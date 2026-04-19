import type { HardhatRuntimeEnvironment } from 'hardhat/types/runtime';
import * as fs from 'fs';
import * as path from 'path';
import { defineChain, toFunctionSelector, type Abi, type AbiFunction, type Chain } from 'viem';

const DEPLOYMENTS_JSON = path.resolve(__dirname, '../../../deployments.json');

const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 } as const;

const DEFAULT_RPC_URLS: Record<string, string> = {
  local: process.env.ETH_RPC_HTTP || 'http://127.0.0.1:8545',
  polkadotTestnet: 'https://services.polkadothub-rpc.com/testnet'
};

const DEFAULT_DEPLOY_GAS_FALLBACK = 30_000_000n;

function updateDeployments(key: string, address: string) {
  let data: Record<string, string | null> = { evm: null, pvm: null };

  try {
    data = JSON.parse(fs.readFileSync(DEPLOYMENTS_JSON, 'utf-8'));
  } catch {
    // File doesn't exist yet.
  }

  data[key] = address;
  fs.writeFileSync(DEPLOYMENTS_JSON, JSON.stringify(data, null, 2) + '\n');
}

function selectorsFromAbi(abi: Abi): `0x${string}`[] {
  return abi.filter((item): item is AbiFunction => item.type === 'function').map(fn => toFunctionSelector(fn));
}

function getRpcUrl(hre: HardhatRuntimeEnvironment) {
  const networkConfig = hre.network.config;

  if ('url' in networkConfig && typeof networkConfig.url === 'string') {
    return networkConfig.url;
  }

  return DEFAULT_RPC_URLS[hre.network.name] || 'http://127.0.0.1:8545';
}

async function getDeploymentChain(hre: HardhatRuntimeEnvironment): Promise<Chain> {
  const chainId = Number(await hre.network.provider.send('eth_chainId'));
  const rpcUrl = getRpcUrl(hre);
  const isTestnet = hre.network.name === 'polkadotTestnet';

  return defineChain({
    id: chainId,
    name: isTestnet ? 'Polkadot Hub TestNet' : hre.network.name === 'local' ? 'Local Parachain' : hre.network.name,
    nativeCurrency: {
      name: 'Unit',
      symbol: 'UNIT',
      decimals: 18
    },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] }
    },
    ...(isTestnet
      ? {
          blockExplorers: {
            default: {
              name: 'Blockscout',
              url: 'https://blockscout-testnet.polkadot.io'
            }
          }
        }
      : {}),
    testnet: true
  });
}

async function getDeploymentClients(hre: HardhatRuntimeEnvironment) {
  const chain = await getDeploymentChain(hre);
  const [walletClient] = await hre.viem.getWalletClients({ chain });
  const publicClient = await hre.viem.getPublicClient({ chain });

  return { chain, walletClient, publicClient };
}

type DeploymentClients = Awaited<ReturnType<typeof getDeploymentClients>>;

function getFallbackDeployGas() {
  const value = process.env.SMART_RUNTIME_DEPLOY_GAS;

  if (!value) {
    return DEFAULT_DEPLOY_GAS_FALLBACK;
  }

  try {
    return BigInt(value);
  } catch {
    throw new Error(`Invalid SMART_RUNTIME_DEPLOY_GAS value: ${value}`);
  }
}

function isOutOfGasEstimationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return `${error}`.includes('OutOfGas');
}

async function deployContractWithFallbackGas(
  clients: DeploymentClients,
  contractName: string,
  parameters: {
    abi: Abi;
    bytecode: `0x${string}`;
    args?: readonly unknown[];
  }
) {
  const { walletClient } = clients;

  try {
    return await walletClient.deployContract(parameters);
  } catch (error) {
    if (!isOutOfGasEstimationError(error)) {
      throw error;
    }

    const gas = getFallbackDeployGas();
    console.warn(`Gas estimation failed for ${contractName}; retrying with gas limit ${gas}.`);

    return walletClient.deployContract({
      ...parameters,
      gas
    });
  }
}

