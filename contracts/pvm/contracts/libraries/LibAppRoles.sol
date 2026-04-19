// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title LibAppRoles
/// @notice Shared role identifiers used across OpenZeppelin-style Smart Pallets.
library LibAppRoles {
    bytes32 internal constant DEFAULT_ADMIN_ROLE = 0x00;
    bytes32 internal constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 internal constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 internal constant BURNER_ROLE = keccak256("BURNER_ROLE");
}
