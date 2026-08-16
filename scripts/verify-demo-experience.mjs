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
const issue = async (code) => { const result = await request('/api/demo/session', { method: 'POST', body: { code } }); expect(result, 201, code); return result.data.token; };
const commitment = `0x${'de'.repeat(32)}`;

try {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { try { if ((await fetch(`${base}/health`)).ok) break; } catch {} await wait(50); }
  const access = await request('/api/demo/access'); expect(access, 200, 'public code list');
  if (!access.data.enabled || access.data.roles.length !== 4) throw new Error('public demo roles are not published');
  expect(await request('/api/demo/session', { method: 'POST', body: { code: 'WRONG-CODE' } }), 401, 'invalid demo code');
  const rawCodeSession = await request('/api/session', { token: 'EMBER-OWNER' });
  if (rawCodeSession.data.actor !== null) throw new Error('public code authenticated directly as a bearer token');

  const [owner, builder, reviewerOne, reviewerTwo] = await Promise.all(['EMBER-OWNER', 'EMBER-BUILDER', 'EMBER-REVIEW-1', 'EMBER-REVIEW-2'].map(issue));
  const projects = await request('/api/projects', { token: owner }); expect(projects, 200, 'scoped project list');
  if (projects.data.projects.length !== 1 || projects.data.projects[0].id !== 'DEMO-001') throw new Error('demo session escaped its project list');
  expect(await request('/api/projects/EMB-001', { token: owner }), 403, 'real project isolation');
  expect(await request('/api/projects', { token: owner, method: 'POST', body: { name: 'Escape', category: 'Test', summary: 'Must not persist', targetAmount: 1, milestones: [{ title: 'One', amount: 1, quorum: 1 }] } }), 403, 'demo project creation isolation');

  const demo = await request('/api/projects/DEMO-001', { token: builder }); expect(demo, 200, 'demo project');
  const active = demo.data.milestones.find((milestone) => milestone.sequence === 2);
  expect(await request(`/api/milestones/${active.id}/evidence`, { token: builder, method: 'POST', body: { label: 'Public demo evidence', commitment } }), 201, 'demo evidence');
  expect(await request(`/api/milestones/${active.id}/review`, { token: reviewerOne, method: 'POST', body: { decision: 'approved', attestationRef: 'local:public-demo-review-one' } }), 201, 'demo reviewer one');
  expect(await request(`/api/milestones/${active.id}/review`, { token: reviewerTwo, method: 'POST', body: { decision: 'approved', attestationRef: 'local:public-demo-review-two' } }), 201, 'demo reviewer two');
  const released = await request(`/api/milestones/${active.id}/release`, { token: owner, method: 'POST' }); expect(released, 200, 'demo release');
  if (released.data.released_amount !== 9000 || released.data.audit.valid !== true) throw new Error('demo release or audit result is incorrect');

  console.log('Emberline public demo: passed');
  console.log('  published codes exchange for random sessions');
  console.log('  real projects remain inaccessible');
  console.log('  production-safe local demo flow completes');
} finally {
  server.kill(); await wait(100); await rm(dbDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
