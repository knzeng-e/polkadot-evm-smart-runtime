import type { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-viem';
import '@nomicfoundation/hardhat-verify';
import { task, vars } from 'hardhat/config';
import { deploySmartRuntime } from './scripts/deploy-runtime';

task('deploy', 'Deploy Smart Pallets and SmartRuntime')
  .addFlag('noCompile', 'Skip compilation before deployment')
  .setAction(async ({ noCompile }, hre) => {
    if (!noCompile) {
      await hre.run('compile');
    }

    await deploySmartRuntime(hre);
  });

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.28',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    local: {
      // Local node Ethereum RPC endpoint (via eth-rpc adapter)
      url: process.env.ETH_RPC_HTTP || 'http://127.0.0.1:8545',
      chainId: 420420420,
      accounts: [
        // Alice dev account private key (well-known Substrate dev key — not a secret)
        '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133'
      ]
    },
    polkadotTestnet: {
      url: 'https://services.polkadothub-rpc.com/testnet',
      chainId: 420420417,
      accounts: [vars.get('PRIVATE_KEY', '')].filter(Boolean)
    }
  },
  etherscan: {
    apiKey: {
      polkadotTestnet: 'no-api-key-needed'
    },
    customChains: [
      {
        network: 'polkadotTestnet',
        chainId: 420420417,
        urls: {
          apiURL: 'https://blockscout-testnet.polkadot.io/api',
          browserURL: 'https://blockscout-testnet.polkadot.io/'
        }
      }
    ]
  }
};

export default config;
