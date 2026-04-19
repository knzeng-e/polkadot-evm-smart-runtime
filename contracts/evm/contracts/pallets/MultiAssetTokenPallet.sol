// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC1155Receiver } from "../interfaces/IERC1155Receiver.sol";
import { LibAccess } from "../libraries/LibAccess.sol";
import { LibAppRoles } from "../libraries/LibAppRoles.sol";
import { LibPause } from "../libraries/LibPause.sol";

/// @title MultiAssetTokenPallet
/// @notice ERC-1155-inspired Smart Pallet with namespaced selectors so it can
///         coexist with other token standards inside the same Smart Runtime.
contract MultiAssetTokenPallet {
    bytes32 internal constant MULTI_ASSET_STORAGE_POSITION =
        keccak256("smart.runtime.pallet.multi-asset-token.storage");

    struct MultiAssetStorage {
        string baseUri;
        bool initialized;
        mapping(uint256 => mapping(address => uint256)) balances;
        mapping(address => mapping(address => bool)) operatorApprovals;
        mapping(uint256 => uint256) totalSupply;
        mapping(uint256 => string) tokenUris;
    }

    event MultiAssetTokenInitialized(string baseUri);
    event MultiAssetTransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );
    event MultiAssetTransferBatch(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256[] ids,
        uint256[] values
    );
    event MultiAssetApprovalForAll(
        address indexed account,
        address indexed operator,
        bool approved
    );
    event MultiAssetUri(string value, uint256 indexed id);

    function _multiAssetStorage() private pure returns (MultiAssetStorage storage ms) {
        bytes32 position = MULTI_ASSET_STORAGE_POSITION;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            ms.slot := position
        }
    }

    function initializeMultiAssetToken(string calldata baseUri_) external {
        LibAccess.enforceRoleOrOwner(LibAppRoles.DEFAULT_ADMIN_ROLE);
        MultiAssetStorage storage ms = _multiAssetStorage();
        require(!ms.initialized, "MultiAssetToken: already initialized");
        ms.initialized = true;
        ms.baseUri = baseUri_;
        emit MultiAssetTokenInitialized(baseUri_);
    }

    function multiAssetBaseUri() external view returns (string memory) {
        return _multiAssetStorage().baseUri;
    }

    function multiAssetSetBaseUri(string calldata newBaseUri) external {
        LibAccess.enforceRoleOrOwner(LibAppRoles.DEFAULT_ADMIN_ROLE);
        _multiAssetStorage().baseUri = newBaseUri;
    }

    function multiAssetUri(uint256 id) external view returns (string memory) {
        MultiAssetStorage storage ms = _multiAssetStorage();
        string memory tokenUri = ms.tokenUris[id];
        return bytes(tokenUri).length == 0 ? ms.baseUri : tokenUri;
    }

    function multiAssetSetTokenUri(uint256 id, string calldata newUri) external {
        LibAccess.enforceRoleOrOwner(LibAppRoles.DEFAULT_ADMIN_ROLE);
        _multiAssetStorage().tokenUris[id] = newUri;
        emit MultiAssetUri(newUri, id);
    }

    function multiAssetBalanceOf(address account, uint256 id) external view returns (uint256) {
        require(account != address(0), "MultiAssetToken: zero account");
        return _multiAssetStorage().balances[id][account];
    }

    function multiAssetBalanceOfBatch(
        address[] calldata accounts,
        uint256[] calldata ids
    ) external view returns (uint256[] memory balances) {
        require(accounts.length == ids.length, "MultiAssetToken: length mismatch");

        MultiAssetStorage storage ms = _multiAssetStorage();
        balances = new uint256[](accounts.length);
        for (uint256 i; i < accounts.length; i++) {
            require(accounts[i] != address(0), "MultiAssetToken: zero account");
            balances[i] = ms.balances[ids[i]][accounts[i]];
        }
    }

    function multiAssetTotalSupply(uint256 id) external view returns (uint256) {
        return _multiAssetStorage().totalSupply[id];
    }

    function multiAssetIsApprovedForAll(address account, address operator)
        external
        view
        returns (bool)
    {
        return _multiAssetStorage().operatorApprovals[account][operator];
    }

    function multiAssetSetApprovalForAll(address operator, bool approved) external {
        require(operator != msg.sender, "MultiAssetToken: approve to caller");
        _multiAssetStorage().operatorApprovals[msg.sender][operator] = approved;
        emit MultiAssetApprovalForAll(msg.sender, operator, approved);
    }

    function multiAssetSafeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external {
        LibPause.enforceNotPaused();
        require(
            from == msg.sender || _multiAssetStorage().operatorApprovals[from][msg.sender],
            "MultiAssetToken: not authorized"
        );
        _transfer(from, to, id, amount);
        _checkOnERC1155Received(from, to, id, amount, data);
    }

    function multiAssetSafeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external {
        LibPause.enforceNotPaused();
        require(ids.length == amounts.length, "MultiAssetToken: length mismatch");
        require(
            from == msg.sender || _multiAssetStorage().operatorApprovals[from][msg.sender],
            "MultiAssetToken: not authorized"
        );

        for (uint256 i; i < ids.length; i++) {
            _transfer(from, to, ids[i], amounts[i]);
        }

        emit MultiAssetTransferBatch(msg.sender, from, to, ids, amounts);
        _checkOnERC1155BatchReceived(from, to, ids, amounts, data);
    }

    function multiAssetMint(
        address to,
        uint256 id,
        uint256 amount,
        string calldata tokenUri,
        bytes calldata data
    ) external {
        LibPause.enforceNotPaused();
        LibAccess.enforceRoleOrOwner(LibAppRoles.MINTER_ROLE);
        require(to != address(0), "MultiAssetToken: mint to zero");

        MultiAssetStorage storage ms = _multiAssetStorage();
        ms.balances[id][to] += amount;
        ms.totalSupply[id] += amount;
        if (bytes(tokenUri).length != 0) {
            ms.tokenUris[id] = tokenUri;
            emit MultiAssetUri(tokenUri, id);
        }
        emit MultiAssetTransferSingle(msg.sender, address(0), to, id, amount);
        _checkOnERC1155Received(address(0), to, id, amount, data);
    }

    function multiAssetMintBatch(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external {
        LibPause.enforceNotPaused();
        LibAccess.enforceRoleOrOwner(LibAppRoles.MINTER_ROLE);
        require(to != address(0), "MultiAssetToken: mint to zero");
        require(ids.length == amounts.length, "MultiAssetToken: length mismatch");

        MultiAssetStorage storage ms = _multiAssetStorage();
        for (uint256 i; i < ids.length; i++) {
            ms.balances[ids[i]][to] += amounts[i];
            ms.totalSupply[ids[i]] += amounts[i];
        }

        emit MultiAssetTransferBatch(msg.sender, address(0), to, ids, amounts);
        _checkOnERC1155BatchReceived(address(0), to, ids, amounts, data);
    }

    function multiAssetBurn(address from, uint256 id, uint256 amount) external {
        LibPause.enforceNotPaused();
        if (from != msg.sender && !_multiAssetStorage().operatorApprovals[from][msg.sender]) {
            LibAccess.enforceRoleOrOwner(LibAppRoles.BURNER_ROLE);
        }
        _burn(from, id, amount);
    }

    function multiAssetBurnBatch(
        address from,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external {
        LibPause.enforceNotPaused();
        require(ids.length == amounts.length, "MultiAssetToken: length mismatch");
        if (from != msg.sender && !_multiAssetStorage().operatorApprovals[from][msg.sender]) {
            LibAccess.enforceRoleOrOwner(LibAppRoles.BURNER_ROLE);
        }

        for (uint256 i; i < ids.length; i++) {
            _burn(from, ids[i], amounts[i]);
        }

        emit MultiAssetTransferBatch(msg.sender, from, address(0), ids, amounts);
    }

    function _transfer(address from, address to, uint256 id, uint256 amount) private {
        require(from != address(0), "MultiAssetToken: transfer from zero");
        require(to != address(0), "MultiAssetToken: transfer to zero");

        MultiAssetStorage storage ms = _multiAssetStorage();
        uint256 balance = ms.balances[id][from];
        require(balance >= amount, "MultiAssetToken: insufficient balance");
        unchecked {
            ms.balances[id][from] = balance - amount;
        }
        ms.balances[id][to] += amount;
        emit MultiAssetTransferSingle(msg.sender, from, to, id, amount);
    }

    function _burn(address from, uint256 id, uint256 amount) private {
        require(from != address(0), "MultiAssetToken: burn from zero");

        MultiAssetStorage storage ms = _multiAssetStorage();
        uint256 balance = ms.balances[id][from];
        require(balance >= amount, "MultiAssetToken: insufficient balance");
        unchecked {
            ms.balances[id][from] = balance - amount;
            ms.totalSupply[id] -= amount;
        }
        emit MultiAssetTransferSingle(msg.sender, from, address(0), id, amount);
    }

    function _checkOnERC1155Received(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) private {
        if (to.code.length == 0) return;

        try IERC1155Receiver(to).onERC1155Received(msg.sender, from, id, amount, data) returns (
            bytes4 retval
        ) {
            require(
                retval == IERC1155Receiver.onERC1155Received.selector,
                "MultiAssetToken: unsafe recipient"
            );
        } catch (bytes memory reason) {
            if (reason.length == 0) {
                revert("MultiAssetToken: unsafe recipient");
            }
            // solhint-disable-next-line no-inline-assembly
            assembly {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }

    function _checkOnERC1155BatchReceived(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) private {
        if (to.code.length == 0) return;

        try IERC1155Receiver(to).onERC1155BatchReceived(
            msg.sender,
            from,
            ids,
            amounts,
            data
        ) returns (bytes4 retval) {
            require(
                retval == IERC1155Receiver.onERC1155BatchReceived.selector,
                "MultiAssetToken: unsafe recipient"
            );
        } catch (bytes memory reason) {
            if (reason.length == 0) {
                revert("MultiAssetToken: unsafe recipient");
            }
            // solhint-disable-next-line no-inline-assembly
            assembly {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }
}
