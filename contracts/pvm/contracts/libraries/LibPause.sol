// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title LibPause
/// @notice Shared storage and helpers for global pause state.
library LibPause {
    bytes32 internal constant PAUSE_STORAGE_POSITION =
        keccak256("smart.runtime.pallet.pause.storage");

    struct PauseStorage {
        bool paused;
    }

    function pauseStorage() internal pure returns (PauseStorage storage ps) {
        bytes32 position = PAUSE_STORAGE_POSITION;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            ps.slot := position
        }
    }

    function paused() internal view returns (bool) {
        return pauseStorage().paused;
    }

    function setPaused(bool value) internal {
        pauseStorage().paused = value;
    }

    function enforceNotPaused() internal view {
        require(!paused(), "Pausable: paused");
    }
}
