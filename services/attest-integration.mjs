import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getAddress } from 'ethers';
import { attestcoinConfig, isAttestcoinReady } from './attestcoin.mjs';

export const EVIDENCE_SCHEMA_VERSION = 'emberline.attest.evidence.v1';
export const PAYMENT_SCHEMA_VERSION = 'emberline.attest.payment-request.v1';
export const PAYMENT_STATUSES = new Set(['created', 'submitted', 'allowed', 'limited', 'review', 'denied', 'queued', 'running', 'confirmed', 'failed', 'unknown']);

const error = (message, status, code, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const trimBaseUrl = (value) => String(value || '').replace(/\/+$/, '');
const isBytes32 = (value) => /^0x[0-9a-fA-F]{64}$/.test(String(value || ''));
const isTxHash = (value) => isBytes32(value);
const normalizedAddress = (value) => { try { return getAddress(value); } catch { return null; } };
const isBoolean = (value) => value === true || value === false;
const pick = (...values) => values.find((value) => value !== undefined && value !== null);
const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const decimalParts = (value) => {
  const text = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  return { text, whole, fraction, digits, scale: fraction.length };
};

const compareDecimals = (left, right) => {
  const a = decimalParts(left); const b = decimalParts(right);
  if (!a || !b) return null;
  const scale = Math.max(a.scale, b.scale);
  const aValue = BigInt(a.digits) * (10n ** BigInt(scale - a.scale));
  const bValue = BigInt(b.digits) * (10n ** BigInt(scale - b.scale));
  return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
};

export const normalizeDecimal = (value) => {
  const parts = decimalParts(value);
  if (!parts) return null;
  const fraction = parts.fraction.replace(/0+$/, '');
  return fraction ? `${parts.whole}.${fraction}` : parts.whole;
};

export const integrationConfig = (env = process.env) => ({
  enabled: env.ATTEST_INTEGRATION_ENABLED === 'true',
  apiUrl: String(env.ATTEST_API_URL || '').trim(),
  apiToken: String(env.ATTEST_INTEGRATION_API_TOKEN || ''),
  signingSecret: String(env.ATTEST_INTEGRATION_SIGNING_SECRET || ''),
  keyId: String(env.ATTEST_INTEGRATION_KEY_ID || 'emberline-prod-1').trim(),
  agentId: String(env.ATTEST_AGENT_ID || 'emberline-operating-agent').trim(),
  agentWallet: String(env.ATTEST_AGENT_WALLET || '').trim(),
  paymentChainId: String(env.ATTEST_PAYMENT_CHAIN_ID || '').trim(),
  paymentTokenAddress: String(env.ATTEST_PAYMENT_TOKEN_ADDRESS || '').trim(),
  paymentRecipientAddress: String(env.ATTEST_PAYMENT_RECIPIENT_ADDRESS || '').trim(),
  paymentMaxAmount: String(env.ATTEST_PAYMENT_MAX_AMOUNT || '').trim(),
  paymentPurpose: String(env.ATTEST_PAYMENT_PURPOSE || 'verified_milestone_operating_reward').trim(),
  publicBaseUrl: trimBaseUrl(env.EMBERLINE_PUBLIC_BASE_URL || 'https://emberline.onrender.com')
});

const validUrl = (value, protocols = ['http:', 'https:']) => {
  try { const parsed = new URL(value); return protocols.includes(parsed.protocol) && !parsed.username && !parsed.password; } catch { return false; }
};

export const validateIntegrationConfiguration = (config = integrationConfig(), { production = process.env.NODE_ENV === 'production' } = {}) => {
  if (!config.enabled) return [];
  const problems = [];
  if (!validUrl(config.apiUrl) || (production && !config.apiUrl.startsWith('https://'))) problems.push('ATTEST_API_URL must be an HTTPS URL in production');
  if (config.apiToken.length < 32) problems.push('ATTEST_INTEGRATION_API_TOKEN must contain at least 32 characters');
  if (config.signingSecret.length < 32) problems.push('ATTEST_INTEGRATION_SIGNING_SECRET must contain at least 32 characters');
  if (!config.keyId || config.keyId.length > 120) problems.push('ATTEST_INTEGRATION_KEY_ID must be a non-empty short identifier');
  if (!config.agentId || config.agentId.length > 160) problems.push('ATTEST_AGENT_ID must be a non-empty short identifier');
  if (!normalizedAddress(config.agentWallet)) problems.push('ATTEST_AGENT_WALLET must be a valid EVM address');
  if (!/^\d+$/.test(config.paymentChainId) || Number(config.paymentChainId) <= 0 || !Number.isSafeInteger(Number(config.paymentChainId))) problems.push('ATTEST_PAYMENT_CHAIN_ID must be a positive integer');
  if (!normalizedAddress(config.paymentTokenAddress)) problems.push('ATTEST_PAYMENT_TOKEN_ADDRESS must be a valid EVM address');
  if (!normalizedAddress(config.paymentRecipientAddress)) problems.push('ATTEST_PAYMENT_RECIPIENT_ADDRESS must be a valid EVM address');
  const maxAmount = decimalParts(config.paymentMaxAmount);
  if (!maxAmount || compareDecimals(maxAmount.text, '0') <= 0) problems.push('ATTEST_PAYMENT_MAX_AMOUNT must be a positive decimal amount');
  if (!/^[a-z0-9_:-]{3,100}$/.test(config.paymentPurpose || '')) problems.push('ATTEST_PAYMENT_PURPOSE must be a valid fixed policy identifier');
  if (!validUrl(config.publicBaseUrl, ['http:', 'https:'])) problems.push('EMBERLINE_PUBLIC_BASE_URL must be an HTTP(S) URL');
  return problems;
};

export const assertIntegrationConfiguration = (config = integrationConfig(), options = {}) => {
  const problems = validateIntegrationConfiguration(config, options);
  if (problems.length) throw error(`Attest integration configuration is invalid: ${problems.join('; ')}`, 500, 'attest_configuration_invalid', { problems });
  return config;
};

export const integrationHealth = (config = integrationConfig()) => {
  const signingConfigured = config.signingSecret.length >= 32;
  const attestApiConfigured = validUrl(config.apiUrl) && config.apiToken.length >= 32;
  return {
    enabled: config.enabled,
    schemaVersion: PAYMENT_SCHEMA_VERSION,
    signingConfigured,
    attestApiConfigured,
    integrationReady: config.enabled && validateIntegrationConfiguration(config, { production: false }).length === 0
  };
};

const rpcCall = async (rpcUrl, method, params, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}`);
    const body = await response.json();
    if (body?.error) throw new Error(body.error.message || 'RPC returned an error');
    return body?.result;
  } catch (cause) {
    const code = cause?.name === 'AbortError' ? 'attest_evidence_unavailable' : 'attest_evidence_unavailable';
    throw error(`Attestcoin RPC could not provide authoritative evidence (${method}).`, 503, code, { cause });
  } finally { clearTimeout(timeout); }
};

const assertLiveAttestationShape = (attestation) => {
  if (!attestation || attestation.status !== 'verified_testnet_sample') throw error('The published Emberline testnet evidence is unavailable.', 503, 'attest_evidence_unavailable');
  for (const [label, value] of [['projectId', attestation.projectId], ['evidenceCommitment', attestation.evidenceCommitment]]) if (!isBytes32(value)) throw error(`The live evidence has an invalid ${label}.`, 503, 'attest_evidence_not_verified');
  for (const [label, value] of [['projectAddress', attestation.projectAddress], ['verifierAddress', attestation.verifierAddress]]) if (!normalizedAddress(value)) throw error(`The live evidence has an invalid ${label}.`, 503, 'attest_evidence_not_verified');
  for (const [label, value] of [['fundingTxHash', attestation.fundingTxHash], ['releaseTxHash', attestation.releaseTxHash]]) if (!isTxHash(value)) throw error(`The live evidence has an invalid ${label}.`, 503, 'attest_evidence_not_verified');
  if (!Array.isArray(attestation.reviewers) || attestation.reviewers.length < 1) throw error('The live evidence has no reviewer proofs.', 503, 'attest_evidence_not_verified');
  for (const reviewer of attestation.reviewers) {
    if (!reviewer?.role || !normalizedAddress(reviewer.address) || !isTxHash(reviewer.sourceTxHash) || !isBytes32(reviewer.proofId) || !isTxHash(reviewer.proofRegistrationTxHash) || !isTxHash(reviewer.emberlineReviewTxHash)) throw error('The live evidence contains an invalid reviewer proof.', 503, 'attest_evidence_not_verified');
  }
  const milestoneId = Number(attestation.milestoneId); const revision = Number(attestation.revision);
  if (!Number.isSafeInteger(milestoneId) || milestoneId < 0 || !Number.isSafeInteger(revision) || revision < 0 || typeof attestation.releasedAmount !== 'string' || !attestation.releasedAmount.trim()) throw error('The live evidence has invalid milestone metadata.', 503, 'attest_evidence_not_verified');
  const approvals = Number(attestation.approvals); const rejections = Number(attestation.rejections); const quorum = Number(attestation.quorum ?? 2);
  if (!Number.isSafeInteger(approvals) || !Number.isSafeInteger(rejections) || !Number.isSafeInteger(quorum) || quorum < 1 || approvals < quorum || rejections !== 0) throw error('The live evidence does not satisfy the published quorum.', 409, 'attest_evidence_not_verified');
  return { approvals, rejections, quorum, milestoneId, revision };
};

export async function buildVerifiedEvidence({ liveAttestation, chainConfig = attestcoinConfig(), publicBaseUrl = integrationConfig().publicBaseUrl, fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
  const shape = assertLiveAttestationShape(liveAttestation);
  if (chainConfig.mode !== 'usc' || !isAttestcoinReady(chainConfig)) throw error('Emberline’s live evidence cannot be published until the USC chain adapter is ready.', 503, 'attest_evidence_not_verified');
  const expectedChainId = Number(chainConfig.chainId);
  const chainIdResult = await rpcCall(chainConfig.rpcUrl, 'eth_chainId', [], { fetchImpl, timeoutMs: 8000 });
  let observedChainId;
  try { observedChainId = Number(BigInt(chainIdResult)); } catch { throw error('Attestcoin returned an invalid chain ID.', 503, 'attest_evidence_unavailable'); }
  if (observedChainId !== expectedChainId) throw error('Attestcoin RPC is connected to a different chain.', 503, 'attest_evidence_not_verified');

  const projectAddress = normalizedAddress(liveAttestation.projectAddress);
  const verifierAddress = normalizedAddress(liveAttestation.verifierAddress);
  const releaseReceipt = await rpcCall(chainConfig.rpcUrl, 'eth_getTransactionReceipt', [liveAttestation.releaseTxHash], { fetchImpl, timeoutMs: 8000 });
  if (!releaseReceipt || !(['0x1', 1, '1'].includes(releaseReceipt.status)) || !releaseReceipt.to || normalizedAddress(releaseReceipt.to) !== projectAddress || !/^0x[0-9a-fA-F]+$/.test(String(releaseReceipt.blockNumber || ''))) throw error('The published release receipt could not be confirmed against the Emberline project contract.', 503, 'attest_evidence_not_verified');
  const block = await rpcCall(chainConfig.rpcUrl, 'eth_getBlockByNumber', [releaseReceipt.blockNumber, false], { fetchImpl, timeoutMs: 8000 });
  if (!block?.timestamp) throw error('The published release block timestamp is unavailable.', 503, 'attest_evidence_unavailable');
  let observedAt;
  try { observedAt = new Date(Number(BigInt(block.timestamp)) * 1000).toISOString(); } catch { throw error('The published release block timestamp is invalid.', 503, 'attest_evidence_not_verified'); }
  const checkedAt = clock().toISOString();
  const evidenceUrl = `${trimBaseUrl(publicBaseUrl)}/api/integrations/attest/v1/evidence`;
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    source: { product: 'Emberline', baseUrl: trimBaseUrl(publicBaseUrl), evidenceUrl, checkedAt, observedAt },
    integration: { healthy: true, chainMode: 'usc', attestcoinReady: true },
    subject: { type: 'emberline_project', projectId: String(liveAttestation.projectId).toLowerCase(), projectAddress, verifierAddress },
    network: { name: chainConfig.network || liveAttestation.network || 'Creditcoin Testnet', chainId: expectedChainId, sourceNetwork: chainConfig.sourceChain || liveAttestation.sourceNetwork || 'Ethereum Sepolia' },
    milestone: { id: shape.milestoneId, revision: shape.revision, evidenceCommitment: String(liveAttestation.evidenceCommitment).toLowerCase(), approvals: shape.approvals, rejections: shape.rejections, quorum: shape.quorum, releasedAmount: String(liveAttestation.releasedAmount) },
    verification: {
      verified: true,
      status: 'confirmed',
      reasonCodes: ['ATTESTCOIN_READY', 'QUORUM_REACHED', 'RELEASE_RECEIPT_CONFIRMED'],
      release: { txHash: String(liveAttestation.releaseTxHash).toLowerCase(), receiptStatus: 1, blockNumber: Number(BigInt(releaseReceipt.blockNumber)), contractAddress: projectAddress, explorerUrl: `https://creditcoin-testnet.blockscout.com/tx/${liveAttestation.releaseTxHash}` },
      reviewers: liveAttestation.reviewers.map((reviewer) => ({ role: String(reviewer.role), address: normalizedAddress(reviewer.address), sourceTxHash: String(reviewer.sourceTxHash).toLowerCase(), proofId: String(reviewer.proofId).toLowerCase(), proofRegistrationTxHash: String(reviewer.proofRegistrationTxHash).toLowerCase(), emberlineReviewTxHash: String(reviewer.emberlineReviewTxHash).toLowerCase() }))
    }
  };
}

