# Emberline — hackathon submission draft

## Tagline

Every verified milestone moves aid forward.

## One-line description

Emberline is an attestation-gated milestone funding system that keeps sensitive evidence private while making approvals, disputes, commitments, and capital releases auditable.

## Recommended sector

RWA - Emberline connects off-chain delivery evidence and independent review decisions to transparent, programmable on-chain funding policy.

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

1. A visitor opens the session-scoped application sandbox, or an owner opens a funded project with sequential milestones.
2. The implementer selects a private delivery package; Emberline computes its commitment locally.
3. Independent reviewers inspect the private evidence through the approved evidence channel.
4. In the sandbox, application attestations demonstrate the interaction flow. The linked live testnet sample separately proves the Attestcoin/USC cross-chain path.
5. A rejected revision freezes capital and remains in history.
6. The implementer submits a corrected revision.
7. The required approvals reach quorum.
8. The Creditcoin escrow releases the eligible tranche.
9. The public audit view shows the full commitment and decision trail without exposing beneficiary files.

## Submission links

- Repository: https://github.com/Nifemi0/Emberline
- Live application: https://emberline.onrender.com
- Submission brief: https://github.com/Nifemi0/Emberline/blob/main/submission-assets/emberline-submission-brief.pdf
- Demo video: https://github.com/Nifemi0/Emberline/raw/refs/heads/main/submission-assets/emberline-buidl-ctc-neural.mp4
- Sepolia source registry: https://sepolia.etherscan.io/address/0x525749ab5390166fCEa076D50d5168d1db476cE7
- Creditcoin verifier: https://creditcoin-testnet.blockscout.com/address/0x525749ab5390166fCEa076D50d5168d1db476cE7
- Project escrow: https://creditcoin-testnet.blockscout.com/address/0xB236da47fe9215E18C729050fEd3f4B77FcBBffE
- Verifier deployment transaction: https://creditcoin-testnet.blockscout.com/tx/0x66e1917d305939d96168b0bde33ac6a1e6cc099b31df3b7c4fcb9516ad4da936
- Project deployment transaction: https://creditcoin-testnet.blockscout.com/tx/0x2794178c36b43c427f458a08c5ba6df11fc53028a32c9f820d782a24d393c881

The hosted deployment currently reports PostgreSQL persistence. The application also supports SQLite as a zero-configuration local fallback. The public guided sandbox is synthetic and session-scoped; its application records have no monetary value and are not represented as public blockchain transactions. The linked live-attestation sample is the separate testnet evidence for the real cross-chain path.

## Submission scope

The current Fall submission page is https://dorahacks.io/hackathon/buidl-ctc-2026-fall. The official Creditcoin page lists September 6, 2026 as the submission date; confirm the platform's displayed cutoff and timezone immediately before submitting. The required public assets are the repository, this technical explanation, the submission brief PDF, the demo video, and the explorer-linked testnet deployment.