async function deployPallet(hre: HardhatRuntimeEnvironment, clients: DeploymentClients, name: string) {
  const { walletClient, publicClient } = clients;
  const artifact = await hre.artifacts.readArtifact(name);
  const hash = await deployContractWithFallbackGas(clients, name, {
    abi: artifact.abi as Abi,
    bytecode: artifact.bytecode as `0x${string}`
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });

  if (!receipt.contractAddress) {
    throw new Error(`${name} deploy tx ${hash} has no contract`);
  }

  console.log(`  ✓ ${name}: ${receipt.contractAddress}`);

  return {
    address: receipt.contractAddress,
    abi: artifact.abi as Abi
  };
}

export async function deploySmartRuntime(hre: HardhatRuntimeEnvironment) {
  const clients = await getDeploymentClients(hre);
  const { chain, walletClient, publicClient } = clients;

  console.log(`\nNetwork: ${hre.network.name}`);
  console.log(`Chain ID: ${chain.id}`);
  console.log(`Deploying Smart Pallets (EVM/solc) from: ${walletClient.account.address}\n`);

  const cutPallet = await deployPallet(hre, clients, 'DiamondCutPallet');
  const loupePallet = await deployPallet(hre, clients, 'DiamondLoupePallet');
  const ownershipPallet = await deployPallet(hre, clients, 'OwnershipPallet');
  const accessControlPallet = await deployPallet(hre, clients, 'AccessControlPallet');
  const pausablePallet = await deployPallet(hre, clients, 'PausablePallet');
  const poePallet = await deployPallet(hre, clients, 'ProofOfExistencePallet');
  const fungibleTokenPallet = await deployPallet(hre, clients, 'FungibleTokenPallet');
  const nonFungibleTokenPallet = await deployPallet(hre, clients, 'NonFungibleTokenPallet');
  const multiAssetTokenPallet = await deployPallet(hre, clients, 'MultiAssetTokenPallet');

  const initialCuts = [
    {
      facetAddress: cutPallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(cutPallet.abi)
    },
    {
      facetAddress: loupePallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(loupePallet.abi)
    },
    {
      facetAddress: ownershipPallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(ownershipPallet.abi)
    },
    {
      facetAddress: accessControlPallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(accessControlPallet.abi)
    },
    {
      facetAddress: pausablePallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(pausablePallet.abi)
    },
    {
      facetAddress: poePallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(poePallet.abi)
    },
    {
      facetAddress: fungibleTokenPallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(fungibleTokenPallet.abi)
    },
    {
      facetAddress: nonFungibleTokenPallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(nonFungibleTokenPallet.abi)
    },
    {
      facetAddress: multiAssetTokenPallet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectorsFromAbi(multiAssetTokenPallet.abi)
    }
  ];

  console.log('\nDeploying SmartRuntime (Diamond Proxy)...');

  const runtimeArtifact = await hre.artifacts.readArtifact('SmartRuntime');
  const owner = walletClient.account.address;

  const runtimeHash = await deployContractWithFallbackGas(clients, 'SmartRuntime', {
    abi: runtimeArtifact.abi as Abi,
    bytecode: runtimeArtifact.bytecode as `0x${string}`,
    args: [owner, initialCuts, '0x0000000000000000000000000000000000000000', '0x']
  });
  const runtimeReceipt = await publicClient.waitForTransactionReceipt({
    hash: runtimeHash,
    timeout: 120_000
  });

  if (!runtimeReceipt.contractAddress) {
    throw new Error(`SmartRuntime deploy tx ${runtimeHash} has no contract`);
  }

  const runtimeAddress = runtimeReceipt.contractAddress;
  console.log(`  ✓ SmartRuntime: ${runtimeAddress}`);

  updateDeployments('evm', runtimeAddress);
  console.log('\n✓ Updated deployments.json');
  console.log(`\nSmartRuntime (EVM) deployed at: ${runtimeAddress}\n`);

  return runtimeAddress;
}