export const signJsonBody = (body, secret) => createHmac('sha256', secret).update(typeof body === 'string' ? body : JSON.stringify(body), 'utf8').digest('hex');
export const verifyJsonSignature = (body, signature, secret) => {
  const expected = signJsonBody(body, secret); const actual = String(signature || '').replace(/^sha256=/, '').replace(/^v1=/, '');
  if (!/^[0-9a-f]{64}$/i.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
};

export const normalizePaymentInput = (body, config) => {
  const input = asObject(body); const keys = Object.keys(input);
  if (keys.some((key) => !['amount', 'purpose'].includes(key))) throw error('Payment requests may contain only amount and purpose.', 400, 'attest_response_invalid');
  const amount = normalizeDecimal(input.amount); const maxAmount = normalizeDecimal(config.paymentMaxAmount);
  if (!amount || compareDecimals(amount, '0') <= 0) throw error('Payment amount must be a positive decimal amount.', 400, 'attest_response_invalid');
  if (!maxAmount || compareDecimals(amount, maxAmount) > 0) throw error('Payment amount exceeds the configured operating-reward cap.', 409, 'attest_amount_over_cap');
  if (typeof input.purpose !== 'string' || input.purpose.trim().length < 8 || input.purpose.trim().length > 240 || /[\u0000-\u001F\u007F<>]/.test(input.purpose)) throw error('Payment purpose must be plain text between 8 and 240 characters.', 400, 'attest_response_invalid');
  const purpose = input.purpose.trim();
  if (purpose !== (config.paymentPurpose || 'verified_milestone_operating_reward')) throw error('Payment purpose must match the configured Attest policy.', 409, 'attest_purpose_mismatch');
  return { amount, purpose };
};

export const paymentRequestHash = ({ input, evidence, config }) => createHash('sha256').update(JSON.stringify({ amount: input.amount, purpose: input.purpose, projectId: evidence.subject.projectId, projectAddress: evidence.subject.projectAddress, milestoneId: evidence.milestone.id, revision: evidence.milestone.revision, evidenceCommitment: evidence.milestone.evidenceCommitment, chainId: config.paymentChainId, tokenAddress: normalizedAddress(config.paymentTokenAddress), recipientAddress: normalizedAddress(config.paymentRecipientAddress), agentId: config.agentId, agentWallet: normalizedAddress(config.agentWallet) })).digest('hex');

export const buildPaymentPayload = ({ input, evidence, config, idempotencyKey, eventId = randomUUID(), occurredAt = new Date().toISOString() }) => ({
  schemaVersion: PAYMENT_SCHEMA_VERSION,
  eventId,
  occurredAt,
  idempotencyKey,
  source: { product: 'Emberline', baseUrl: evidence.source.baseUrl, evidenceUrl: evidence.source.evidenceUrl },
  agent: { id: config.agentId, walletAddress: normalizedAddress(config.agentWallet) },
  project: { projectId: evidence.subject.projectId, projectAddress: evidence.subject.projectAddress },
  milestone: { id: evidence.milestone.id, revision: evidence.milestone.revision, evidenceCommitment: evidence.milestone.evidenceCommitment, approvals: evidence.milestone.approvals, rejections: evidence.milestone.rejections, quorum: evidence.milestone.quorum, releaseTxHash: evidence.verification.release.txHash },
  payment: { actionType: 'erc20_transfer', chainId: Number(config.paymentChainId), tokenAddress: normalizedAddress(config.paymentTokenAddress), recipientAddress: normalizedAddress(config.paymentRecipientAddress), amount: input.amount, purpose: input.purpose }
});

const responseJson = async (response) => {
  try { return await response.json(); } catch { return null; }
};

const fetchAttest = async (url, init, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) => {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...init, signal: controller.signal }); }
  catch (cause) { if (cause?.name === 'AbortError') throw error('Attest did not return an authoritative response before the timeout.', 504, 'attest_request_unknown'); throw error('Attest API was unavailable.', 503, 'attest_api_unavailable', { cause }); }
  finally { clearTimeout(timeout); }
};

