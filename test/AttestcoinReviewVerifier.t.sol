// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./TestBase.sol";
import {AttestcoinReviewVerifier} from "../src/AttestcoinReviewVerifier.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "@gluwa/usc-contracts/contracts/write-ability/INativeQueryVerifier.sol";

contract MockBlockProver is INativeQueryVerifier {
    bool public valid = true;

    function setValid(bool valid_) external { valid = valid_; }

    function verify(
        uint64,
        uint64,
        bytes calldata,
        MerkleProof calldata,
        ContinuityProof calldata
    ) external view returns (bool) { return valid; }
}

contract AttestcoinReviewVerifierTest is TestBase {
    uint64 constant SOURCE_CHAIN_KEY = 1;
    uint64 constant BLOCK_HEIGHT = 12345;

    AttestcoinReviewVerifier verifier;
    MockBlockProver prover;
    address registry = makeAddr("source-registry");
    address reviewer = makeAddr("reviewer");
    bytes32 projectId = keccak256("project-1");
    bytes32 commitment = keccak256("evidence-1");

    function setUp() public {
        prover = new MockBlockProver();
        verifier = new AttestcoinReviewVerifier(SOURCE_CHAIN_KEY, registry, address(prover));
    }

    function encodedReview(address emitter, uint8 status) internal view returns (bytes memory) {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(
            uint64(1), uint64(100000), reviewer, false, registry, uint256(0), bytes("")
        );

        EvmV1Decoder.AccessListEntryBytes32[] memory accessList =
            new EvmV1Decoder.AccessListEntryBytes32[](0);
        chunks[1] = abi.encode(
            uint64(11155111), uint128(1), uint128(2), accessList, uint8(0), bytes32(0), bytes32(0)
        );

        bytes32[] memory topics = new bytes32[](4);
        topics[0] = verifier.REVIEW_RECORDED_SIGNATURE();
        topics[1] = projectId;
        topics[2] = bytes32(uint256(0));
        topics[3] = bytes32(uint256(2));
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({
            address_: emitter,
            topics: topics,
            data: abi.encode(commitment, reviewer, true)
        });
        chunks[2] = abi.encode(status, uint64(90000), logs, bytes(""));
        return abi.encode(uint8(2), chunks);
    }

    function emptyProofs() internal pure returns (
        INativeQueryVerifier.MerkleProof memory merkle,
        INativeQueryVerifier.ContinuityProof memory continuity
    ) {
        merkle = INativeQueryVerifier.MerkleProof({
            root: bytes32(uint256(1)),
            siblings: new INativeQueryVerifier.MerkleProofEntry[](0)
        });
        continuity = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: bytes32(uint256(2)),
            roots: new bytes32[](0)
        });
    }

    function submit() internal returns (bytes32 proofId) {
        (INativeQueryVerifier.MerkleProof memory merkle, INativeQueryVerifier.ContinuityProof memory continuity) = emptyProofs();
        return verifier.submitReviewProof(BLOCK_HEIGHT, encodedReview(registry, 1), merkle, continuity);
    }

    function testPermissionlessProofMatchesFullBinding() public {
        bytes32 proofId = submit();
        assertTrue(verifier.isValidReview(proofId, reviewer, projectId, 0, 2, commitment, true));
    }

    function testTamperedBindingFails() public {
        bytes32 proofId = submit();
        assertFalse(verifier.isValidReview(proofId, reviewer, projectId, 0, 3, commitment, true));
        assertFalse(verifier.isValidReview(proofId, reviewer, projectId, 0, 2, keccak256("tampered"), true));
    }

    function testInvalidAttestcoinProofFails() public {
        prover.setValid(false);
        (INativeQueryVerifier.MerkleProof memory merkle, INativeQueryVerifier.ContinuityProof memory continuity) = emptyProofs();
        vm.expectRevert("Attestcoin proof invalid");
        verifier.submitReviewProof(BLOCK_HEIGHT, encodedReview(registry, 1), merkle, continuity);
    }

    function testWrongEmitterFails() public {
        (INativeQueryVerifier.MerkleProof memory merkle, INativeQueryVerifier.ContinuityProof memory continuity) = emptyProofs();
        vm.expectRevert("one review event required");
        verifier.submitReviewProof(BLOCK_HEIGHT, encodedReview(makeAddr("impostor"), 1), merkle, continuity);
    }

    function testFailedSourceTransactionFails() public {
        (INativeQueryVerifier.MerkleProof memory merkle, INativeQueryVerifier.ContinuityProof memory continuity) = emptyProofs();
        vm.expectRevert("source transaction failed");
        verifier.submitReviewProof(BLOCK_HEIGHT, encodedReview(registry, 0), merkle, continuity);
    }

    function testProofCannotBeRegisteredTwice() public {
        submit();
        (INativeQueryVerifier.MerkleProof memory merkle, INativeQueryVerifier.ContinuityProof memory continuity) = emptyProofs();
        vm.expectRevert("proof exists");
        verifier.submitReviewProof(BLOCK_HEIGHT, encodedReview(registry, 1), merkle, continuity);
    }
}
