// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IERC721Receiver
/// @dev Standard ERC-721 receiver interface.
interface IERC721Receiver {
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}
