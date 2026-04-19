/**
 * SmartRuntime test suite (EVM / Hardhat Network)
 *
 * Tests cover:
 *   - Diamond construction with initial Smart Pallets
 *   - DiamondLoupe introspection (ERC-2535)
 *   - ERC-165 interface detection
 *   - ProofOfExistencePallet logic via the SmartRuntime proxy
 *   - OwnershipPallet
 *   - Forkless upgrade: Replace a Smart Pallet via DiamondCutPallet
 */

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { toFunctionSelector, keccak256, toBytes, getAddress, parseEventLogs, type Abi, type AbiFunction } from 'viem';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 } as const;

/**
 * Extract 4-byte function selectors from a Hardhat ABI.
 * Uses toFunctionSelector(abiItem) so tuple inputs are expanded correctly
 * (e.g. FacetCut[] -> (address,uint8,bytes4[])[]).
 */
function selectorsFromAbi(abi: Abi): `0x${string}`[] {
  return abi.filter((item): item is AbiFunction => item.type === 'function').map(fn => toFunctionSelector(fn));
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const;

// ---------------------------------------------------------------------------
// Fixture — deploys all pallets + SmartRuntime fresh for each test group
// ---------------------------------------------------------------------------

async function deploySmartRuntimeFixture() {
  const [owner, otherAccount] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  const cutArtifact = await hre.artifacts.readArtifact('DiamondCutPallet');
  const loupeArtifact = await hre.artifacts.readArtifact('DiamondLoupePallet');
  const ownershipArtifact = await hre.artifacts.readArtifact('OwnershipPallet');
  const poeArtifact = await hre.artifacts.readArtifact('ProofOfExistencePallet');

  // Deploy all Smart Pallets
  const cutPallet = await hre.viem.deployContract('DiamondCutPallet');
  const loupePallet = await hre.viem.deployContract('DiamondLoupePallet');
  const ownershipPallet = await hre.viem.deployContract('OwnershipPallet');
  const poePallet = await hre.viem.deployContract('ProofOfExistencePallet');

  const initialCuts = [
    {
      facetAddress: cutPallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(cutArtifact.abi as Abi)
    },
    {
      facetAddress: loupePallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(loupeArtifact.abi as Abi)
    },
    {
      facetAddress: ownershipPallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(ownershipArtifact.abi as Abi)
    },
    {
      facetAddress: poePallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(poeArtifact.abi as Abi)
    }
  ];

  // Deploy SmartRuntime (Diamond Proxy)
  const runtime = await hre.viem.deployContract('SmartRuntime', [owner.account.address, initialCuts, ZERO_ADDR, '0x']);

  return {
    runtime,
    cutPallet,
    loupePallet,
    ownershipPallet,
    poePallet,
    cutArtifact,
    loupeArtifact,
    ownershipArtifact,
    poeArtifact,
    owner,
    otherAccount,
    publicClient
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SmartRuntime', function () {
  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  describe('Construction', function () {
    it('registers all initial Smart Pallets', async function () {
      const { runtime, cutPallet, loupePallet, ownershipPallet, poePallet } = await loadFixture(deploySmartRuntimeFixture);

      const loupe = await hre.viem.getContractAt('DiamondLoupePallet', runtime.address);
      const addresses = (await loupe.read.facetAddresses()).map(a => a.toLowerCase());

      expect(addresses).to.include.members([
        cutPallet.address.toLowerCase(),
        loupePallet.address.toLowerCase(),
        ownershipPallet.address.toLowerCase(),
        poePallet.address.toLowerCase()
      ]);
    });

    it('registers function selectors for each pallet', async function () {
      const { runtime, poePallet, poeArtifact } = await loadFixture(deploySmartRuntimeFixture);

      const loupe = await hre.viem.getContractAt('DiamondLoupePallet', runtime.address);
      const poeSelectors = selectorsFromAbi(poeArtifact.abi as Abi);
      const registeredSelectors = await loupe.read.facetFunctionSelectors([poePallet.address]);
      for (const sel of poeSelectors) {
        expect(registeredSelectors).to.include(sel);
      }
    });
  });

  // -------------------------------------------------------------------------
  // ERC-165
  // -------------------------------------------------------------------------

  describe('ERC-165', function () {
    it('supports IDiamondLoupe interface', async function () {
      const { runtime } = await loadFixture(deploySmartRuntimeFixture);
      const loupe = await hre.viem.getContractAt('DiamondLoupePallet', runtime.address);
      // Compute IDiamondLoupe interfaceId = XOR of all function selectors
      const ids = ['facets()', 'facetFunctionSelectors(address)', 'facetAddresses()', 'facetAddress(bytes4)'].map(toFunctionSelector);
      const interfaceId = ids.reduce(
        (acc, id) => ('0x' + (parseInt(acc.slice(2), 16) ^ parseInt(id.slice(2), 16)).toString(16).padStart(8, '0')) as `0x${string}`
      );
      expect(await loupe.read.supportsInterface([interfaceId])).to.equal(true);
    });

    it('does not support a random interface', async function () {
      const { runtime } = await loadFixture(deploySmartRuntimeFixture);
      const loupe = await hre.viem.getContractAt('DiamondLoupePallet', runtime.address);
      expect(await loupe.read.supportsInterface(['0xdeadbeef'])).to.equal(false);
    });
  });

  // -------------------------------------------------------------------------
  // DiamondLoupe
  // -------------------------------------------------------------------------

  describe('DiamondLoupePallet', function () {
    it('returns facet count equal to number of pallets', async function () {
      const { runtime } = await loadFixture(deploySmartRuntimeFixture);
      const loupe = await hre.viem.getContractAt('DiamondLoupePallet', runtime.address);
      const facets = await loupe.read.facets();
      expect(facets.length).to.equal(4);
    });

    it('facetAddress returns correct pallet for a PoE selector', async function () {
      const { runtime, poePallet } = await loadFixture(deploySmartRuntimeFixture);
      const loupe = await hre.viem.getContractAt('DiamondLoupePallet', runtime.address);
      const sel = toFunctionSelector('createClaim(bytes32)');
      const addr = await loupe.read.facetAddress([sel]);
      expect(addr.toLowerCase()).to.equal(poePallet.address.toLowerCase());
    });
  });

  // -------------------------------------------------------------------------
  // OwnershipPallet
  // -------------------------------------------------------------------------

  describe('OwnershipPallet', function () {
    it('owner() returns the deployer', async function () {
      const { runtime, owner } = await loadFixture(deploySmartRuntimeFixture);
      const ownership = await hre.viem.getContractAt('OwnershipPallet', runtime.address);
      expect(getAddress(await ownership.read.owner())).to.equal(getAddress(owner.account.address));
    });

    it('transferOwnership changes owner', async function () {
      const { runtime, owner, otherAccount } = await loadFixture(deploySmartRuntimeFixture);
      const ownership = await hre.viem.getContractAt('OwnershipPallet', runtime.address);
      await ownership.write.transferOwnership([otherAccount.account.address], {
        account: owner.account
      });
      expect(getAddress(await ownership.read.owner())).to.equal(getAddress(otherAccount.account.address));
    });

    it('non-owner cannot transfer ownership', async function () {
      const { runtime, otherAccount } = await loadFixture(deploySmartRuntimeFixture);
      const ownership = await hre.viem.getContractAt('OwnershipPallet', runtime.address);
      try {
        await ownership.write.transferOwnership([otherAccount.account.address], {
          account: otherAccount.account
        });
        expect.fail('Should have reverted');
      } catch (e: unknown) {
        expect((e as Error).message).to.include('not owner');
      }
    });
  });

  // -------------------------------------------------------------------------
  // ProofOfExistencePallet (via SmartRuntime proxy)
  // -------------------------------------------------------------------------

  describe('ProofOfExistencePallet', function () {
    const docHash = keccak256(toBytes('polkadot smart runtime document'));
    const docHash2 = keccak256(toBytes('another document'));

    it('starts with zero claims', async function () {
      const { runtime } = await loadFixture(deploySmartRuntimeFixture);
      const poe = await hre.viem.getContractAt('ProofOfExistencePallet', runtime.address);
      expect(await poe.read.getClaimCount()).to.equal(0n);
    });

    it('createClaim stores the claim', async function () {
      const { runtime, owner } = await loadFixture(deploySmartRuntimeFixture);
      const poe = await hre.viem.getContractAt('ProofOfExistencePallet', runtime.address);
      await poe.write.createClaim([docHash]);
      const [claimOwner, blockNum] = await poe.read.getClaim([docHash]);
      expect(getAddress(claimOwner)).to.equal(getAddress(owner.account.address));
      expect(blockNum > 0n).to.equal(true);
    });

    it('getClaimCount increments', async function () {
      const { runtime } = await loadFixture(deploySmartRuntimeFixture);
      const poe = await hre.viem.getContractAt('ProofOfExistencePallet', runtime.address);
      await poe.write.createClaim([docHash]);
      await poe.write.createClaim([docHash2]);
      expect(await poe.read.getClaimCount()).to.equal(2n);
    });

    it('reverts on duplicate claim', async function () {
      const { runtime } = await loadFixture(deploySmartRuntimeFixture);
      const poe = await hre.viem.getContractAt('ProofOfExistencePallet', runtime.address);
      await poe.write.createClaim([docHash]);
      try {
        await poe.write.createClaim([docHash]);
        expect.fail('Should have reverted');
      } catch (e: unknown) {
        expect((e as Error).message).to.include('already claimed');
      }
    });

    it('revokeClaim removes the claim', async function () {
      const { runtime } = await loadFixture(deploySmartRuntimeFixture);
      const poe = await hre.viem.getContractAt('ProofOfExistencePallet', runtime.address);
      await poe.write.createClaim([docHash]);
      await poe.write.revokeClaim([docHash]);
      const [claimOwner] = await poe.read.getClaim([docHash]);
      expect(claimOwner).to.equal(ZERO_ADDR);
      expect(await poe.read.getClaimCount()).to.equal(0n);
    });

    it('non-owner cannot revoke', async function () {
      const { runtime, otherAccount } = await loadFixture(deploySmartRuntimeFixture);
      const poe = await hre.viem.getContractAt('ProofOfExistencePallet', runtime.address);
      await poe.write.createClaim([docHash]);
      try {
        await poe.write.revokeClaim([docHash], { account: otherAccount.account });
        expect.fail('Should have reverted');
      } catch (e: unknown) {
        expect((e as Error).message).to.include('not claim owner');
      }
    });

    it('emits ClaimCreated event', async function () {
      const { runtime, owner, publicClient, poeArtifact } = await loadFixture(deploySmartRuntimeFixture);
      const poe = await hre.viem.getContractAt('ProofOfExistencePallet', runtime.address);
      const hash = await poe.write.createClaim([docHash]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const logs = parseEventLogs({
        abi: poeArtifact.abi as Abi,
        logs: receipt.logs,
        eventName: 'ClaimCreated'
      });
      expect(logs).to.have.lengthOf(1);
      expect(getAddress(logs[0].args.who as string)).to.equal(getAddress(owner.account.address));
      expect(logs[0].args.documentHash).to.equal(docHash);
    });

    it('emits ClaimRevoked event', async function () {
      const { runtime, owner, publicClient, poeArtifact } = await loadFixture(deploySmartRuntimeFixture);
      const poe = await hre.viem.getContractAt('ProofOfExistencePallet', runtime.address);
      await poe.write.createClaim([docHash]);
      const hash = await poe.write.revokeClaim([docHash]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const logs = parseEventLogs({
        abi: poeArtifact.abi as Abi,
        logs: receipt.logs,
        eventName: 'ClaimRevoked'
      });
      expect(logs).to.have.lengthOf(1);
      expect(getAddress(logs[0].args.who as string)).to.equal(getAddress(owner.account.address));
    });
  });

  // -------------------------------------------------------------------------
  // Forkless upgrade — Replace Smart Pallet via DiamondCutPallet
  // -------------------------------------------------------------------------

  describe('Forkless upgrade (Replace Smart Pallet)', function () {
    it('can replace ProofOfExistencePallet with a new version', async function () {
      const { runtime, owner, poePallet, poeArtifact } = await loadFixture(deploySmartRuntimeFixture);

      // Deploy a new version of the ProofOfExistencePallet
      const newPoe = await hre.viem.deployContract('ProofOfExistencePallet');
      const poeSelectors = selectorsFromAbi(poeArtifact.abi as Abi);

      // Call diamondCut through the SmartRuntime proxy
      const cut = await hre.viem.getContractAt('DiamondCutPallet', runtime.address);
      await cut.write.diamondCut(
        [
          [
            {
              facetAddress: newPoe.address,
              action: FacetCutAction.Replace,
              functionSelectors: poeSelectors
            }
          ],
          ZERO_ADDR,
          '0x'
        ],
        { account: owner.account }
      );

      // Loupe should now point createClaim to newPoe
      const loupe = await hre.viem.getContractAt('DiamondLoupePallet', runtime.address);
      const sel = toFunctionSelector('createClaim(bytes32)');
      const registeredPallet = await loupe.read.facetAddress([sel]);
      expect(registeredPallet.toLowerCase()).to.equal(newPoe.address.toLowerCase());
      expect(registeredPallet.toLowerCase()).to.not.equal(poePallet.address.toLowerCase());
    });

    it('non-owner cannot upgrade', async function () {
      const { runtime, otherAccount, poeArtifact } = await loadFixture(deploySmartRuntimeFixture);
      const newPoe = await hre.viem.deployContract('ProofOfExistencePallet');
      const poeSelectors = selectorsFromAbi(poeArtifact.abi as Abi);
      const cut = await hre.viem.getContractAt('DiamondCutPallet', runtime.address);
      try {
        await cut.write.diamondCut(
          [
            [
              {
                facetAddress: newPoe.address,
                action: FacetCutAction.Replace,
                functionSelectors: poeSelectors
              }
            ],
            ZERO_ADDR,
            '0x'
          ],
          { account: otherAccount.account }
        );
        expect.fail('Should have reverted');
      } catch (e: unknown) {
        expect((e as Error).message).to.include('not owner');
      }
    });
  });
});
