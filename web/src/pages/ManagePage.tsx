import type { Address, Abi } from "viem";
import { useState, useEffect, useCallback } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { getPublicClient, getWalletClient, devAccounts } from "../config/evm";
import { diamondLoupeAbi, diamondCutAbi, ownershipAbi } from "../config/abis";

import {
	categoryMeta,
	getPalletById,
	type PalletDef,
	PALLET_REGISTRY,
	selectorsFromAbi,
	GLOBAL_SELECTOR_MAP,
} from "../config/pallets";

import AccountSelector from "../components/AccountSelector";
import TxStatus, { type LogEntry } from "../components/TxStatus";

interface OutletCtx { rpcUrl: string }
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

interface LiveFacet {
	address: `0x${string}`;
	selectors: `0x${string}`[];
	knownPallet?: PalletDef;
}

export default function ManagePage() {
	const { rpcUrl } = useOutletContext<OutletCtx>();

	const [searchParams] = useSearchParams();
	const [txBusy, setTxBusy] = useState(false);
	const [loading, setLoading] = useState(false);
	const [log, setLog] = useState<LogEntry[]>([]);
	const [addPalletId, setAddPalletId] = useState("");
	const [accountIndex, setAccountIndex] = useState(0);
	const [replacePalletId, setReplacePalletId] = useState("");
	const [liveFacets, setLiveFacets] = useState<LiveFacet[]>([]);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
	const [replaceFacetAddr, setReplaceFacetAddr] = useState<`0x${string}` | "">("");
	const [runtimeAddress, setRuntimeAddress] = useState(searchParams.get("address") ?? "");

	// Granular (per-function) management state
	const [granularFacetAddr, setGranularFacetAddr] = useState<`0x${string}` | null>(null);
	const [granularSelected, setGranularSelected] = useState<Set<string>>(new Set());
	const [granularReplacePalletId, setGranularReplacePalletId] = useState("");
	const [granularAddSelected, setGranularAddSelected] = useState<Set<string>>(new Set());

	function push(kind: LogEntry["kind"], text: string) {
		setLog((prev) => [...prev, { kind, text }]);
	}

	function requireSuccessfulCreate(
		label: string,
		receipt: { status: string; contractAddress?: `0x${string}` | null },
	) {
		if (receipt.status !== "success") throw new Error(`${label} reverted on-chain`);
		if (!receipt.contractAddress) throw new Error(`${label}: no contract address in receipt`);
		return receipt.contractAddress;
	}

	function requireSuccessfulTx(label: string, receipt: { status: string }) {
		if (receipt.status !== "success") throw new Error(`${label} reverted on-chain`);
	}

	// -------------------------------------------------------------------------
	// Granular helpers
	// -------------------------------------------------------------------------

	function openGranular(addr: `0x${string}`) {
		setGranularFacetAddr(addr);
		setGranularSelected(new Set());
		setGranularReplacePalletId("");
		setLog([]);
	}

	function closeGranular() {
		setGranularFacetAddr(null);
		setGranularSelected(new Set());
		setGranularReplacePalletId("");
		setGranularAddSelected(new Set());
	}

	function toggleGranularSel(sel: string) {
		setGranularSelected((prev) => {
			const next = new Set(prev);
			if (next.has(sel)) next.delete(sel); else next.add(sel);
			return next;
		});
	}

	function toggleAllGranularSel(facet: LiveFacet) {
		const allSelected = facet.selectors.every((s) => granularSelected.has(s));
		setGranularSelected(allSelected ? new Set() : new Set(facet.selectors));
	}

	function toggleGranularAddSel(sel: string) {
		setGranularAddSelected((prev) => {
			const next = new Set(prev);
			if (next.has(sel)) next.delete(sel); else next.add(sel);
			return next;
		});
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
		closeGranular();
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

			try {
				const owner = (await client.readContract({
					address: addr,
					abi: ownershipAbi as Abi,
					functionName: "owner",
				})) as `0x${string}`;
				setOwnerAddress(owner);
			} catch { /* OwnershipPallet not installed */ }
		} catch (e) {
			setLoadError(`Failed to read runtime: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setLoading(false);
		}
	}, [rpcUrl, runtimeAddress]);

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
			const deployHash = await wallet.deployContract({ abi: pallet.abi as Abi, bytecode: pallet.bytecode });
			const receipt = await client.waitForTransactionReceipt({ hash: deployHash, timeout: 120_000 });
			const contractAddress = requireSuccessfulCreate(`${pallet.name} deployment`, receipt);
			push("success", `${pallet.name} deployed: ${contractAddress}`);

			push("pending", `Registering in SmartRuntime via diamondCut…`);
			const cutHash = await wallet.writeContract({
				address: runtimeAddress as Address,
				abi: diamondCutAbi as Abi,
				functionName: "diamondCut",
				args: [[{ facetAddress: contractAddress, action: 0, functionSelectors: selectorsFromAbi(pallet.abi) }], ZERO_ADDR, "0x"],
			});
			const cutReceipt = await client.waitForTransactionReceipt({ hash: cutHash, timeout: 120_000 });
			requireSuccessfulTx(`diamondCut(Add ${pallet.name})`, cutReceipt);
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
	// Replace pallet (all selectors → new implementation)
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
			const deployHash = await wallet.deployContract({ abi: newPallet.abi as Abi, bytecode: newPallet.bytecode });
			const receipt = await client.waitForTransactionReceipt({ hash: deployHash, timeout: 120_000 });
			const contractAddress = requireSuccessfulCreate(`${newPallet.name} deployment`, receipt);
			push("success", `New pallet deployed: ${contractAddress}`);

			push("pending", `Replacing all ${oldFacet.selectors.length} selectors via diamondCut(Replace)…`);
			const cutHash = await wallet.writeContract({
				address: runtimeAddress as Address,
				abi: diamondCutAbi as Abi,
				functionName: "diamondCut",
				args: [[{ facetAddress: contractAddress, action: 1, functionSelectors: oldFacet.selectors }], ZERO_ADDR, "0x"],
			});
			const cutReceipt = await client.waitForTransactionReceipt({ hash: cutHash, timeout: 120_000 });
			requireSuccessfulTx(`diamondCut(Replace ${newPallet.name})`, cutReceipt);
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
	// Remove pallet (all selectors)
	// -------------------------------------------------------------------------

	async function handleRemovePallet(facet: LiveFacet) {
		if (!confirm(`Remove pallet at ${facet.address}?\nThis will unregister all ${facet.selectors.length} selectors.`)) return;
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
				args: [[{ facetAddress: ZERO_ADDR, action: 2, functionSelectors: facet.selectors }], ZERO_ADDR, "0x"],
			});
			const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
			requireSuccessfulTx(`diamondCut(Remove ${facet.address})`, receipt);
			push("success", "Pallet removed ✓");
			await loadRuntime();
		} catch (e) {
			push("error", e instanceof Error ? e.message : String(e));
		} finally {
			setTxBusy(false);
		}
	}

	// -------------------------------------------------------------------------
	// Granular remove (selected selectors only)
	// -------------------------------------------------------------------------

	async function handleGranularRemove(facet: LiveFacet) {
		const selectors = [...granularSelected] as `0x${string}`[];
		if (!selectors.length) return;
		const names = selectors.map((s) => GLOBAL_SELECTOR_MAP.get(s) ?? s).join(", ");
		if (!confirm(`Remove ${selectors.length} function(s) from ${facet.knownPallet?.name ?? facet.address}?\n\n${names}`)) return;
		setTxBusy(true);
		setLog([]);
		try {
			const client = getPublicClient(rpcUrl);
			const wallet = await getWalletClient(accountIndex, rpcUrl);

			push("pending", `Removing ${selectors.length} function(s): ${names}…`);
			const hash = await wallet.writeContract({
				address: runtimeAddress as Address,
				abi: diamondCutAbi as Abi,
				functionName: "diamondCut",
				args: [[{ facetAddress: ZERO_ADDR, action: 2, functionSelectors: selectors }], ZERO_ADDR, "0x"],
			});
			const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
			requireSuccessfulTx("diamondCut(Remove selectors)", receipt);
			push("success", `${selectors.length} function(s) removed ✓`);
			closeGranular();
			await loadRuntime();
		} catch (e) {
			push("error", e instanceof Error ? e.message : String(e));
		} finally {
			setTxBusy(false);
		}
	}

	// -------------------------------------------------------------------------
	// Granular add (re-register previously removed selectors to existing facet)
	// -------------------------------------------------------------------------

	async function handleGranularAdd(facet: LiveFacet) {
		const selectors = [...granularAddSelected] as `0x${string}`[];
		if (!selectors.length) return;
		const names = selectors.map((s) => GLOBAL_SELECTOR_MAP.get(s) ?? s).join(", ");
		setTxBusy(true);
		setLog([]);
		try {
			const client = getPublicClient(rpcUrl);
			const wallet = await getWalletClient(accountIndex, rpcUrl);

			push("pending", `Re-adding ${selectors.length} function(s) to ${facet.address}: ${names}…`);
			const hash = await wallet.writeContract({
				address: runtimeAddress as Address,
				abi: diamondCutAbi as Abi,
				functionName: "diamondCut",
				args: [[{ facetAddress: facet.address, action: 0, functionSelectors: selectors }], ZERO_ADDR, "0x"],
			});
			const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
			requireSuccessfulTx("diamondCut(Add selectors)", receipt);
			push("success", `${selectors.length} function(s) re-added ✓`);
			closeGranular();
			await loadRuntime();
		} catch (e) {
			push("error", e instanceof Error ? e.message : String(e));
		} finally {
			setTxBusy(false);
		}
	}

	// -------------------------------------------------------------------------
	// Granular replace (selected selectors → new implementation)
	// -------------------------------------------------------------------------

	async function handleGranularReplace(_facet: LiveFacet) {
		const selectors = [...granularSelected] as `0x${string}`[];
		const newPallet = getPalletById(granularReplacePalletId);
		if (!selectors.length || !newPallet || !newPallet.bytecode || newPallet.bytecode === "0x") return;
		const names = selectors.map((s) => GLOBAL_SELECTOR_MAP.get(s) ?? s).join(", ");
		setTxBusy(true);
		setLog([]);
		try {
			const client = getPublicClient(rpcUrl);
			const wallet = await getWalletClient(accountIndex, rpcUrl);

			push("pending", `Deploying new ${newPallet.name}…`);
			const deployHash = await wallet.deployContract({ abi: newPallet.abi as Abi, bytecode: newPallet.bytecode });
			const receipt = await client.waitForTransactionReceipt({ hash: deployHash, timeout: 120_000 });
			const contractAddress = requireSuccessfulCreate(`${newPallet.name} deployment`, receipt);
			push("success", `New implementation deployed: ${contractAddress}`);

			push("pending", `Rerouting ${selectors.length} function(s) via diamondCut(Replace): ${names}…`);
			const cutHash = await wallet.writeContract({
				address: runtimeAddress as Address,
				abi: diamondCutAbi as Abi,
				functionName: "diamondCut",
				args: [[{ facetAddress: contractAddress, action: 1, functionSelectors: selectors }], ZERO_ADDR, "0x"],
			});
			const cutReceipt = await client.waitForTransactionReceipt({ hash: cutHash, timeout: 120_000 });
			requireSuccessfulTx("diamondCut(Replace selectors)", cutReceipt);
			push("success", `${selectors.length} function(s) rerouted to ${contractAddress} ✓`);
			closeGranular();
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
					ERC-2535 allows granular upgrades — add, replace, or remove individual functions
					without touching the rest of the pallet.
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
						{(() => {
							const allRegisteredSelectors = new Set(liveFacets.flatMap((f) => f.selectors));
							return liveFacets.map((facet) => {
							const isGranularOpen = granularFacetAddr === facet.address;
							const allSelected = facet.selectors.length > 0 && facet.selectors.every((s) => granularSelected.has(s));
							// Selectors in the known pallet ABI not registered anywhere in the diamond
							const missingSelectors = facet.knownPallet
								? selectorsFromAbi(facet.knownPallet.abi).filter((s) => !allRegisteredSelectors.has(s))
								: [];

							return (
								<div key={facet.address} className={`card space-y-3 transition-all ${isGranularOpen ? "ring-1 ring-polka-400/30" : ""}`}>
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

									{/* Functions list */}
									<div>
										<div className="flex items-center justify-between mb-1.5">
											<p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
												Functions ({facet.selectors.length})
											</p>
											{isGranularOpen && facet.selectors.length > 1 && (
												<button
													onClick={() => toggleAllGranularSel(facet)}
													className="text-[10px] text-polka-400 hover:text-polka-300"
												>
													{allSelected ? "Deselect all" : "Select all"}
												</button>
											)}
										</div>
										<div className="space-y-0.5">
											{facet.selectors.map((sel) => {
												const fnName = GLOBAL_SELECTOR_MAP.get(sel);
												return isGranularOpen ? (
													<label
														key={sel}
														className={`flex items-center gap-2 rounded px-1.5 py-1 cursor-pointer transition-colors ${granularSelected.has(sel) ? "bg-polka-400/10" : "hover:bg-white/[0.03]"}`}
													>
														<input
															type="checkbox"
															checked={granularSelected.has(sel)}
															onChange={() => toggleGranularSel(sel)}
															className="w-3 h-3 accent-polka-400 flex-shrink-0"
														/>
														<span className="text-xs text-text-secondary flex-1 min-w-0 truncate">
															{fnName ?? <span className="text-text-muted italic">unknown</span>}
														</span>
														<code className="text-[9px] font-mono text-text-muted flex-shrink-0">{sel}</code>
													</label>
												) : (
													<div
														key={sel}
														className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-white/[0.02] border border-white/[0.04]"
													>
														<span className="text-[10px] text-text-secondary flex-1 min-w-0 truncate">
															{fnName ?? <span className="text-text-muted italic">unknown</span>}
														</span>
														<code className="text-[9px] font-mono text-text-muted flex-shrink-0">{sel}</code>
													</div>
												);
											})}
										</div>
									</div>

									{/* Granular action panel */}
									{isGranularOpen && (
										<div className="border-t border-white/[0.06] pt-3 space-y-3">

											{/* Registered functions — remove / replace */}
											<div className="space-y-2">
												<p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
													{granularSelected.size === 0
														? "Select registered functions to remove or replace"
														: `${granularSelected.size} registered function${granularSelected.size !== 1 ? "s" : ""} selected`}
												</p>

												{granularSelected.size > 0 && (
													<>
														<button
															onClick={() => handleGranularRemove(facet)}
															disabled={txBusy}
															className="btn-danger text-xs w-full"
														>
															Remove {granularSelected.size} selected function{granularSelected.size !== 1 ? "s" : ""}
														</button>

														<div className="flex gap-2">
															<select
																value={granularReplacePalletId}
																onChange={(e) => setGranularReplacePalletId(e.target.value)}
																className="input-field flex-1 text-xs"
															>
																<option value="">Route selected to new pallet…</option>
																{PALLET_REGISTRY.map((p) => (
																	<option key={p.id} value={p.id}>{p.name}</option>
																))}
															</select>
															<button
																onClick={() => handleGranularReplace(facet)}
																disabled={txBusy || !granularReplacePalletId}
																className="btn-primary text-xs"
															>
																Replace
															</button>
														</div>
													</>
												)}
											</div>

											{/* Previously removed functions — re-add */}
											{missingSelectors.length > 0 && (
												<div className="border-t border-white/[0.04] pt-2 space-y-1.5">
													<p className="text-[10px] font-medium text-accent-green/70 uppercase tracking-wider">
														Previously removed — re-add to this pallet ({missingSelectors.length})
													</p>
													<div className="space-y-0.5">
														{missingSelectors.map((sel) => (
															<label
																key={sel}
																className={`flex items-center gap-2 rounded px-1.5 py-1 cursor-pointer transition-colors ${granularAddSelected.has(sel) ? "bg-accent-green/10" : "hover:bg-white/[0.03]"}`}
															>
																<input
																	type="checkbox"
																	checked={granularAddSelected.has(sel)}
																	onChange={() => toggleGranularAddSel(sel)}
																	className="w-3 h-3 flex-shrink-0"
																	style={{ accentColor: "rgb(74 222 128)" }}
																/>
																<span className="text-xs text-text-secondary flex-1 min-w-0 truncate">
																	{GLOBAL_SELECTOR_MAP.get(sel) ?? <span className="italic text-text-muted">unknown</span>}
																</span>
																<code className="text-[9px] font-mono text-text-muted flex-shrink-0">{sel}</code>
															</label>
														))}
													</div>
													{granularAddSelected.size > 0 && (
														<button
															onClick={() => handleGranularAdd(facet)}
															disabled={txBusy}
															className="btn-secondary text-xs w-full border-accent-green/20 text-accent-green hover:bg-accent-green/10"
														>
															Re-add {granularAddSelected.size} function{granularAddSelected.size !== 1 ? "s" : ""} to this pallet
														</button>
													)}
												</div>
											)}

											<button onClick={closeGranular} disabled={txBusy} className="btn-secondary text-xs w-full">
												Cancel
											</button>
										</div>
									)}

									{/* Pallet-level actions */}
									{!isGranularOpen && (
										<div className="flex gap-2 pt-1 border-t border-white/[0.04]">
											<button
												onClick={() => openGranular(facet.address)}
												disabled={txBusy}
												className="btn-secondary text-xs flex-1"
												title="Remove or replace individual functions within this pallet"
											>
												Manage functions
											</button>
											<button
												onClick={() => { setReplaceFacetAddr(facet.address); setReplacePalletId(""); }}
												disabled={txBusy}
												className="btn-secondary text-xs"
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
									)}
								</div>
							);
						});
						})()}
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
								Deploy a new pallet instance and register all its selectors via{" "}
								<code className="bg-white/[0.06] px-1 rounded">diamondCut(Add)</code>.
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

					{/* Replace pallet (all selectors) */}
					<div className="rounded-lg border border-white/[0.06] p-4 space-y-3">
						<div>
							<h3 className="text-sm font-semibold text-text-primary mb-0.5">Replace Smart Pallet</h3>
							<p className="text-xs text-text-muted">
								Deploy a new implementation and reroute <em>all</em> of the old pallet's selectors via{" "}
								<code className="bg-white/[0.06] px-1 rounded">diamondCut(Replace)</code> — forkless upgrade.
								To replace only specific functions, use <strong>Manage functions</strong> on a pallet card above.
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
