#!/usr/bin/env node
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { openDatabase, hashToken, appendEvent, projectView, createDemoProject, deleteDemoProject } from './services/database.mjs';
import { attestcoinConfig, isAttestcoinReady, verifyUscReview } from './services/attestcoin.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(root, 'app');
let liveAttestation = null;
try { liveAttestation = JSON.parse(await readFile(resolve(root, 'live-attestation.json'), 'utf8')); } catch { /* The live sample is optional for local development. */ }
const port = Number(process.env.PORT || 8899);
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const db = await openDatabase(process.env.EMBERLINE_DB_PATH || resolve(root, 'data/emberline.db'));
const MAX_BODY = 32 * 1024;
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.pdf': 'application/pdf' };
const requests = new Map();
const DEMO_SESSION_MS = 60 * 60 * 1000;
const demoExperienceEnabled = process.env.DEMO_EXPERIENCE_ENABLED !== 'false';
const demoCodes = new Map([
  ['EMBER-OWNER', { id: 'demo-owner', name: 'Demo Capital Owner', role: 'owner' }],
  ['EMBER-BUILDER', { id: 'demo-implementer', name: 'Demo Builder', role: 'implementer' }],
  ['EMBER-REVIEW-1', { id: 'demo-reviewer-one', name: 'Demo Reviewer One', role: 'reviewer' }],
  ['EMBER-REVIEW-2', { id: 'demo-reviewer-two', name: 'Demo Reviewer Two', role: 'reviewer' }]
]);
const demoSessions = new Map();
const demoJourneys = new Map();
for (const { id } of await db.all("SELECT id FROM projects WHERE id LIKE 'DEMO-%'")) await deleteDemoProject(db, id);

