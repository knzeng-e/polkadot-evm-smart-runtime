import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { toFunctionSelector, type Abi, type AbiFunction } from 'viem';

const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 } as const;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const;

function selectorsFromAbi(abi: Abi): `0x${string}`[] {
  return abi.filter((item): item is AbiFunction => item.type === 'function').map(fn => toFunctionSelector(fn));
}

async function deployOpenZeppelinStyleFixture() {
  const [owner, otherAccount] = await hre.viem.getWalletClients();

  const facetNames = [
    'DiamondCutPallet',
    'DiamondLoupePallet',
    'OwnershipPallet',
    'AccessControlPallet',
    'PausablePallet',
    'ProofOfExistencePallet',
    'FungibleTokenPallet',
    'NonFungibleTokenPallet',
    'MultiAssetTokenPallet'
  ] as const;

  const artifacts = Object.fromEntries(await Promise.all(facetNames.map(async name => [name, await hre.artifacts.readArtifact(name)]))) as Record<
    (typeof facetNames)[number],
    Awaited<ReturnType<typeof hre.artifacts.readArtifact>>
  >;

  const deployed = Object.fromEntries(await Promise.all(facetNames.map(async name => [name, await hre.viem.deployContract(name)]))) as Record<
    (typeof facetNames)[number],
    { address: `0x${string}` }
  >;

  const initialCuts = facetNames.map(name => ({
    facetAddress: deployed[name].address,
    action: FacetCutAction.Add,
    functionSelectors: selectorsFromAbi(artifacts[name].abi as Abi)
  }));

  const runtime = await hre.viem.deployContract('SmartRuntime', [owner.account.address, initialCuts, ZERO_ADDR, '0x']);

  return {
    runtime,
    artifacts,
    deployed,
    owner,
    otherAccount
  };
}

