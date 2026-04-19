import { useState, useEffect, useCallback } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { Address, Abi } from "viem";
import { getPublicClient, getWalletClient, devAccounts } from "../config/evm";
import { diamondLoupeAbi, diamondCutAbi, ownershipAbi } from "../config/abis";
import {
	PALLET_REGISTRY,
	selectorsFromAbi,
	categoryMeta,
	getPalletById,
	type PalletDef,
} from "../config/pallets";
import TxStatus, { type LogEntry } from "../components/TxStatus";
import AccountSelector from "../components/AccountSelector";

interface OutletCtx { rpcUrl: string }
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

// A registered facet read from the chain
interface LiveFacet {
	address: `0x${string}`;
	selectors: `0x${string}`[];
	knownPallet?: PalletDef;
}

export default function ManagePage() {
	const { rpcUrl } = useOutletContext<OutletCtx>();
	const [searchParams] = useSearchParams();

	const [runtimeAddress, setRuntimeAddress] = useState(searchParams.get("address") ?? "");
	const [accountIndex, setAccountIndex] = useState(0);

	const [liveFacets, setLiveFacets] = useState<LiveFacet[]>([]);
	const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [log, setLog] = useState<LogEntry[]>([]);
	const [txBusy, setTxBusy] = useState(false);

	const [addPalletId, setAddPalletId] = useState("");
	const [replaceFacetAddr, setReplaceFacetAddr] = useState<`0x${string}` | "">("");
	const [replacePalletId, setReplacePalletId] = useState("");

	function push(kind: LogEntry["kind"], text: string) {
		setLog((prev) => [...prev, { kind, text }]);
	}

	// -------------------------------------------------------------------------
	// Load live runtime state
	// -------------------------------------------------------------------------

	const loadRuntime = useCallback(async () => {
		const addr = runtimeAddress.trim() as Address;
		if (!addr || !addr.startsWith("0x")) return;
		setLoading(true);
		setLoadError(null);
		setLiveFacets([]);
		setOwnerAddress(null);
		try {
			const client = getPublicClient(rpcUrl);

			const code = await client.getCode({ address: addr });
			if (!code || code === "0x") {
				setLoadError("No contract found at this address.");
				return;
			}

			// Read facets via DiamondLoupe
			const facetsRaw = (await client.readContract({
				address: addr,
				abi: diamondLoupeAbi as Abi,
				functionName: "facets",
			})) as { facetAddress: `0x${string}`; functionSelectors: `0x${string}`[] }[];

			const live: LiveFacet[] = facetsRaw.map((f) => {
				const selSet = new Set(f.functionSelectors);
				const known = PALLET_REGISTRY.find((p) =>
					selectorsFromAbi(p.abi).some((sel) => selSet.has(sel)),
				);
				return {
					address: f.facetAddress,
					selectors: [...f.functionSelectors],
					knownPallet: known,
				};
			});
			setLiveFacets(live);

			// Read owner (OwnershipPallet may not be installed)
			try {
				const owner = (await client.readContract({
					address: addr,
					abi: ownershipAbi as Abi,
					functionName: "owner",
				})) as `0x${string}`;
				setOwnerAddress(owner);
			} catch {
				/* OwnershipPallet not installed */
			}
		} catch (e) {
			setLoadError(`Failed to read runtime: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setLoading(false);
		}
	}, [rpcUrl, runtimeAddress]);

	// Auto-load when address is pre-filled from URL param
	useEffect(() => {
		if (searchParams.get("address")) loadRuntime();
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// -------------------------------------------------------------------------
	// Add pallet
	// -------------------------------------------------------------------------

	async function handleAddPallet() {
		const pallet = getPalletById(addPalletId);
		if (!pallet || !pallet.bytecode || pallet.bytecode === "0x") return;
		setTxBusy(true);
		setLog([]);
		try {
			const client = getPublicClient(rpcUrl);
			const wallet = await getWalletClient(accountIndex, rpcUrl);

			push("pending", `Deploying ${pallet.name}…`);
			const deployHash = await wallet.deployContract({
				abi: pallet.abi as Abi,
				bytecode: pallet.bytecode,
			});
			const receipt = await client.waitForTransactionReceipt({ hash: deployHash, timeout: 120_000 });
			if (!receipt.contractAddress) throw new Error("No contract address in receipt");
			push("success", `${pallet.name} deployed: ${receipt.contractAddress}`);

			push("pending", `Registering in SmartRuntime via diamondCut…`);
			const cutHash = await wallet.writeContract({
				address: runtimeAddress as Address,
				abi: diamondCutAbi as Abi,
				functionName: "diamondCut",
				args: [
					[{ facetAddress: receipt.contractAddress, action: 0, functionSelectors: selectorsFromAbi(pallet.abi) }],
					ZERO_ADDR,
					"0x",
				],
			});
			await client.waitForTransactionReceipt({ hash: cutHash, timeout: 120_000 });
			push("success", `${pallet.name} added ✓`);
			setAddPalletId("");
			await loadRuntime();
		} catch (e) {
			push("error", e instanceof Error ? e.message : String(e));
		} finally {
			setTxBusy(false);
		}
	}

	// -------------------------------------------------------------------------
	// Replace pallet
	// -------------------------------------------------------------------------

	async function handleReplacePallet() {
		const oldFacet = liveFacets.find((f) => f.address === replaceFacetAddr);
		const newPallet = getPalletById(replacePalletId);
		if (!oldFacet || !newPallet || !newPallet.bytecode || newPallet.bytecode === "0x") return;
		setTxBusy(true);
		setLog([]);
		try {
			const client = getPublicClient(rpcUrl);
			const wallet = await getWalletClient(accountIndex, rpcUrl);

			push("pending", `Deploying new ${newPallet.name}…`);
			const deployHash = await wallet.deployContract({
				abi: newPallet.abi as Abi,
				bytecode: newPallet.bytecode,
			});
			const receipt = await client.waitForTransactionReceipt({ hash: deployHash, timeout: 120_000 });
			if (!receipt.contractAddress) throw new Error("No contract address in receipt");
			push("success", `New pallet deployed: ${receipt.contractAddress}`);

			push("pending", `Replacing via diamondCut (action=1)…`);
			const cutHash = await wallet.writeContract({
				address: runtimeAddress as Address,
				abi: diamondCutAbi as Abi,
				functionName: "diamondCut",
				args: [
					[{ facetAddress: receipt.contractAddress, action: 1, functionSelectors: oldFacet.selectors }],
					ZERO_ADDR,
					"0x",
				],
			});
			await client.waitForTransactionReceipt({ hash: cutHash, timeout: 120_000 });
			push("success", "Pallet replaced ✓");
			setReplaceFacetAddr("");
			setReplacePalletId("");
			await loadRuntime();
		} catch (e) {
			push("error", e instanceof Error ? e.message : String(e));
		} finally {
			setTxBusy(false);
		}
	}

	// -------------------------------------------------------------------------
	// Remove pallet
	// -------------------------------------------------------------------------

	async function handleRemovePallet(facet: LiveFacet) {
		if (!confirm(`Remove pallet at ${facet.address}?\nThis will unregister all its ${facet.selectors.length} selectors.`)) return;
		setTxBusy(true);
		setLog([]);
		try {
			const client = getPublicClient(rpcUrl);
			const wallet = await getWalletClient(accountIndex, rpcUrl);

			push("pending", `Removing pallet ${facet.address}…`);
			const hash = await wallet.writeContract({
				address: runtimeAddress as Address,
				abi: diamondCutAbi as Abi,
				functionName: "diamondCut",
				args: [
					[{ facetAddress: ZERO_ADDR, action: 2, functionSelectors: facet.selectors }],
					ZERO_ADDR,
					"0x",
				],
			});
			await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
			push("success", "Pallet removed ✓");
			await loadRuntime();
		} catch (e) {
			push("error", e instanceof Error ? e.message : String(e));
		} finally {
			setTxBusy(false);
		}
	}

	// -------------------------------------------------------------------------
	// Derived state
	// -------------------------------------------------------------------------

	const installedIds = new Set(liveFacets.map((f) => f.knownPallet?.id).filter(Boolean) as string[]);
	const availableToAdd = PALLET_REGISTRY.filter((p) => !installedIds.has(p.id));
	const signerAddress = devAccounts[accountIndex].account.address;
	const isOwner = ownerAddress
		? ownerAddress.toLowerCase() === signerAddress.toLowerCase()
		: null;

	// -------------------------------------------------------------------------
	// Render
	// -------------------------------------------------------------------------

	return (
		<div className="space-y-8 animate-fade-in">
			{/* Header */}
			<div className="space-y-2">
				<h1 className="page-title">
					Manage{" "}
					<span className="bg-gradient-to-r from-accent-blue to-accent-purple bg-clip-text text-transparent">
						Smart Runtime
					</span>
				</h1>
				<p className="text-text-secondary text-sm leading-relaxed max-w-2xl">
					Connect to a deployed SmartRuntime to inspect its registered Smart Pallets and apply
					forkless upgrades via{" "}
					<code className="bg-white/[0.06] px-1 rounded text-xs">diamondCut</code>.
				</p>
			</div>

			{/* Connect card */}
			<div className="card space-y-4">
				<h2 className="section-title">Connect to Runtime</h2>
				<div>
					<label className="label">SmartRuntime Address</label>
					<div className="flex gap-2">
						<input
							type="text"
							value={runtimeAddress}
							onChange={(e) => setRuntimeAddress(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && loadRuntime()}
							placeholder="0x…"
							className="input-field flex-1"
						/>
						<button
							onClick={loadRuntime}
							disabled={loading || !runtimeAddress.trim()}
							className="btn-primary flex items-center gap-2"
						>
							{loading ? (
								<>
									<svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
									</svg>
									Loading…
								</>
							) : "Load"}
						</button>
					</div>
					{loadError && <p className="mt-2 text-xs text-accent-red">{loadError}</p>}
				</div>

				{ownerAddress && (
					<div className="flex items-center gap-3 text-xs flex-wrap">
						<div>
							<span className="text-text-muted">Owner: </span>
							<code className="text-text-secondary font-mono">{ownerAddress}</code>
						</div>
						{isOwner !== null && (
							<span className={`badge ${isOwner ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"}`}>
								{isOwner ? "✓ You are the owner" : "✗ Not owner — upgrades will revert"}
							</span>
						)}
					</div>
				)}
			</div>

			{/* Live pallets */}
			{liveFacets.length > 0 && (
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="section-title">
							Registered Smart Pallets
							<span className="ml-2 text-sm font-normal text-text-muted">({liveFacets.length})</span>
						</h2>
						<button onClick={loadRuntime} disabled={loading} className="btn-secondary text-xs">
							{loading ? "Refreshing…" : "↻ Refresh"}
						</button>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{liveFacets.map((facet) => (
							<div key={facet.address} className="card space-y-3">
								{/* Header */}
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										{facet.knownPallet ? (
											<>
												<div className="flex items-center gap-2 mb-0.5">
													<span className={`badge text-xs ${categoryMeta[facet.knownPallet.category].bg} ${categoryMeta[facet.knownPallet.category].color}`}>
														{categoryMeta[facet.knownPallet.category].label}
													</span>
												</div>
												<p className="font-semibold text-text-primary text-sm font-display">
													{facet.knownPallet.name}
												</p>
											</>
										) : (
											<p className="font-semibold text-text-secondary text-sm">Unknown Pallet</p>
										)}
										<code className="text-[10px] font-mono text-text-muted block mt-0.5 truncate">
											{facet.address}
										</code>
									</div>
								</div>

								{/* Selectors */}
								<div>
									<p className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
										Selectors ({facet.selectors.length})
									</p>
									<div className="flex flex-wrap gap-1">
										{facet.selectors.map((sel) => (
											<code
												key={sel}
												className="text-[9px] font-mono px-1 py-0.5 rounded bg-white/[0.03] border border-white/[0.05] text-text-muted"
											>
												{sel}
											</code>
										))}
									</div>
								</div>

								{/* Actions */}
								<div className="flex gap-2 pt-1 border-t border-white/[0.04]">
									<button
										onClick={() => { setReplaceFacetAddr(facet.address); setReplacePalletId(""); }}
										disabled={txBusy}
										className="btn-secondary text-xs flex-1"
									>
										Replace
									</button>
									<button
										onClick={() => handleRemovePallet(facet)}
										disabled={txBusy}
										className="btn-danger text-xs"
									>
										Remove
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Upgrade panel */}
			{liveFacets.length > 0 && (
				<div className="card space-y-5">
					<h2 className="section-title">Upgrade SmartRuntime</h2>

					<AccountSelector value={accountIndex} onChange={setAccountIndex} />

					{/* Add */}
					<div className="rounded-lg border border-white/[0.06] p-4 space-y-3">
						<div>
							<h3 className="text-sm font-semibold text-text-primary mb-0.5">Add Smart Pallet</h3>
							<p className="text-xs text-text-muted">
								Deploy a new pallet instance and register its selectors via <code className="bg-white/[0.06] px-1 rounded">diamondCut(Add)</code>.
							</p>
						</div>
						{availableToAdd.length === 0 ? (
							<p className="text-xs text-accent-green">All known pallets are already registered.</p>
						) : (
							<div className="flex gap-2">
								<select
									value={addPalletId}
									onChange={(e) => setAddPalletId(e.target.value)}
									className="input-field flex-1"
								>
									<option value="">Select a pallet to add…</option>
									{availableToAdd.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name} · {categoryMeta[p.category].label}
										</option>
									))}
								</select>
								<button
									onClick={handleAddPallet}
									disabled={txBusy || !addPalletId}
									className="btn-primary"
								>
									{txBusy && addPalletId ? "Adding…" : "Add"}
								</button>
							</div>
						)}
					</div>

					{/* Replace */}
					<div className="rounded-lg border border-white/[0.06] p-4 space-y-3">
						<div>
							<h3 className="text-sm font-semibold text-text-primary mb-0.5">Replace Smart Pallet</h3>
							<p className="text-xs text-text-muted">
								Deploy a new implementation and reroute the old selectors via{" "}
								<code className="bg-white/[0.06] px-1 rounded">diamondCut(Replace)</code> — forkless upgrade.
							</p>
						</div>
						<div className="space-y-2">
							<select
								value={replaceFacetAddr}
								onChange={(e) => { setReplaceFacetAddr(e.target.value as `0x${string}`); setReplacePalletId(""); }}
								className="input-field w-full"
							>
								<option value="">Select existing pallet to replace…</option>
								{liveFacets.map((f) => (
									<option key={f.address} value={f.address}>
										{f.knownPallet?.name ?? "Unknown"} — {f.address.slice(0, 10)}…
									</option>
								))}
							</select>
							{replaceFacetAddr && (
								<div className="flex gap-2">
									<select
										value={replacePalletId}
										onChange={(e) => setReplacePalletId(e.target.value)}
										className="input-field flex-1"
									>
										<option value="">Select new implementation…</option>
										{PALLET_REGISTRY.map((p) => (
											<option key={p.id} value={p.id}>{p.name}</option>
										))}
									</select>
									<button
										onClick={handleReplacePallet}
										disabled={txBusy || !replacePalletId}
										className="btn-primary"
									>
										{txBusy && replacePalletId ? "Replacing…" : "Replace"}
									</button>
								</div>
							)}
						</div>
					</div>

					{log.length > 0 && <TxStatus log={log} />}
				</div>
			)}

			{/* Empty state */}
			{!loading && liveFacets.length === 0 && !loadError && (
				<div className="card flex flex-col items-center justify-center py-16 text-center gap-3">
					<div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
						<svg className="w-7 h-7 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
							<rect x="3" y="3" width="8" height="8" rx="1.5" />
							<rect x="13" y="3" width="8" height="8" rx="1.5" />
							<rect x="3" y="13" width="8" height="8" rx="1.5" />
							<rect x="13" y="13" width="8" height="8" rx="1.5" />
						</svg>
					</div>
					<p className="text-text-secondary text-sm">Paste a SmartRuntime address above and click Load.</p>
					<p className="text-text-muted text-xs">Don't have one yet?{" "}
						<a href="#/deploy" className="text-polka-400 hover:underline">Deploy one first →</a>
					</p>
				</div>
			)}
		</div>
	);
}
