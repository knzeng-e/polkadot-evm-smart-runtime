// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { LibAccess } from "../libraries/LibAccess.sol";
import { LibAppRoles } from "../libraries/LibAppRoles.sol";
import { LibPause } from "../libraries/LibPause.sol";

/// @title FungibleTokenPallet
/// @notice ERC-20-inspired Smart Pallet with namespaced selectors so it can
///         coexist with NFT and multi-asset pallets inside the same diamond.
contract FungibleTokenPallet {
    bytes32 internal constant FUNGIBLE_STORAGE_POSITION =
        keccak256("smart.runtime.pallet.fungible-token.storage");

    struct FungibleStorage {
        string name;
        string symbol;
        uint8 decimals;
        bool initialized;
        uint256 totalSupply;
        mapping(address => uint256) balances;
        mapping(address => mapping(address => uint256)) allowances;
    }

    event FungibleTokenInitialized(string name, string symbol, uint8 decimals);
    event FungibleTransfer(address indexed from, address indexed to, uint256 value);
    event FungibleApproval(address indexed owner, address indexed spender, uint256 value);

    function _fungibleStorage() private pure returns (FungibleStorage storage fs) {
        bytes32 position = FUNGIBLE_STORAGE_POSITION;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            fs.slot := position
        }
    }

    function initializeFungibleToken(
        string calldata name_,
        string calldata symbol_,
        uint8 decimals_
    ) external {
        LibAccess.enforceRoleOrOwner(LibAppRoles.DEFAULT_ADMIN_ROLE);
        FungibleStorage storage fs = _fungibleStorage();
        require(!fs.initialized, "FungibleToken: already initialized");
        fs.initialized = true;
        fs.name = name_;
        fs.symbol = symbol_;
        fs.decimals = decimals_;
        emit FungibleTokenInitialized(name_, symbol_, decimals_);
    }

    function fungibleName() external view returns (string memory) {
        return _fungibleStorage().name;
    }

    function fungibleSymbol() external view returns (string memory) {
        return _fungibleStorage().symbol;
    }

    function fungibleDecimals() external view returns (uint8) {
        return _fungibleStorage().decimals;
    }

    function fungibleTotalSupply() external view returns (uint256) {
        return _fungibleStorage().totalSupply;
    }

    function fungibleBalanceOf(address account) external view returns (uint256) {
        return _fungibleStorage().balances[account];
    }

    function fungibleAllowance(address owner, address spender) external view returns (uint256) {
        return _fungibleStorage().allowances[owner][spender];
    }

    function fungibleApprove(address spender, uint256 amount) external returns (bool) {
        LibPause.enforceNotPaused();
        _approve(msg.sender, spender, amount);
        return true;
    }

    function fungibleIncreaseAllowance(address spender, uint256 addedValue)
        external
        returns (bool)
    {
        LibPause.enforceNotPaused();
        FungibleStorage storage fs = _fungibleStorage();
        uint256 newAllowance = fs.allowances[msg.sender][spender] + addedValue;
        _approve(msg.sender, spender, newAllowance);
        return true;
    }

    function fungibleDecreaseAllowance(address spender, uint256 subtractedValue)
        external
        returns (bool)
    {
        LibPause.enforceNotPaused();
        FungibleStorage storage fs = _fungibleStorage();
        uint256 currentAllowance = fs.allowances[msg.sender][spender];
        require(
            currentAllowance >= subtractedValue,
            "FungibleToken: decreased allowance below zero"
        );
        _approve(msg.sender, spender, currentAllowance - subtractedValue);
        return true;
    }

    function fungibleTransfer(address to, uint256 amount) external returns (bool) {
        LibPause.enforceNotPaused();
        _transfer(msg.sender, to, amount);
        return true;
    }

    function fungibleTransferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        LibPause.enforceNotPaused();
        FungibleStorage storage fs = _fungibleStorage();
        uint256 currentAllowance = fs.allowances[from][msg.sender];
        require(currentAllowance >= amount, "FungibleToken: insufficient allowance");
        if (currentAllowance != type(uint256).max) {
            unchecked {
                fs.allowances[from][msg.sender] = currentAllowance - amount;
            }
            emit FungibleApproval(from, msg.sender, fs.allowances[from][msg.sender]);
        }
        _transfer(from, to, amount);
        return true;
    }

    function fungibleMint(address to, uint256 amount) external {
        LibPause.enforceNotPaused();
        LibAccess.enforceRoleOrOwner(LibAppRoles.MINTER_ROLE);
        require(to != address(0), "FungibleToken: mint to zero");

        FungibleStorage storage fs = _fungibleStorage();
        fs.totalSupply += amount;
        fs.balances[to] += amount;
        emit FungibleTransfer(address(0), to, amount);
    }

    function fungibleBurn(address from, uint256 amount) external {
        LibPause.enforceNotPaused();
        if (msg.sender != from) {
            LibAccess.enforceRoleOrOwner(LibAppRoles.BURNER_ROLE);
        }
        require(from != address(0), "FungibleToken: burn from zero");

        FungibleStorage storage fs = _fungibleStorage();
        uint256 balance = fs.balances[from];
        require(balance >= amount, "FungibleToken: insufficient balance");
        unchecked {
            fs.balances[from] = balance - amount;
            fs.totalSupply -= amount;
        }
        emit FungibleTransfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(from != address(0), "FungibleToken: transfer from zero");
        require(to != address(0), "FungibleToken: transfer to zero");

        FungibleStorage storage fs = _fungibleStorage();
        uint256 balance = fs.balances[from];
        require(balance >= amount, "FungibleToken: insufficient balance");
        unchecked {
            fs.balances[from] = balance - amount;
        }
        fs.balances[to] += amount;
        emit FungibleTransfer(from, to, amount);
    }

    function _approve(address owner, address spender, uint256 amount) private {
        require(owner != address(0), "FungibleToken: approve from zero");
        require(spender != address(0), "FungibleToken: approve to zero");

        _fungibleStorage().allowances[owner][spender] = amount;
        emit FungibleApproval(owner, spender, amount);
    }
}
