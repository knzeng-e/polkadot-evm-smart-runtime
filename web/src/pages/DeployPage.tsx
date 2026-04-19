import { useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import type { Abi } from "viem";
import { getPublicClient, getWalletClient } from "../config/evm";
import {
	PALLET_REGISTRY,
	REQUIRED_PALLET_IDS,
	selectorsFromAbi,
	categoryMeta,
	type PalletCategory,
	type PalletDef,
} from "../config/pallets";
import { bytecodes } from "../config/bytecodes";
import PalletCard from "../components/PalletCard";
import TxStatus, { type LogEntry } from "../components/TxStatus";
import AccountSelector from "../components/AccountSelector";

const CATEGORIES: PalletCategory[] = ["core", "access", "token", "app"];
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

interface OutletCtx { rpcUrl: string }

export default function DeployPage() {
	const { rpcUrl } = useOutletContext<OutletCtx>();

	// Selected pallet IDs — required ones are always in
	const [selected, setSelected] = useState<Set<string>>(new Set(REQUIRED_PALLET_IDS));
	const [accountIndex, setAccountIndex] = useState(0);
	const [deploying, setDeploying] = useState(false);
	const [log, setLog] = useState<LogEntry[]>([]);
	const [deployedRuntime, setDeployedRuntime] = useState<string | null>(null);
	const [activeCategory, setActiveCategory] = useState<PalletCategory | "all">("all");

	function push(kind: LogEntry["kind"], text: string) {
		setLog((prev) => [...prev, { kind, text }]);
	}

	function togglePallet(id: string) {
		if (REQUIRED_PALLET_IDS.has(id)) return;
		setSelected((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
	}

	const selectedPallets = PALLET_REGISTRY.filter((p) => selected.has(p.id));

	async function deployRuntime() {
		setDeploying(true);
		setLog([]);
		setDeployedRuntime(null);

		try {
			const publicClient = getPublicClient(rpcUrl);
			const walletClient = await getWalletClient(accountIndex, rpcUrl);
			const owner = walletClient.account!.address;

			push("info", `Deployer: ${owner}`);
			push("info", `Network: ${rpcUrl}`);
			push("info", `Pallets selected: ${selectedPallets.map((p) => p.name).join(", ")}`);
			push("info", "─────────────────────────────────");

			// Deploy each pallet
			const deployedPallets: { pallet: PalletDef; address: `0x${string}` }[] = [];
			for (const pallet of selectedPallets) {
				if (pallet.bytecode === "0x" || !pallet.bytecode) {
					push("error", `${pallet.name}: no bytecode — recompile contracts`);
					return;
				}
				push("pending", `Deploying ${pallet.name}...`);
				const hash = await walletClient.deployContract({
					abi: pallet.abi as Abi,
					bytecode: pallet.bytecode,
				});
				const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
				if (!receipt.contractAddress) throw new Error(`${pallet.name}: no contract address in receipt`);
				push("success", `${pallet.name}: ${receipt.contractAddress}`);
				deployedPallets.push({ pallet, address: receipt.contractAddress });
			}

			// Build FacetCut array
			push("info", "─────────────────────────────────");
			push("pending", "Building initial FacetCut array...");
			const initialCuts = deployedPallets.map(({ pallet, address }) => ({
				facetAddress: address,
				action: 0, // Add
				functionSelectors: selectorsFromAbi(pallet.abi),
			}));

			// Deploy SmartRuntime
			push("pending", "Deploying SmartRuntime (Diamond Proxy)...");
			const runtimeBytecode = bytecodes["SmartRuntime"];
			if (!runtimeBytecode || runtimeBytecode === "0x") {
				push("error", "SmartRuntime bytecode not found — recompile contracts");
				return;
			}

			const smartRuntimeAbi: Abi = [
				{
					type: "constructor",
					inputs: [
						{ name: "owner", type: "address" },
						{
							name: "initialCuts",
							type: "tuple[]",
							components: [
								{ name: "facetAddress", type: "address" },
								{ name: "action", type: "uint8" },
								{ name: "functionSelectors", type: "bytes4[]" },
							],
						},
						{ name: "init", type: "address" },
						{ name: "initCalldata", type: "bytes" },
					],
					stateMutability: "payable",
				},
			];

			const runtimeHash = await walletClient.deployContract({
				abi: smartRuntimeAbi,
				bytecode: runtimeBytecode,
				args: [owner, initialCuts, ZERO_ADDR, "0x"],
			});

			const runtimeReceipt = await publicClient.waitForTransactionReceipt({
				hash: runtimeHash,
				timeout: 120_000,
			});

			if (!runtimeReceipt.contractAddress) {
				throw new Error("SmartRuntime: no contract address in receipt");
			}

			push("success", `SmartRuntime: ${runtimeReceipt.contractAddress}`);
			push("info", "─────────────────────────────────");
			push("success", "Deployment complete!");
			setDeployedRuntime(runtimeReceipt.contractAddress);
		} catch (e) {
			push("error", `${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setDeploying(false);
		}
	}

	const filteredPallets =
		activeCategory === "all"
			? PALLET_REGISTRY
			: PALLET_REGISTRY.filter((p) => p.category === activeCategory);

	return (
		<div className="space-y-8 animate-fade-in">
			{/* Header */}
			<div className="space-y-2">
				<h1 className="page-title">
					Deploy a{" "}
					<span className="bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent">
						Smart Runtime
					</span>
				</h1>
				<p className="text-text-secondary text-sm leading-relaxed max-w-2xl">
					Select the Smart Pallets your application needs. Core pallets are always included.
					Click Deploy to deploy each pallet then assemble the SmartRuntime with a single
					on-chain <code className="bg-white/[0.06] px-1 rounded text-xs">constructor</code> call.
				</p>
			</div>

			{/* Pallet catalog */}
			<div className="space-y-4">
				{/* Category filter */}
				<div className="flex items-center gap-2 flex-wrap">
					<button
						onClick={() => setActiveCategory("all")}
						className={`badge text-xs cursor-pointer transition-colors ${
							activeCategory === "all"
								? "bg-polka-500/20 text-polka-300 border border-polka-500/30"
								: "bg-white/[0.04] text-text-secondary border border-white/[0.08] hover:bg-white/[0.08]"
						}`}
					>
						All ({PALLET_REGISTRY.length})
					</button>
					{CATEGORIES.map((cat) => {
						const meta = categoryMeta[cat];
						const count = PALLET_REGISTRY.filter((p) => p.category === cat).length;
						return (
							<button
								key={cat}
								onClick={() => setActiveCategory(cat)}
								className={`badge text-xs cursor-pointer transition-colors ${
									activeCategory === cat
										? `${meta.bg} ${meta.color} border ${meta.color.replace("text-", "border-")}/30`
										: "bg-white/[0.04] text-text-secondary border border-white/[0.08] hover:bg-white/[0.08]"
								}`}
							>
								{meta.label} ({count})
							</button>
						);
					})}
				</div>

				{/* Grid */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{filteredPallets.map((pallet) => (
						<PalletCard
							key={pallet.id}
							pallet={pallet}
							selected={selected.has(pallet.id)}
							onToggle={togglePallet}
						/>
					))}
				</div>
			</div>

			{/* Deploy panel */}
			<div className="card space-y-5">
				<h2 className="section-title">Deploy Configuration</h2>

				{/* Selected summary */}
				<div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 space-y-2">
					<p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
						Selected Pallets ({selectedPallets.length})
					</p>
					<div className="flex flex-wrap gap-1.5">
						{selectedPallets.map((p) => {
							const meta = categoryMeta[p.category];
							return (
								<span key={p.id} className={`badge ${meta.bg} ${meta.color} text-xs`}>
									{p.name}
									{!p.required && (
										<button
											onClick={() => togglePallet(p.id)}
											className="ml-1 opacity-60 hover:opacity-100"
											title="Remove"
										>
											×
										</button>
									)}
								</span>
							);
						})}
					</div>
				</div>

				<AccountSelector value={accountIndex} onChange={setAccountIndex} />

				{/* Deploy button */}
				<button
					onClick={deployRuntime}
					disabled={deploying || selectedPallets.length === 0}
					className="btn-primary w-full flex items-center justify-center gap-2"
				>
					{deploying ? (
						<>
							<svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
							</svg>
							Deploying…
						</>
					) : (
						<>
							<svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
								<path d="M10 3v10M5 8l5-5 5 5M4 17h12" />
							</svg>
							Deploy SmartRuntime ({selectedPallets.length} pallets)
						</>
					)}
				</button>

				{/* Log */}
				{log.length > 0 && <TxStatus log={log} />}

				{/* Success banner */}
				{deployedRuntime && (
					<div className="rounded-lg border border-accent-green/20 bg-accent-green/5 p-4 space-y-3">
						<div className="flex items-center gap-2">
							<span className="w-5 h-5 rounded-full bg-accent-green/20 flex items-center justify-center">
								<svg className="w-3 h-3 text-accent-green" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
									<polyline points="2,6 5,9 10,3" />
								</svg>
							</span>
							<span className="text-sm font-semibold text-accent-green">SmartRuntime deployed!</span>
						</div>
						<div>
							<p className="text-xs text-text-tertiary mb-1">Contract Address</p>
							<code className="text-sm font-mono text-text-primary break-all">{deployedRuntime}</code>
						</div>
						<Link
							to={`/manage?address=${deployedRuntime}`}
							className="btn-secondary text-sm inline-flex items-center gap-1.5"
						>
							Manage this Runtime →
						</Link>
					</div>
				)}
			</div>
		</div>
	);
}
