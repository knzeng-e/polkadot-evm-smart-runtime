// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { LibAppRoles } from "./LibAppRoles.sol";
import { LibDiamond } from "./LibDiamond.sol";

/// @title LibAccess
/// @notice Shared storage and helpers for role-based access control.
library LibAccess {
    bytes32 internal constant ACCESS_STORAGE_POSITION =
        keccak256("smart.runtime.pallet.access-control.storage");

    struct RoleData {
        mapping(address => bool) members;
        bytes32 adminRole;
    }

    struct AccessStorage {
        mapping(bytes32 => RoleData) roles;
    }

    function accessStorage() internal pure returns (AccessStorage storage acs) {
        bytes32 position = ACCESS_STORAGE_POSITION;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            acs.slot := position
        }
    }

    function hasRole(bytes32 role, address account) internal view returns (bool) {
        if (role == LibAppRoles.DEFAULT_ADMIN_ROLE && account == LibDiamond.contractOwner()) {
            return true;
        }
        return accessStorage().roles[role].members[account];
    }

    function getRoleAdmin(bytes32 role) internal view returns (bytes32 adminRole) {
        adminRole = accessStorage().roles[role].adminRole;
        if (adminRole == bytes32(0)) {
            adminRole = LibAppRoles.DEFAULT_ADMIN_ROLE;
        }
    }

    function grantRole(bytes32 role, address account) internal returns (bool) {
        if (hasRole(role, account)) return false;
        accessStorage().roles[role].members[account] = true;
        return true;
    }

    function revokeRole(bytes32 role, address account) internal returns (bool) {
        if (!accessStorage().roles[role].members[account]) return false;
        delete accessStorage().roles[role].members[account];
        return true;
    }

    function setRoleAdmin(bytes32 role, bytes32 adminRole)
        internal
        returns (bytes32 previousAdminRole)
    {
        previousAdminRole = getRoleAdmin(role);
        accessStorage().roles[role].adminRole = adminRole;
    }

    function enforceRole(bytes32 role) internal view {
        require(hasRole(role, msg.sender), "AccessControl: missing role");
    }

    function enforceRoleOrOwner(bytes32 role) internal view {
        if (msg.sender == LibDiamond.contractOwner()) return;
        require(hasRole(role, msg.sender), "AccessControl: missing role");
    }
}
