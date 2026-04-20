import type { Address, Abi, AbiParameter } from "viem";
import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { getPublicClient, getWalletClient, devAccounts } from "../config/evm";
import { diamondLoupeAbi, ownershipAbi } from "../config/abis";
import {
	categoryMeta,
	type PalletDef,
	PALLET_REGISTRY,
	selectorsFromAbi,
	GLOBAL_FUNCTION_INFO_MAP,
	type GlobalFunctionInfo,
} from "../config/pallets";
import AccountSelector from "../components/AccountSelector";
import TxStatus, { type LogEntry } from "../components/TxStatus";

interface OutletCtx { rpcUrl: string }

interface LiveFacet {
	address: `0x${string}`;
	selectors: `0x${string}`[];
	knownPallet?: PalletDef;
}

interface RuntimeFunctionOption extends GlobalFunctionInfo {
	facetAddress: `0x${string}`;
	knownPallet?: PalletDef;
}

function parseAbiInputValue(value: unknown, parameter: AbiParameter): unknown {
	const tupleParameter = parameter as AbiParameter & { components?: readonly AbiParameter[] };
	const arrayMatch = parameter.type.match(/^(.*)\[(\d*)\]$/);

	if (arrayMatch) {
		if (!Array.isArray(value)) {
			throw new Error(`Expected ${parameter.type} as a JSON array`);
		}

		const [, itemType, fixedLength] = arrayMatch;
		if (fixedLength && value.length !== Number(fixedLength)) {
			throw new Error(`Expected ${parameter.type} with ${fixedLength} item(s)`);
		}

		return value.map((item) =>
			parseAbiInputValue(item, {
				...parameter,
				type: itemType,
				components: tupleParameter.components,
			} as AbiParameter),
		);
	}

	if (parameter.type.startsWith("tuple")) {
		const components = tupleParameter.components ?? [];
		if (Array.isArray(value)) {
			if (value.length !== components.length) {
				throw new Error(`Expected tuple with ${components.length} value(s)`);
			}

			return components.map((component, index) => parseAbiInputValue(value[index], component));
		}

		if (value && typeof value === "object") {
			const tupleObject = value as Record<string, unknown>;
			return components.map((component) => {
				const componentValue = component.name ? tupleObject[component.name] : undefined;
				return parseAbiInputValue(componentValue, component);
			});
		}

		throw new Error(`Expected ${parameter.type} as a JSON array or object`);
	}

	if (parameter.type === "string") {
		return typeof value === "string" ? value : String(value ?? "");
	}

	if (parameter.type === "bool") {
		if (typeof value === "boolean") return value;
		if (typeof value === "string") {
			if (value === "true" || value === "1") return true;
			if (value === "false" || value === "0") return false;
		}
		throw new Error("Expected a boolean value: true or false");
	}

	if (parameter.type === "address") {
		if (typeof value !== "string" || !value.trim()) {
			throw new Error("Expected an address value");
		}
		return value.trim() as Address;
	}

	if (parameter.type === "bytes" || /^bytes\d+$/.test(parameter.type)) {
		if (typeof value !== "string" || !value.trim()) {
			throw new Error(`Expected ${parameter.type} as a 0x-prefixed hex string`);
		}
		return value.trim() as `0x${string}`;
	}

	if (/^(u?int)\d*$/.test(parameter.type)) {
		if (typeof value === "bigint") return value;
		if (typeof value === "number") return BigInt(value);
		if (typeof value === "string" && value.trim()) return BigInt(value.trim());
		throw new Error(`Expected ${parameter.type} as an integer`);
	}

	return value;
}

function parseUserArgument(rawValue: string, parameter: AbiParameter): unknown {
	const trimmed = rawValue.trim();
	const expectsJson = parameter.type.startsWith("tuple") || parameter.type.includes("[");
	const value = expectsJson ? JSON.parse(trimmed || "[]") : trimmed;
	return parseAbiInputValue(value, parameter);
}

function placeholderForParameter(parameter: AbiParameter): string {
	const tupleParameter = parameter as AbiParameter & { components?: readonly AbiParameter[] };
	const arrayMatch = parameter.type.match(/^(.*)\[(\d*)\]$/);

	if (arrayMatch) {
		return "[]";
	}

	if (parameter.type.startsWith("tuple")) {
		const components = tupleParameter.components ?? [];
		const objectShape = Object.fromEntries(
			components.map((component, index) => [component.name || `field${index}`, placeholderForParameter(component)]),
		);
		return JSON.stringify(objectShape);
	}

	switch (parameter.type) {
		case "address":
			return "0x...";
		case "bool":
			return "true";
		case "bytes":
		case "bytes32":
			return "0x";
		case "string":
			return "text";
		default:
			if (/^(u?int)\d*$/.test(parameter.type)) return "0";
			return parameter.type;
	}
}