const boolValue = (...values) => values.find(isBoolean);

export const normalizeAttestResponse = (body) => {
  const root = asObject(body); const decision = asObject(pick(root.decision, root.result, root.data)); const source = Object.keys(decision).length ? { ...root, ...decision } : root;
  const keeperhub = asObject(pick(source.keeperhub, source.keeperHub, source.execution, source.workflow));
  const decisionId = String(pick(source.decisionId, source.attestDecisionId, source.id, decision.id, '') || '').trim();
  const rawOutcome = String(pick(source.outcome, source.decision, source.status, keeperhub.outcome, '') || '').trim().toLowerCase().replace(/[- ]/g, '_');
  const aliases = { allow: 'allowed', approve: 'allowed', approved: 'allowed', deny: 'denied', rejected: 'denied', manual_review: 'review', in_progress: 'running', success: 'confirmed', complete: 'confirmed' };
  const outcome = aliases[rawOutcome] || rawOutcome;
  const allowedOutcomes = new Set(['allowed', 'limited', 'review', 'denied', 'queued', 'running', 'confirmed']);
  if (!decisionId || !allowedOutcomes.has(outcome)) throw error('Attest returned an invalid decision response.', 502, 'attest_response_invalid');
  const executionStatus = String(pick(keeperhub.status, keeperhub.outcome, source.executionStatus, '') || '').trim().toLowerCase().replace(/[- ]/g, '_');
  const transactionHash = pick(keeperhub.transactionHash, keeperhub.txHash, source.transactionHash, source.txHash);
  if (transactionHash !== undefined && transactionHash !== null && !isTxHash(transactionHash)) throw error('Attest returned an invalid transaction hash.', 502, 'attest_response_invalid');
  const receipt = asObject(pick(keeperhub.receipt, source.receipt)); const postconditions = asObject(pick(keeperhub.postconditions, source.postconditions));
  const receiptVerified = boolValue(source.receiptVerified, source.receipt_verified, keeperhub.receiptVerified, keeperhub.receipt_verified, receipt.verified, receipt.statusVerified);
  const postconditionsVerified = boolValue(source.postconditionsVerified, source.postconditions_verified, keeperhub.postconditionsVerified, keeperhub.postconditions_verified, postconditions.verified);
  let status = outcome;
  if (outcome === 'allowed' && ['queued', 'running', 'confirmed'].includes(executionStatus)) status = executionStatus;
  if ((outcome === 'confirmed' || executionStatus === 'confirmed') && !(receiptVerified === true && postconditionsVerified === true)) status = 'unknown';
  const reasonCodes = (Array.isArray(pick(source.reasonCodes, source.reason_codes)) ? pick(source.reasonCodes, source.reason_codes) : []).map((code) => String(code));
  if (status === 'unknown' && !reasonCodes.includes('CONFIRMATION_FLAGS_REQUIRED')) reasonCodes.push('CONFIRMATION_FLAGS_REQUIRED');
  const explorerUrl = pick(keeperhub.explorerUrl, source.explorerUrl);
  if (explorerUrl !== undefined && explorerUrl !== null && !validUrl(explorerUrl)) throw error('Attest returned an invalid explorer URL.', 502, 'attest_response_invalid');
  return { decisionId, outcome, status, reasonCodes, executionStatus: executionStatus || null, executionId: String(pick(keeperhub.executionId, keeperhub.id, source.keeperhubExecutionId, '') || '') || null, transactionHash: transactionHash ? String(transactionHash).toLowerCase() : null, explorerUrl: explorerUrl ? String(explorerUrl) : null, receiptVerified: receiptVerified === true, postconditionsVerified: postconditionsVerified === true };
};

