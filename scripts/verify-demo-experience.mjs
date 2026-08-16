import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = 8904;
const dbDir = await mkdtemp(join(tmpdir(), 'emberline-demo-'));
const dbPath = join(dbDir, 'demo.db');
const longToken = (role) => `${role}-production-test-token-1234567890`;
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, PORT: String(port), NODE_ENV: 'production', EMBERLINE_DB_PATH: dbPath, DEMO_EXPERIENCE_ENABLED: 'true', ALLOW_LOCAL_ATTESTATIONS: 'false', EMBERLINE_OWNER_TOKEN: longToken('owner'), EMBERLINE_IMPLEMENTER_TOKEN: longToken('implementer'), EMBERLINE_TECHNICAL_TOKEN: longToken('technical'), EMBERLINE_STAKEHOLDER_TOKEN: longToken('stakeholder'), EMBERLINE_AUDITOR_TOKEN: longToken('auditor') },
  stdio: 'ignore'
});
const base = `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const request = async (path, { token, method = 'GET', body } = {}) => {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...(method !== 'GET' ? { 'idempotency-key': crypto.randomUUID() } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { response, data: await response.json() };
};
const expect = (result, status, label) => { if (result.response.status !== status) throw new Error(`${label}: expected ${status}, got ${result.response.status} (${result.data.message || result.data.error})`); };
const issue = async (code, journeyId) => { const result = await request('/api/demo/session', { method: 'POST', body: { code, journeyId } }); expect(result, 201, code); return result.data; };
const commitment = `0x${'de'.repeat(32)}`;

try {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { try { if ((await fetch(`${base}/health`)).ok) break; } catch {} await wait(50); }
  const access = await request('/api/demo/access'); expect(access, 200, 'public code list');
  if (!access.data.enabled || access.data.roles.length !== 4) throw new Error('public demo roles are not published');
  expect(await request('/api/demo/session', { method: 'POST', body: { code: 'WRONG-CODE' } }), 401, 'invalid demo code');
  const rawCodeSession = await request('/api/session', { token: 'EMBER-OWNER' });
  if (rawCodeSession.data.actor !== null) throw new Error('public code authenticated directly as a bearer token');

  const builderSession = await issue('EMBER-BUILDER');
  const [ownerSession, reviewerOneSession, reviewerTwoSession] = await Promise.all(['EMBER-OWNER', 'EMBER-REVIEW-1', 'EMBER-REVIEW-2'].map((code) => issue(code, builderSession.journeyId)));
  const owner = ownerSession.token; const builder = builderSession.token; const reviewerOne = reviewerOneSession.token; const reviewerTwo = reviewerTwoSession.token; const projectId = builderSession.actor.projectId;
  if (![ownerSession, reviewerOneSession, reviewerTwoSession].every((session) => session.actor.projectId === projectId)) throw new Error('role switches did not preserve one journey');
  const otherVisitor = await issue('EMBER-BUILDER');
  if (otherVisitor.actor.projectId === projectId) throw new Error('separate visitors shared one demo project');
  const projects = await request('/api/projects', { token: owner }); expect(projects, 200, 'scoped project list');
  if (projects.data.projects.length !== 1 || projects.data.projects[0].id !== projectId) throw new Error('demo session escaped its project list');
  expect(await request('/api/projects/EMB-001', { token: owner }), 403, 'real project isolation');
  expect(await request('/api/projects', { token: owner, method: 'POST', body: { name: 'Escape', category: 'Test', summary: 'Must not persist', targetAmount: 1, milestones: [{ title: 'One', amount: 1, quorum: 1 }] } }), 403, 'demo project creation isolation');

  const demo = await request(`/api/projects/${projectId}`, { token: builder }); expect(demo, 200, 'demo project');
  const seeded = demo.data.milestones.find((milestone) => milestone.sequence === 1);
  if (seeded.state !== 'released' || !seeded.evidence_commitment || seeded.approvals !== 2 || demo.data.events.length < 6 || demo.data.audit.valid !== true) throw new Error('seeded release is not internally consistent');
  const active = demo.data.milestones.find((milestone) => milestone.sequence === 2);
  expect(await request(`/api/milestones/${active.id}/evidence`, { token: builder, method: 'POST', body: { label: 'Public demo evidence', commitment } }), 201, 'demo evidence');
  expect(await request(`/api/milestones/${active.id}/review`, { token: reviewerOne, method: 'POST', body: { decision: 'approved', attestationRef: 'local:public-demo-review-one' } }), 201, 'demo reviewer one');
  expect(await request(`/api/milestones/${active.id}/review`, { token: reviewerTwo, method: 'POST', body: { decision: 'approved', attestationRef: 'local:public-demo-review-two' } }), 201, 'demo reviewer two');
  const released = await request(`/api/milestones/${active.id}/release`, { token: owner, method: 'POST' }); expect(released, 200, 'demo release');
  if (released.data.released_amount !== 9000 || released.data.funded_amount !== 9000 || released.data.status !== 'complete' || released.data.confirmed_impact !== released.data.impact_target || released.data.audit.valid !== true) throw new Error('demo release or audit result is incorrect');

  console.log('Emberline public demo: passed');
  console.log('  published codes exchange for random sessions');
  console.log('  every visitor receives an isolated project');
  console.log('  seeded history and milestone sequence are consistent');
  console.log('  real projects remain inaccessible');
  console.log('  production-safe local demo flow completes');
} finally {
  server.kill(); await wait(100); await rm(dbDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
