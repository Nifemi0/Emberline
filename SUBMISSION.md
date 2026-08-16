# Emberline — hackathon submission draft

## Tagline

Every verified milestone moves aid forward.

## One-line description

Emberline is an attestation-gated milestone funding system that keeps sensitive evidence private while making approvals, disputes, commitments, and capital releases auditable.

## Problem

Humanitarian and public-interest funding often moves before delivery can be independently verified, while conventional transparency systems pressure teams to expose sensitive beneficiary or operational data. Donors need accountability; implementers and beneficiaries need privacy; reviewers need a durable process for recording independent decisions.

## Solution

Emberline locks project capital behind sequential milestone policies. Implementers hash evidence packages locally, independent reviewers attest to a specific evidence revision, and a tranche becomes releasable only when the configured quorum is satisfied. One rejection freezes the milestone until a new evidence revision is submitted. Prior commitments and decisions remain auditable.

## Attestcoin integration

Attestcoin is the verification bridge between reviewer attestations and release policy. Each accepted proof is bound to:

- reviewer
- project
- milestone
- evidence revision
- evidence commitment
- approval or rejection decision

`AttestcoinReviewVerifier` permissionlessly verifies the Merkle and continuity proof through Creditcoin's BlockProver precompile, decodes the proven successful receipt, and accepts only a `ReviewRecorded` event from Emberline's immutable Sepolia registry. `EmberlineProject` checks the complete binding, prevents proof replay, enforces reviewer policy and sequence, and releases funds only after quorum. No trusted proof-worker wallet can invent a review.

The project makes a deliberately narrow claim: the chain verifies that the configured approval process occurred against a specific evidence commitment. It does not claim that blockchain alone proves a real-world event.

## What is implemented

- multi-project owner, implementer, and reviewer workspace
- server-derived role authorization and production credential guards
- local private-file SHA-256 hashing; files are not uploaded
- immutable evidence revision history
- independent approval and dispute flow
- quorum-gated, sequential tranche release
- request idempotency and transactional funding checks
- content-verified hash-chained audit log with tamper detection
- Solidity escrow and Attestcoin proof-verifier contracts
- source-registry binding, replay, duplicate-vote, dispute, and sequence safeguards
- Docker deployment package with persistent SQLite volume
- E2E and production-safety verification suites

## Demo flow

1. An owner opens a funded relief project with sequential milestones.
2. The implementer selects a private delivery package; Emberline computes its commitment locally.
3. Independent reviewers inspect the private evidence through the approved evidence channel.
4. Reviewer attestations become Attestcoin/USC proof bindings.
5. A rejected revision freezes capital and remains in history.
6. The implementer submits a corrected revision.
7. The required approvals reach quorum.
8. The Creditcoin escrow releases the eligible tranche.
9. The public audit view shows the full commitment and decision trail without exposing beneficiary files.

## Submission links

- Repository: TBD
- Live application: TBD
- Demo video: TBD
- Verifier contract: TBD
- Project escrow contract: TBD
- Creditcoin explorer transactions: TBD

These fields require the final repository, host, wallet, and testnet deployment.
