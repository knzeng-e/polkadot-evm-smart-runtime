import { type PalletDef, categoryMeta, selectorsFromAbi } from "../config/pallets";

interface Props {
	pallet: PalletDef;
	selected: boolean;
	onToggle?: (id: string) => void;
	/** Show selector list — off by default for compact view */
	showSelectors?: boolean;
	/** Extra slot rendered at bottom right */
	action?: React.ReactNode;
}

export default function PalletCard({
	pallet,
	selected,
	onToggle,
	showSelectors = false,
	action,
}: Props) {
	const cat = categoryMeta[pallet.category];
	const selectors = selectorsFromAbi(pallet.abi);
	const isClickable = !!onToggle && !pallet.required;

	return (
		<div
			role={isClickable ? "checkbox" : undefined}
			aria-checked={isClickable ? selected : undefined}
			tabIndex={isClickable ? 0 : undefined}
			onClick={() => isClickable && onToggle(pallet.id)}
			onKeyDown={(e) => {
				if (isClickable && (e.key === " " || e.key === "Enter")) {
					e.preventDefault();
					onToggle(pallet.id);
				}
			}}
			className={`group relative flex flex-col gap-3 rounded-xl border p-4 transition-all duration-200 ${
				pallet.required
					? "border-white/[0.06] bg-white/[0.02] opacity-80"
					: selected
						? "card-selected"
						: "card-hover border-white/[0.06]"
			} ${isClickable ? "cursor-pointer" : ""}`}
		>
			{/* Selected tick */}
			{selected && !pallet.required && (
				<span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-polka-500 flex items-center justify-center">
					<svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
						<polyline points="2,6 5,9 10,3" />
					</svg>
				</span>
			)}

			{/* Required lock */}
			{pallet.required && (
				<span className="absolute top-3 right-3 text-text-muted" title="Required pallet">
					<svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
						<path d="M8 1a3 3 0 00-3 3v2H4a1 1 0 00-1 1v7a1 1 0 001 1h8a1 1 0 001-1V7a1 1 0 00-1-1h-1V4a3 3 0 00-3-3zm-1 3a1 1 0 012 0v2H7V4zm1 5a1 1 0 110 2 1 1 0 010-2z" />
					</svg>
				</span>
			)}

			{/* Header */}
			<div className="flex items-start gap-2 pr-6">
				<div>
					<div className="flex items-center gap-2 mb-1">
						<span className={`badge ${cat.bg} ${cat.color}`}>{cat.label}</span>
					</div>
					<h3 className="font-semibold text-text-primary font-display text-sm leading-tight">
						{pallet.name}
					</h3>
				</div>
			</div>

			{/* Description */}
			<p className="text-xs text-text-secondary leading-relaxed">{pallet.description}</p>

			{/* Selector list */}
			{showSelectors && selectors.length > 0 && (
				<div className="space-y-1">
					<p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
						Selectors ({selectors.length})
					</p>
					<div className="flex flex-wrap gap-1">
						{selectors.map((sel) => (
							<code
								key={sel}
								className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-text-muted"
							>
								{sel}
							</code>
						))}
					</div>
				</div>
			)}

			{/* Action slot */}
			{action && <div className="mt-auto pt-1">{action}</div>}
		</div>
	);
}
