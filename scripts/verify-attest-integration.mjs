import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { assertIntegrationConfiguration, buildVerifiedEvidence, integrationHealth, normalizeAttestResponse, signJsonBody, validateIntegrationConfiguration, verifyJsonSignature, submitAttestPaymentRequest } from '../services/attest-integration.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const liveAttestation = JSON.parse(await readFile(join(root, 'live-attestation.json'), 'utf8'));
const secret = 'local-attest-signing-secret-01234567890123456789';
const apiToken = 'local-attest-api-token-01234567890123456789';
const ownerToken = 'owner-demo-token-change-me';
const implementerToken = 'implementer-demo-token-change-me';
const validAddress = '0x1111111111111111111111111111111111111111';
const tokenAddress = '0x2222222222222222222222222222222222222222';
const recipientAddress = '0x3333333333333333333333333333333333333333';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const writeJson = (response, status, body) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
const readRaw = async (request) => { let raw = ''; for await (const chunk of request) raw += chunk; return raw; };

const rpcState = { receipt: { status: '0x1', to: liveAttestation.projectAddress, blockNumber: '0x1234' }, timestamp: '0x66b1f000' };
const rpcServer = createServer(async (request, response) => {
  const body = JSON.parse(await readRaw(request));
  if (body.method === 'eth_chainId') return writeJson(response, 200, { jsonrpc: '2.0', id: body.id, result: '0x18e8f' });
  if (body.method === 'eth_getTransactionReceipt') return writeJson(response, 200, { jsonrpc: '2.0', id: body.id, result: rpcState.receipt });
  if (body.method === 'eth_getBlockByNumber') return writeJson(response, 200, { jsonrpc: '2.0', id: body.id, result: { timestamp: rpcState.timestamp } });
  return writeJson(response, 200, { jsonrpc: '2.0', id: body.id, result: null });
});

const attestState = { mode: 'allowed', postCount: 0, refreshCount: 0, signaturesValid: true };
const attestServer = createServer(async (request, response) => {
  const raw = await readRaw(request);
  if (request.method === 'POST' && request.url === '/api/integrations/emberline/payment-request') {
    attestState.postCount += 1;
    const timestamp = request.headers['x-emberline-timestamp']; const eventId = request.headers['x-emberline-event-id']; const signature = request.headers['x-emberline-signature'];
    attestState.signaturesValid = verifyJsonSignature(`${timestamp}.${eventId}.${raw}`, signature, secret);
    if (!attestState.signaturesValid) return writeJson(response, 401, { error: 'invalid_signature' });
    if (attestState.mode === 'denied') return writeJson(response, 200, { decisionId: 'dec-denied', outcome: 'denied', reasonCodes: ['POLICY_DENIED'] });
    return writeJson(response, 200, { decisionId: 'dec-allowed', outcome: 'allowed', reasonCodes: ['POLICY_ALLOWED'], keeperhub: { executionId: 'kh-local-1', status: 'queued' } });
  }
  if (request.method === 'GET' && request.url === '/api/decisions/dec-allowed') {
    attestState.refreshCount += 1;
    return writeJson(response, 200, { decisionId: 'dec-allowed', outcome: 'confirmed', reasonCodes: ['RECEIPT_VERIFIED', 'POSTCONDITIONS_VERIFIED'], keeperhub: { executionId: 'kh-local-1', status: 'confirmed', transactionHash: `0x${'4'.repeat(64)}`, explorerUrl: 'https://creditcoin-testnet.blockscout.com/tx/local', receiptVerified: true, postconditionsVerified: true } });
  }
  return writeJson(response, 404, { error: 'not_found' });
});

