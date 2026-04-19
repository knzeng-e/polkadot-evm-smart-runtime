import { devAccounts } from "../config/evm";

interface Props {
	value: number;
	onChange: (index: number) => void;
	label?: string;
}

export default function AccountSelector({ value, onChange, label = "Signer Account" }: Props) {
	return (
		<div>
			<label className="label">{label}</label>
			<select
				value={value}
				onChange={(e) => onChange(parseInt(e.target.value))}
				className="input-field w-full"
			>
				{devAccounts.map((acc, i) => (
					<option key={i} value={i}>
						{acc.name} — {acc.account.address}
					</option>
				))}
			</select>
			<p className="mt-1 text-xs text-text-muted">
				Well-known Substrate dev keys — for local testing only.
			</p>
		</div>
	);
}