const send = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(data)); };
const fail = (res, status, error, message, extra = {}) => send(res, status, { error, message, ...extra });
const appError = (message, status = 400, code = 'request_failed') => Object.assign(new Error(message), { status, code });
const parseBody = async (req) => {
  let raw = ''; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw appError('Payload too large.', 413, 'payload_too_large'); raw += chunk; }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw appError('Invalid JSON.', 400, 'invalid_json'); }
};
const authenticate = async (req) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const tokenDigest = hashToken(token); const demoSession = demoSessions.get(tokenDigest);
  if (demoSession) {
    if (demoSession.expiresAt > Date.now()) return { ...demoSession.actor, demo: true, projectId: demoSession.projectId, journeyId: demoSession.journeyId };
    demoSessions.delete(tokenDigest);
  }
  return await db.get('SELECT id,name,role FROM actors WHERE token_hash=?', [tokenDigest]) || null;
};
const requireRole = async (req, res, roles) => {
  const actor = await authenticate(req);
  if (!actor) { fail(res, 401, 'authentication_required', 'Enter a valid actor token to continue.'); return null; }
  if (!roles.includes(actor.role)) { fail(res, 403, 'forbidden', `This action requires ${roles.join(' or ')} access.`); return null; }
  return actor;
};
const rateLimit = (req, res) => {
  const key = req.socket.remoteAddress || 'local'; const bucket = Math.floor(Date.now() / 60000); const old = requests.get(key);
  const count = old?.bucket === bucket ? old.count + 1 : 1; requests.set(key, { bucket, count });
  if (count > 180) { fail(res, 429, 'rate_limited', 'Too many requests. Try again shortly.'); return false; } return true;
};
const idempotent = async (actor, req, signature, fn) => {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 8 || key.length > 100) throw appError('A valid Idempotency-Key header is required.', 400, 'idempotency_key_required');
  const digest = createHash('sha256').update(signature).digest('hex');
  const saved = await db.get('SELECT response_json,signature FROM idempotency WHERE actor_id=? AND request_key=?', [actor.id, key]);
  if (saved) {
    if (saved.signature && saved.signature !== digest) throw appError('This idempotency key was already used for a different request.', 409, 'idempotency_conflict');
    return JSON.parse(saved.response_json);
  }
  const result = await fn();
  await db.run('INSERT INTO idempotency (actor_id,request_key,response_json,signature,created_at) VALUES (?,?,?,?,?)', [actor.id, key, JSON.stringify(result), digest, new Date().toISOString()]);
  return result;
};
const isCommitment = (value) => /^0x[0-9a-fA-F]{64}$/.test(value || '');
const isTxHash = (value) => !value || /^0x[0-9a-fA-F]{64}$/.test(value);
const isProjectId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const ensureDemoScope = (actor, projectId) => { if (actor?.demo && projectId !== actor.projectId) throw appError('Demo sessions are restricted to their private sandbox.', 403, 'demo_scope'); };
const cleanupExpiredDemos = async () => {
  const now = Date.now();
  for (const [journeyId, journey] of demoJourneys) {
    if (journey.expiresAt <= now) { demoJourneys.delete(journeyId); await deleteDemoProject(db, journey.projectId); }
  }
  for (const [digest, session] of demoSessions) if (session.expiresAt <= now) demoSessions.delete(digest);
};
const localAttestationsEnabled = process.env.ALLOW_LOCAL_ATTESTATIONS === 'true' || (process.env.NODE_ENV !== 'production' && process.env.ALLOW_LOCAL_ATTESTATIONS !== 'false');
const refreshProjectStatus = async (projectId) => {
  const project = await db.get('SELECT funded_amount,target_amount FROM projects WHERE id=?', [projectId]);
  const states = (await db.all('SELECT state FROM milestones WHERE project_id=?', [projectId])).map((row) => row.state);
  const status = states.length && states.every((state) => state === 'released') ? 'complete' : states.includes('disputed') ? 'disputed' : project.funded_amount < project.target_amount ? 'funding' : 'in_review';
  await db.run('UPDATE projects SET status=?,version=version+1 WHERE id=?', [status, projectId]);
};
const projectForMilestone = (id) => db.get('SELECT m.*,p.implementer_actor_id,p.funded_amount,p.released_amount,p.target_amount FROM milestones m JOIN projects p ON p.id=m.project_id WHERE m.id=?', [id]);
const reviewerWalletForActor = (actorId) => ({
  'reviewer-technical': process.env.EMBERLINE_TECHNICAL_WALLET,
  'reviewer-community': process.env.EMBERLINE_STAKEHOLDER_WALLET,
  'reviewer-auditor': process.env.EMBERLINE_AUDITOR_WALLET
})[actorId] || '';
const attestcoin = () => { const config = attestcoinConfig(); return {
  name: 'Attestcoin Protocol', mode: config.mode, network: config.network, chainId: config.chainId,
  sourceChain: config.sourceChain, sourceChainKey: config.sourceChainKey,
  rpcUrlConfigured: Boolean(config.rpcUrl), proofBuilderConfigured: Boolean(config.proofBuilderUrl),
  sourceRegistryConfigured: Boolean(config.sourceRegistry),
  uscContractConfigured: Boolean(config.uscContract), decoderContract: config.decoderContract,
  chainInfoPrecompile: config.chainInfoPrecompile, nativeVerifierPrecompile: config.blockProverPrecompile,
  integrationReady: isAttestcoinReady(config)
}; };

