# Polkadot Smart Runtime

Polkadot Smart Runtime is a modular smart-contract system that applies the ERC-2535 Diamond pattern to Polkadot execution environments.

Instead of deploying one large monolithic contract and replacing it wholesale, the project treats the diamond proxy as a long-lived `SmartRuntime` and the facets as upgradeable pallets. New behavior is introduced by adding, replacing, or removing functions through `diamondCut`, which gives the system a forkless-upgrade workflow similar in spirit to a native Polkadot runtime upgrade. A second practical benefit is that the runtime can grow beyond the default EVM single-contract bytecode ceiling by splitting logic across multiple facet contracts behind one stable address.

![](./docs/Polkadot%20Smart%20runtimes.png)

## What This Project Contains

- A diamond-based runtime contract in Solidity (`contracts/evm/contracts/Runtime.sol`)
- A mirrored PolkaVM/PVM contract tree compiled with `resolc`
- A growing pallet catalog covering:
  - Core: upgrade, inspector, ownership
  - Access: access control, pausable
  - Token: fungible, non-fungible, multi-asset
  - App: proof of existence
- Hardhat deploy/test flows for both EVM and PVM targets
- A small web manager for deploying, upgrading, and interacting with runtimes
- Shell wrappers for common deployment workflows

## Mental Model

```text
SmartRuntime  = Diamond proxy
Pallet        = Diamond facet

One runtime address
+ many pallets
+ hot-swappable logic
+ shared storage via delegatecall
+ distributed bytecode across facet contracts
```

## Repository Layout

| Path | Purpose |
|---|---|
| `contracts/evm/` | Canonical Solidity contracts, Hardhat config, EVM tests, EVM deploy scripts |
| `contracts/pvm/` | Mirrored Solidity sources compiled for PolkaVM / pallet-revive with `resolc` |
| `docs/` | Architecture and technical documentation for the Smart Runtime model |
| `web/` | Runtime manager UI for browsing pallets and performing deploy/manage/interact flows |
| `scripts/` | Shell helpers for compiling and deploying from the repo root |
| `deployments.json` | Last-known deployed runtime addresses for `evm` and `pvm` |

## Current Runtime Surface

### Core

- `Upgrade`: add, replace, or remove selectors and optionally run initialization logic
- `Inspector`: inspect live pallet registration and selector routing via the ERC-2535 inspection interface
- `Ownership`: single-owner control of upgrades

### Access

- `Access Control`: role-based permissions inspired by OpenZeppelin `AccessControl`
- `Pausable`: runtime-wide emergency stop inspired by OpenZeppelin `Pausable`

### Token

- `Fungible Token`: ERC-20-like balances, allowances, minting, and burning
- `Non-Fungible Token`: ERC-721-like ownership, approvals, minting, and burning
- `Multi-Asset Token`: ERC-1155-like balances, operator approvals, and batch transfers

### App

- `Proof of Existence`: example application pallet for document-hash claims

## Important Design Constraint

The token pallets are OpenZeppelin-inspired, but they do not expose the literal ERC-20 / ERC-721 / ERC-1155 selector set unchanged.

That is intentional.

Inside one diamond, standards such as ERC-20 and ERC-721 collide on selectors like `balanceOf`, `approve`, and `transferFrom`. To allow these pallets to coexist in a single runtime, the public APIs are namespaced:

- `fungibleTransfer`
- `nftTransferFrom`
- `multiAssetSafeBatchTransferFrom`

## Supported Targets

| Target | Compiler | Typical Use |
|---|---|---|
| AssetHub-style EVM | `solc 0.8.28` | EVM deployment, local EVM tests, Blockscout verification |
| PolkaVM / pallet-revive | `resolc 1.0.0` | PVM deployment and live-node testing |

## Prerequisites

- Node.js 22.x active on your shell `PATH`
- npm 10.x
- For local deployment or PVM tests: an Ethereum-compatible RPC endpoint backed by a local Polkadot node / `eth-rpc` adapter at `http://127.0.0.1:8545`, or `ETH_RPC_HTTP` set to another URL

## Quick Start

### 1. EVM Contracts

```bash
cd contracts/evm
npm ci
npm run compile
npm test
npm run deploy:local
```

### 2. PVM Contracts

```bash
cd contracts/pvm
npm ci
npm run compile
npm test
npm run deploy:local
```

### 3. Root Deployment Script

```bash
# local
./scripts/deploy.sh

# EVM only
./scripts/deploy.sh evm

# PVM only
./scripts/deploy.sh pvm

# testnet
./scripts/deploy.sh both testnet
```

### 4. Web Manager

```bash
cd web

# regenerate frontend bytecodes after recompiling contracts/evm
npm run codegen

# local dev server
npm run dev
```

The web UI exposes dedicated `Deploy Runtime`, `Manage Runtime`, and `Interact` flows.
After a successful deployment, the deploy page links directly to both the manage and interact views for the newly created runtime.
The interact view supports direct read/write calls against the loaded runtime, shows inline pending transaction state for writes, and opens a confirmation modal when a write succeeds or fails.

## Testnet Deployment

For testnet deploys, configure the Hardhat private key variable first:

```bash
cd contracts/evm
npx hardhat vars set PRIVATE_KEY

cd ../pvm
npx hardhat vars set PRIVATE_KEY
```

Then deploy with either the package scripts or the root `deploy.sh` wrapper.

## Upgrade Flow

At deployment time, the runtime is initialized with an array of facet cuts.

After deployment, upgrades happen through the `Upgrade` module via the standard `diamondCut` function:

1. Deploy a new pallet contract.
2. Build the selector set for that pallet.
3. Call `diamondCut` with action `Add`, `Replace`, or `Remove`.
4. The runtime starts routing matching selectors to the new pallet immediately.

## Current Operational Notes

- At the runtime level, the diamond model sidesteps the single-contract EVM bytecode ceiling by distributing logic across facets. Each facet still has its own contract-size budget.
- The web manager currently generates and ships bytecodes from `contracts/evm/artifacts`, so it should be treated as an EVM-focused deploy/manage/interact UI. PVM deployment is currently best handled through the Hardhat and shell-script flows.
- The web manager uses well-known dev accounts out of the box. It is intended for local development and controlled demos, not production wallet integration.
- PVM tests run against a live RPC endpoint rather than an in-process simulated network.

## Documentation Map

- [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md): full technical documentation
- [docs/ADR.md](docs/ADR.md): architectural decision record
- [CLAUDE.md](CLAUDE.md): repository context for AI/code agents

## License

MIT
