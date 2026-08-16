// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal source-chain event registry designed for Attestcoin Protocol proving.
contract EvidenceReviewRegistry {
    address public immutable administrator;
    mapping(address => bool) public reviewers;

    event ReviewerConfigured(address indexed reviewer, bool allowed);
    event ReviewRecorded(
        bytes32 indexed projectId,
        uint256 indexed milestoneId,
        uint256 indexed revision,
        bytes32 evidenceCommitment,
        address reviewer,
        bool approved
    );

    constructor() { administrator = msg.sender; }

    function configureReviewer(address reviewer, bool allowed) external {
        require(msg.sender == administrator, "only administrator");
        require(reviewer != address(0), "reviewer required");
        reviewers[reviewer] = allowed;
        emit ReviewerConfigured(reviewer, allowed);
    }

    function recordReview(bytes32 projectId, uint256 milestoneId, uint256 revision, bytes32 evidenceCommitment, bool approved) external {
        require(reviewers[msg.sender], "not reviewer");
        require(projectId != bytes32(0) && evidenceCommitment != bytes32(0), "invalid review");
        emit ReviewRecorded(projectId, milestoneId, revision, evidenceCommitment, msg.sender, approved);
    }
}