export async function submitAttestPaymentRequest({ payload, config, fetchImpl = globalThis.fetch, clock = () => Date.now() } = {}) {
  const rawBody = JSON.stringify(payload); const timestamp = Math.floor(clock() / 1000).toString();
  const signature = signJsonBody(`${timestamp}.${payload.eventId}.${rawBody}`, config.signingSecret);
  const url = `${trimBaseUrl(config.apiUrl)}/api/integrations/emberline/payment-request`;
  let response;
  try {
    response = await fetchAttest(url, { method: 'POST', headers: { authorization: `Bearer ${config.apiToken}`, 'content-type': 'application/json', 'idempotency-key': payload.idempotencyKey, 'x-emberline-key-id': config.keyId, 'x-emberline-timestamp': timestamp, 'x-emberline-event-id': payload.eventId, 'x-emberline-signature': `v1=${signature}` }, body: rawBody }, { fetchImpl, timeoutMs: 10000 });
  } catch (cause) {
    if (cause.code === 'attest_request_unknown') return { status: 'unknown', errorCode: 'attest_request_unknown', normalized: null };
    return { status: 'failed', errorCode: cause.code || 'attest_api_unavailable', normalized: null };
  }
  const body = await responseJson(response);
  try {
    const normalized = normalizeAttestResponse(body);
    if (response.ok || normalized.outcome === 'denied' || normalized.outcome === 'review') return { ...normalized, errorCode: normalized.status === 'unknown' ? 'attest_response_invalid' : null, normalized };
  } catch (cause) {
    return { status: response.status >= 500 ? 'unknown' : 'failed', errorCode: response.status >= 500 ? 'attest_api_unavailable' : (cause.code || 'attest_response_invalid'), normalized: null };
  }
  return { status: response.status >= 500 ? 'unknown' : 'failed', errorCode: response.status >= 500 ? 'attest_api_unavailable' : 'attest_response_invalid', normalized: null };
}

