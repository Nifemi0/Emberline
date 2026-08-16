// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReviewProofVerifier} from "./EmberlineProject.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "@gluwa/usc-contracts/contracts/write-ability/INativeQueryVerifier.sol";

/// @notice Permissionless Attestcoin verifier for Emberline review events.
/// @dev A caller supplies an official Attestcoin transaction proof. The
///      BlockProver precompile verifies inclusion and this contract decodes the
///      proven receipt, accepting only ReviewRecorded events emitted by the
///      immutable source registry.
contract AttestcoinReviewVerifier is IReviewProofVerifier {
    struct ReviewProof {
        address reviewer;
        bytes32 projectId;
        uint256 milestoneId;
        uint256 revision;
        bytes32 evidenceCommitment;
        bool approved;
    }

    bytes32 public constant REVIEW_RECORDED_SIGNATURE = keccak256(
        "ReviewRecorded(bytes32,uint256,uint256,bytes32,address,bool)"
    );

    uint64 public immutable sourceChainKey;
    address public immutable sourceRegistry;
    INativeQueryVerifier public immutable blockProver;
    mapping(bytes32 => ReviewProof) private proofs;

    event ProofRegistered(
        bytes32 indexed proofId,
        address indexed reviewer,
        bytes32 indexed projectId,
        uint256 milestoneId,
        uint256 revision,
        bytes32 evidenceCommitment,
        bool approved
    );

    constructor(uint64 sourceChainKey_, address sourceRegistry_, address blockProver_) {
        require(sourceChainKey_ != 0, "chain key required");
        require(sourceRegistry_ != address(0), "registry required");
        require(blockProver_ != address(0), "prover required");
        sourceChainKey = sourceChainKey_;
        sourceRegistry = sourceRegistry_;
        blockProver = INativeQueryVerifier(blockProver_);
    }

    /// @notice Verify and register one source-chain ReviewRecorded event.
    /// @return proofId Stable identifier derived from the proven transaction.
    function submitReviewProof(
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external returns (bytes32 proofId) {
        require(
            blockProver.verify(sourceChainKey, blockHeight, encodedTransaction, merkleProof, continuityProof),
            "Attestcoin proof invalid"
        );

        proofId = keccak256(abi.encode(sourceChainKey, blockHeight, encodedTransaction));
        require(proofs[proofId].reviewer == address(0), "proof exists");

        uint8 transactionType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(transactionType), "unsupported transaction");

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "source transaction failed");

        EvmV1Decoder.LogEntry memory reviewLog;
        uint256 matchingLogs;
        for (uint256 i; i < receipt.receiptLogs.length; ++i) {
            EvmV1Decoder.LogEntry memory candidate = receipt.receiptLogs[i];
            if (
                candidate.address_ == sourceRegistry &&
                candidate.topics.length > 0 &&
                candidate.topics[0] == REVIEW_RECORDED_SIGNATURE
            ) {
                reviewLog = candidate;
                matchingLogs += 1;
            }
        }
        require(matchingLogs == 1, "one review event required");
        require(reviewLog.topics.length == 4, "invalid review topics");
        require(reviewLog.data.length == 96, "invalid review data");

        (bytes32 evidenceCommitment, address reviewer, bool approved) = abi.decode(
            reviewLog.data,
            (bytes32, address, bool)
        );
        ReviewProof memory proof = ReviewProof({
            reviewer: reviewer,
            projectId: reviewLog.topics[1],
            milestoneId: uint256(reviewLog.topics[2]),
            revision: uint256(reviewLog.topics[3]),
            evidenceCommitment: evidenceCommitment,
            approved: approved
        });
        require(proof.reviewer != address(0), "reviewer required");
        require(proof.projectId != bytes32(0), "project required");
        require(proof.evidenceCommitment != bytes32(0), "evidence required");

        proofs[proofId] = proof;
        emit ProofRegistered(
            proofId,
            proof.reviewer,
            proof.projectId,
            proof.milestoneId,
            proof.revision,
            proof.evidenceCommitment,
            proof.approved
        );
    }

    function isValidReview(
        bytes32 proofId,
        address reviewer,
        bytes32 projectId,
        uint256 milestoneId,
        uint256 revision,
        bytes32 evidenceCommitment,
        bool approved
    ) external view returns (bool) {
        ReviewProof memory proof = proofs[proofId];
        return proof.reviewer == reviewer
            && proof.projectId == projectId
            && proof.milestoneId == milestoneId
            && proof.revision == revision
            && proof.evidenceCommitment == evidenceCommitment
            && proof.approved == approved;
    }

    function getProof(bytes32 proofId) external view returns (ReviewProof memory) {
        return proofs[proofId];
    }
}
