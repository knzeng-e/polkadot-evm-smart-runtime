import { toFunctionSelector, type Abi, type AbiFunction } from "viem";
import { bytecodes } from "./bytecodes";

// ---------------------------------------------------------------------------
// Pallet categories
// ---------------------------------------------------------------------------

export type PalletCategory = "core" | "access" | "token" | "app";

export const categoryMeta: Record<
	PalletCategory,
	{ label: string; color: string; bg: string }
> = {
	core: { label: "Core", color: "text-accent-blue", bg: "bg-accent-blue/10" },
	access: { label: "Access", color: "text-accent-orange", bg: "bg-accent-orange/10" },
	token: { label: "Token", color: "text-accent-purple", bg: "bg-accent-purple/10" },
	app: { label: "App", color: "text-accent-green", bg: "bg-accent-green/10" },
};

// ---------------------------------------------------------------------------
// Pallet registry — all known Smart Pallets
// ---------------------------------------------------------------------------

export interface PalletDef {
	/** Unique identifier — matches Solidity contract name */
	id: string;
	name: string;
	description: string;
	category: PalletCategory;
	/** Whether this pallet is mandatory for every SmartRuntime */
	required: boolean;
	abi: Abi;
	bytecode: `0x${string}`;
}

// Helper: derive 4-byte selectors from an ABI
export function selectorsFromAbi(abi: Abi): `0x${string}`[] {
	return (abi as AbiFunction[])
		.filter((item) => item.type === "function")
		.map((fn) => toFunctionSelector(fn as AbiFunction));
}

