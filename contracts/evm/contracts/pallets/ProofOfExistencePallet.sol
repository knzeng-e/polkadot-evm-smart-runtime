// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ProofOfExistencePallet
/// @notice Example Smart Pallet — demonstrates modular logic in the Smart Runtime.
///
///         This pallet is functionally equivalent to the standalone ProofOfExistence
///         contract from the polkadot-stack-template, but implemented as a Diamond
///         Facet.  Because it executes via `delegatecall` inside the SmartRuntime,
///         its storage lives in the SmartRuntime's storage context.
///
///         Storage layout: uses a dedicated namespace slot so it never collides
///         with other Smart Pallets or LibDiamond's storage.
///
///         Upgrade example: deploy a `ProofOfExistenceV2Pallet` with a new
///         `createClaimWithMetadata` function and call `diamondCut` with Replace
///         — the SmartRuntime routes the old selectors to the new pallet.
contract ProofOfExistencePallet {
    // -------------------------------------------------------------------------
    // AppStorage — namespaced to avoid collisions with other pallets
    // -------------------------------------------------------------------------

    bytes32 constant POE_STORAGE_POSITION =
        keccak256("smart.runtime.pallet.proof-of-existence.storage");

    struct Claim {
        address owner;
        uint256 blockNumber;
    }

    struct PoeStorage {
        mapping(bytes32 => Claim) claims;
        bytes32[] claimHashes;
        mapping(bytes32 => uint256) claimIndex;
    }

    function _poeStorage() private pure returns (PoeStorage storage ps) {
        bytes32 position = POE_STORAGE_POSITION;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            ps.slot := position
        }
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ClaimCreated(address indexed who, bytes32 indexed documentHash);
    event ClaimRevoked(address indexed who, bytes32 indexed documentHash);

    // -------------------------------------------------------------------------
    // Pallet logic
    // -------------------------------------------------------------------------

    /// @notice Create a proof-of-existence claim for a document hash.
    /// @param documentHash The blake2b-256 (or keccak256) hash of the document.
    function createClaim(bytes32 documentHash) external {
        PoeStorage storage ps = _poeStorage();
        require(ps.claims[documentHash].owner == address(0), "PoE: already claimed");
        ps.claims[documentHash] = Claim(msg.sender, block.number);
        ps.claimIndex[documentHash] = ps.claimHashes.length;
        ps.claimHashes.push(documentHash);
        emit ClaimCreated(msg.sender, documentHash);
    }

    /// @notice Revoke an existing proof-of-existence claim.
    /// @param documentHash The hash of the claim to revoke.
    function revokeClaim(bytes32 documentHash) external {
        PoeStorage storage ps = _poeStorage();
        require(ps.claims[documentHash].owner != address(0), "PoE: claim not found");
        require(ps.claims[documentHash].owner == msg.sender, "PoE: not claim owner");

        // Swap-and-pop to remove from the array
        uint256 idx = ps.claimIndex[documentHash];
        uint256 lastIdx = ps.claimHashes.length - 1;
        if (idx != lastIdx) {
            bytes32 lastHash = ps.claimHashes[lastIdx];
            ps.claimHashes[idx] = lastHash;
            ps.claimIndex[lastHash] = idx;
        }
        ps.claimHashes.pop();
        delete ps.claimIndex[documentHash];
        delete ps.claims[documentHash];

        emit ClaimRevoked(msg.sender, documentHash);
    }

    /// @notice Get the claim details for a document hash.
    /// @param documentHash The hash to look up.
    /// @return claimOwner  The address that created the claim (address(0) if unclaimed).
    /// @return blockNumber The block when the claim was created.
    function getClaim(bytes32 documentHash)
        external
        view
        returns (address claimOwner, uint256 blockNumber)
    {
        Claim memory c = _poeStorage().claims[documentHash];
        return (c.owner, c.blockNumber);
    }

    /// @notice Total number of active claims.
    function getClaimCount() external view returns (uint256) {
        return _poeStorage().claimHashes.length;
    }

    /// @notice Get a claim hash by its index.
    function getClaimHashAtIndex(uint256 index) external view returns (bytes32) {
        return _poeStorage().claimHashes[index];
    }
}
