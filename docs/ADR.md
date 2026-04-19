# ADR-0001: Smart Runtime as a Diamond-Based Contract Runtime

## Status

Accepted

## Context

The project needs a smart-contract architecture that can behave like an application runtime rather than a single-purpose contract.

The main requirements are:

- modular logic
- upgradeability without redeploying the system entrypoint
- support for both Polkadot EVM-style execution and PolkaVM / pallet-revive compilation targets
- room for multiple categories of pallets to coexist in one deployed runtime

Traditional upgradeable proxy patterns solve part of this problem, but they generally swap one implementation contract for another. The project instead needs a structure where multiple modules can be attached, replaced, or removed independently.

## Decision

The system will use the ERC-2535 Diamond pattern as the contract-level runtime shell.

### The chosen model

- `SmartRuntime` is the diamond proxy and long-lived runtime address.
- Pallets are diamond facets.
- Runtime upgrades are performed through the `Upgrade` module via the standard `diamondCut` function.
- Shared selector routing and ownership state live in `LibDiamond`.
- Runtime state lives in the diamond and is organized with namespaced storage slots for each pallet domain.

### Deployment targets

The same logical runtime model is maintained across:

- AssetHub-style EVM compilation with `solc`
- PolkaVM / pallet-revive compilation with `resolc`

## Consequences

### Positive

- The runtime address stays stable while logic evolves.
- New pallets can be added without redeploying the system.
- Old pallets can be replaced or removed independently.
- The runtime can grow past the single-contract EVM bytecode ceiling by splitting functionality across multiple facets.
- The contract surface can be organized by capability rather than forced into one implementation contract.
- The model maps well to the project's framing of "Smart Runtime" and "Smart Pallets".

### Negative

- Selector management becomes a first-class concern.
- Storage isolation must be explicit and disciplined.
- Tooling and documentation need to explain the difference between the proxy, facets, and shared storage.
- Frontend deployment flows must stay synchronized with the pallet selector surface.

## Current Implemented Runtime Surface

### Core

- `Upgrade`
- `Inspector`
- `Ownership`

### Access

- `Access Control`
- `Pausable`

### Token

- `Fungible Token`
- `Non-Fungible Token`
- `Multi-Asset Token`

### App

- `Proof of Existence`

## Important Design Constraint

The runtime intentionally does not expose literal ERC-20, ERC-721, and ERC-1155 public selector sets unchanged inside one diamond.

Reason:

- those standards reuse selectors such as `balanceOf`, `approve`, and `transferFrom`
- a single diamond cannot safely register overlapping selectors to different facets

Decision:

- token pallets use namespaced selector families such as `fungible*`, `nft*`, and `multiAsset*`

## Operational Implications

- Deploy-time pallet registration is performed by building an initial `FacetCut[]`.
- Upgrade-time changes are applied with `Add`, `Replace`, or `Remove`.
- The frontend and shell tooling must understand the pallet catalog and selector model.
- The PVM target mirrors the EVM contract structure, but frontend bytecode tooling is currently EVM-oriented.

## Follow-On Decisions

The next architectural decisions likely needed are:

- whether to add timelock / multisig governance around `diamondCut`
- whether the web manager should become dual-target for both EVM and PVM bytecode
- how far to go on OpenZeppelin-style runtime primitives versus Polkadot-native pallets such as XCM, preimage, or treasury flows
