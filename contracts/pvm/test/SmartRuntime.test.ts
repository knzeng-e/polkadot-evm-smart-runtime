/**
 * SmartRuntime test suite (PVM / resolc)
 *
 * Identical test logic to the EVM suite — runs against a live node (local network)
 * because the Hardhat Network does not simulate PolkaVM execution.
 *
 * Prerequisites: running Polkadot node + eth-rpc adapter on :8545
 *   ./scripts/start-local.sh   (from the polkadot-stack-template sibling)
 *
 * Run:
 *   cd contracts/pvm && npx hardhat test --network local
 */

import { expect } from "chai";
import hre from "hardhat";
import {
	toFunctionSelector,
	keccak256,
	toBytes,
	getAddress,
	parseEventLogs,
	type Abi,
	type AbiFunction,
} from "viem";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 } as const;

function selectorsFromAbi(abi: Abi): `0x${string}`[] {
	return abi
		.filter((item): item is AbiFunction => item.type === "function")
		.map((fn) => toFunctionSelector(fn));
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

// ---------------------------------------------------------------------------
// Shared state (PVM tests are stateful — no fixture snapshots on live network)
// ---------------------------------------------------------------------------

let runtimeAddress: `0x${string}`;
let ownerAddress: `0x${string}`;
let otherAddress: `0x${string}`;
let cutAbi: Abi;
let loupeAbi: Abi;
let ownershipAbi: Abi;
let poeAbi: Abi;
let poePalletAddress: `0x${string}`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SmartRuntime (PVM)", function () {
	this.timeout(300_000); // PVM transactions can be slower

	before(async function () {
		const [owner, other] = await hre.viem.getWalletClients();
		const publicClient = await hre.viem.getPublicClient();
		ownerAddress = owner.account.address;
		otherAddress = other.account.address;

		const cutArtifact = await hre.artifacts.readArtifact("DiamondCutPallet");
		const loupeArtifact = await hre.artifacts.readArtifact("DiamondLoupePallet");
		const ownershipArtifact = await hre.artifacts.readArtifact("OwnershipPallet");
		const poeArtifact = await hre.artifacts.readArtifact("ProofOfExistencePallet");
		cutAbi = cutArtifact.abi as Abi;
		loupeAbi = loupeArtifact.abi as Abi;
		ownershipAbi = ownershipArtifact.abi as Abi;
		poeAbi = poeArtifact.abi as Abi;

		const deployPallet = async (name: string, abi: Abi, bytecode: `0x${string}`) => {
			const hash = await owner.deployContract({ abi, bytecode });
			const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
			if (!r.contractAddress) throw new Error(`${name} no contract`);
			return r.contractAddress;
		};

		const cutAddr = await deployPallet(
			"DiamondCutPallet",
			cutAbi,
			cutArtifact.bytecode as `0x${string}`,
		);
		const loupeAddr = await deployPallet(
			"DiamondLoupePallet",
			loupeAbi,
			loupeArtifact.bytecode as `0x${string}`,
		);
		const ownershipAddr = await deployPallet(
			"OwnershipPallet",
			ownershipAbi,
			ownershipArtifact.bytecode as `0x${string}`,
		);
		poePalletAddress = await deployPallet(
			"ProofOfExistencePallet",
			poeAbi,
			poeArtifact.bytecode as `0x${string}`,
		);

		const initialCuts = [
			{ facetAddress: cutAddr, action: FacetCutAction.Add, functionSelectors: selectorsFromAbi(cutAbi) },
			{ facetAddress: loupeAddr, action: FacetCutAction.Add, functionSelectors: selectorsFromAbi(loupeAbi) },
			{ facetAddress: ownershipAddr, action: FacetCutAction.Add, functionSelectors: selectorsFromAbi(ownershipAbi) },
			{ facetAddress: poePalletAddress, action: FacetCutAction.Add, functionSelectors: selectorsFromAbi(poeAbi) },
		];

		const runtimeArtifact = await hre.artifacts.readArtifact("SmartRuntime");
		const runtimeHash = await owner.deployContract({
			abi: runtimeArtifact.abi as Abi,
			bytecode: runtimeArtifact.bytecode as `0x${string}`,
			args: [ownerAddress, initialCuts, ZERO_ADDR, "0x"],
		});
		const runtimeReceipt = await publicClient.waitForTransactionReceipt({
			hash: runtimeHash,
			timeout: 180_000,
		});
		if (!runtimeReceipt.contractAddress) throw new Error("SmartRuntime has no contract");
		runtimeAddress = runtimeReceipt.contractAddress;
		console.log(`\n  SmartRuntime (PVM) deployed at: ${runtimeAddress}\n`);
	});

	it("registers all Smart Pallets", async function () {
		const loupe = await hre.viem.getContractAt("DiamondLoupePallet", runtimeAddress);
		const addresses = await loupe.read.facetAddresses();
		expect(addresses.length).to.equal(4);
	});

	it("owner() returns deployer", async function () {
		const ownership = await hre.viem.getContractAt("OwnershipPallet", runtimeAddress);
		expect(getAddress(await ownership.read.owner())).to.equal(getAddress(ownerAddress));
	});

	it("createClaim and getClaim work via proxy", async function () {
		const poe = await hre.viem.getContractAt("ProofOfExistencePallet", runtimeAddress);
		const docHash = keccak256(toBytes("pvm-smart-runtime-test"));
		await poe.write.createClaim([docHash]);
		const [claimOwner] = await poe.read.getClaim([docHash]);
		expect(getAddress(claimOwner)).to.equal(getAddress(ownerAddress));
	});

	it("forkless upgrade: replace ProofOfExistencePallet", async function () {
		const newPoeArtifact = await hre.artifacts.readArtifact("ProofOfExistencePallet");
		const [owner] = await hre.viem.getWalletClients();
		const publicClient = await hre.viem.getPublicClient();

		const newHash = await owner.deployContract({
			abi: newPoeArtifact.abi as Abi,
			bytecode: newPoeArtifact.bytecode as `0x${string}`,
		});
		const newReceipt = await publicClient.waitForTransactionReceipt({
			hash: newHash,
			timeout: 180_000,
		});
		const newPoeAddr = newReceipt.contractAddress!;

		const cut = await hre.viem.getContractAt("DiamondCutPallet", runtimeAddress);
		await cut.write.diamondCut([
			[{ facetAddress: newPoeAddr, action: FacetCutAction.Replace, functionSelectors: selectorsFromAbi(poeAbi) }],
			ZERO_ADDR,
			"0x",
		]);

		const loupe = await hre.viem.getContractAt("DiamondLoupePallet", runtimeAddress);
		const sel = toFunctionSelector("createClaim(bytes32)");
		const registeredAddr = await loupe.read.facetAddress([sel]);
		expect(getAddress(registeredAddr)).to.equal(getAddress(newPoeAddr));
	});
});