await new Promise((resolve) => rpcServer.listen(0, '127.0.0.1', resolve));
await new Promise((resolve) => attestServer.listen(0, '127.0.0.1', resolve));
const rpcUrl = `http://127.0.0.1:${rpcServer.address().port}`;
const attestApiUrl = `http://127.0.0.1:${attestServer.address().port}`;
const chainConfig = { mode: 'usc', network: 'Creditcoin Testnet', chainId: 102031, sourceChain: 'Ethereum Sepolia', sourceChainKey: 1, rpcUrl, proofBuilderUrl: 'http://local-proof-builder', sourceRegistry: validAddress, uscContract: validAddress };
const integrationEnv = { ATTESTCOIN_MODE: 'usc', ATTESTCOIN_NETWORK: 'Creditcoin Testnet', ATTESTCOIN_CHAIN_ID: '102031', ATTESTCOIN_SOURCE_CHAIN: 'Ethereum Sepolia', ATTESTCOIN_SOURCE_CHAIN_KEY: '1', ATTESTCOIN_RPC_URL: rpcUrl, ATTESTCOIN_PROOF_BUILDER_URL: 'http://local-proof-builder', ATTESTCOIN_SOURCE_REGISTRY: validAddress, ATTESTCOIN_USC_CONTRACT: validAddress, ATTEST_INTEGRATION_ENABLED: 'true', ATTEST_API_URL: attestApiUrl, ATTEST_INTEGRATION_API_TOKEN: apiToken, ATTEST_INTEGRATION_SIGNING_SECRET: secret, ATTEST_INTEGRATION_KEY_ID: 'local-test-key', ATTEST_AGENT_ID: 'local-agent', ATTEST_AGENT_WALLET: validAddress, ATTEST_PAYMENT_CHAIN_ID: '102031', ATTEST_PAYMENT_TOKEN_ADDRESS: tokenAddress, ATTEST_PAYMENT_RECIPIENT_ADDRESS: recipientAddress, ATTEST_PAYMENT_MAX_AMOUNT: '5', EMBERLINE_PUBLIC_BASE_URL: 'https://emberline.test' };
const integrationConfig = { enabled: true, apiUrl: attestApiUrl, apiToken, signingSecret: secret, keyId: 'local-test-key', agentId: 'local-agent', agentWallet: validAddress, paymentChainId: '102031', paymentTokenAddress: tokenAddress, paymentRecipientAddress: recipientAddress, paymentMaxAmount: '5', paymentPurpose: 'verified_milestone_operating_reward', publicBaseUrl: 'https://emberline.test' };
const appPort = 8913;
const testDbDir = await mkdtemp(join(tmpdir(), 'emberline-attest-'));
const app = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, ...integrationEnv, NODE_ENV: 'development', PORT: String(appPort), DATABASE_URL: '', EMBERLINE_DB_PATH: join(testDbDir, 'test.db'), ALLOW_LOCAL_ATTESTATIONS: 'true' }, stdio: 'ignore' });
const base = `http://127.0.0.1:${appPort}`;
const request = async (path, { token, method = 'GET', body, key } = {}) => {
  const headers = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(method !== 'GET' ? { 'idempotency-key': key || randomUUID() } : {}) };
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await response.text(); let data = {}; try { data = JSON.parse(raw); } catch { data = { raw }; }
  return { response, data, raw };
};
const post = (path, token, body, key) => request(path, { token, method: 'POST', body, key });
const expectStatus = (result, status, label) => assert.equal(result.response.status, status, `${label}: expected ${status}, got ${result.response.status} (${result.data.error || result.data.message || ''})`);
const expectCode = (result, code, label) => assert.equal(result.data.error, code, `${label}: expected ${code}, got ${result.data.error}`);
const expectReject = async (promise, code, label) => { await assert.rejects(promise, (cause) => { assert.equal(cause.code, code, label); return true; }); };
const waitForApp = async () => { const deadline = Date.now() + 15000; while (Date.now() < deadline) { if (app.exitCode !== null) throw new Error(`Emberline exited during Attest integration tests: ${app.exitCode}`); try { const response = await fetch(`${base}/health`); if (response.ok) return; } catch {} await wait(50); } throw new Error('Emberline did not become ready.'); };

