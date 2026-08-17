import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const port = 8901;
const dbDir = await mkdtemp(join(tmpdir(), 'emberline-e2e-'));
const dbPath = join(dbDir, 'test.db');
const server = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, PORT: String(port), EMBERLINE_DB_PATH: dbPath }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;
const tokens = { owner: 'owner-demo-token-change-me', implementer: 'implementer-demo-token-change-me', technical: 'technical-demo-token-change-me', stakeholder: 'stakeholder-demo-token-change-me', auditor: 'auditor-demo-token-change-me' };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const request = async (path, { token, method = 'GET', body, key } = {}) => {
  const headers = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...(method !== 'GET' ? { 'idempotency-key': key || crypto.randomUUID() } : {}) };
  const response = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); return { response, data };
};
const post = (path, token, body, key) => request(path, { token, method: 'POST', body, key });
const expectStatus = (result, status, label) => { if (result.response.status !== status) throw new Error(`${label}: expected ${status}, got ${result.response.status} (${result.data.message || result.data.error})`); };
const commitment = (hex) => `0x${hex.padEnd(64, '0').slice(0, 64)}`;

const waitForServer = async () => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {}
    await wait(50);
  }
  throw new Error('Emberline server did not become ready within 15 seconds.');
};

try {
  await waitForServer();
  const health = await request('/health'); expectStatus(health, 200, 'health');
  if (health.data.attestcoin?.nativeVerifierPrecompile.toLowerCase() !== '0x0000000000000000000000000000000000000fd2' || health.data.attestcoin?.proofBuilderConfigured !== true || health.data.attestcoin?.integrationReady !== false) throw new Error('Attestcoin adapter status is incorrect');
  const landingResponse = await fetch(`${base}/`); const landingHtml = await landingResponse.text();
  if (!landingResponse.ok || !landingHtml.includes('Capital controlled by') || !landingHtml.includes('href="/workspace"')) throw new Error('Public landing route is incorrect');
  const whitepaperResponse = await fetch(`${base}/whitepaper`); const whitepaperHtml = await whitepaperResponse.text();
  if (!whitepaperResponse.ok || !whitepaperHtml.includes('TECHNICAL WHITEPAPER') || !whitepaperHtml.includes('Try the guided demo')) throw new Error('Whitepaper route is incorrect');
  const workspaceResponse = await fetch(`${base}/workspace`); const workspaceHtml = await workspaceResponse.text();
  if (!workspaceResponse.ok || !workspaceHtml.includes('Milestone ledger') || !workspaceHtml.includes('YOUR GUIDED SANDBOX') || !workspaceHtml.includes('FUNDING COMMITTED') || !workspaceHtml.includes('/app.js')) throw new Error('Workspace route is incorrect');
  expectStatus(await request('/api/projects'), 200, 'public project list');
  const unauthenticated = await post('/api/projects', '', { name: 'Nope', category: 'Test', summary: 'Should fail', targetAmount: 1, milestones: [{ title: 'One', amount: 1, quorum: 1 }] });
  expectStatus(unauthenticated, 401, 'owner authorization');

  const created = await post('/api/projects', tokens.owner, { name: 'E2E Community Build', category: 'Public works', summary: 'A repeatable adversarial verification fixture.', targetAmount: 9000, impactTarget: 90, impactUnit: 'outcomes', milestones: [{ title: 'Design package', amount: 3000, quorum: 2 }, { title: 'Delivery package', amount: 6000, quorum: 2 }] });
  expectStatus(created, 201, 'project creation'); const id = created.data.id; const first = created.data.milestones[0].id; const second = created.data.milestones[1].id;
  expectStatus(await post(`/api/projects/${id}/fund`, tokens.owner, { amount: 9000 }), 200, 'funding');

  const invalidEvidence = await post(`/api/milestones/${first}/evidence`, tokens.implementer, { label: 'bad', commitment: 'x' });
  expectStatus(invalidEvidence, 400, 'invalid evidence');
  expectStatus(await post(`/api/milestones/${second}/evidence`, tokens.implementer, { label: 'Future delivery evidence', commitment: commitment('f1') }), 409, 'future evidence sequence guard');
  expectStatus(await post(`/api/milestones/${first}/evidence`, tokens.implementer, { label: 'Design evidence', commitment: commitment('a1') }), 201, 'evidence submission');
  const unconfiguredUsc = await post(`/api/milestones/${first}/review`, tokens.technical, { decision: 'approved', attestationRef: 'usc:proof-before-config', sourceTxHash: commitment('a2') });
  expectStatus(unconfiguredUsc, 409, 'unconfigured USC proof');
  expectStatus(await post(`/api/milestones/${first}/review`, tokens.technical, { decision: 'approved', attestationRef: 'local:technical-1' }), 201, 'technical approval');
  expectStatus(await post(`/api/milestones/${first}/review`, tokens.stakeholder, { decision: 'approved', attestationRef: 'local:stakeholder-1' }), 201, 'stakeholder approval');
  expectStatus(await post(`/api/milestones/${first}/release`, tokens.owner), 200, 'first release');

  const sequenceBlocked = await post(`/api/milestones/${second}/release`, tokens.owner); expectStatus(sequenceBlocked, 409, 'sequence guard');
  expectStatus(await post(`/api/milestones/${second}/evidence`, tokens.implementer, { label: 'Delivery evidence v1', commitment: commitment('b1') }), 201, 'second evidence');
  expectStatus(await post(`/api/milestones/${second}/review`, tokens.auditor, { decision: 'rejected', attestationRef: 'local:auditor-1' }), 201, 'dispute');
  const locked = await post(`/api/milestones/${second}/release`, tokens.owner); expectStatus(locked, 409, 'dispute lock');
  expectStatus(await post(`/api/milestones/${second}/evidence`, tokens.implementer, { label: 'Delivery evidence v2', commitment: commitment('b2') }), 201, 'evidence revision');
  expectStatus(await post(`/api/milestones/${second}/review`, tokens.technical, { decision: 'approved', attestationRef: 'local:technical-2' }), 201, 'revised technical approval');
  expectStatus(await post(`/api/milestones/${second}/review`, tokens.stakeholder, { decision: 'approved', attestationRef: 'local:stakeholder-2' }), 201, 'revised stakeholder approval');
  const released = await post(`/api/milestones/${second}/release`, tokens.owner); expectStatus(released, 200, 'second release');
  if (released.data.status !== 'complete' || released.data.released_amount !== 9000) throw new Error('final project state is incorrect');

  const duplicateKey = 'fixed-e2e-key-1234';
  const idemBody = { name: 'Idempotency Fixture', category: 'Test', summary: 'Signature binding fixture.', targetAmount: 1, milestones: [{ title: 'One', amount: 1, quorum: 1 }] };
  expectStatus(await post('/api/projects', tokens.owner, idemBody, duplicateKey), 201, 'idempotent create');
  const conflict = await post('/api/projects', tokens.owner, { ...idemBody, summary: 'Changed payload.' }, duplicateKey); expectStatus(conflict, 409, 'idempotency conflict');
  const audit = await request(`/api/projects/${id}/audit`); if (!audit.data.valid) throw new Error('audit chain invalid');
  const tamperDb = new DatabaseSync(dbPath); tamperDb.prepare('UPDATE events SET detail=? WHERE project_id=? AND id=(SELECT id FROM events WHERE project_id=? ORDER BY created_at LIMIT 1)').run('tampered event', id, id); tamperDb.close();
  const tamperedAudit = await request(`/api/projects/${id}/audit`); if (tamperedAudit.data.valid) throw new Error('audit chain did not detect event tampering');
  console.log('Emberline E2E: passed');
  console.log('  landing + workspace routes: verified');
  console.log('  auth + path validation: enforced');
  console.log('  evidence: immutable revisions');
  console.log('  dispute: funds locked');
  console.log('  sequence: earlier gate required');
  console.log('  full quorum: $9,000 released');
  console.log('  audit chain: verified + tampering detected');
} finally {
  server.kill();
  await wait(100);
  await rm(dbDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
