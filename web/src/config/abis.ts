// Inline ABIs for all Smart Runtime contracts.
// Kept here so the DApp works without importing Hardhat artifact JSON files.

export const smartRuntimeAbi = [
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
] as const;

export const diamondCutAbi = [
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
	{
		type: "event",
		name: "DiamondCut",
		inputs: [
			{ name: "cuts", type: "tuple[]", indexed: false },
			{ name: "init", type: "address", indexed: false },
			{ name: "initCalldata", type: "bytes", indexed: false },
		],
	},
] as const;

export const diamondLoupeAbi = [
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
] as const;

export const ownershipAbi = [
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
	{
		type: "event",
		name: "OwnershipTransferred",
		inputs: [
			{ name: "previousOwner", type: "address", indexed: true },
			{ name: "newOwner", type: "address", indexed: true },
		],
	},
] as const;

export const poeAbi = [
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
] as const;

// Combined runtime ABI (all pallets unioned for reading via proxy)
export const runtimeAbi = [
	...diamondCutAbi,
	...diamondLoupeAbi,
	...ownershipAbi,
	...poeAbi,
] as const;
