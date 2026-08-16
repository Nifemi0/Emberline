// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Adapter boundary for an Attestcoin Protocol proof verifier on Creditcoin.
/// @dev Production implementation must verify a source-chain ReviewRecorded event
///      and bind reviewer, project, milestone, revision and evidence commitment.
interface IReviewProofVerifier {
    function isValidReview(
        bytes32 proofId,
        address reviewer,
        bytes32 projectId,
        uint256 milestoneId,
        uint256 revision,
        bytes32 evidenceCommitment,
        bool approved
    ) external view returns (bool);
}

contract EmberlineProject {
    enum MilestoneState { Pending, Submitted, Released, Disputed }

    struct Milestone {
        uint256 amount;
        bytes32 evidenceCommitment;
        uint256 approvals;
        uint256 rejections;
        uint256 revision;
        MilestoneState state;
    }

    address public immutable owner;
    address public immutable implementer;
    IReviewProofVerifier public immutable proofVerifier;
    bytes32 public immutable projectId;
    uint256 public immutable quorum;
    uint256 public funded;
    uint256 public released;
    uint256 public reviewerCount;
    bool public reviewerSetLocked;

    mapping(address => bool) public approvedReviewers;
    mapping(bytes32 => bool) public usedProofs;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public voted;
    Milestone[] private milestones;

    event ProjectCreated(bytes32 indexed projectId, address indexed implementer, uint256 milestoneCount);
    event Funded(address indexed contributor, uint256 amount);
    event ReviewerConfigured(address indexed reviewer, bool allowed);
    event EvidenceSubmitted(uint256 indexed milestoneId, uint256 indexed revision, bytes32 evidenceCommitment);
    event ReviewRecorded(uint256 indexed milestoneId, uint256 indexed revision, address indexed reviewer, bool approved, bytes32 proofId);
    event MilestoneDisputed(uint256 indexed milestoneId, uint256 indexed revision, address indexed reviewer);
    event MilestoneReleased(uint256 indexed milestoneId, uint256 indexed revision, uint256 amount, address recipient);

    modifier onlyOwner() { require(msg.sender == owner, "only owner"); _; }
    modifier onlyImplementer() { require(msg.sender == implementer, "only implementer"); _; }

    constructor(
        bytes32 projectId_,
        address implementer_,
        uint256[] memory milestoneAmounts,
        address proofVerifier_,
        uint256 quorum_
    ) {
        require(projectId_ != bytes32(0), "project id required");
        require(implementer_ != address(0), "implementer required");
        require(proofVerifier_ != address(0), "verifier required");
        require(milestoneAmounts.length > 0, "milestones required");
        require(quorum_ > 0, "quorum required");
        owner = msg.sender;
        projectId = projectId_;
        implementer = implementer_;
        proofVerifier = IReviewProofVerifier(proofVerifier_);
        quorum = quorum_;
        for (uint256 i; i < milestoneAmounts.length; ++i) {
            require(milestoneAmounts[i] > 0, "zero milestone");
            milestones.push(Milestone(milestoneAmounts[i], bytes32(0), 0, 0, 0, MilestoneState.Pending));
        }
        emit ProjectCreated(projectId_, implementer_, milestoneAmounts.length);
    }

    receive() external payable { fund(); }

    function fund() public payable {
        require(msg.value > 0, "zero funding");
        funded += msg.value;
        emit Funded(msg.sender, msg.value);
    }

    function configureReviewer(address reviewer, bool allowed) external onlyOwner {
        require(!reviewerSetLocked, "reviewer set locked");
        require(reviewer != address(0) && reviewer != implementer, "invalid reviewer");
        if (allowed && !approvedReviewers[reviewer]) reviewerCount += 1;
        if (!allowed && approvedReviewers[reviewer]) reviewerCount -= 1;
        approvedReviewers[reviewer] = allowed;
        emit ReviewerConfigured(reviewer, allowed);
    }

    function submitEvidence(uint256 milestoneId, bytes32 evidenceCommitment) external onlyImplementer {
        require(milestoneId < milestones.length, "invalid milestone");
        require(reviewerCount >= quorum, "insufficient reviewers");
        Milestone storage milestone = milestones[milestoneId];
        require(milestone.state == MilestoneState.Pending, "not pending");
        require(evidenceCommitment != bytes32(0), "evidence required");
        reviewerSetLocked = true;
        milestone.evidenceCommitment = evidenceCommitment;
        milestone.state = MilestoneState.Submitted;
        emit EvidenceSubmitted(milestoneId, milestone.revision, evidenceCommitment);
    }

    /// @notice A disputed package may be replaced, but its prior revision stays auditable.
    function reviseEvidence(uint256 milestoneId, bytes32 newCommitment) external onlyImplementer {
        require(milestoneId < milestones.length, "invalid milestone");
        Milestone storage milestone = milestones[milestoneId];
        require(milestone.state == MilestoneState.Disputed, "not disputed");
        require(newCommitment != bytes32(0) && newCommitment != milestone.evidenceCommitment, "new evidence required");
        milestone.revision += 1;
        milestone.evidenceCommitment = newCommitment;
        milestone.approvals = 0;
        milestone.rejections = 0;
        milestone.state = MilestoneState.Submitted;
        emit EvidenceSubmitted(milestoneId, milestone.revision, newCommitment);
    }

    function recordReview(uint256 milestoneId, bool approved, bytes32 proofId) external {
        require(approvedReviewers[msg.sender], "not reviewer");
        require(milestoneId < milestones.length, "invalid milestone");
        require(proofId != bytes32(0), "proof required");
        require(!usedProofs[proofId], "proof already used");
        Milestone storage milestone = milestones[milestoneId];
        require(milestone.state == MilestoneState.Submitted, "not submitted");
        require(!voted[milestoneId][milestone.revision][msg.sender], "already voted");
        require(proofVerifier.isValidReview(proofId, msg.sender, projectId, milestoneId, milestone.revision, milestone.evidenceCommitment, approved), "invalid proof");
        usedProofs[proofId] = true;
        voted[milestoneId][milestone.revision][msg.sender] = true;
        if (approved) milestone.approvals += 1;
        else {
            milestone.rejections += 1;
            milestone.state = MilestoneState.Disputed;
            emit MilestoneDisputed(milestoneId, milestone.revision, msg.sender);
        }
        emit ReviewRecorded(milestoneId, milestone.revision, msg.sender, approved, proofId);
    }

    /// @notice Permissionless after policy satisfaction, preventing owner censorship.
    function releaseMilestone(uint256 milestoneId) external {
        require(milestoneId < milestones.length, "invalid milestone");
        Milestone storage milestone = milestones[milestoneId];
        if (milestoneId > 0) require(milestones[milestoneId - 1].state == MilestoneState.Released, "previous milestone incomplete");
        require(milestone.state == MilestoneState.Submitted, "not releasable");
        require(milestone.approvals >= quorum, "quorum incomplete");
        require(milestone.rejections == 0, "milestone disputed");
        require(address(this).balance >= milestone.amount, "insufficient escrow");
        milestone.state = MilestoneState.Released;
        released += milestone.amount;
        (bool sent,) = payable(implementer).call{value: milestone.amount}("");
        require(sent, "transfer failed");
        emit MilestoneReleased(milestoneId, milestone.revision, milestone.amount, implementer);
    }

    function milestoneCount() external view returns (uint256) { return milestones.length; }
    function getMilestone(uint256 milestoneId) external view returns (Milestone memory) { return milestones[milestoneId]; }
}
