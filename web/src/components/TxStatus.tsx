export type LogEntry = { kind: "info" | "success" | "error" | "pending"; text: string };

interface Props {
	log: LogEntry[];
	className?: string;
}

const kindStyle: Record<LogEntry["kind"], string> = {
	info: "text-text-secondary",
	pending: "text-accent-yellow",
	success: "text-accent-green",
	error: "text-accent-red",
};

const kindPrefix: Record<LogEntry["kind"], string> = {
	info: "  ",
	pending: "⟳ ",
	success: "✓ ",
	error: "✗ ",
};

export default function TxStatus({ log, className = "" }: Props) {
	if (log.length === 0) return null;
	return (
		<div
			className={`rounded-lg border border-white/[0.06] bg-black/30 p-3 space-y-0.5 font-mono text-xs overflow-y-auto max-h-48 ${className}`}
		>
			{log.map((entry, i) => (
				<p key={i} className={kindStyle[entry.kind]}>
					<span className="select-none">{kindPrefix[entry.kind]}</span>
					{entry.text}
				</p>
			))}
		</div>
	);
}
