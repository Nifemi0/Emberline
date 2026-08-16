# Emberline

**Capital moves when verified work moves.**

Emberline is a general milestone-funding and accountability workspace. It can be used for public works, grants, contractors, research, community initiatives, or humanitarian programs. It is not locked to an NGO narrative.

The system records a project policy, commits capital, stores evidence commitments, collects independent reviewer attestations, and releases each tranche only when the configured policy is satisfied.

## Live deployment

- Application: https://emberline.onrender.com
- Repository: https://github.com/Nifemi0/Emberline
- Sepolia review registry: `0x525749ab5390166fCEa076D50d5168d1db476cE7`
- Creditcoin Attestcoin verifier: `0x525749ab5390166fCEa076D50d5168d1db476cE7`
- Creditcoin project escrow: `0xB236da47fe9215E18C729050fEd3f4B77FcBBffE`
- Project ID: `0x4ef2ce7025b91eb08aa02e50567a6450b755103065f7a11325d9a5fb34f1252e`

The same registry and verifier address is expected: the same deployer used the same nonce on two different chains. Public testnet deployment details and explorer links are in [`SUBMISSION.md`](./SUBMISSION.md).

## What is real in this MVP

- PostgreSQL production persistence selected by `DATABASE_URL`, with SQLite as the zero-config local fallback
- Bearer-token actor authorization derived server-side
- Owner, implementer, and reviewer permissions enforced in the API
- Private browser-side evidence hashing with immutable commitment revisions and complete history
- Reviewer votes scoped to an evidence revision, with duplicate-vote prevention
- Dispute locks and evidence replacement without erasing prior history
- Sequential milestone release enforcement
- Funding and release amounts checked transactionally
- Request idempotency bound to both the key and request signature
- Hash-chained audit events with an API integrity check
- Generalized multi-project frontend with capital, evidence, review, and audit views
- Solidity release contract with reviewer-count, proof-replay, revision, and sequence guards
- Permissionless Attestcoin proof-verifier contract that calls the Creditcoin BlockProver and binds a proven source-registry event to reviewer, project, milestone, revision, evidence commitment, and decision

The chain adapter is intentionally explicit: `local:` references work in the local simulation, while `usc:` references are reserved for a configured Attestcoin Protocol verifier on Creditcoin. The app does not claim that a blockchain proves a physical-world event by itself.

## Run locally

```bash
node server.mjs
```

Open `http://127.0.0.1:8899` for the public product guide. The operational application is at `http://127.0.0.1:8899/workspace`.

For container and Creditcoin deployment, follow [`DEPLOYMENT.md`](./DEPLOYMENT.md). Submission assets are in [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`SUBMISSION.md`](./SUBMISSION.md), and [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md).

Local demo tokens are shown in the actor connection dialog. Set `EMBERLINE_*_TOKEN` environment variables before launch for non-demo credentials. Production refuses to start unless every actor token is configured with at least 24 characters, and configured tokens rotate existing database credentials. Set `DATABASE_URL` for PostgreSQL in production. When it is absent, Emberline uses SQLite at `EMBERLINE_DB_PATH` (default `./data/emberline.db`). Set `PGSSL=true` when the database provider requires TLS.

Attestcoin configuration is optional for local work. Current official testnet defaults are Creditcoin chain ID `102031`, RPC `https://rpc.cc3-testnet.creditcoin.network`, Ethereum Sepolia source-chain key `1`, Proof Builder `https://proof-gen-api.cc3-testnet.creditcoin.network/`, and BlockProver `0x0000000000000000000000000000000000000FD2`. Set the reviewer wallet mappings, `ATTESTCOIN_MODE=usc`, `ATTESTCOIN_SOURCE_REGISTRY`, and the deployed `ATTESTCOIN_USC_CONTRACT` to enable live proofs. Invalid, unavailable, or mismatched proofs block the review. Local attestations are enabled by default only outside production and can be controlled with `ALLOW_LOCAL_ATTESTATIONS`.

## API surface

```text
GET  /health
GET  /api/session
GET  /api/actors
GET  /api/projects
POST /api/projects                         owner
GET  /api/projects/:id
GET  /api/projects/:id/audit
POST /api/projects/:id/fund                owner
POST /api/milestones/:id/evidence          implementer
POST /api/milestones/:id/review            reviewer
POST /api/milestones/:id/release           owner
```

All mutating requests require a valid `Idempotency-Key` header. Evidence commitments must be full 32-byte hexadecimal hashes. Review references must use a `local:` or `usc:` prefix.

## Verification

```bash
npm test
forge test
```

The on-chain integration boundary is `src/AttestcoinReviewVerifier.sol`. Anyone may submit an official proof. The contract calls Creditcoin's BlockProver, decodes the proven receipt with `@gluwa/usc-contracts`, requires exactly one `ReviewRecorded` event from the immutable source registry, and stores the resulting binding. There is no trusted proof-worker allowlist. `EmberlineProject` accepts the proof only when every review field matches and prevents replay.

The end-to-end suite covers authorization, invalid evidence, persistent project creation and funding, immutable evidence revisions, dispute locks, sequential release ordering, quorum release, idempotency conflicts, full audit-hash verification, and tampering detection. The production guard suite verifies required credentials, hidden demo access, and disabled local attestations.
