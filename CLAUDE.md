# CLAUDE.md

This file provides context for AI agents working with this repository.

## Project Purpose

A **Polkadot Smart Runtime** — a modular, upgradeable smart-contract system built on the **ERC-2535 Diamond Proxy** pattern and deployed on Polkadot's **AssetHub EVM** and **PolkaVM (PVM)**.

- **Smart Runtime** = the Diamond Proxy (central entry-point / orchestrator)
- **Smart Pallets** = Diamond Facets (modular pieces of logic)

Upgrades are forkless: add, replace, or remove Smart Pallets without redeploying the Smart Runtime. Splitting logic across facets also helps the runtime grow beyond the default EVM single-contract bytecode ceiling.

## Component Map

| Component | Path | Tech |
|---|---|---|
| EVM contracts | `contracts/evm/` | Solidity 0.8.28, Hardhat, solc |
| PVM contracts | `contracts/pvm/` | Solidity 0.8.28, Hardhat, resolc (PolkaVM) |
| Deploy scripts | `scripts/` | Bash |

## Contract Architecture

```
SmartRuntime (Diamond Proxy)
│
├── Upgrade             — add / replace / remove Smart Pallets
├── Inspector           — introspect registered pallets (ERC-2535)
├── Ownership           — contract owner management
├── Access Control      — role-based permissions
├── Pausable            — global emergency stop
├── Fungible Token      — ERC-20-like asset logic
├── Non-Fungible Token  — ERC-721-like asset logic
├── Multi-Asset Token   — ERC-1155-like asset logic
└── Proof of Existence  — example Smart Pallet (claim / revoke hashes)
```

### Key Files

- `contracts/evm/contracts/Runtime.sol` — Diamond Proxy (fallback → delegatecall)
- `contracts/evm/contracts/libraries/LibDiamond.sol` — shared Diamond storage & cut logic
- `contracts/evm/contracts/interfaces/IDiamondCut.sol` — ERC-2535 cut interface
- `contracts/evm/contracts/interfaces/IDiamondLoupe.sol` — ERC-2535 inspection interface
- `contracts/evm/contracts/pallets/DiamondCutPallet.sol` — Upgrade module
- `contracts/evm/contracts/pallets/DiamondLoupePallet.sol` — Inspector module
- `contracts/evm/contracts/pallets/OwnershipPallet.sol` — Ownership module
- `contracts/evm/contracts/pallets/AccessControlPallet.sol` — Access Control module
- `contracts/evm/contracts/pallets/PausablePallet.sol` — Pausable module
- `contracts/evm/contracts/pallets/FungibleTokenPallet.sol` — Fungible Token module
- `contracts/evm/contracts/pallets/NonFungibleTokenPallet.sol` — Non-Fungible Token module
- `contracts/evm/contracts/pallets/MultiAssetTokenPallet.sol` — Multi-Asset Token module
- `contracts/evm/contracts/pallets/ProofOfExistencePallet.sol` — Proof of Existence module
- `contracts/evm/scripts/deploy.ts` — deploy all contracts & write deployments.json
- `contracts/evm/test/SmartRuntime.test.ts` — EVM integration tests
- `contracts/evm/test/OpenZeppelinStylePallets.test.ts` — EVM tests for OZ-inspired pallets
- `contracts/pvm/` — same Solidity sources compiled with resolc for PolkaVM

## Build Commands

```bash
# EVM contracts
cd contracts/evm && npm ci && npx hardhat compile

# PVM contracts
cd contracts/pvm && npm ci && npx hardhat compile
```

## Test Commands

```bash
# EVM tests (Hardhat Network — no node required)
cd contracts/evm && npx hardhat test

# PVM tests (requires running node + eth-rpc)
cd contracts/pvm && npx hardhat test --network local
```

## Deploy Commands

```bash
# Deploy to local node
cd contracts/evm && npm run deploy:local
cd contracts/pvm && npm run deploy:local

# Deploy to Polkadot Hub TestNet
cd contracts/evm && npm run deploy:testnet
cd contracts/pvm && npm run deploy:testnet
```

## Network Configuration

| Network | Chain ID | RPC |
|---|---|---|
| Local dev | 420420421 | http://127.0.0.1:8545 |
| Polkadot Hub TestNet | 420420417 | https://services.polkadothub-rpc.com/testnet |

## Version Pinning

- **polkadot-sdk**: stable2512-3 (for runtime if added later)
- **Solidity**: 0.8.28
- **resolc**: 1.0.0
- **Node.js**: 22.x LTS

## Granular Upgrade Model (ERC-2535)

ERC-2535 operates at the **function-selector level** (`bytes4`), not the pallet level. A single `diamondCut` call takes an array of `FacetCut` structs:

```solidity
struct FacetCut {
    address facetAddress;      // 0x0 for Remove
    FacetCutAction action;     // Add (0) | Replace (1) | Remove (2)
    bytes4[] functionSelectors; // subset of selectors to act on
}
```

This means any subset of a pallet's functions can be added, replaced, or removed independently — the rest of the pallet stays untouched. The UI exposes all three granularities:

| Operation | Scope | UI location |
|---|---|---|
| Add pallet | All selectors in a new pallet | Upgrade card → Add Smart Pallet |
| Replace pallet | All selectors → new implementation | Upgrade card → Replace Smart Pallet |
| Remove pallet | All selectors | Pallet card → Remove button |
| Manage functions | Individual selectors | Pallet card → Manage functions |

**"Manage functions" panel** (per pallet card):

- **Registered functions** — checkboxes to select a subset; actions: *Remove selected* or *Route selected to new pallet* (replace)
- **Previously removed** — selectors present in the known pallet ABI but not registered anywhere in the diamond; checkboxes to *Re-add* them back to the same facet address (the facet contract is still deployed, so no redeployment needed)

Removed selectors can always be re-registered later with `diamondCut(Add)` pointing at any facet address. The diamond's storage (`LibDiamond.DiamondStorage`) maps each `bytes4` selector to its current facet independently.

## Notes for AI Agents

- Dev private key in `contracts/evm/hardhat.config.ts` is Alice's well-known Substrate dev account key — not a secret.
- EVM and PVM use the **same Solidity source files** compiled with different compilers (solc vs resolc).
- `deployments.json` at the root tracks deployed contract addresses for `evm` and `pvm` keys.
- The Diamond Proxy fallback uses `delegatecall` + inline assembly — this works on both EVM and PVM via pallet-revive.
- Runtime state is stored on the diamond, not on facet contracts. Facets access namespaced storage slots in the diamond via `delegatecall`.
- `GLOBAL_SELECTOR_MAP` in `web/src/config/pallets.ts` maps every known `bytes4` selector to its function name — used by the UI to display human-readable function names instead of raw hex.
- The "previously removed" detection compares each known pallet's full ABI selectors against the live `facets()` response from DiamondLoupe; any selector absent from all live facets is shown as re-addable.