function serializeResult(value: unknown): string {
	const normalize = (input: unknown): unknown => {
		if (typeof input === "bigint") return input.toString();
		if (Array.isArray(input)) return input.map(normalize);
		if (input && typeof input === "object") {
			return Object.fromEntries(
				Object.entries(input as Record<string, unknown>).map(([key, nested]) => [key, normalize(nested)]),
			);
		}
		return input;
	};

	return JSON.stringify(normalize(value), null, 2);
}

export default function InteractPage() {
	const { rpcUrl } = useOutletContext<OutletCtx>();
	const [searchParams] = useSearchParams();
	const queryAddress = searchParams.get("address") ?? "";

	const [accountIndex, setAccountIndex] = useState(0);
	const [liveFacets, setLiveFacets] = useState<LiveFacet[]>([]);
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
	const [runtimeAddress, setRuntimeAddress] = useState(queryAddress);
	const [runtimeFnSelector, setRuntimeFnSelector] = useState<`0x${string}` | "">("");
	const [runtimeFnInputs, setRuntimeFnInputs] = useState<string[]>([]);
	const [runtimeFnBusy, setRuntimeFnBusy] = useState(false);
	const [runtimeFnResult, setRuntimeFnResult] = useState<string | null>(null);
	const [runtimeFnLog, setRuntimeFnLog] = useState<LogEntry[]>([]);

	function requireSuccessfulTx(label: string, receipt: { status: string }) {
		if (receipt.status !== "success") throw new Error(`${label} reverted on-chain`);
	}

	function pushRuntimeFn(kind: LogEntry["kind"], text: string) {
		setRuntimeFnLog((prev) => [...prev, { kind, text }]);
	}

	const loadRuntimeForAddress = useCallback(async (addressInput: string) => {
		const addr = addressInput.trim() as Address;
		if (!addr || !addr.startsWith("0x")) return;

		setLoading(true);
		setLoadError(null);
		setLiveFacets([]);
		setOwnerAddress(null);
		setRuntimeFnResult(null);
		setRuntimeFnLog([]);

		try {
			const client = getPublicClient(rpcUrl);
			const code = await client.getCode({ address: addr });

			if (!code || code === "0x") {
				setLoadError("No contract found at this address on the current RPC URL.");
				return;
			}

			const facetsRaw = (await client.readContract({
				address: addr,
				abi: diamondLoupeAbi as Abi,
				functionName: "facets",
			})) as { facetAddress: `0x${string}`; functionSelectors: `0x${string}`[] }[];

			const live: LiveFacet[] = facetsRaw.map((facet) => {
				const selectorSet = new Set(facet.functionSelectors);
				const knownPallet = PALLET_REGISTRY.find((pallet) =>
					selectorsFromAbi(pallet.abi).some((selector) => selectorSet.has(selector)),
				);

				return {
					address: facet.facetAddress,
					selectors: [...facet.functionSelectors],
					knownPallet,
				};
			});

			setLiveFacets(live);

			try {
				const owner = (await client.readContract({
					address: addr,
					abi: ownershipAbi as Abi,
					functionName: "owner",
				})) as `0x${string}`;
				setOwnerAddress(owner);
			} catch {
				// OwnershipPallet is optional.
			}
		} catch (error) {
			setLoadError(`Failed to read runtime: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			setLoading(false);
		}
	}, [rpcUrl]);

	const loadRuntime = useCallback(async () => {
		await loadRuntimeForAddress(runtimeAddress);
	}, [loadRuntimeForAddress, runtimeAddress]);

	useEffect(() => {
		if (!queryAddress) return;
		setRuntimeAddress(queryAddress);
		void loadRuntimeForAddress(queryAddress);
	}, [loadRuntimeForAddress, queryAddress]);

	const signerAddress = devAccounts[accountIndex].account.address;
	const isOwner = ownerAddress
		? ownerAddress.toLowerCase() === signerAddress.toLowerCase()
		: null;
	const runtimeFunctions: RuntimeFunctionOption[] = liveFacets
		.flatMap((facet) => {
			const knownFunctions: RuntimeFunctionOption[] = [];
			for (const selector of facet.selectors) {
				const info = GLOBAL_FUNCTION_INFO_MAP.get(selector);
				if (!info) continue;
				knownFunctions.push({
					...info,
					facetAddress: facet.address,
					knownPallet: facet.knownPallet,
				});
			}
			return knownFunctions;
		})
		.sort((a, b) =>
			a.knownPallet?.name === b.knownPallet?.name
				? a.signature.localeCompare(b.signature)
				: (a.knownPallet?.name ?? a.palletName).localeCompare(b.knownPallet?.name ?? b.palletName),
		);
	const selectedRuntimeFunction =
		runtimeFunctions.find((fn) => fn.selector === runtimeFnSelector) ?? null;
	const selectedRuntimeFunctionInputs = (selectedRuntimeFunction?.abi.inputs ?? []) as readonly AbiParameter[];
	const runtimeReadFunctions = runtimeFunctions.filter((fn) => ["view", "pure"].includes(fn.abi.stateMutability));
	const runtimeWriteFunctions = runtimeFunctions.filter((fn) => !["view", "pure"].includes(fn.abi.stateMutability));
	const totalSelectorCount = liveFacets.reduce((count, facet) => count + facet.selectors.length, 0);

	function selectRuntimeFunction(selector: `0x${string}` | "") {
		setRuntimeFnSelector(selector);
		const nextFunction = runtimeFunctions.find((fn) => fn.selector === selector) ?? null;
		setRuntimeFnInputs((nextFunction?.abi.inputs ?? []).map(() => ""));
		setRuntimeFnResult(null);
		setRuntimeFnLog([]);
	}

	function updateRuntimeFunctionInput(index: number, value: string) {
		setRuntimeFnInputs((prev) => prev.map((entry, idx) => (idx === index ? value : entry)));
	}

	async function handleRuntimeInteraction() {
		if (!selectedRuntimeFunction) return;

		setRuntimeFnBusy(true);
		setRuntimeFnResult(null);
		setRuntimeFnLog([]);

		try {
			const args = selectedRuntimeFunctionInputs.map((parameter, index) =>
				parseUserArgument(runtimeFnInputs[index] ?? "", parameter),
			);
			const publicClient = getPublicClient(rpcUrl);
			const singleFunctionAbi = [selectedRuntimeFunction.abi] as Abi;
			const isRead = ["view", "pure"].includes(selectedRuntimeFunction.abi.stateMutability);

			pushRuntimeFn(
				"info",
				`${isRead ? "Reading" : "Writing"} ${selectedRuntimeFunction.signature} on ${runtimeAddress}`,
			);

			if (isRead) {
				const result = await publicClient.readContract({
					address: runtimeAddress as Address,
					abi: singleFunctionAbi,
					functionName: selectedRuntimeFunction.abi.name,
					args,
				});
				setRuntimeFnResult(serializeResult(result));
				pushRuntimeFn("success", "Read call completed");
				return;
			}

			const wallet = await getWalletClient(accountIndex, rpcUrl);
			const hash = await wallet.writeContract({
				address: runtimeAddress as Address,
				abi: singleFunctionAbi,
				functionName: selectedRuntimeFunction.abi.name,
				args,
			});
			pushRuntimeFn("pending", `Transaction submitted: ${hash}`);

			const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
			requireSuccessfulTx(selectedRuntimeFunction.signature, receipt);
			setRuntimeFnResult(
				serializeResult({
					hash,
					status: receipt.status,
					blockNumber: receipt.blockNumber,
					gasUsed: receipt.gasUsed,
				}),
			);
			pushRuntimeFn("success", "Transaction confirmed");
			await loadRuntime();
		} catch (error) {
			pushRuntimeFn("error", error instanceof Error ? error.message : String(error));
		} finally {
			setRuntimeFnBusy(false);
		}
	}

	useEffect(() => {
		if (runtimeFunctions.length === 0) {
			setRuntimeFnSelector("");
			setRuntimeFnInputs([]);
			setRuntimeFnResult(null);
			setRuntimeFnLog([]);
			return;
		}

		if (!runtimeFnSelector || !runtimeFunctions.some((fn) => fn.selector === runtimeFnSelector)) {
			const firstSelector = runtimeFunctions[0]?.selector ?? "";
			setRuntimeFnSelector(firstSelector);
			setRuntimeFnInputs((runtimeFunctions[0]?.abi.inputs ?? []).map(() => ""));
			setRuntimeFnResult(null);
			setRuntimeFnLog([]);
		}
	}, [runtimeFunctions, runtimeFnSelector]);

	return (
		<div className="space-y-8 animate-fade-in">
			<div className="space-y-2">
				<h1 className="page-title">
					Interact with{" "}
					<span className="bg-gradient-to-r from-accent-green to-accent-blue bg-clip-text text-transparent">
						Smart Runtime
					</span>
				</h1>
				<p className="text-text-secondary text-sm leading-relaxed max-w-2xl">
					Load a deployed SmartRuntime and execute direct read or write calls against the
					functions currently registered on-chain. The console derives its callable surface from
					the pallet ABIs known by the local UI.
				</p>
			</div>

			<div className="card space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="section-title">Connect to Runtime</h2>
					{liveFacets.length > 0 && (
						<Link to={`/manage?address=${runtimeAddress.trim()}`} className="btn-secondary text-xs">
							Open Manage
						</Link>
					)}
				</div>

				<div>
					<label className="label">SmartRuntime Address</label>
					<div className="flex gap-2">
						<input
							type="text"
							value={runtimeAddress}
							onChange={(e) => setRuntimeAddress(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && loadRuntime()}
							placeholder="0x..."
							className="input-field flex-1"
						/>
						<button
							onClick={() => loadRuntime()}
							disabled={loading || !runtimeAddress.trim()}
							className="btn-primary flex items-center gap-2"
						>
							{loading ? (
								<>
									<svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
									</svg>
									Loading...
								</>
							) : "Load"}
						</button>
					</div>
					{loadError && <p className="mt-2 text-xs text-accent-red">{loadError}</p>}
				</div>

				{liveFacets.length > 0 && (
					<div className="flex flex-wrap items-center gap-2 text-xs">
						<span className="badge bg-accent-blue/10 text-accent-blue">
							{liveFacets.length} pallet{liveFacets.length !== 1 ? "s" : ""}
						</span>
						<span className="badge bg-white/[0.06] text-text-secondary">
							{totalSelectorCount} registered selector{totalSelectorCount !== 1 ? "s" : ""}
						</span>
						<span className="badge bg-accent-green/10 text-accent-green">
							{runtimeFunctions.length} known callable function{runtimeFunctions.length !== 1 ? "s" : ""}
						</span>
					</div>
				)}

				{ownerAddress && (
					<div className="flex items-center gap-3 text-xs flex-wrap">
						<div>
							<span className="text-text-muted">Owner: </span>
							<code className="text-text-secondary font-mono">{ownerAddress}</code>
						</div>
						{isOwner !== null && (
							<span className={`badge ${isOwner ? "bg-accent-green/10 text-accent-green" : "bg-accent-orange/10 text-accent-orange"}`}>
								{isOwner ? "Selected signer is owner" : "Owner-only writes may revert"}
							</span>
						)}
					</div>
				)}
			</div>

			{liveFacets.length > 0 && runtimeFunctions.length === 0 && (
				<div className="card space-y-2">
					<h2 className="section-title">No Known ABI Surface</h2>
					<p className="text-sm text-text-secondary leading-relaxed max-w-2xl">
						The runtime exposes selectors, but none of them match the pallet ABIs bundled in the
						local catalog. The console cannot generate typed inputs until those pallet
						definitions are added to <code className="bg-white/[0.06] px-1 rounded text-xs">web/src/config/pallets.ts</code>.
					</p>
				</div>
			)}

			{runtimeFunctions.length > 0 && (
				<div className="card space-y-5">
					<div className="space-y-1">
						<h2 className="section-title">Runtime Console</h2>
						<p className="text-xs text-text-muted max-w-2xl">
							Select a live function, provide ABI-typed arguments, then run a read call or send a
							transaction with one of the bundled dev signers.
						</p>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-5">
						<div className="space-y-4">
							<div className="space-y-2">
								<label className="label">Function</label>
								<select
									value={runtimeFnSelector}
									onChange={(e) => selectRuntimeFunction(e.target.value as `0x${string}` | "")}
									className="input-field w-full"
								>
									<option value="">Select a runtime function...</option>
									{runtimeReadFunctions.length > 0 && (
										<optgroup label={`Read (${runtimeReadFunctions.length})`}>
											{runtimeReadFunctions.map((fn) => (
												<option key={fn.selector} value={fn.selector}>
													{fn.knownPallet?.name ?? fn.palletName} · {fn.signature}
												</option>
											))}
										</optgroup>
									)}
									{runtimeWriteFunctions.length > 0 && (
										<optgroup label={`Write (${runtimeWriteFunctions.length})`}>
											{runtimeWriteFunctions.map((fn) => (
												<option key={fn.selector} value={fn.selector}>
													{fn.knownPallet?.name ?? fn.palletName} · {fn.signature}
												</option>
											))}
										</optgroup>
									)}
								</select>
							</div>

							{selectedRuntimeFunction && (
								<>
									<div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
										<div className="flex flex-wrap items-center gap-2">
											<span
												className={`badge ${categoryMeta[selectedRuntimeFunction.palletCategory].bg} ${categoryMeta[selectedRuntimeFunction.palletCategory].color} text-[10px]`}
											>
												{categoryMeta[selectedRuntimeFunction.palletCategory].label}
											</span>
											<span
												className={`badge text-[10px] ${
													["view", "pure"].includes(selectedRuntimeFunction.abi.stateMutability)
														? "bg-accent-green/10 text-accent-green"
														: "bg-accent-orange/10 text-accent-orange"
												}`}
											>
												{["view", "pure"].includes(selectedRuntimeFunction.abi.stateMutability) ? "Read" : "Write"}
											</span>
										</div>
										<code className="block text-xs text-text-primary break-all">
											{selectedRuntimeFunction.signature}
										</code>
										<p className="text-[11px] text-text-muted">
											Facet: <code>{selectedRuntimeFunction.facetAddress}</code>
										</p>
									</div>

									{!["view", "pure"].includes(selectedRuntimeFunction.abi.stateMutability) && (
										<AccountSelector value={accountIndex} onChange={setAccountIndex} label="Caller Account" />
									)}

									<div className="space-y-3">
										{selectedRuntimeFunctionInputs.length === 0 ? (
											<p className="text-xs text-text-muted">
												This function has no inputs.
											</p>
										) : (
											selectedRuntimeFunctionInputs.map((parameter, index) => (
												<div key={`${selectedRuntimeFunction.selector}:${parameter.name ?? index}`} className="space-y-1.5">
													<label className="label">
														{parameter.name || `arg${index}`}
														<span className="ml-1 text-text-muted normal-case">({parameter.type})</span>
													</label>
													{parameter.type.startsWith("tuple") || parameter.type.includes("[") ? (
														<textarea
															value={runtimeFnInputs[index] ?? ""}
															onChange={(e) => updateRuntimeFunctionInput(index, e.target.value)}
															placeholder={placeholderForParameter(parameter)}
															className="input-field min-h-24 w-full font-mono text-xs"
														/>
													) : (
														<input
															type="text"
															value={runtimeFnInputs[index] ?? ""}
															onChange={(e) => updateRuntimeFunctionInput(index, e.target.value)}
															placeholder={placeholderForParameter(parameter)}
															className="input-field w-full font-mono text-xs"
														/>
													)}
												</div>
											))
										)}
									</div>

									<button
										onClick={handleRuntimeInteraction}
										disabled={runtimeFnBusy}
										className="btn-primary"
									>
										{runtimeFnBusy
											? "Running..."
											: ["view", "pure"].includes(selectedRuntimeFunction.abi.stateMutability)
												? "Run Read"
												: "Send Transaction"}
									</button>
								</>
							)}
						</div>

						<div className="space-y-4">
							<div className="space-y-2">
								<h3 className="text-sm font-semibold text-text-primary">Output</h3>
								<div className="rounded-lg border border-white/[0.06] bg-black/25 min-h-52 p-3">
									{runtimeFnResult ? (
										<pre className="whitespace-pre-wrap break-words text-xs text-text-secondary font-mono">
											{runtimeFnResult}
										</pre>
									) : (
										<p className="text-xs text-text-muted">
											Run a read call or submit a transaction to inspect the result here.
										</p>
									)}
								</div>
							</div>

							{runtimeFnLog.length > 0 && <TxStatus log={runtimeFnLog} />}
						</div>
					</div>
				</div>
			)}

			{!loading && liveFacets.length === 0 && !loadError && (
				<div className="card flex flex-col items-center justify-center py-16 text-center gap-3">
					<div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
						<svg className="w-7 h-7 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
							<path d="M12 3v18M3 12h18" />
						</svg>
					</div>
					<p className="text-text-secondary text-sm">Paste a SmartRuntime address above and click Load.</p>
					<p className="text-text-muted text-xs">
						Need a runtime first?{" "}
						<Link to="/deploy" className="text-polka-400 hover:underline">Deploy one</Link>.
					</p>
				</div>
			)}
		</div>
	);
}
