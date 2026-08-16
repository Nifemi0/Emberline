// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function deal(address account, uint256 newBalance) external;
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
    function expectRevert(bytes calldata revertData) external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function makeAddr(string memory name) internal returns (address) {
        return vm.addr(uint256(keccak256(bytes(name))));
    }

    function assertTrue(bool condition) internal pure { require(condition, "assertTrue failed"); }
    function assertFalse(bool condition) internal pure { require(!condition, "assertFalse failed"); }
    function assertEq(uint256 left, uint256 right) internal pure { require(left == right, "assertEq failed"); }
}
