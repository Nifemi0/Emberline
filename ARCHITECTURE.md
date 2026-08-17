# Emberline architecture

## Two clearly separated experiences

The public guided workspace is a session-scoped application sandbox. It creates synthetic application records so a visitor can experience the evidence, review, quorum, and release flow without a wallet or signup; those records have no monetary value and are not public blockchain transactions. The live Attestcoin sample is separate and links the real Sepolia source events, Creditcoin proof registrations, Emberline review calls, and testnet escrow release.

```mermaid
flowchart LR
    Owner["Project owner"] -->|"funds and policy"| App["Emberline web app"]
    Implementer["Implementer"] -->|"private file hashed locally"| App
    App -->|"commitments, revisions, reviews"| API["Node API"]
    API --> DB["SQLite + hash-chained audit log"]
    Reviewer["Independent reviewer"] -->|"ReviewRecorded transaction"| Registry["EvidenceReviewRegistry on Sepolia"]
    Registry -->|"transaction attested"| Attestcoin["Attestcoin Proof Builder"]
    Attestcoin -->|"Merkle + continuity proof"| Verifier["AttestcoinReviewVerifier on Creditcoin"]
    Verifier -->|"calls 0x…0FD2"| BlockProver["BlockProver precompile"]
    App -->|"quorum release"| Escrow["EmberlineProject escrow"]
    Escrow -->|"exact proof lookup"| Verifier
    Escrow -->|"released tranche"| Implementer
```

## Trust boundaries

- Evidence files remain with the implementer. The browser calculates SHA-256 locally and sends only the commitment and a non-sensitive label.
- The API authenticates actor roles with server-side bearer-token hashes. Browser-supplied roles are never trusted.
- Review proofs are submitted permissionlessly. The immutable source-chain key, source registry, and BlockProver address define the verification boundary.
- The proven successful receipt must contain exactly one correctly encoded `ReviewRecorded` event from the configured registry.
- A rejection disputes the current revision. A replacement creates a new immutable revision without deleting prior evidence or reviews.
- The application audit chain detects both broken links and modified event contents.
- Blockchain verification proves the approval process and commitment binding; it does not independently prove a physical-world claim.

## Release sequence

```mermaid
sequenceDiagram
    participant I as Implementer
    participant A as Emberline
    participant R as Reviewers
    participant P as Attestcoin Proof Builder
    participant C as Creditcoin contracts

    I->>A: Hash private file and submit commitment
    A->>A: Persist immutable evidence revision
    R->>C: Record review on source registry
    R->>P: Request proof after attestation finality
    P-->>R: Return transaction proof
    R->>C: Submit proof to permissionless verifier
    R->>A: Submit source transaction hash
    A->>A: Verify exact review bindings and quorum
    A->>C: Release eligible milestone
    C-->>I: Transfer tranche
```
