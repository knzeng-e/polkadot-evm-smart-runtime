import {
	createPublicClient,
	createWalletClient,
	http,
	defineChain,
	type PublicClient,
	type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ---------------------------------------------------------------------------
// Network defaults
// ---------------------------------------------------------------------------

export const LOCAL_ETH_RPC_URL = "http://127.0.0.1:8545";
export const TESTNET_ETH_RPC_URL = "https://services.polkadothub-rpc.com/testnet";
export const TESTNET_CHAIN_ID = 420420417;
export const LOCAL_CHAIN_ID = 420420421;

// ---------------------------------------------------------------------------
// Well-known Substrate dev accounts (PUBLIC test keys — never use for real funds)
// ---------------------------------------------------------------------------

export const devAccounts = [
	{
		name: "Alice",
		account: privateKeyToAccount(
			"0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133",
		),
	},
	{
		name: "Bob",
		account: privateKeyToAccount(
			"0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b",
		),
	},
	{
		name: "Charlie",
		account: privateKeyToAccount(
			"0x0b6e18cafb6ed99687ec547bd28139cafbd3a4f28014f8640076aba0082bf262",
		),
	},
] as const;

// ---------------------------------------------------------------------------
// Client factory — cached per URL
// ---------------------------------------------------------------------------

let _publicClient: PublicClient | null = null;
let _publicClientUrl = "";

export function getPublicClient(rpcUrl = LOCAL_ETH_RPC_URL): PublicClient {
	if (!_publicClient || _publicClientUrl !== rpcUrl) {
		_publicClient = createPublicClient({ transport: http(rpcUrl) });
		_publicClientUrl = rpcUrl;
	}
	return _publicClient;
}

let _chainCache: Chain | null = null;
let _chainCacheUrl = "";

export async function getChain(rpcUrl = LOCAL_ETH_RPC_URL): Promise<Chain> {
	if (!_chainCache || _chainCacheUrl !== rpcUrl) {
		const client = getPublicClient(rpcUrl);
		const chainId = await client.getChainId();
		_chainCache = defineChain({
			id: chainId,
			name:
				rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost")
					? "Local Parachain"
					: "Polkadot Hub TestNet",
			nativeCurrency: { name: "Unit", symbol: "UNIT", decimals: 18 },
			rpcUrls: { default: { http: [rpcUrl] } },
		});
		_chainCacheUrl = rpcUrl;
	}
	return _chainCache;
}

export async function getWalletClient(accountIndex: number, rpcUrl = LOCAL_ETH_RPC_URL) {
	const chain = await getChain(rpcUrl);
	return createWalletClient({
		account: devAccounts[accountIndex as 0 | 1 | 2].account,
		chain,
		transport: http(rpcUrl),
	});
}
