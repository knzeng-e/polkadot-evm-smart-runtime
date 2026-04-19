import { Link } from "react-router-dom";
import { PALLET_REGISTRY, categoryMeta, type PalletCategory } from "../config/pallets";

export default function HomePage() {
	const categories = (["core", "access", "token", "app"] as PalletCategory[]).map((cat) => ({
		cat,
		pallets: PALLET_REGISTRY.filter((p) => p.category === cat),
	}));

	return (
		<div className="space-y-10 animate-fade-in">
			{/* Hero */}
			<div className="space-y-4">
				<h1 className="page-title">
					Polkadot{" "}
					<span className="bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent">
						Smart Runtime
					</span>
				</h1>
				<p className="text-text-secondary text-base leading-relaxed max-w-2xl">
					A modular, upgradeable smart-contract system built on the{" "}
					<span className="text-text-primary font-medium">ERC-2535 Diamond Proxy</span> pattern.
					Compose your on-chain logic from Smart Pallets, deploy a Smart Runtime, and upgrade it
					forklessly — without ever redeploying the core contract.
				</p>
			</div>

			{/* Architecture diagram */}
			<div className="card space-y-4">
				<h2 className="section-title">Architecture</h2>
				<div className="rounded-lg border border-white/[0.06] bg-black/20 p-4 font-mono text-xs text-text-secondary leading-relaxed overflow-x-auto">
					<p className="text-text-primary font-semibold">SmartRuntime (Diamond Proxy)</p>
					<p className="text-text-muted">│  Single entry-point — never redeployed</p>
					<p className="text-text-muted">│  fallback → delegatecall → Smart Pallet</p>
					<p>│</p>
					<p>├── <span className="text-accent-blue">DiamondCutPallet</span>   — add / replace / remove Smart Pallets</p>
					<p>├── <span className="text-accent-blue">DiamondLoupePallet</span>  — ERC-2535 introspection</p>
					<p>├── <span className="text-accent-blue">OwnershipPallet</span>     — owner management</p>
					<p>├── <span className="text-accent-orange">AccessControlPallet</span> — role-based permissions</p>
					<p>├── <span className="text-accent-orange">PausablePallet</span>      — emergency stop</p>
					<p>├── <span className="text-accent-purple">FungibleTokenPallet</span> — ERC-20-like assets</p>
					<p>├── <span className="text-accent-purple">NonFungibleTokenPallet</span> — ERC-721-like NFTs</p>
					<p>├── <span className="text-accent-purple">MultiAssetTokenPallet</span> — ERC-1155-like multi-asset</p>
					<p>└── <span className="text-accent-green">ProofOfExistencePallet</span> — example app pallet</p>
				</div>
				<p className="text-xs text-text-muted">
					All pallets share the SmartRuntime's storage via <code className="bg-white/[0.06] px-1 rounded">delegatecall</code>.
					Upgrade at any time by calling <code className="bg-white/[0.06] px-1 rounded">diamondCut</code>.
				</p>
			</div>

			{/* Action cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<Link to="/deploy" className="card-hover group block p-6">
					<div className="flex items-start gap-4">
						<div className="w-10 h-10 rounded-xl bg-polka-500/10 border border-polka-500/20 flex items-center justify-center shrink-0">
							<svg className="w-5 h-5 text-polka-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
								<circle cx="10" cy="10" r="8" />
								<line x1="10" y1="6" x2="10" y2="14" />
								<line x1="6" y1="10" x2="14" y2="10" />
							</svg>
						</div>
						<div>
							<h3 className="text-lg font-semibold text-polka-400 font-display mb-1">
								Deploy a Smart Runtime
							</h3>
							<p className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
								Browse the Smart Pallet catalog, select the pallets your use-case needs, and
								deploy a new SmartRuntime with one click.
							</p>
						</div>
					</div>
				</Link>

				<Link to="/manage" className="card-hover group block p-6">
					<div className="flex items-start gap-4">
						<div className="w-10 h-10 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center shrink-0">
							<svg className="w-5 h-5 text-accent-blue" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
								<rect x="3" y="3" width="6" height="6" rx="1" />
								<rect x="11" y="3" width="6" height="6" rx="1" />
								<rect x="3" y="11" width="6" height="6" rx="1" />
								<rect x="11" y="11" width="6" height="6" rx="1" />
							</svg>
						</div>
						<div>
							<h3 className="text-lg font-semibold text-accent-blue font-display mb-1">
								Manage a Smart Runtime
							</h3>
							<p className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
								Connect to an existing SmartRuntime to inspect its pallets, add new ones,
								replace old versions, or remove unused ones — forklessly.
							</p>
						</div>
					</div>
				</Link>
			</div>

			{/* Pallet catalog overview */}
			<div className="space-y-6">
				<h2 className="section-title">Smart Pallet Catalog</h2>
				{categories.map(({ cat, pallets }) => {
					const meta = categoryMeta[cat];
					return (
						<div key={cat} className="space-y-3">
							<div className="flex items-center gap-2">
								<span className={`badge ${meta.bg} ${meta.color} text-xs`}>{meta.label}</span>
								<span className="text-text-muted text-xs">{pallets.length} pallet{pallets.length !== 1 ? "s" : ""}</span>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
								{pallets.map((p) => (
									<div key={p.id} className="card p-3">
										<div className="flex items-center justify-between mb-1">
											<span className="text-sm font-semibold text-text-primary font-display">{p.name}</span>
											{p.required && (
												<span className="badge bg-white/[0.05] text-text-muted text-[10px]">Required</span>
											)}
										</div>
										<p className="text-xs text-text-secondary leading-relaxed">{p.description}</p>
										<p className="mt-2 text-[10px] text-text-muted font-mono">
											{p.abi.filter((x) => x.type === "function").length} functions
										</p>
									</div>
								))}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
