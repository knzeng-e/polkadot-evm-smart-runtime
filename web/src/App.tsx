import { useState } from "react";
import { LOCAL_ETH_RPC_URL } from "./config/evm";
import { Outlet, Link, useLocation } from "react-router-dom";

// Global RPC URL stored in module state — simple enough for a dev DApp
let _rpcUrl = LOCAL_ETH_RPC_URL;
export function getRpcUrl() { return _rpcUrl; }

export default function App() {
	const location = useLocation();
	const [rpcUrl, setRpcUrl] = useState(LOCAL_ETH_RPC_URL);
	const [connected, setConnected] = useState<boolean | null>(null);

	async function testConnection(url: string) {
		setConnected(null);
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
			});
			const json = await res.json() as { result?: string };
			setConnected(!!json.result);
		} catch {
			setConnected(false);
		}
	}

	function handleRpcChange(url: string) {
		_rpcUrl = url;
		setRpcUrl(url);
	}

	const navItems = [
		{ path: "/", label: "Home" },
		{ path: "/deploy", label: "Deploy Runtime" },
		{ path: "/manage", label: "Manage Runtime" },
		{ path: "/interact", label: "Interact" },
	];

	return (
		<div className="min-h-screen bg-pattern relative">
			{/* Ambient gradient orbs */}
			<div className="gradient-orb" style={{ background: "#e6007a", top: "-200px", right: "-100px" }} />
			<div className="gradient-orb" style={{ background: "#4cc2ff", bottom: "-200px", left: "-100px" }} />

			{/* Navigation */}
			<nav className="sticky top-0 z-50 border-b border-white/[0.06] backdrop-blur-xl bg-surface-950/80">
				<div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-6">
					{/* Logo */}
					<Link to="/" className="flex items-center gap-2.5 shrink-0 group">
						<div className="w-7 h-7 rounded-lg bg-gradient-to-br from-polka-500 to-polka-700 flex items-center justify-center shadow-glow transition-shadow group-hover:shadow-glow-lg">
							<svg viewBox="0 0 16 16" className="w-4 h-4" fill="white">
								<circle cx="8" cy="3" r="2" />
								<circle cx="3" cy="8" r="2" />
								<circle cx="13" cy="8" r="2" />
								<circle cx="8" cy="13" r="2" />
								<circle cx="8" cy="8" r="1.5" opacity="0.6" />
							</svg>
						</div>
						<span className="text-base font-semibold text-text-primary font-display tracking-tight">
							Smart Runtime
						</span>
					</Link>

					{/* Nav links */}
					<div className="flex gap-0.5 overflow-x-auto">
						{navItems.map((item) => (
							<Link
								key={item.path}
								to={item.path}
								className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
									location.pathname === item.path
										? "text-white"
										: "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
								}`}
							>
								{location.pathname === item.path && (
									<span className="absolute inset-0 rounded-lg bg-polka-500/15 border border-polka-500/25" />
								)}
								<span className="relative">{item.label}</span>
							</Link>
						))}
					</div>

					{/* RPC input + status */}
					<div className="ml-auto flex items-center gap-2 shrink-0">
						<input
							type="text"
							value={rpcUrl}
							onChange={(e) => handleRpcChange(e.target.value)}
							onBlur={(e) => testConnection(e.target.value)}
							placeholder={LOCAL_ETH_RPC_URL}
							className="input-field w-52 text-xs py-1.5"
						/>
						<span
							className={`w-2 h-2 rounded-full transition-colors duration-500 ${
								connected === null
									? "bg-accent-yellow animate-pulse"
									: connected
										? "bg-accent-green shadow-[0_0_6px_rgba(52,211,153,0.5)]"
										: "bg-accent-red"
							}`}
						/>
					</div>
				</div>
			</nav>

			{/* Main */}
			<main className="relative z-10 max-w-5xl mx-auto px-4 py-8">
				<Outlet context={{ rpcUrl }} />
			</main>
		</div>
	);
}
