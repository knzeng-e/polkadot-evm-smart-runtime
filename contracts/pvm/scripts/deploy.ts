/**
 * Deploy script for the Polkadot Smart Runtime (PVM / resolc)
 *
 * Same deployment logic as the EVM script — the Solidity source is identical;
 * only the compiler differs (resolc produces PolkaVM / RISC-V bytecode).
 *
 * Requires a running Polkadot node with eth-rpc adapter at :8545.
 */

import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { toFunctionSelector, type Abi, type AbiFunction } from "viem";

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const DEPLOYMENTS_JSON = path.resolve(__dirname, "../../../deployments.json");

function updateDeployments(key: string, address: string) {
	let data: Record<string, string | null> = { evm: null, pvm: null };
	try {
		data = JSON.parse(fs.readFileSync(DEPLOYMENTS_JSON, "utf-8"));
	} catch {
		// File doesn't exist yet
	}
	data[key] = address;
	fs.writeFileSync(DEPLOYMENTS_JSON, JSON.stringify(data, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function selectorsFromAbi(abi: Abi): `0x${string}`[] {
	return abi
		.filter((item): item is AbiFunction => item.type === "function")
		.map((fn) => toFunctionSelector(fn));
}

const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 } as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const [walletClient] = await hre.viem.getWalletClients();
	const publicClient = await hre.viem.getPublicClient();

	console.log(`\nDeploying Smart Pallets (PVM/resolc) from: ${walletClient.account.address}\n`);

	const deployPallet = async (name: string) => {
		const artifact = await hre.artifacts.readArtifact(name);
		const hash = await walletClient.deployContract({
			abi: artifact.abi as Abi,
			bytecode: artifact.bytecode as `0x${string}`,
		});
		const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
		if (!receipt.contractAddress) throw new Error(`${name} deploy tx ${hash} has no contract`);
		console.log(`  ✓ ${name}: ${receipt.contractAddress}`);
		return { address: receipt.contractAddress, abi: artifact.abi as Abi };
	};

	const cutPallet = await deployPallet("DiamondCutPallet");
	const loupePallet = await deployPallet("DiamondLoupePallet");
	const ownershipPallet = await deployPallet("OwnershipPallet");
	const accessControlPallet = await deployPallet("AccessControlPallet");
	const pausablePallet = await deployPallet("PausablePallet");
	const poePallet = await deployPallet("ProofOfExistencePallet");
	const fungibleTokenPallet = await deployPallet("FungibleTokenPallet");
	const nonFungibleTokenPallet = await deployPallet("NonFungibleTokenPallet");
	const multiAssetTokenPallet = await deployPallet("MultiAssetTokenPallet");

	const initialCuts = [
		{
			facetAddress: cutPallet.address,
			action: FacetCutAction.Add,
			functionSelectors: selectorsFromAbi(cutPallet.abi),
		},
		{
			facetAddress: loupePallet.address,
			action: FacetCutAction.Add,
			functionSelectors: selectorsFromAbi(loupePallet.abi),
		},
		{
			facetAddress: ownershipPallet.address,
			action: FacetCutAction.Add,
			functionSelectors: selectorsFromAbi(ownershipPallet.abi),
		},
		{
			facetAddress: accessControlPallet.address,
			action: FacetCutAction.Add,
			functionSelectors: selectorsFromAbi(accessControlPallet.abi),
		},
		{
			facetAddress: pausablePallet.address,
			action: FacetCutAction.Add,
			functionSelectors: selectorsFromAbi(pausablePallet.abi),
		},
		{
			facetAddress: poePallet.address,
			action: FacetCutAction.Add,
			functionSelectors: selectorsFromAbi(poePallet.abi),
		},
		{
			facetAddress: fungibleTokenPallet.address,
			action: FacetCutAction.Add,
			functionSelectors: selectorsFromAbi(fungibleTokenPallet.abi),
		},
		{
			facetAddress: nonFungibleTokenPallet.address,
			action: FacetCutAction.Add,
			functionSelectors: selectorsFromAbi(nonFungibleTokenPallet.abi),
		},
		{
			facetAddress: multiAssetTokenPallet.address,
			action: FacetCutAction.Add,
			functionSelectors: selectorsFromAbi(multiAssetTokenPallet.abi),
		},
	];

	console.log("\nDeploying SmartRuntime (Diamond Proxy / PVM)...");

	const runtimeArtifact = await hre.artifacts.readArtifact("SmartRuntime");
	const owner = walletClient.account.address;

	const runtimeHash = await walletClient.deployContract({
		abi: runtimeArtifact.abi as Abi,
		bytecode: runtimeArtifact.bytecode as `0x${string}`,
		args: [owner, initialCuts, "0x0000000000000000000000000000000000000000", "0x"],
	});

	const runtimeReceipt = await publicClient.waitForTransactionReceipt({
		hash: runtimeHash,
		timeout: 180_000,
	});

	if (!runtimeReceipt.contractAddress) {
		throw new Error(`SmartRuntime deploy tx ${runtimeHash} has no contract`);
	}

	const runtimeAddress = runtimeReceipt.contractAddress;
	console.log(`  ✓ SmartRuntime: ${runtimeAddress}`);

	updateDeployments("pvm", runtimeAddress);
	console.log("\n✓ Updated deployments.json");
	console.log(`\nSmartRuntime (PVM) deployed at: ${runtimeAddress}\n`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
