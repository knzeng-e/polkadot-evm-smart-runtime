// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC721Receiver } from "../interfaces/IERC721Receiver.sol";
import { LibAccess } from "../libraries/LibAccess.sol";
import { LibAppRoles } from "../libraries/LibAppRoles.sol";
import { LibPause } from "../libraries/LibPause.sol";

/// @title NonFungibleTokenPallet
/// @notice ERC-721-inspired Smart Pallet with namespaced selectors so it can
///         coexist with other token standards inside the same Smart Runtime.
contract NonFungibleTokenPallet {
    bytes32 internal constant NFT_STORAGE_POSITION =
        keccak256("smart.runtime.pallet.non-fungible-token.storage");

    struct NftStorage {
        string name;
        string symbol;
        bool initialized;
        mapping(uint256 => address) owners;
        mapping(address => uint256) balances;
        mapping(uint256 => address) approvals;
        mapping(address => mapping(address => bool)) operatorApprovals;
        mapping(uint256 => string) tokenUris;
    }

    event NonFungibleTokenInitialized(string name, string symbol);
    event NftTransfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event NftApproval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event NftApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function _nftStorage() private pure returns (NftStorage storage ns) {
        bytes32 position = NFT_STORAGE_POSITION;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            ns.slot := position
        }
    }

    function initializeNonFungibleToken(string calldata name_, string calldata symbol_) external {
        LibAccess.enforceRoleOrOwner(LibAppRoles.DEFAULT_ADMIN_ROLE);
        NftStorage storage ns = _nftStorage();
        require(!ns.initialized, "NonFungibleToken: already initialized");
        ns.initialized = true;
        ns.name = name_;
        ns.symbol = symbol_;
        emit NonFungibleTokenInitialized(name_, symbol_);
    }

    function nftName() external view returns (string memory) {
        return _nftStorage().name;
    }

    function nftSymbol() external view returns (string memory) {
        return _nftStorage().symbol;
    }

    function nftBalanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "NonFungibleToken: zero owner");
        return _nftStorage().balances[owner];
    }

    function nftOwnerOf(uint256 tokenId) external view returns (address) {
        return _requireOwned(tokenId);
    }

    function nftExists(uint256 tokenId) external view returns (bool) {
        return _nftStorage().owners[tokenId] != address(0);
    }

    function nftTokenURI(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _nftStorage().tokenUris[tokenId];
    }

    function nftGetApproved(uint256 tokenId) external view returns (address) {
        _requireOwned(tokenId);
        return _nftStorage().approvals[tokenId];
    }

    function nftIsApprovedForAll(address owner, address operator) external view returns (bool) {
        return _nftStorage().operatorApprovals[owner][operator];
    }

    function nftApprove(address to, uint256 tokenId) external {
        address owner = _requireOwned(tokenId);
        require(to != owner, "NonFungibleToken: approval to owner");
        require(
            msg.sender == owner || _nftStorage().operatorApprovals[owner][msg.sender],
            "NonFungibleToken: not owner nor approved for all"
        );

        _nftStorage().approvals[tokenId] = to;
        emit NftApproval(owner, to, tokenId);
    }

    function nftSetApprovalForAll(address operator, bool approved) external {
        require(operator != msg.sender, "NonFungibleToken: approve to caller");
        _nftStorage().operatorApprovals[msg.sender][operator] = approved;
        emit NftApprovalForAll(msg.sender, operator, approved);
    }

    function nftTransferFrom(address from, address to, uint256 tokenId) external {
        LibPause.enforceNotPaused();
        require(_isApprovedOrOwner(msg.sender, tokenId), "NonFungibleToken: not authorized");
        _transfer(from, to, tokenId);
    }

    function nftSafeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data)
        external
    {
        LibPause.enforceNotPaused();
        require(_isApprovedOrOwner(msg.sender, tokenId), "NonFungibleToken: not authorized");
        _transfer(from, to, tokenId);
        _checkOnERC721Received(from, to, tokenId, data);
    }

    function nftMint(address to, uint256 tokenId, string calldata tokenUri) external {
        LibPause.enforceNotPaused();
        LibAccess.enforceRoleOrOwner(LibAppRoles.MINTER_ROLE);
        require(to != address(0), "NonFungibleToken: mint to zero");
        require(_nftStorage().owners[tokenId] == address(0), "NonFungibleToken: already minted");

        NftStorage storage ns = _nftStorage();
        ns.owners[tokenId] = to;
        ns.balances[to] += 1;
        ns.tokenUris[tokenId] = tokenUri;
        emit NftTransfer(address(0), to, tokenId);
    }

    function nftBurn(uint256 tokenId) external {
        LibPause.enforceNotPaused();
        if (!_isApprovedOrOwner(msg.sender, tokenId)) {
            LibAccess.enforceRoleOrOwner(LibAppRoles.BURNER_ROLE);
        }

        NftStorage storage ns = _nftStorage();
        address owner = _requireOwned(tokenId);
        ns.balances[owner] -= 1;
        delete ns.owners[tokenId];
        delete ns.approvals[tokenId];
        delete ns.tokenUris[tokenId];
        emit NftTransfer(owner, address(0), tokenId);
    }

    function _transfer(address from, address to, uint256 tokenId) private {
        require(to != address(0), "NonFungibleToken: transfer to zero");

        NftStorage storage ns = _nftStorage();
        address owner = _requireOwned(tokenId);
        require(owner == from, "NonFungibleToken: wrong from");

        delete ns.approvals[tokenId];
        ns.balances[from] -= 1;
        ns.balances[to] += 1;
        ns.owners[tokenId] = to;
        emit NftTransfer(from, to, tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) private view returns (bool) {
        address owner = _requireOwned(tokenId);
        NftStorage storage ns = _nftStorage();
        return (
            spender == owner ||
            ns.approvals[tokenId] == spender ||
            ns.operatorApprovals[owner][spender]
        );
    }

    function _requireOwned(uint256 tokenId) private view returns (address owner) {
        owner = _nftStorage().owners[tokenId];
        require(owner != address(0), "NonFungibleToken: token does not exist");
    }

    function _checkOnERC721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata data
    ) private {
        if (to.code.length == 0) return;

        try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (
            bytes4 retval
        ) {
            require(
                retval == IERC721Receiver.onERC721Received.selector,
                "NonFungibleToken: unsafe recipient"
            );
        } catch (bytes memory reason) {
            if (reason.length == 0) {
                revert("NonFungibleToken: unsafe recipient");
            }
            // solhint-disable-next-line no-inline-assembly
            assembly {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }
}
