# Emberline deployment runbook

The source is launch-ready, but deployment still requires wallets, test tokens, public hosting, and submission-account access owned by the project team.

## 1. Prepare production configuration

Copy `.env.example` to `.env`, set `NODE_ENV=production`, and replace every actor token. Production rejects missing tokens and tokens shorter than 24 characters.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set each reviewer wallet to the Ethereum Sepolia address that will call `EvidenceReviewRegistry.recordReview`. Keep `ALLOW_LOCAL_ATTESTATIONS=false`.

## 2. Official testnet values

```text
Creditcoin RPC:          https://rpc.cc3-testnet.creditcoin.network
Creditcoin chain ID:     102031
Creditcoin explorer:     https://creditcoin-testnet.blockscout.com/
Proof Builder API:       https://proof-gen-api.cc3-testnet.creditcoin.network/
Ethereum Sepolia key:    1
BlockProver precompile:  0x0000000000000000000000000000000000000FD2
Decoder library:         0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f
```

Creditcoin test CTC comes from the Creditcoin Discord `token-faucet` channel with `/faucet address:<your-address>`. Sepolia ETH must come from a Sepolia faucet available to the deployment owner.

## 3. Test contracts

Install Foundry and run:

```bash
npm install
npm test
forge test
```

The Foundry remapping links the audited transaction decoder package used by the current official Attestcoin examples.

## 4. Deploy the source registry to Ethereum Sepolia

```bash
forge create src/EvidenceReviewRegistry.sol:EvidenceReviewRegistry \
  --broadcast \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$SEPOLIA_DEPLOYER_PRIVATE_KEY"
```

Record its address as `ATTESTCOIN_SOURCE_REGISTRY`, then authorize each review wallet:

```bash
cast send "$ATTESTCOIN_SOURCE_REGISTRY" \
  "configureReviewer(address,bool)" "$REVIEWER_ADDRESS" true \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$SEPOLIA_DEPLOYER_PRIVATE_KEY"
```

## 5. Deploy the verifier and escrow to Creditcoin testnet

The verifier constructor locks the source-chain key, source registry, and BlockProver address. The official decoder contract is linked as the `EvmV1Decoder` library.

```bash
forge create src/AttestcoinReviewVerifier.sol:AttestcoinReviewVerifier \
  --broadcast \
  --rpc-url "$ATTESTCOIN_RPC_URL" \
  --private-key "$CREDITCOIN_DEPLOYER_PRIVATE_KEY" \
  --libraries "node_modules/@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder:$ATTESTCOIN_DECODER_CONTRACT" \
  --constructor-args 1 "$ATTESTCOIN_SOURCE_REGISTRY" 0x0000000000000000000000000000000000000FD2
```

Record the result as `ATTESTCOIN_USC_CONTRACT`. Deploy each project escrow with that verifier:

```bash
forge create src/EmberlineProject.sol:EmberlineProject \
  --broadcast \
  --rpc-url "$ATTESTCOIN_RPC_URL" \
  --private-key "$CREDITCOIN_DEPLOYER_PRIVATE_KEY" \
  --constructor-args "$PROJECT_ID_BYTES32" "$IMPLEMENTER_ADDRESS" "[$MILESTONE_WEI_AMOUNTS]" "$ATTESTCOIN_USC_CONTRACT" "$QUORUM"
```

Verify the contracts in Blockscout and save all addresses and transaction links.

## 6. Live proof flow

1. A configured reviewer calls `recordReview` on the Sepolia registry.
2. Wait until the source block is attested; this is normally about one Creditcoin block after eligibility.
3. Request `proof-by-tx/1/<source-transaction-hash>` from the Proof Builder, or let Emberline request it through `@gluwa/usc-sdk`.
4. Submit the returned `headerNumber`, `txBytes`, `merkleProof`, and `continuityProof` to `AttestcoinReviewVerifier.submitReviewProof`.
5. Use the emitted `proofId` in `EmberlineProject.recordReview`.
6. After quorum, call `releaseMilestone` permissionlessly.

The app's live review response includes the canonical `proofId` and destination-contract proof payload. It never stores a user-invented USC proof ID.

## 7. Deploy the web application

Set `DATABASE_URL` to a PostgreSQL connection string for durable production storage. Emberline creates and seeds its schema automatically on first boot. Set `PGSSL=true` when the provider requires TLS and optionally tune `PGPOOL_MAX` (default `10`). Without `DATABASE_URL`, the app falls back to SQLite at `EMBERLINE_DB_PATH`; that mode requires a persistent volume in production.

For any real launch, use a durable PostgreSQL service with backups and a documented retention policy. The hosted demo currently uses PostgreSQL; SQLite remains a zero-configuration local fallback and requires a persistent volume when deployed as a single-container service.

```bash
docker compose up --build -d
curl http://127.0.0.1:8899/health
```

The health response reports `persistence` as `postgresql` or `sqlite`. It is launch-ready only when `demoCredentials` is `false`, `localAttestationsEnabled` is `false`, `attestcoin.integrationReady` is `true`, and production data is on a durable, backed-up store. Use HTTPS.

Set `DEMO_EXPERIENCE_ENABLED=true` for the public hackathon sandbox or `false` for a private production deployment. Public demo codes create only short-lived sessions scoped to the resettable `DEMO-001` project; they never reveal or reuse the private `EMBERLINE_*_TOKEN` credentials.

## Remaining owner-only launch inputs

- Sepolia and Creditcoin deployer wallets and test funds
- three reviewer wallet addresses
- durable PostgreSQL database (or a public Railway project/domain and persistent volume for SQLite)
- repository URL, demo video URL, and pitch-deck/whitepaper PDF URL
- DoraHacks team and submission-account access

The hackathon deadline is September 6, 2026 at 23:59 ET. The final submission must include a working testnet Attestcoin integration and technical documentation.
