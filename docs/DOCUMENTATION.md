# Polkadot Smart Runtime Documentation

## 1. Overview

Polkadot Smart Runtime is a contract-based runtime system built around the ERC-2535 Diamond proxy pattern.

The project uses a persistent proxy contract, `SmartRuntime`, as the stable execution shell. Each unit of runtime logic is implemented as a pallet backed by a diamond facet. Facets are invoked with `delegatecall`, so state lives in the runtime and the code is split across independently deployed facet contracts.

The practical outcome is:

- one runtime address
- modular runtime logic
- on-chain upgrades through `diamondCut`
- room to grow beyond the default EVM single-contract bytecode ceiling by distributing logic across facets
- mirrored contract source for both EVM and PVM compilation targets

## 2. Project Status

The repository currently contains four main surfaces:

### Contracts

- `contracts/evm/`: canonical Solidity source, EVM deploy/test flow
- `contracts/pvm/`: mirrored Solidity source compiled with `resolc`

### Frontend

- `web/`: a small manager UI for deploying a new runtime from a selected pallet set, loading an existing runtime, performing add/replace/remove pallet flows, and interacting with live pallet functions

### Scripts

- `scripts/deploy.sh`: top-level deploy helper
- `scripts/common.sh`: shared shell variables and RPC readiness checks

### Reference Files

- `deployments.json`: last persisted `evm` and `pvm` runtime addresses
- `docs/ADR.md`: architectural decision record

## 3. Core Architecture

### 3.1 Runtime Contract

The runtime proxy lives in:

- `contracts/evm/contracts/Runtime.sol`
- `contracts/pvm/contracts/Runtime.sol`

That contract:

- stores the runtime owner
- registers supported interfaces
- applies the initial facet cuts in the constructor
- forwards unknown calls through `delegatecall`

### 3.2 Diamond Storage

Shared diamond storage is handled by `LibDiamond`.

Under ERC-2535, the diamond is the stateful contract. Facets are stateless code modules that read and write the diamond's storage via `delegatecall`; they do not hold the runtime's persistent state in their own contract storage.

It owns:

- selector-to-facet mappings
- facet selector lists
- supported interface flags
- runtime owner state

Additional runtime state is organized with pallet-local namespaced storage slots in the diamond to avoid collisions and make upgrades safer.

### 3.3 Upgrade Model

Upgrades are performed through the `Upgrade` module, which exposes the standard `diamondCut` entrypoint.

Supported actions:

- `Add`
- `Replace`
- `Remove`

This means the runtime itself is intended to be long-lived, while pallets are disposable and replaceable.

### 3.4 Why This Helps on EVM

The Diamond choice is also practical for EVM code size.

EIP-170 caps the runtime bytecode of a single deployed contract at `0x6000`, which is 24,576 bytes. ERC-2535 explicitly calls out Diamonds as a way to exceed that single-contract ceiling at the application level by distributing functionality across multiple facets behind one stable address.

In practice, that means the runtime is not forced into one monolithic bytecode blob. Each facet still has its own deployment-size limit, but the overall runtime surface can grow by adding more facets instead of cramming all logic into one contract.

## 4. Runtime Modules

### 4.1 Core

| Module | Responsibility |
|---|---|
| `Upgrade` | Upgrade entrypoint via `diamondCut` |
| `Inspector` | Selector and facet introspection via `IDiamondLoupe` |
| `Ownership` | Single-owner control of upgrade authority |

### 4.2 Access

| Module | Responsibility |
|---|---|
| `Access Control` | Role management for admin, mint, burn, and pause capabilities |
| `Pausable` | Runtime-wide pause switch used by token pallets |

### 4.3 Token

| Module | Responsibility |
|---|---|
| `Fungible Token` | ERC-20-like balances, allowances, minting, burning |
| `Non-Fungible Token` | ERC-721-like ownership, approvals, transfers, metadata URI |
| `Multi-Asset Token` | ERC-1155-like balances, batch transfers, operator approvals, URI support |

### 4.4 App

| Module | Responsibility |
|---|---|
| `Proof of Existence` | Example application pallet for document-hash claims |

## 5. Why the Token APIs Are Namespaced

This is one of the most important implementation details in the repository.

If the project exposed literal ERC-20, ERC-721, and ERC-1155 function names on a single diamond, selector collisions would make the runtime ambiguous or undeployable.

Examples of colliding names:

- `balanceOf`
- `approve`
- `transferFrom`
- `setApprovalForAll`

To solve that, the token pallet APIs are intentionally namespaced:

