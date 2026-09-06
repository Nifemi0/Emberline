# Emberline architecture

## Two clearly separated experiences

The public guided workspace is a session-scoped application sandbox. It creates synthetic application records so a visitor can experience the evidence, review, quorum, and release flow without a wallet or signup; those records have no monetary value and are not public blockchain transactions. The live Attestcoin sample is separate and links the real Sepolia source events, Creditcoin proof registrations, Emberline review calls, and testnet escrow release.

Attest is a separate project in a separate hackathon. Emberline remains responsible for milestone evidence, reviewer quorum, and its existing Creditcoin escrow release. When explicitly enabled by the owner, Emberline can emit a signed operating-reward request after the published live sample is re-verified. Attest evaluates the autonomous agent’s bounded payment authority and KeeperHub executes the separate testnet ERC-20 payment. This integration does not replace or modify Emberline’s CTC release, Solidity contracts, private evidence, or public synthetic demo.

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
    App -.->|"optional signed reward request"| AttestAPI["Attest API"]
    AttestAPI -->|"bounded payment decision"| KeeperHub["KeeperHub workflow"]
    KeeperHub -.->|"separate testnet ERC-20 tx"| App
```

## Trust boundaries

- Evidence files remain with the implementer. The browser calculates SHA-256 locally and sends only the commitment and a non-sensitive label.
- The API authenticates actor roles with server-side bearer-token hashes. Browser-supplied roles are never trusted.
- Review proofs are submitted permissionlessly. The immutable source-chain key, source registry, and BlockProver address define the verification boundary.
- The proven successful receipt must contain exactly one correctly encoded `ReviewRecorded` event from the configured registry.
- A rejection disputes the current revision. A replacement creates a new immutable revision without deleting prior evidence or reviews.
- The application audit chain detects both broken links and modified event contents.
- Blockchain verification proves the approval process and commitment binding; it does not independently prove a physical-world claim.
- The optional reward request is stored in an isolated `attest_payment_requests` table and never changes milestone or project state. Secrets stay server-side; only a redacted confirmed proof is public.

## Release sequence

```mermaid
sequenceDiagram
    participant I as Implementer
    participant A as Emberline
    participant R as Reviewers
    participant P as Attestcoin Proof Builder
    participant C as Creditcoin contracts
    participant X as Attest API
    participant K as KeeperHub

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
    A-->>X: Optional signed operating-reward request
    X->>K: Attest decision and bounded policy
    K-->>A: KeeperHub status and verified testnet receipt
```
