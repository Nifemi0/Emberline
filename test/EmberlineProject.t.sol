// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./TestBase.sol";
import {EmberlineProject, IReviewProofVerifier} from "../src/EmberlineProject.sol";

contract MockProofVerifier is IReviewProofVerifier {
    mapping(bytes32 => bool) public valid;
    function setValid(bytes32 id) external { valid[id] = true; }
    function isValidReview(bytes32 id,address,bytes32,uint256,uint256,bytes32,bool) external view returns (bool) { return valid[id]; }
}

contract EmberlineProjectTest is TestBase {
    EmberlineProject project;
    MockProofVerifier verifier;
    address implementer = makeAddr("implementer");
    address reviewerA = makeAddr("reviewer-a");
    address reviewerB = makeAddr("reviewer-b");
    bytes32 proofA = keccak256("proof-a");
    bytes32 proofB = keccak256("proof-b");

    function setUp() public {
        verifier = new MockProofVerifier();
        uint256[] memory amounts = new uint256[](2); amounts[0] = 2 ether; amounts[1] = 3 ether;
        project = new EmberlineProject(keccak256("project"), implementer, amounts, address(verifier), 2);
        project.configureReviewer(reviewerA, true); project.configureReviewer(reviewerB, true);
        verifier.setValid(proofA); verifier.setValid(proofB);
        vm.deal(address(this), 5 ether); project.fund{value: 5 ether}();
    }

    function submit() internal { vm.prank(implementer); project.submitEvidence(0, keccak256("evidence-v1")); }

    function testQuorumAllowsPermissionlessRelease() public {
        submit(); vm.prank(reviewerA); project.recordReview(0, true, proofA); vm.prank(reviewerB); project.recordReview(0, true, proofB);
        uint256 beforeBalance = implementer.balance; vm.prank(makeAddr("anyone")); project.releaseMilestone(0);
        assertEq(implementer.balance - beforeBalance, 2 ether);
    }

    function testReviewerSetLocksOnSubmission() public { submit(); vm.expectRevert("reviewer set locked"); project.configureReviewer(makeAddr("late-reviewer"), true); }
    function testProofCannotBeReplayed() public { submit(); vm.prank(reviewerA); project.recordReview(0, true, proofA); vm.prank(reviewerB); vm.expectRevert("proof already used"); project.recordReview(0, true, proofA); }
    function testReviewerCannotVoteTwice() public { submit(); vm.prank(reviewerA); project.recordReview(0, true, proofA); vm.prank(reviewerA); vm.expectRevert("already voted"); project.recordReview(0, true, proofB); }
    function testRejectionFreezesRelease() public { submit(); vm.prank(reviewerA); project.recordReview(0, false, proofA); vm.expectRevert("not releasable"); project.releaseMilestone(0); }
    function testDisputeCanBeRevisedWithoutErasingHistory() public { submit(); vm.prank(reviewerA); project.recordReview(0, false, proofA); vm.prank(implementer); project.reviseEvidence(0, keccak256("evidence-v2")); EmberlineProject.Milestone memory m = project.getMilestone(0); assertEq(m.revision, 1); assertEq(m.approvals, 0); assertEq(m.rejections, 0); }
    function testInvalidProofRejected() public { submit(); vm.prank(reviewerA); vm.expectRevert("invalid proof"); project.recordReview(0, true, keccak256("invalid")); }
    function testImplementerCannotBeReviewer() public { EmberlineProject fresh; uint256[] memory amounts = new uint256[](1); amounts[0] = 1 ether; fresh = new EmberlineProject(keccak256("fresh"), implementer, amounts, address(verifier), 1); vm.expectRevert("invalid reviewer"); fresh.configureReviewer(implementer, true); }
    function testReleaseRequiresPreviousMilestone() public {
        vm.prank(implementer); project.submitEvidence(1, keccak256("evidence-v2"));
        vm.prank(reviewerA); project.recordReview(1, true, proofA);
        vm.prank(reviewerB); project.recordReview(1, true, proofB);
        vm.expectRevert("previous milestone incomplete"); project.releaseMilestone(1);
    }
    function testEvidenceRequiresEnoughReviewers() public {
        EmberlineProject fresh; uint256[] memory amounts = new uint256[](1); amounts[0] = 1 ether;
        fresh = new EmberlineProject(keccak256("reviewer-count"), implementer, amounts, address(verifier), 2);
        vm.prank(implementer); vm.expectRevert("insufficient reviewers"); fresh.submitEvidence(0, keccak256("evidence"));
    }
}