- `fungible*`
- `nft*`
- `multiAsset*`

That keeps the runtime modular without sacrificing coexistence.

## 6. EVM and PVM Relationship

The Solidity source is mirrored across:

- `contracts/evm/contracts/...`
- `contracts/pvm/contracts/...`

The logic is intentionally kept aligned, but the build outputs are different:

- EVM uses `solc`
- PVM uses `resolc`

That is why each side has its own Hardhat config, tests, and deploy script even though the source shape is largely the same.

## 7. Development Workflows

### 7.1 EVM

```bash
cd contracts/evm
npm ci
npm run compile
npm test
npm run deploy:local
```

Useful extra command:

```bash
npm run verify
```

### 7.2 PVM

```bash
cd contracts/pvm
npm ci
npm run compile
npm test
npm run deploy:local
```

PVM testing and local deployment require a live RPC endpoint.

### 7.3 Root Script

Use `scripts/deploy.sh` when you want a simple top-level workflow:

```bash
./scripts/deploy.sh
./scripts/deploy.sh evm
./scripts/deploy.sh pvm
./scripts/deploy.sh both testnet
```

The script:

- validates Node and npm
- installs dependencies if needed
- compiles the chosen target
- waits for local RPC readiness where required
- writes deployed addresses to `deployments.json`

## 8. Frontend Manager

The frontend lives in `web/`.

### 8.1 What It Does

The UI provides:

- a home page with the pallet catalog
- a deploy page to assemble and deploy a new runtime
- a manage page to inspect and upgrade an existing runtime
- an interact page to run direct read/write calls against a loaded runtime

### 8.2 How It Works

The frontend uses:

- handwritten ABI definitions in `web/src/config/pallets.ts`
- generated bytecodes in `web/src/config/bytecodes.ts`
- lightweight runtime ABIs in `web/src/config/abis.ts`

### 8.3 Codegen Step

After recompiling EVM contracts, regenerate the frontend bytecode table:

```bash
cd web
npm run codegen
```

The generator reads from:

- `contracts/evm/artifacts/contracts/...`

and writes:

- `web/src/config/bytecodes.ts`

### 8.4 Current Scope Limitation

Because the frontend bytecode generator reads EVM artifacts, the web manager currently packages EVM bytecode, not PVM bytecode.

That means:

- the web app is appropriate for EVM deployment, interaction, and EVM-side upgrade flows
- PVM deployment and upgrade flows should currently use Hardhat/scripts instead of the web UI

### 8.5 Accounts

The frontend uses well-known dev accounts from `web/src/config/evm.ts`.

This is convenient for local development but should not be treated as a production wallet model.

## 9. Networks and Configuration

The repository expects Node 22 to be the active `node` executable in your shell, not merely installed somewhere else on disk. This matters in particular for the web manager build flow.

### Local

- RPC default: `http://127.0.0.1:8545`
- Chain ID: `420420421`

### Testnet

- RPC: `https://services.polkadothub-rpc.com/testnet`
- Chain ID: `420420417`

### Environment and Variables

- `ETH_RPC_HTTP`: overrides the default local RPC URL
- Hardhat variable `PRIVATE_KEY`: used for testnet deploys

### Persisted Addresses

`deployments.json` stores:

- `evm`
- `pvm`

These values are updated by the deploy scripts after successful deployment.

## 10. Testing

### EVM Tests

The EVM suite covers:

- runtime construction
- interface support
- inspector behavior
- ownership
- proof-of-existence behavior
- OZ-style pallet behavior
- replace-upgrade flow

### PVM Tests

The PVM suite validates the runtime against a live node and confirms that the same diamond pattern works in the PolkaVM target.

## 11. Operational Notes and Limitations

- The contract model is production-oriented in structure, but the repository still uses development defaults in several places, especially the web manager.
- The token pallets are inspired by OpenZeppelin standards, not literal drop-in ERC ABI clones.
- PVM support is first-class at the contract layer, but the web tooling currently trails the contract layer and remains EVM-oriented.
- Frontend bytecodes must be regenerated after contract changes, otherwise the deploy UI can fall behind the compiled contract set.

## 12. Recommended Reading Order

For a new reader:

1. `README.md`
2. `docs/DOCUMENTATION.md`
3. `docs/ADR.md`
4. `contracts/evm/contracts/Runtime.sol`
5. `contracts/evm/test/SmartRuntime.test.ts`
6. `web/src/pages/DeployPage.tsx`
7. `web/src/pages/ManagePage.tsx`
8. `web/src/pages/InteractPage.tsx`