describe('OpenZeppelin-style Smart Pallets', function () {
  it('registers the new pallets in the Smart Runtime', async function () {
    const { runtime, deployed } = await loadFixture(deployOpenZeppelinStyleFixture);
    const loupe = await hre.viem.getContractAt('DiamondLoupePallet', runtime.address);
    const addresses = (await loupe.read.facetAddresses()).map(address => address.toLowerCase());

    expect(addresses.length).to.equal(9);
    expect(addresses).to.include.members([
      deployed.AccessControlPallet.address.toLowerCase(),
      deployed.PausablePallet.address.toLowerCase(),
      deployed.FungibleTokenPallet.address.toLowerCase(),
      deployed.NonFungibleTokenPallet.address.toLowerCase(),
      deployed.MultiAssetTokenPallet.address.toLowerCase()
    ]);
  });

  it('uses namespaced selectors so fungible and NFT APIs can coexist', async function () {
    const { runtime, deployed } = await loadFixture(deployOpenZeppelinStyleFixture);
    const loupe = await hre.viem.getContractAt('DiamondLoupePallet', runtime.address);

    const fungibleSelector = toFunctionSelector('fungibleBalanceOf(address)');
    const nftSelector = toFunctionSelector('nftBalanceOf(address)');

    expect((await loupe.read.facetAddress([fungibleSelector])).toLowerCase()).to.equal(deployed.FungibleTokenPallet.address.toLowerCase());
    expect((await loupe.read.facetAddress([nftSelector])).toLowerCase()).to.equal(deployed.NonFungibleTokenPallet.address.toLowerCase());
  });

  it('grants roles and allows a delegated minter to mint fungible tokens', async function () {
    const { runtime, otherAccount } = await loadFixture(deployOpenZeppelinStyleFixture);
    const accessControl = await hre.viem.getContractAt('AccessControlPallet', runtime.address);
    const fungible = await hre.viem.getContractAt('FungibleTokenPallet', runtime.address);
    const minterRole = await accessControl.read.MINTER_ROLE();

    await accessControl.write.grantRole([minterRole, otherAccount.account.address]);
    expect(await accessControl.read.hasRole([minterRole, otherAccount.account.address])).to.equal(true);

    await fungible.write.initializeFungibleToken(['Smart Token', 'SMRT', 18]);
    await fungible.write.fungibleMint([otherAccount.account.address, 1_000n], {
      account: otherAccount.account
    });

    expect(await fungible.read.fungibleTotalSupply()).to.equal(1_000n);
    expect(await fungible.read.fungibleBalanceOf([otherAccount.account.address])).to.equal(1_000n);
  });

  it('pauses and unpauses shared token actions', async function () {
    const { runtime, owner, otherAccount } = await loadFixture(deployOpenZeppelinStyleFixture);
    const pausable = await hre.viem.getContractAt('PausablePallet', runtime.address);
    const fungible = await hre.viem.getContractAt('FungibleTokenPallet', runtime.address);

    await fungible.write.initializeFungibleToken(['Smart Token', 'SMRT', 18]);
    await fungible.write.fungibleMint([owner.account.address, 500n]);
    await pausable.write.pause();

    try {
      await fungible.write.fungibleTransfer([otherAccount.account.address, 1n], {
        account: owner.account
      });
      expect.fail('Should have reverted');
    } catch (error: unknown) {
      expect((error as Error).message).to.include('paused');
    }

    await pausable.write.unpause();
    await fungible.write.fungibleTransfer([otherAccount.account.address, 100n], {
      account: owner.account
    });

    expect(await fungible.read.fungibleBalanceOf([otherAccount.account.address])).to.equal(100n);
  });

  it('supports fungible approvals and transferFrom', async function () {
    const { runtime, owner, otherAccount } = await loadFixture(deployOpenZeppelinStyleFixture);
    const fungible = await hre.viem.getContractAt('FungibleTokenPallet', runtime.address);

    await fungible.write.initializeFungibleToken(['Smart Token', 'SMRT', 18]);
    await fungible.write.fungibleMint([owner.account.address, 1_000n]);
    await fungible.write.fungibleApprove([otherAccount.account.address, 250n], {
      account: owner.account
    });
    await fungible.write.fungibleTransferFrom([owner.account.address, otherAccount.account.address, 200n], { account: otherAccount.account });

    expect(await fungible.read.fungibleBalanceOf([owner.account.address])).to.equal(800n);
    expect(await fungible.read.fungibleBalanceOf([otherAccount.account.address])).to.equal(200n);
    expect(await fungible.read.fungibleAllowance([owner.account.address, otherAccount.account.address])).to.equal(50n);
  });

  it('mints and transfers NFTs through approvals', async function () {
    const { runtime, owner, otherAccount } = await loadFixture(deployOpenZeppelinStyleFixture);
    const nft = await hre.viem.getContractAt('NonFungibleTokenPallet', runtime.address);

    await nft.write.initializeNonFungibleToken(['Smart Runtime NFT', 'SRNFT']);
    await nft.write.nftMint([owner.account.address, 1n, 'ipfs://token-1']);
    await nft.write.nftApprove([otherAccount.account.address, 1n], {
      account: owner.account
    });
    await nft.write.nftTransferFrom([owner.account.address, otherAccount.account.address, 1n], { account: otherAccount.account });

    expect((await nft.read.nftOwnerOf([1n])).toLowerCase()).to.equal(otherAccount.account.address.toLowerCase());
    expect(await nft.read.nftBalanceOf([owner.account.address])).to.equal(0n);
    expect(await nft.read.nftBalanceOf([otherAccount.account.address])).to.equal(1n);
  });

  it('supports multi-asset operator approvals and batch transfers', async function () {
    const { runtime, owner, otherAccount } = await loadFixture(deployOpenZeppelinStyleFixture);
    const multiAsset = await hre.viem.getContractAt('MultiAssetTokenPallet', runtime.address);

    await multiAsset.write.initializeMultiAssetToken(['ipfs://collection/']);
    await multiAsset.write.multiAssetMintBatch([owner.account.address, [1n, 2n], [10n, 20n], '0x'], { account: owner.account });
    await multiAsset.write.multiAssetSetApprovalForAll([otherAccount.account.address, true], {
      account: owner.account
    });
    await multiAsset.write.multiAssetSafeBatchTransferFrom([owner.account.address, otherAccount.account.address, [1n, 2n], [3n, 4n], '0x'], {
      account: otherAccount.account
    });

    expect(await multiAsset.read.multiAssetBalanceOf([otherAccount.account.address, 1n])).to.equal(3n);
    expect(await multiAsset.read.multiAssetBalanceOf([otherAccount.account.address, 2n])).to.equal(4n);
    expect(await multiAsset.read.multiAssetTotalSupply([1n])).to.equal(10n);
    expect(await multiAsset.read.multiAssetTotalSupply([2n])).to.equal(20n);
  });

  it('allows a delegated burner to burn multi-asset balances', async function () {
    const { runtime, owner, otherAccount } = await loadFixture(deployOpenZeppelinStyleFixture);
    const accessControl = await hre.viem.getContractAt('AccessControlPallet', runtime.address);
    const multiAsset = await hre.viem.getContractAt('MultiAssetTokenPallet', runtime.address);
    const burnerRole = await accessControl.read.BURNER_ROLE();

    await accessControl.write.grantRole([burnerRole, otherAccount.account.address], {
      account: owner.account
    });
    await multiAsset.write.initializeMultiAssetToken(['ipfs://collection/']);
    await multiAsset.write.multiAssetMint([owner.account.address, 7n, 50n, '', '0x']);
    await multiAsset.write.multiAssetBurn([owner.account.address, 7n, 20n], {
      account: otherAccount.account
    });

    expect(await multiAsset.read.multiAssetBalanceOf([owner.account.address, 7n])).to.equal(30n);
    expect(await multiAsset.read.multiAssetTotalSupply([7n])).to.equal(30n);
  });
});
