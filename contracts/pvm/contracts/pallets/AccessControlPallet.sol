// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { LibAccess } from "../libraries/LibAccess.sol";
import { LibAppRoles } from "../libraries/LibAppRoles.sol";

/// @title AccessControlPallet
/// @notice OpenZeppelin-style role management for the Smart Runtime.
contract AccessControlPallet {
    event RoleAdminChanged(
        bytes32 indexed role,
        bytes32 indexed previousAdminRole,
        bytes32 indexed newAdminRole
    );
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    function DEFAULT_ADMIN_ROLE() external pure returns (bytes32) {
        return LibAppRoles.DEFAULT_ADMIN_ROLE;
    }

    function PAUSER_ROLE() external pure returns (bytes32) {
        return LibAppRoles.PAUSER_ROLE;
    }

    function MINTER_ROLE() external pure returns (bytes32) {
        return LibAppRoles.MINTER_ROLE;
    }

    function BURNER_ROLE() external pure returns (bytes32) {
        return LibAppRoles.BURNER_ROLE;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return LibAccess.hasRole(role, account);
    }

    function getRoleAdmin(bytes32 role) external view returns (bytes32) {
        return LibAccess.getRoleAdmin(role);
    }

    function grantRole(bytes32 role, address account) external {
        LibAccess.enforceRoleOrOwner(LibAccess.getRoleAdmin(role));
        if (LibAccess.grantRole(role, account)) {
            emit RoleGranted(role, account, msg.sender);
        }
    }

    function revokeRole(bytes32 role, address account) external {
        LibAccess.enforceRoleOrOwner(LibAccess.getRoleAdmin(role));
        if (LibAccess.revokeRole(role, account)) {
            emit RoleRevoked(role, account, msg.sender);
        }
    }

    function renounceRole(bytes32 role, address account) external {
        require(account == msg.sender, "AccessControl: can only renounce self");
        if (LibAccess.revokeRole(role, account)) {
            emit RoleRevoked(role, account, msg.sender);
        }
    }

    function setRoleAdmin(bytes32 role, bytes32 adminRole) external {
        LibAccess.enforceRoleOrOwner(LibAppRoles.DEFAULT_ADMIN_ROLE);
        bytes32 previousAdminRole = LibAccess.setRoleAdmin(role, adminRole);
        emit RoleAdminChanged(role, previousAdminRole, adminRole);
    }
}