try {
  assert.equal(integrationHealth({ enabled: false, apiUrl: '', apiToken: '', signingSecret: '', keyId: '', agentId: '', agentWallet: '', paymentChainId: '', paymentTokenAddress: '', paymentRecipientAddress: '', paymentMaxAmount: '', publicBaseUrl: 'https://emberline.test' }).integrationReady, false);
  assert.ok(validateIntegrationConfiguration({ ...integrationConfig, apiUrl: 'http://not-allowed-in-production' }, { production: true }).length > 0, 'production must require HTTPS Attest API');
  assert.throws(() => assertIntegrationConfiguration({ ...integrationConfig, signingSecret: 'short' }, { production: true }), (cause) => cause.code === 'attest_configuration_invalid');

  await waitForApp();
  const health = await request('/health'); expectStatus(health, 200, 'health'); assert.equal(health.data.attestIntegration.integrationReady, true); assert.equal(health.data.attestIntegration.signingConfigured, true); assert.equal(health.data.attestIntegration.attestApiConfigured, true); assert.equal(Object.prototype.hasOwnProperty.call(health.data.attestIntegration, 'apiToken'), false);
  const evidence = await request('/api/integrations/attest/v1/evidence'); expectStatus(evidence, 200, 'verified evidence'); assert.equal(evidence.data.verification.verified, true); assert.equal(evidence.data.network.chainId, 102031); assert.equal(evidence.response.headers.get('x-emberline-attest-schema'), 'emberline.attest.evidence.v1'); assert.equal(verifyJsonSignature(evidence.raw, evidence.response.headers.get('x-emberline-attest-signature'), secret), true); assert.equal(verifyJsonSignature(`${evidence.raw} `, evidence.response.headers.get('x-emberline-attest-signature'), secret), false);

  await expectReject(buildVerifiedEvidence({ liveAttestation, chainConfig: { ...chainConfig, chainId: 102030 } }), 'attest_evidence_not_verified', 'wrong chain');
  rpcState.receipt = null; await expectReject(buildVerifiedEvidence({ liveAttestation, chainConfig }), 'attest_evidence_not_verified', 'missing receipt'); rpcState.receipt = { status: '0x0', to: liveAttestation.projectAddress, blockNumber: '0x1234' }; await expectReject(buildVerifiedEvidence({ liveAttestation, chainConfig }), 'attest_evidence_not_verified', 'reverted receipt'); rpcState.receipt = { status: '0x1', to: validAddress, blockNumber: '0x1234' }; await expectReject(buildVerifiedEvidence({ liveAttestation, chainConfig }), 'attest_evidence_not_verified', 'wrong project contract'); rpcState.receipt = { status: '0x1', to: liveAttestation.projectAddress, blockNumber: '0x1234' };
  await expectReject(buildVerifiedEvidence({ liveAttestation: { ...liveAttestation, approvals: 1 }, chainConfig }), 'attest_evidence_not_verified', 'quorum not reached'); await expectReject(buildVerifiedEvidence({ liveAttestation: { ...liveAttestation, rejections: 1 }, chainConfig }), 'attest_evidence_not_verified', 'evidence rejected');
  assert.equal(verifyJsonSignature('{"amount":"1"}', `sha256=${signJsonBody('{"amount":"1"}', secret)}`, secret), true); assert.equal(verifyJsonSignature('{"amount":"2"}', `sha256=${signJsonBody('{"amount":"1"}', secret)}`, secret), false);
  assert.equal(normalizeAttestResponse({ decisionId: 'dec-flags', outcome: 'confirmed', keeperhub: { status: 'confirmed' } }).status, 'unknown', 'confirmed requires receipt and postcondition flags'); assert.equal(normalizeAttestResponse({ decisionId: 'dec-flags', outcome: 'confirmed', keeperhub: { status: 'confirmed', receiptVerified: true, postconditionsVerified: true } }).status, 'confirmed');

  const demo = await post('/api/demo/session', '', { code: 'EMBER-OWNER' }, 'demo-session-key'); expectStatus(demo, 201, 'demo session'); const demoPayment = await post('/api/integrations/attest/v1/payment-requests', demo.data.token, { amount: '1', purpose: 'Demo payment must fail' }, 'demo-payment-key'); expectStatus(demoPayment, 403, 'demo actor rejection'); expectCode(demoPayment, 'attest_integration_disabled', 'demo actor rejection');
  const nonOwner = await post('/api/integrations/attest/v1/payment-requests', implementerToken, { amount: '1', purpose: 'Implementer must fail' }, 'non-owner-key'); expectStatus(nonOwner, 403, 'non-owner rejection');
  const override = await post('/api/integrations/attest/v1/payment-requests', ownerToken, { amount: '1', purpose: 'Attempt to override server values', tokenAddress, recipientAddress, chainId: 1, agentId: 'browser-agent' }, 'override-key'); expectStatus(override, 400, 'browser override rejection'); expectCode(override, 'attest_response_invalid', 'browser override rejection');
  const overCap = await post('/api/integrations/attest/v1/payment-requests', ownerToken, { amount: '6', purpose: 'This exceeds the configured cap' }, 'over-cap-key'); expectStatus(overCap, 409, 'amount over cap'); expectCode(overCap, 'attest_amount_over_cap', 'amount over cap');

  const purpose = 'verified_milestone_operating_reward'; const allowedKey = 'allowed-payment-key-001'; attestState.mode = 'allowed'; const allowed = await post('/api/integrations/attest/v1/payment-requests', ownerToken, { amount: '1.5', purpose }, allowedKey); expectStatus(allowed, 201, 'allowed Attest response'); assert.equal(allowed.data.attestOutcome, 'allowed'); assert.equal(allowed.data.status, 'queued'); assert.equal(attestState.signaturesValid, true); const postCountAfterFirst = attestState.postCount; const duplicate = await post('/api/integrations/attest/v1/payment-requests', ownerToken, { amount: '1.5', purpose }, allowedKey); expectStatus(duplicate, 200, 'duplicate idempotency replay'); assert.equal(attestState.postCount, postCountAfterFirst); const conflict = await post('/api/integrations/attest/v1/payment-requests', ownerToken, { amount: '1.4', purpose }, allowedKey); expectStatus(conflict, 409, 'idempotency conflict'); expectCode(conflict, 'attest_request_conflict', 'idempotency conflict');
  attestState.mode = 'denied'; const denied = await post('/api/integrations/attest/v1/payment-requests', ownerToken, { amount: '1', purpose }, 'denied-payment-key-001'); expectStatus(denied, 201, 'denied Attest response'); assert.equal(denied.data.status, 'denied'); assert.equal(denied.data.attestOutcome, 'denied'); attestState.mode = 'allowed';
  const refreshed = await post(`/api/integrations/attest/v1/payment-requests/${allowed.data.id}/refresh`, ownerToken, {}); expectStatus(refreshed, 200, 'refresh queued decision'); assert.equal(refreshed.data.status, 'confirmed'); assert.equal(refreshed.data.transactionHash, `0x${'4'.repeat(64)}`); assert.equal(attestState.refreshCount, 1);
  const publicProof = await request('/api/integrations/attest/v1/proof'); expectStatus(publicProof, 200, 'public proof'); assert.equal(publicProof.data.available, true); assert.equal(publicProof.data.integration.status, 'confirmed'); assert.equal(Object.prototype.hasOwnProperty.call(publicProof.data, 'apiToken'), false); assert.equal(Object.prototype.hasOwnProperty.call(publicProof.data, 'signingSecret'), false); assert.equal(Object.prototype.hasOwnProperty.call(publicProof.data, 'payload_json'), false); assert.equal(Object.prototype.hasOwnProperty.call(publicProof.data.integration, 'requestedByActorId'), false);

  let timeoutCalls = 0; const timeoutResult = await submitAttestPaymentRequest({ payload: { ...JSON.parse(JSON.stringify(allowed.data)), eventId: randomUUID(), idempotencyKey: 'timeout-key' }, config: integrationConfig, fetchImpl: async () => { timeoutCalls += 1; const cause = new Error('timed out'); cause.name = 'AbortError'; throw cause; } }); assert.equal(timeoutResult.status, 'unknown'); assert.equal(timeoutResult.errorCode, 'attest_request_unknown'); assert.equal(timeoutCalls, 1, 'timed out POST must not retry automatically');
  console.log('Emberline Attest integration: passed');
  console.log('  isolated config + production validation: verified');
  console.log('  evidence RPC, receipt, timestamp, and HMAC signature: verified');
  console.log('  wrong chain, receipt, quorum, and evidence rejection: blocked');
  console.log('  owner-only, non-demo, server-controlled payment requests: verified');
  console.log('  idempotency replay/conflict and no automatic retry: verified');
  console.log('  allowed, denied, queued → confirmed, and proof redaction: verified');
} finally {
  app.kill(); await wait(100); await rm(testDbDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  await new Promise((resolve) => rpcServer.close(resolve)); await new Promise((resolve) => attestServer.close(resolve));
}