export async function refreshAttestDecision({ decisionId, config, fetchImpl = globalThis.fetch } = {}) {
  if (!decisionId) return { status: 'unknown', errorCode: 'attest_request_unknown', normalized: null };
  const url = `${trimBaseUrl(config.apiUrl)}/api/decisions/${encodeURIComponent(decisionId)}`;
  let response;
  try { response = await fetchAttest(url, { method: 'GET', headers: { authorization: `Bearer ${config.apiToken}`, accept: 'application/json', 'x-emberline-key-id': config.keyId } }, { fetchImpl, timeoutMs: 10000 }); }
  catch (cause) { return { status: 'unknown', errorCode: cause.code || 'attest_api_unavailable', normalized: null }; }
  try {
    const normalized = normalizeAttestResponse(await responseJson(response));
    if (!response.ok) return { status: response.status >= 500 ? 'unknown' : 'failed', errorCode: response.status >= 500 ? 'attest_api_unavailable' : 'attest_response_invalid', normalized: null };
    return { ...normalized, errorCode: normalized.status === 'unknown' ? 'attest_response_invalid' : null, normalized };
  } catch (cause) { return { status: response.status >= 500 ? 'unknown' : 'failed', errorCode: response.status >= 500 ? 'attest_api_unavailable' : (cause.code || 'attest_response_invalid'), normalized: null }; }
}
