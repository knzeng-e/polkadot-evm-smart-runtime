// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { LibAccess } from "../libraries/LibAccess.sol";
import { LibAppRoles } from "../libraries/LibAppRoles.sol";
import { LibPause } from "../libraries/LibPause.sol";

/// @title PausablePallet
/// @notice OpenZeppelin-style global emergency stop for the Smart Runtime.
contract PausablePallet {
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    function paused() external view returns (bool) {
        return LibPause.paused();
    }

    function pause() external {
        LibAccess.enforceRoleOrOwner(LibAppRoles.PAUSER_ROLE);
        require(!LibPause.paused(), "Pausable: paused");
        LibPause.setPaused(true);
        emit Paused(msg.sender);
    }

    function unpause() external {
        LibAccess.enforceRoleOrOwner(LibAppRoles.PAUSER_ROLE);
        require(LibPause.paused(), "Pausable: not paused");
        LibPause.setPaused(false);
        emit Unpaused(msg.sender);
    }
}
