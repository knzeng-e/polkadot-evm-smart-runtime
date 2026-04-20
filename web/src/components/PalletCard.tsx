import type { KeyboardEvent, ReactNode } from "react";
import {
	type PalletDef,
	categoryMeta,
	functionSignaturesFromAbi,
	selectorsFromAbi,
} from "../config/pallets";

interface Props {
	pallet: PalletDef;
	selected: boolean;
	expanded?: boolean;
	onToggleExpanded?: (id: string) => void;
	showCategoryBadge?: boolean;
	action?: ReactNode;
}

export default function PalletCard({
	pallet,
	selected,
	expanded = false,
	onToggleExpanded,
	showCategoryBadge = true,
	action,
}: Props) {
	const cat = categoryMeta[pallet.category];
	const functions = functionSignaturesFromAbi(pallet.abi);
	const selectors = selectorsFromAbi(pallet.abi);
	const isExpandable = !!onToggleExpanded;

	function handleExpand() {
		onToggleExpanded?.(pallet.id);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (!isExpandable || (event.key !== " " && event.key !== "Enter")) {
			return;
		}

		event.preventDefault();
		handleExpand();
	}

	return (
		<div
			role={isExpandable ? "button" : undefined}
			aria-expanded={isExpandable ? expanded : undefined}
			tabIndex={isExpandable ? 0 : undefined}
			onClick={handleExpand}
			onKeyDown={handleKeyDown}
			className={`group relative flex flex-col gap-3 rounded-xl border p-4 transition-all duration-200 ${
				pallet.required
					? "border-white/[0.06] bg-white/[0.02] opacity-80"
					: selected
						? "card-selected"
						: "card-hover border-white/[0.06]"
			} ${isExpandable ? "cursor-pointer" : ""}`}
		>
			{/* Header */}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 mb-1 flex-wrap">
						{showCategoryBadge && (
							<span className={`badge ${cat.bg} ${cat.color}`}>{cat.label}</span>
						)}
						{pallet.required && (
							<span className="badge bg-white/[0.05] text-text-muted text-[10px]">
								Required
							</span>
						)}
						{selected && !pallet.required && (
							<span className="badge bg-polka-500/15 text-polka-300 border border-polka-500/25 text-[10px]">
								Selected
							</span>
						)}
					</div>
					<h3 className="font-semibold text-text-primary font-display text-sm leading-tight">
						{pallet.name}
					</h3>
				</div>
				{isExpandable && (
					<span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] p-1.5 text-text-muted">
						<svg
							className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.6"
						>
							<path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
					</span>
				)}
			</div>

			{/* Description */}
			<p className="text-xs text-text-secondary leading-relaxed">{pallet.description}</p>

			<div className="mt-auto space-y-3">
				<div className="flex items-center justify-between gap-3">
					<p className="text-[10px] font-mono text-text-muted">
						{functions.length} function{functions.length === 1 ? "" : "s"}
					</p>
					{action && (
						<div onClick={(event) => event.stopPropagation()}>
							{action}
						</div>
					)}
				</div>

				{expanded && functions.length > 0 && (
					<div className="space-y-2 border-t border-white/[0.06] pt-3">
						<p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
							Functions ({functions.length})
						</p>
						<div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
							{functions.map((signature, index) => (
								<div
									key={`${signature}:${selectors[index]}`}
									className="rounded-lg border border-white/[0.06] bg-black/15 px-2.5 py-2"
								>
									<code className="block break-all text-[11px] text-text-primary">
										{signature}
									</code>
									<code className="mt-1 block text-[10px] text-text-muted">
										{selectors[index]}
									</code>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