const server = http.createServer(async (req, res) => {
  try {
    if (!rateLimit(req, res)) return;
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health' && req.method === 'GET') { const chain = attestcoin(); return send(res, 200, { ok: true, persistence: db.kind, audit: 'hash-chained', authorization: 'bearer-actor', demoCredentials: process.env.NODE_ENV !== 'production', demoExperienceEnabled, localAttestationsEnabled, chainMode: chain.mode, attestcoin: chain }); }
    if (url.pathname === '/api/live-attestation' && req.method === 'GET') return send(res, 200, { available: Boolean(liveAttestation), attestation: liveAttestation });
    if (url.pathname === '/api/demo/access' && req.method === 'GET') return send(res, 200, { enabled: demoExperienceEnabled, expiresInMinutes: DEMO_SESSION_MS / 60000, isolatedPerVisitor: true, roles: demoExperienceEnabled ? [...demoCodes.entries()].map(([code, actor]) => ({ code, name: actor.name, role: actor.role })) : [] });
    if (url.pathname === '/api/demo/session' && req.method === 'POST') {
      if (!demoExperienceEnabled) return fail(res, 404, 'demo_disabled', 'Public demo access is disabled.');
      const body = await parseBody(req); const code = String(body.code || '').trim().toUpperCase(); const actor = demoCodes.get(code);
      if (!actor) return fail(res, 401, 'invalid_demo_code', 'That demo code was not recognized.');
      await cleanupExpiredDemos();
      const requestedJourney = String(body.journeyId || '').trim();
      let journeyId = /^[A-Za-z0-9-]{16,80}$/.test(requestedJourney) ? requestedJourney : randomUUID();
      let journey = demoJourneys.get(journeyId);
      if (!journey) {
        const projectId = `DEMO-${randomUUID().slice(0, 12).toUpperCase()}`;
        const expiresAt = Date.now() + DEMO_SESSION_MS;
        await createDemoProject(db, projectId); journey = { projectId, expiresAt }; demoJourneys.set(journeyId, journey);
      }
      const token = randomBytes(32).toString('base64url');
      demoSessions.set(hashToken(token), { actor, projectId: journey.projectId, journeyId, expiresAt: journey.expiresAt });
      return send(res, 201, { token, journeyId, expiresAt: new Date(journey.expiresAt).toISOString(), actor: { ...actor, demo: true, projectId: journey.projectId, journeyId } });
    }
    if (url.pathname === '/api/session' && req.method === 'GET') return send(res, 200, { actor: await authenticate(req) });
    if (url.pathname === '/api/actors' && req.method === 'GET') return send(res, 200, { actors: await db.all("SELECT id,name,role FROM actors WHERE id NOT LIKE 'demo-%' ORDER BY role,name") });
    if (url.pathname === '/api/projects' && req.method === 'GET') { const actor = await authenticate(req); const query = actor?.demo ? 'SELECT id,name,category,status,target_amount,funded_amount,released_amount,created_at FROM projects WHERE id=?' : "SELECT id,name,category,status,target_amount,funded_amount,released_amount,created_at FROM projects WHERE id NOT LIKE 'DEMO-%' ORDER BY created_at DESC"; return send(res, 200, { projects: await db.all(query, actor?.demo ? [actor.projectId] : []) }); }

    if (url.pathname === '/api/projects' && req.method === 'POST') {
      const actor = await requireRole(req, res, ['owner']); if (!actor) return; const body = await parseBody(req);
      if (actor.demo) return fail(res, 403, 'demo_scope', 'Demo owners use the prepared sandbox project and cannot create persistent workspaces.');
      if (!body.name || !body.category || !body.summary || !Number.isSafeInteger(body.targetAmount) || body.targetAmount <= 0 || !Array.isArray(body.milestones) || !body.milestones.length) return fail(res, 400, 'invalid_project', 'Name, category, summary, positive target, and milestones are required.');
      const milestones = body.milestones.map((m) => ({ title: String(m.title || '').trim(), amount: Number(m.amount), quorum: Number(m.quorum || 2) }));
      if (milestones.some((m) => !m.title || !Number.isSafeInteger(m.amount) || m.amount <= 0 || !Number.isSafeInteger(m.quorum) || m.quorum < 1 || m.quorum > 3)) return fail(res, 400, 'invalid_milestones', 'Each milestone needs a title, positive amount, and quorum between 1 and 3.');
      if (milestones.reduce((sum, m) => sum + m.amount, 0) !== body.targetAmount) return fail(res, 400, 'milestone_total_mismatch', 'Milestone amounts must equal the project target.');
      const reviewerIds = body.reviewerActorIds || (await db.all("SELECT id FROM actors WHERE role='reviewer' AND id NOT LIKE 'demo-%'")).map((row) => row.id);
      const reviewerChecks = Array.isArray(reviewerIds) ? await Promise.all(reviewerIds.map((id) => db.get("SELECT 1 FROM actors WHERE id=? AND role='reviewer'", [id]))) : [];
      if (!Array.isArray(reviewerIds) || new Set(reviewerIds).size !== reviewerIds.length || reviewerChecks.some((row) => !row) || reviewerIds.length < Math.max(...milestones.map((m) => m.quorum))) return fail(res, 400, 'invalid_review_policy', 'Assign enough unique reviewer actors to satisfy the largest milestone quorum.');
      const result = await db.transaction(() => idempotent(actor, req, `${req.method} ${url.pathname} ${JSON.stringify(body)}`, async () => {
        const id = `EMB-${randomUUID().slice(0, 8).toUpperCase()}`; const implementerId = body.implementerActorId || 'implementer-atlas';
        if (!(await db.get("SELECT 1 FROM actors WHERE id=? AND role='implementer'", [implementerId]))) throw appError('Unknown implementer actor.');
        await db.run(`INSERT INTO projects (id,name,category,summary,implementer_actor_id,status,target_amount,impact_target,impact_unit,created_at) VALUES (?,?,?,?,?,'funding',?,?,?,?)`, [id, body.name.trim(), body.category.trim(), body.summary.trim(), implementerId, body.targetAmount, Number(body.impactTarget || 0), String(body.impactUnit || 'outcomes').trim(), new Date().toISOString()]);
        for (const [index, milestone] of milestones.entries()) await db.run('INSERT INTO milestones (project_id,sequence,title,amount,quorum,state) VALUES (?,?,?,?,?,?)', [id, index + 1, milestone.title, milestone.amount, milestone.quorum, 'pending']);
        for (const reviewerId of reviewerIds) await db.run('INSERT INTO project_reviewers (project_id,actor_id,reviewer_role) VALUES (?,?,?)', [id, reviewerId, reviewerId.replace('reviewer-', '')]);
        await appendEvent(db, { projectId: id, type: 'project_created', actorId: actor.id, actorName: actor.name, detail: 'Project created', reference: id }); return projectView(db, id);
      })); return send(res, 201, result);
    }
    const projectRoute = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectRoute && req.method === 'GET') { if (!isProjectId(projectRoute[1])) return fail(res, 400, 'invalid_project_id', 'Invalid project id.'); const actor = await authenticate(req); ensureDemoScope(actor, projectRoute[1]); const project = await projectView(db, projectRoute[1]); return project ? send(res, 200, project) : fail(res, 404, 'not_found', 'Project not found.'); }
    const auditRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/audit$/);
    if (auditRoute && req.method === 'GET') { const actor = await authenticate(req); ensureDemoScope(actor, auditRoute[1]); const project = await projectView(db, auditRoute[1]); return project ? send(res, 200, project.audit) : fail(res, 404, 'not_found', 'Project not found.'); }
    const fundRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/fund$/);
    if (fundRoute && req.method === 'POST') {
      const actor = await requireRole(req, res, ['owner']); if (!actor) return; const body = await parseBody(req); const amount = Number(body.amount);
      ensureDemoScope(actor, fundRoute[1]);
      if (!Number.isSafeInteger(amount) || amount <= 0 || !isTxHash(body.sourceTxHash)) return fail(res, 400, 'invalid_funding', 'A positive integer amount and optional transaction hash are required.');
      const result = await db.transaction(() => idempotent(actor, req, `${req.method} ${url.pathname} ${JSON.stringify(body)}`, async () => {
        const project = await db.get('SELECT * FROM projects WHERE id=?', [fundRoute[1]]); if (!project) throw appError('Project not found.', 404);
        if (project.funded_amount + amount > project.target_amount) throw appError('Funding exceeds the project target.', 409, 'overfunding');
        await db.run('UPDATE projects SET funded_amount=funded_amount+?,version=version+1 WHERE id=?', [amount, project.id]); await refreshProjectStatus(project.id);
        await appendEvent(db, { projectId: project.id, type: 'funding_recorded', actorId: actor.id, actorName: actor.name, detail: `${amount} units funded`, reference: body.sourceTxHash || 'local:settlement-pending' }); return projectView(db, project.id);
      })); return send(res, 200, result);
    }
    const evidenceRoute = url.pathname.match(/^\/api\/milestones\/(\d+)\/evidence$/);
    if (evidenceRoute && req.method === 'POST') {
      const actor = await requireRole(req, res, ['implementer']); if (!actor) return; const body = await parseBody(req);
      if (!isCommitment(body.commitment) || typeof body.label !== 'string' || body.label.trim().length < 3 || body.label.length > 180) return fail(res, 400, 'invalid_commitment', 'Evidence needs a label and a full 32-byte hex commitment.');
      const result = await db.transaction(() => idempotent(actor, req, `${req.method} ${url.pathname} ${JSON.stringify(body)}`, async () => {
        const milestone = await projectForMilestone(Number(evidenceRoute[1])); if (!milestone) throw appError('Milestone not found.', 404); if (milestone.implementer_actor_id !== actor.id) throw appError('Only this project implementer may submit evidence.', 403);
        ensureDemoScope(actor, milestone.project_id);
        if (!['pending', 'disputed'].includes(milestone.state)) throw appError('Only pending or disputed milestones accept a new evidence revision.', 409, 'evidence_immutable');
        const prior = await db.get('SELECT state FROM milestones WHERE project_id=? AND sequence<? ORDER BY sequence DESC LIMIT 1', [milestone.project_id, milestone.sequence]);
        if (prior && prior.state !== 'released') throw appError('Complete the current milestone before submitting evidence for a later gate.', 409, 'sequence_locked');
        const revision = milestone.state === 'disputed' ? milestone.revision + 1 : milestone.revision;
        await db.run('INSERT INTO evidence_revisions (milestone_id,revision,commitment,label,submitted_by,created_at) VALUES (?,?,?,?,?,?)', [milestone.id, revision, body.commitment, body.label.trim(), actor.id, new Date().toISOString()]);
        await db.run("UPDATE milestones SET evidence_commitment=?,revision=?,approvals=0,rejections=0,state='submitted',version=version+1 WHERE id=?", [body.commitment, revision, milestone.id]);
        await appendEvent(db, { projectId: milestone.project_id, milestoneId: milestone.id, type: 'evidence_submitted', actorId: actor.id, actorName: actor.name, detail: `${body.label.trim()} · revision ${revision}`, reference: body.commitment }); await refreshProjectStatus(milestone.project_id); return projectView(db, milestone.project_id);
      })); return send(res, 201, result);
    }
    const reviewRoute = url.pathname.match(/^\/api\/milestones\/(\d+)\/review$/);
    if (reviewRoute && req.method === 'POST') {
      const actor = await requireRole(req, res, ['reviewer']); if (!actor) return; const body = await parseBody(req);
      if (!['approved', 'rejected'].includes(body.decision) || typeof body.attestationRef !== 'string' || body.attestationRef.length < 6 || body.attestationRef.length > 180 || !isTxHash(body.sourceTxHash)) return fail(res, 400, 'invalid_review', 'Decision, attestation reference, and optional source transaction hash are required.');
      if (!/^(local|usc):/i.test(body.attestationRef)) return fail(res, 400, 'invalid_attestation_ref', 'Attestation reference must identify a local or USC proof.');
      const usesUscProof = /^usc:/i.test(body.attestationRef);
      if (!usesUscProof && !localAttestationsEnabled && !actor.demo) return fail(res, 409, 'local_attestations_disabled', 'Local attestations are disabled in this environment. Use a verified USC proof.');
      if (usesUscProof && !isAttestcoinReady()) return fail(res, 409, 'attestcoin_unconfigured', 'USC attestations are disabled until the RPC, Proof Builder, source registry, mode, and deployed verifier are configured.');
      if (usesUscProof && !body.sourceTxHash) return fail(res, 400, 'source_tx_required', 'A USC attestation must include the source transaction hash.');
      const milestoneForProof = usesUscProof ? await projectForMilestone(Number(reviewRoute[1])) : null;
      if (usesUscProof && !milestoneForProof) return fail(res, 404, 'not_found', 'Milestone not found.');
      const uscVerification = usesUscProof ? await verifyUscReview({
        reviewerAddress: reviewerWalletForActor(actor.id),
        projectId: milestoneForProof.project_id,
        milestoneId: milestoneForProof.id,
        revision: milestoneForProof.revision,
        evidenceCommitment: milestoneForProof.evidence_commitment,
        approved: body.decision === 'approved',
        sourceTxHash: body.sourceTxHash
      }, attestcoinConfig()) : null;
      const canonicalAttestationRef = uscVerification ? `usc:${uscVerification.proofId}` : body.attestationRef.trim();
      const result = await db.transaction(() => idempotent(actor, req, `${req.method} ${url.pathname} ${JSON.stringify(body)}`, async () => {
        const milestone = await projectForMilestone(Number(reviewRoute[1])); if (!milestone) throw appError('Milestone not found.', 404);
        ensureDemoScope(actor, milestone.project_id);
        if (!(await db.get('SELECT 1 FROM project_reviewers WHERE project_id=? AND actor_id=? AND active=1', [milestone.project_id, actor.id]))) throw appError('Reviewer is not assigned to this project.', 403);
        if (milestone.state !== 'submitted') throw appError('Milestone is not open for review.', 409);
        await db.run('INSERT INTO milestone_reviews (milestone_id,revision,actor_id,decision,attestation_ref,source_tx_hash,created_at) VALUES (?,?,?,?,?,?,?)', [milestone.id, milestone.revision, actor.id, body.decision, canonicalAttestationRef, body.sourceTxHash || null, new Date().toISOString()]);
        const approved = body.decision === 'approved'; await db.run("UPDATE milestones SET approvals=approvals+?,rejections=rejections+?,state=CASE WHEN ?=1 THEN 'disputed' ELSE state END,version=version+1 WHERE id=?", [approved ? 1 : 0, approved ? 0 : 1, approved ? 0 : 1, milestone.id]);
        await appendEvent(db, { projectId: milestone.project_id, milestoneId: milestone.id, type: approved ? 'review_approved' : 'review_rejected', actorId: actor.id, actorName: actor.name, detail: approved ? `Milestone approved · revision ${milestone.revision}` : `Milestone disputed · revision ${milestone.revision}`, reference: body.sourceTxHash || body.attestationRef }); await refreshProjectStatus(milestone.project_id); return projectView(db, milestone.project_id);
      }));
      if (uscVerification) result.attestcoin = { proofId: uscVerification.proofId, contractProof: uscVerification.contractProof };
      return send(res, 201, result);
    }
    const releaseRoute = url.pathname.match(/^\/api\/milestones\/(\d+)\/release$/);
    if (releaseRoute && req.method === 'POST') {
      const actor = await requireRole(req, res, ['owner']); if (!actor) return;
      const result = await db.transaction(() => idempotent(actor, req, `${req.method} ${url.pathname}`, async () => {
        const milestone = await projectForMilestone(Number(releaseRoute[1])); if (!milestone) throw appError('Milestone not found.', 404);
        ensureDemoScope(actor, milestone.project_id);
        const prior = await db.get('SELECT state FROM milestones WHERE project_id=? AND sequence<? ORDER BY sequence DESC LIMIT 1', [milestone.project_id, milestone.sequence]);
        if (prior && prior.state !== 'released') throw appError('Earlier milestones must be released first.', 409, 'sequence_locked');
        if (milestone.state !== 'submitted' || milestone.approvals < milestone.quorum || milestone.rejections > 0) throw appError('Release policy is not satisfied.', 409, 'release_blocked');
        if (milestone.funded_amount - milestone.released_amount < milestone.amount) throw appError('Project escrow is underfunded.', 409, 'underfunded');
        await db.run("UPDATE milestones SET state='released',released_at=?,version=version+1 WHERE id=?", [new Date().toISOString(), milestone.id]);
        await db.run('UPDATE projects SET released_amount=released_amount+?,version=version+1 WHERE id=?', [milestone.amount, milestone.project_id]);
        if (actor.demo && !(await db.get("SELECT 1 FROM milestones WHERE project_id=? AND state<>'released' LIMIT 1", [milestone.project_id]))) await db.run('UPDATE projects SET confirmed_impact=impact_target WHERE id=?', [milestone.project_id]);
        await appendEvent(db, { projectId: milestone.project_id, milestoneId: milestone.id, type: 'milestone_released', actorId: actor.id, actorName: actor.name, detail: `${milestone.amount} units released`, reference: `release:${randomUUID()}` }); await refreshProjectStatus(milestone.project_id); return projectView(db, milestone.project_id);
      })); return send(res, 200, result);
    }
    if (url.pathname.startsWith('/api/')) return fail(res, 404, 'not_found', 'API route not found.');
    const requested = url.pathname === '/' ? '/landing.html' : ['/workspace', '/workspace/'].includes(url.pathname) ? '/index.html' : ['/whitepaper', '/whitepaper/'].includes(url.pathname) ? '/whitepaper.html' : url.pathname; const file = resolve(appRoot, `.${requested}`);
    if (!(file === appRoot || file.startsWith(`${appRoot}${sep}`)) || !existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'" });
    res.end(await readFile(file));
  } catch (error) {
    const status = error.status || (String(error.message).includes('UNIQUE constraint') || error.code === '23505' ? 409 : 500); fail(res, status, error.status ? error.code : (status === 500 ? 'internal_error' : 'conflict'), status === 500 ? 'The request could not be completed.' : error.message); if (status === 500) console.error(error);
  }
});
server.listen(port, host, () => console.log(`Emberline: http://${host}:${port}`));
process.on('SIGTERM', async () => { await db.close(); server.close(); });