const diamondCutAbi: Abi = [
	{
		type: "function",
		name: "diamondCut",
		inputs: [
			{
				name: "cuts",
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
		outputs: [],
		stateMutability: "nonpayable",
	},
];

const diamondLoupeAbi: Abi = [
	{
		type: "function",
		name: "facets",
		inputs: [],
		outputs: [
			{
				name: "facets_",
				type: "tuple[]",
				components: [
					{ name: "facetAddress", type: "address" },
					{ name: "functionSelectors", type: "bytes4[]" },
				],
			},
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "facetFunctionSelectors",
		inputs: [{ name: "facet", type: "address" }],
		outputs: [{ name: "facetFunctionSelectors_", type: "bytes4[]" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "facetAddresses",
		inputs: [],
		outputs: [{ name: "facetAddresses_", type: "address[]" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "facetAddress",
		inputs: [{ name: "functionSelector", type: "bytes4" }],
		outputs: [{ name: "facetAddress_", type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "supportsInterface",
		inputs: [{ name: "interfaceId", type: "bytes4" }],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
];

const ownershipAbi: Abi = [
	{
		type: "function",
		name: "owner",
		inputs: [],
		outputs: [{ name: "owner_", type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "transferOwnership",
		inputs: [{ name: "newOwner", type: "address" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
];

const poeAbi: Abi = [
	{
		type: "function",
		name: "createClaim",
		inputs: [{ name: "documentHash", type: "bytes32" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "revokeClaim",
		inputs: [{ name: "documentHash", type: "bytes32" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "getClaim",
		inputs: [{ name: "documentHash", type: "bytes32" }],
		outputs: [
			{ name: "claimOwner", type: "address" },
			{ name: "blockNumber", type: "uint256" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getClaimCount",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getClaimHashAtIndex",
		inputs: [{ name: "index", type: "uint256" }],
		outputs: [{ name: "", type: "bytes32" }],
		stateMutability: "view",
	},
];

const accessControlAbi: Abi = [
	{
		type: "function",
		name: "BURNER_ROLE",
		inputs: [],
		outputs: [{ name: "", type: "bytes32" }],
		stateMutability: "pure",
	},
	{
		type: "function",
		name: "DEFAULT_ADMIN_ROLE",
		inputs: [],
		outputs: [{ name: "", type: "bytes32" }],
		stateMutability: "pure",
	},
	{
		type: "function",
		name: "MINTER_ROLE",
		inputs: [],
		outputs: [{ name: "", type: "bytes32" }],
		stateMutability: "pure",
	},
	{
		type: "function",
		name: "PAUSER_ROLE",
		inputs: [],
		outputs: [{ name: "", type: "bytes32" }],
		stateMutability: "pure",
	},
	{
		type: "function",
		name: "getRoleAdmin",
		inputs: [{ name: "role", type: "bytes32" }],
		outputs: [{ name: "", type: "bytes32" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "grantRole",
		inputs: [
			{ name: "role", type: "bytes32" },
			{ name: "account", type: "address" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "hasRole",
		inputs: [
			{ name: "role", type: "bytes32" },
			{ name: "account", type: "address" },
		],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "renounceRole",
		inputs: [
			{ name: "role", type: "bytes32" },
			{ name: "account", type: "address" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "revokeRole",
		inputs: [
			{ name: "role", type: "bytes32" },
			{ name: "account", type: "address" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "setRoleAdmin",
		inputs: [
			{ name: "role", type: "bytes32" },
			{ name: "adminRole", type: "bytes32" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
];

const pausableAbi: Abi = [
	{
		type: "function",
		name: "pause",
		inputs: [],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "paused",
		inputs: [],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "unpause",
		inputs: [],
		outputs: [],
		stateMutability: "nonpayable",
	},
];

const fungibleTokenAbi: Abi = [
	{
		type: "function",
		name: "fungibleAllowance",
		inputs: [
			{ name: "owner", type: "address" },
			{ name: "spender", type: "address" },
		],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "fungibleApprove",
		inputs: [
			{ name: "spender", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "fungibleBalanceOf",
		inputs: [{ name: "account", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "fungibleBurn",
		inputs: [
			{ name: "from", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "fungibleDecimals",
		inputs: [],
		outputs: [{ name: "", type: "uint8" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "fungibleDecreaseAllowance",
		inputs: [
			{ name: "spender", type: "address" },
			{ name: "subtractedValue", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "fungibleIncreaseAllowance",
		inputs: [
			{ name: "spender", type: "address" },
			{ name: "addedValue", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "fungibleMint",
		inputs: [
			{ name: "to", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "fungibleName",
		inputs: [],
		outputs: [{ name: "", type: "string" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "fungibleSymbol",
		inputs: [],
		outputs: [{ name: "", type: "string" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "fungibleTotalSupply",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "fungibleTransfer",
		inputs: [
			{ name: "to", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "fungibleTransferFrom",
		inputs: [
			{ name: "from", type: "address" },
			{ name: "to", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "initializeFungibleToken",
		inputs: [
			{ name: "name_", type: "string" },
			{ name: "symbol_", type: "string" },
			{ name: "decimals_", type: "uint8" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
];

const nftAbi: Abi = [
	{
		type: "function",
		name: "initializeNonFungibleToken",
		inputs: [
			{ name: "name_", type: "string" },
			{ name: "symbol_", type: "string" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "nftApprove",
		inputs: [
			{ name: "to", type: "address" },
			{ name: "tokenId", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "nftBalanceOf",
		inputs: [{ name: "owner", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "nftBurn",
		inputs: [{ name: "tokenId", type: "uint256" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "nftExists",
		inputs: [{ name: "tokenId", type: "uint256" }],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "nftGetApproved",
		inputs: [{ name: "tokenId", type: "uint256" }],
		outputs: [{ name: "", type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "nftIsApprovedForAll",
		inputs: [
			{ name: "owner", type: "address" },
			{ name: "operator", type: "address" },
		],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "nftMint",
		inputs: [
			{ name: "to", type: "address" },
			{ name: "tokenId", type: "uint256" },
			{ name: "tokenUri", type: "string" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "nftName",
		inputs: [],
		outputs: [{ name: "", type: "string" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "nftOwnerOf",
		inputs: [{ name: "tokenId", type: "uint256" }],
		outputs: [{ name: "", type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "nftSafeTransferFrom",
		inputs: [
			{ name: "from", type: "address" },
			{ name: "to", type: "address" },
			{ name: "tokenId", type: "uint256" },
			{ name: "data", type: "bytes" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "nftSetApprovalForAll",
		inputs: [
			{ name: "operator", type: "address" },
			{ name: "approved", type: "bool" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "nftSymbol",
		inputs: [],
		outputs: [{ name: "", type: "string" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "nftTokenURI",
		inputs: [{ name: "tokenId", type: "uint256" }],
		outputs: [{ name: "", type: "string" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "nftTransferFrom",
		inputs: [
			{ name: "from", type: "address" },
			{ name: "to", type: "address" },
			{ name: "tokenId", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
];

const multiAssetAbi: Abi = [
	{
		type: "function",
		name: "initializeMultiAssetToken",
		inputs: [{ name: "baseUri_", type: "string" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "multiAssetBalanceOf",
		inputs: [
			{ name: "account", type: "address" },
			{ name: "id", type: "uint256" },
		],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "multiAssetBalanceOfBatch",
		inputs: [
			{ name: "accounts", type: "address[]" },
			{ name: "ids", type: "uint256[]" },
		],
		outputs: [{ name: "balances", type: "uint256[]" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "multiAssetBaseUri",
		inputs: [],
		outputs: [{ name: "", type: "string" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "multiAssetBurn",
		inputs: [
			{ name: "from", type: "address" },
			{ name: "id", type: "uint256" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "multiAssetBurnBatch",
		inputs: [
			{ name: "from", type: "address" },
			{ name: "ids", type: "uint256[]" },
			{ name: "amounts", type: "uint256[]" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "multiAssetIsApprovedForAll",
		inputs: [
			{ name: "account", type: "address" },
			{ name: "operator", type: "address" },
		],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "multiAssetMint",
		inputs: [
			{ name: "to", type: "address" },
			{ name: "id", type: "uint256" },
			{ name: "amount", type: "uint256" },
			{ name: "tokenUri", type: "string" },
			{ name: "data", type: "bytes" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "multiAssetMintBatch",
		inputs: [
			{ name: "to", type: "address" },
			{ name: "ids", type: "uint256[]" },
			{ name: "amounts", type: "uint256[]" },
			{ name: "data", type: "bytes" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "multiAssetSafeBatchTransferFrom",
		inputs: [
			{ name: "from", type: "address" },
			{ name: "to", type: "address" },
			{ name: "ids", type: "uint256[]" },
			{ name: "amounts", type: "uint256[]" },
			{ name: "data", type: "bytes" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "multiAssetSafeTransferFrom",
		inputs: [
			{ name: "from", type: "address" },
			{ name: "to", type: "address" },
			{ name: "id", type: "uint256" },
			{ name: "amount", type: "uint256" },
			{ name: "data", type: "bytes" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "multiAssetSetApprovalForAll",
		inputs: [
			{ name: "operator", type: "address" },
			{ name: "approved", type: "bool" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "multiAssetSetBaseUri",
		inputs: [{ name: "newBaseUri", type: "string" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "multiAssetSetTokenUri",
		inputs: [
			{ name: "id", type: "uint256" },
			{ name: "newUri", type: "string" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "multiAssetTotalSupply",
		inputs: [{ name: "id", type: "uint256" }],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "multiAssetUri",
		inputs: [{ name: "id", type: "uint256" }],
		outputs: [{ name: "", type: "string" }],
		stateMutability: "view",
	},
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PALLET_REGISTRY: PalletDef[] = [
	// --- Core (required) ---
	{
		id: "DiamondCutPallet",
		name: "Diamond Cut",
		description:
			"Enables forkless upgrades. Add, replace, or remove Smart Pallets at any time without redeploying the SmartRuntime.",
		category: "core",
		required: true,
		abi: diamondCutAbi,
		bytecode: bytecodes["DiamondCutPallet"] ?? "0x",
	},
	{
		id: "DiamondLoupePallet",
		name: "Diamond Loupe",
		description:
			"ERC-2535 introspection. Lets any tool or contract discover which Smart Pallets are registered and which selectors they serve.",
		category: "core",
		required: true,
		abi: diamondLoupeAbi,
		bytecode: bytecodes["DiamondLoupePallet"] ?? "0x",
	},
	{
		id: "OwnershipPallet",
		name: "Ownership",
		description:
			"Simple single-owner access control. The owner is the only account that can call diamondCut to upgrade the runtime.",
		category: "core",
		required: true,
		abi: ownershipAbi,
		bytecode: bytecodes["OwnershipPallet"] ?? "0x",
	},

	// --- Access ---
	{
		id: "AccessControlPallet",
		name: "Access Control",
		description:
			"Role-based permissions (DEFAULT_ADMIN_ROLE, MINTER_ROLE, BURNER_ROLE, PAUSER_ROLE). Inspired by OpenZeppelin AccessControl.",
		category: "access",
		required: false,
		abi: accessControlAbi,
		bytecode: bytecodes["AccessControlPallet"] ?? "0x",
	},
	{
		id: "PausablePallet",
		name: "Pausable",
		description:
			"Global emergency stop. The PAUSER_ROLE can freeze all token pallets in one transaction.",
		category: "access",
		required: false,
		abi: pausableAbi,
		bytecode: bytecodes["PausablePallet"] ?? "0x",
	},

	// --- Token ---
	{
		id: "FungibleTokenPallet",
		name: "Fungible Token",
		description:
			"ERC-20-like balances, allowances, mint, and burn. Functions are namespaced (fungibleTransfer, fungibleMint…) to coexist with NFT pallets.",
		category: "token",
		required: false,
		abi: fungibleTokenAbi,
		bytecode: bytecodes["FungibleTokenPallet"] ?? "0x",
	},
	{
		id: "NonFungibleTokenPallet",
		name: "Non-Fungible Token",
		description:
			"ERC-721-like ownership, approvals, and transfers. Namespaced functions (nftMint, nftTransferFrom…) to avoid selector collisions.",
		category: "token",
		required: false,
		abi: nftAbi,
		bytecode: bytecodes["NonFungibleTokenPallet"] ?? "0x",
	},
	{
		id: "MultiAssetTokenPallet",
		name: "Multi-Asset Token",
		description:
			"ERC-1155-like batch balances, operator approvals, and batch transfers. Ideal for gaming or multi-asset DeFi.",
		category: "token",
		required: false,
		abi: multiAssetAbi,
		bytecode: bytecodes["MultiAssetTokenPallet"] ?? "0x",
	},

	// --- App ---
	{
		id: "ProofOfExistencePallet",
		name: "Proof of Existence",
		description:
			"Example Smart Pallet. Claim and revoke document hashes on-chain. Demonstrates the upgrade pattern — swap it out for a V2 without redeploying the runtime.",
		category: "app",
		required: false,
		abi: poeAbi,
		bytecode: bytecodes["ProofOfExistencePallet"] ?? "0x",
	},
];

export const REQUIRED_PALLET_IDS = new Set(
	PALLET_REGISTRY.filter((p) => p.required).map((p) => p.id),
);

export function getPalletById(id: string): PalletDef | undefined {
	return PALLET_REGISTRY.find((p) => p.id === id);
}
