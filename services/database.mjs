import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const { Pool } = pg;
const now = () => new Date().toISOString();
export const hashToken = (value) => createHash('sha256').update(value).digest('hex');
const eventHash = (event) => createHash('sha256').update(JSON.stringify(event)).digest('hex');

class SqliteStore {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.kind = 'sqlite';
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  }
  get(sql, params = []) { return this.database.prepare(sql).get(...params); }
  all(sql, params = []) { return this.database.prepare(sql).all(...params); }
  run(sql, params = []) { return this.database.prepare(sql).run(...params); }
  exec(sql) { return this.database.exec(sql); }
  async transaction(fn) {
    this.database.exec('BEGIN IMMEDIATE');
    try { const result = await fn(); this.database.exec('COMMIT'); return result; }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
  close() { this.database.close(); }
}

const postgresSql = (sql) => { let index = 0; return sql.replace(/\?/g, () => `$${++index}`); };

export class PostgresStore {
  constructor(connectionString, PoolClass = Pool) {
    this.kind = 'postgresql';
    this.context = new AsyncLocalStorage();
    this.pool = new PoolClass({
      connectionString,
      max: Number(process.env.PGPOOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ...(process.env.PGSSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
    });
  }
  client() { return this.context.getStore() || this.pool; }
  async query(sql, params = []) { return this.client().query(postgresSql(sql), params); }
  async get(sql, params = []) { return (await this.query(sql, params)).rows[0]; }
  async all(sql, params = []) { return (await this.query(sql, params)).rows; }
  async run(sql, params = []) { const result = await this.query(sql, params); return { changes: result.rowCount, rows: result.rows }; }
  async exec(sql) { await this.client().query(sql); }
  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.context.run(client, fn);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}

const actorDefinitions = [
  ['owner-sky', 'Sky', 'owner', 'EMBERLINE_OWNER_TOKEN', 'owner-demo-token-change-me'],
  ['implementer-atlas', 'Atlas Works', 'implementer', 'EMBERLINE_IMPLEMENTER_TOKEN', 'implementer-demo-token-change-me'],
  ['reviewer-technical', 'Technical Reviewer', 'reviewer', 'EMBERLINE_TECHNICAL_TOKEN', 'technical-demo-token-change-me'],
  ['reviewer-community', 'Stakeholder Representative', 'reviewer', 'EMBERLINE_STAKEHOLDER_TOKEN', 'stakeholder-demo-token-change-me'],
  ['reviewer-auditor', 'Independent Auditor', 'reviewer', 'EMBERLINE_AUDITOR_TOKEN', 'auditor-demo-token-change-me']
];

const sqliteSchema = `
  CREATE TABLE IF NOT EXISTS actors (id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,summary TEXT NOT NULL,implementer_actor_id TEXT NOT NULL REFERENCES actors(id),status TEXT NOT NULL,target_amount INTEGER NOT NULL CHECK(target_amount>0),funded_amount INTEGER NOT NULL DEFAULT 0,released_amount INTEGER NOT NULL DEFAULT 0,impact_target INTEGER NOT NULL DEFAULT 0,impact_unit TEXT NOT NULL DEFAULT 'outcomes',confirmed_impact INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS milestones (id INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT NOT NULL REFERENCES projects(id),sequence INTEGER NOT NULL,title TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),evidence_commitment TEXT,approvals INTEGER NOT NULL DEFAULT 0,rejections INTEGER NOT NULL DEFAULT 0,quorum INTEGER NOT NULL CHECK(quorum>0),state TEXT NOT NULL DEFAULT 'pending',released_at TEXT,version INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 0,UNIQUE(project_id,sequence));
  CREATE TABLE IF NOT EXISTS project_reviewers (project_id TEXT NOT NULL REFERENCES projects(id),actor_id TEXT NOT NULL REFERENCES actors(id),reviewer_role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(project_id,actor_id));
  CREATE TABLE IF NOT EXISTS reviews (milestone_id INTEGER NOT NULL REFERENCES milestones(id),actor_id TEXT NOT NULL REFERENCES actors(id),decision TEXT NOT NULL,attestation_ref TEXT NOT NULL,source_tx_hash TEXT,created_at TEXT NOT NULL,PRIMARY KEY(milestone_id,actor_id));
  CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),milestone_id INTEGER,type TEXT NOT NULL,actor_id TEXT,actor_name TEXT NOT NULL,detail TEXT NOT NULL,reference TEXT NOT NULL,previous_hash TEXT NOT NULL,event_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS idempotency (actor_id TEXT NOT NULL,request_key TEXT NOT NULL,response_json TEXT NOT NULL,signature TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,PRIMARY KEY(actor_id,request_key));
  CREATE TABLE IF NOT EXISTS evidence_revisions (id INTEGER PRIMARY KEY AUTOINCREMENT,milestone_id INTEGER NOT NULL REFERENCES milestones(id),revision INTEGER NOT NULL,commitment TEXT NOT NULL,label TEXT NOT NULL,submitted_by TEXT NOT NULL REFERENCES actors(id),created_at TEXT NOT NULL,UNIQUE(milestone_id,revision));
  CREATE TABLE IF NOT EXISTS milestone_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT,milestone_id INTEGER NOT NULL REFERENCES milestones(id),revision INTEGER NOT NULL,actor_id TEXT NOT NULL REFERENCES actors(id),decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),attestation_ref TEXT NOT NULL,source_tx_hash TEXT,created_at TEXT NOT NULL,UNIQUE(milestone_id,revision,actor_id));
`;

const postgresSchema = `
  CREATE TABLE IF NOT EXISTS actors (id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,summary TEXT NOT NULL,implementer_actor_id TEXT NOT NULL REFERENCES actors(id),status TEXT NOT NULL,target_amount INTEGER NOT NULL CHECK(target_amount>0),funded_amount INTEGER NOT NULL DEFAULT 0,released_amount INTEGER NOT NULL DEFAULT 0,impact_target INTEGER NOT NULL DEFAULT 0,impact_unit TEXT NOT NULL DEFAULT 'outcomes',confirmed_impact INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS milestones (id SERIAL PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),sequence INTEGER NOT NULL,title TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),evidence_commitment TEXT,approvals INTEGER NOT NULL DEFAULT 0,rejections INTEGER NOT NULL DEFAULT 0,quorum INTEGER NOT NULL CHECK(quorum>0),state TEXT NOT NULL DEFAULT 'pending',released_at TEXT,version INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 0,UNIQUE(project_id,sequence));
  CREATE TABLE IF NOT EXISTS project_reviewers (project_id TEXT NOT NULL REFERENCES projects(id),actor_id TEXT NOT NULL REFERENCES actors(id),reviewer_role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(project_id,actor_id));
  CREATE TABLE IF NOT EXISTS reviews (milestone_id INTEGER NOT NULL REFERENCES milestones(id),actor_id TEXT NOT NULL REFERENCES actors(id),decision TEXT NOT NULL,attestation_ref TEXT NOT NULL,source_tx_hash TEXT,created_at TEXT NOT NULL,PRIMARY KEY(milestone_id,actor_id));
  CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),milestone_id INTEGER,type TEXT NOT NULL,actor_id TEXT,actor_name TEXT NOT NULL,detail TEXT NOT NULL,reference TEXT NOT NULL,previous_hash TEXT NOT NULL,event_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS idempotency (actor_id TEXT NOT NULL,request_key TEXT NOT NULL,response_json TEXT NOT NULL,signature TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,PRIMARY KEY(actor_id,request_key));
  CREATE TABLE IF NOT EXISTS evidence_revisions (id SERIAL PRIMARY KEY,milestone_id INTEGER NOT NULL REFERENCES milestones(id),revision INTEGER NOT NULL,commitment TEXT NOT NULL,label TEXT NOT NULL,submitted_by TEXT NOT NULL REFERENCES actors(id),created_at TEXT NOT NULL,UNIQUE(milestone_id,revision));
  CREATE TABLE IF NOT EXISTS milestone_reviews (id SERIAL PRIMARY KEY,milestone_id INTEGER NOT NULL REFERENCES milestones(id),revision INTEGER NOT NULL,actor_id TEXT NOT NULL REFERENCES actors(id),decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),attestation_ref TEXT NOT NULL,source_tx_hash TEXT,created_at TEXT NOT NULL,UNIQUE(milestone_id,revision,actor_id));
  ALTER TABLE milestones ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE idempotency ADD COLUMN IF NOT EXISTS signature TEXT NOT NULL DEFAULT '';
`;

export async function initialize(store) {
  await store.exec(store.kind === 'postgresql' ? postgresSchema : sqliteSchema);
  if (store.kind === 'sqlite') {
    const milestoneColumns = new Set((await store.all('PRAGMA table_info(milestones)')).map((column) => column.name));
    const idempotencyColumns = new Set((await store.all('PRAGMA table_info(idempotency)')).map((column) => column.name));
    if (!milestoneColumns.has('revision')) await store.exec("ALTER TABLE milestones ADD COLUMN revision INTEGER NOT NULL DEFAULT 0");
    if (!idempotencyColumns.has('signature')) await store.exec("ALTER TABLE idempotency ADD COLUMN signature TEXT NOT NULL DEFAULT ''");
  }

  const production = process.env.NODE_ENV === 'production';
  if (production) {
    const missing = actorDefinitions.filter(([, , , key]) => !process.env[key] || process.env[key].length < 24).map(([, , , key]) => key);
    if (missing.length) throw new Error(`Production requires actor tokens of at least 24 characters: ${missing.join(', ')}`);
  }
  for (const [id, name, role, key, demo] of actorDefinitions) {
    await store.run(`INSERT INTO actors (id,name,role,token_hash,created_at) VALUES (?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,token_hash=excluded.token_hash`, [id, name, role, hashToken(process.env[key] || demo), now()]);
  }

  if (!(await store.get('SELECT 1 FROM projects LIMIT 1'))) {
    await store.transaction(async () => {
      await store.run('INSERT INTO projects (id,name,category,summary,implementer_actor_id,status,target_amount,funded_amount,released_amount,impact_target,impact_unit,confirmed_impact,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', ['EMB-001', 'Solar Microgrid · Phase II', 'Infrastructure', 'Expand reliable evening power to three residential clusters through a shared solar and battery microgrid.', 'implementer-atlas', 'in_review', 25000, 25000, 5000, 180, 'households', 64, now()]);
      const milestones = [[1, 'Site survey & engineering plan', 5000, 2, 'released', null, 2, now()],[2, 'Battery installation · Cluster A', 8000, 2, 'submitted', '0x8b2f8ac6a51b90c24ca481f479d801824de0e523f7414e325a2a9ca541e7c41d', 1, null],[3, 'Distribution commissioning', 7000, 2, 'pending', null, 0, null],[4, 'Performance audit & closeout', 5000, 2, 'pending', null, 0, null]];
      for (const milestone of milestones) await store.run('INSERT INTO milestones (project_id,sequence,title,amount,quorum,state,evidence_commitment,approvals,released_at) VALUES (?,?,?,?,?,?,?,?,?)', ['EMB-001', ...milestone]);
      for (const [actorId, role] of [['reviewer-technical', 'technical'], ['reviewer-community', 'stakeholder'], ['reviewer-auditor', 'auditor']]) await store.run('INSERT INTO project_reviewers (project_id,actor_id,reviewer_role) VALUES (?,?,?)', ['EMB-001', actorId, role]);
      const milestone = await store.get('SELECT id FROM milestones WHERE project_id=? AND sequence=2', ['EMB-001']);
      await store.run('INSERT INTO milestone_reviews (milestone_id,revision,actor_id,decision,attestation_ref,source_tx_hash,created_at) VALUES (?,?,?,?,?,?,?)', [milestone.id, 0, 'reviewer-technical', 'approved', 'local:seed-technical-review', null, now()]);
      await store.run('INSERT INTO evidence_revisions (milestone_id,revision,commitment,label,submitted_by,created_at) VALUES (?,?,?,?,?,?)', [milestone.id, 0, '0x8b2f8ac6a51b90c24ca481f479d801824de0e523f7414e325a2a9ca541e7c41d', 'Seeded installation evidence package', 'implementer-atlas', now()]);
    });
  }

  const evidenceBackfill = store.kind === 'postgresql'
    ? `INSERT INTO evidence_revisions (milestone_id,revision,commitment,label,submitted_by,created_at) SELECT m.id,COALESCE(m.revision,0),m.evidence_commitment,'Imported evidence package',p.implementer_actor_id,COALESCE(m.released_at,?) FROM milestones m JOIN projects p ON p.id=m.project_id WHERE m.evidence_commitment IS NOT NULL ON CONFLICT(milestone_id,revision) DO NOTHING`
    : `INSERT OR IGNORE INTO evidence_revisions (milestone_id,revision,commitment,label,submitted_by,created_at) SELECT m.id,COALESCE(m.revision,0),m.evidence_commitment,'Imported evidence package',p.implementer_actor_id,COALESCE(m.released_at,datetime('now')) FROM milestones m JOIN projects p ON p.id=m.project_id WHERE m.evidence_commitment IS NOT NULL`;
  const reviewBackfill = store.kind === 'postgresql'
    ? `INSERT INTO milestone_reviews (milestone_id,revision,actor_id,decision,attestation_ref,source_tx_hash,created_at) SELECT r.milestone_id,COALESCE(m.revision,0),r.actor_id,r.decision,r.attestation_ref,r.source_tx_hash,r.created_at FROM reviews r JOIN milestones m ON m.id=r.milestone_id ON CONFLICT(milestone_id,revision,actor_id) DO NOTHING`
    : `INSERT OR IGNORE INTO milestone_reviews (milestone_id,revision,actor_id,decision,attestation_ref,source_tx_hash,created_at) SELECT r.milestone_id,COALESCE(m.revision,0),r.actor_id,r.decision,r.attestation_ref,r.source_tx_hash,r.created_at FROM reviews r JOIN milestones m ON m.id=r.milestone_id`;
  if (store.kind === 'postgresql') await store.run(evidenceBackfill, [now()]); else await store.exec(evidenceBackfill);
  await store.exec(reviewBackfill);
}

export async function openDatabase(path = process.env.EMBERLINE_DB_PATH || resolve('data/emberline.db')) {
  const store = process.env.DATABASE_URL ? new PostgresStore(process.env.DATABASE_URL) : new SqliteStore(path);
  await initialize(store);
  return store;
}

export async function appendEvent(db, { projectId, milestoneId = null, type, actorId = null, actorName, detail, reference }) {
  const previous = (await db.get('SELECT event_hash FROM events WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 1', [projectId]))?.event_hash || 'GENESIS';
  const createdAt = now();
  const event = { projectId, milestoneId, type, actorId, actorName, detail, reference, previous, createdAt };
  const digest = eventHash(event);
  await db.run('INSERT INTO events (id,project_id,milestone_id,type,actor_id,actor_name,detail,reference,previous_hash,event_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [randomUUID(), projectId, milestoneId, type, actorId, actorName, detail, reference, previous, digest, createdAt]);
  return digest;
}

export async function projectView(db, projectId) {
  const project = await db.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!project) return null;
  const [milestones, reviewers, reviews, evidence, events, allEvents] = await Promise.all([
    db.all('SELECT * FROM milestones WHERE project_id=? ORDER BY sequence', [projectId]),
    db.all('SELECT a.id,a.name,pr.reviewer_role AS role,pr.active FROM project_reviewers pr JOIN actors a ON a.id=pr.actor_id WHERE pr.project_id=? ORDER BY pr.reviewer_role', [projectId]),
    db.all('SELECT r.milestone_id,r.revision,r.actor_id,r.decision,r.attestation_ref,r.source_tx_hash,r.created_at FROM milestone_reviews r JOIN milestones m ON m.id=r.milestone_id WHERE m.project_id=?', [projectId]),
    db.all('SELECT e.milestone_id,e.revision,e.commitment,e.label,e.submitted_by,e.created_at FROM evidence_revisions e JOIN milestones m ON m.id=e.milestone_id WHERE m.project_id=? ORDER BY e.revision DESC', [projectId]),
    db.all('SELECT * FROM events WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 50', [projectId]),
    db.all('SELECT * FROM events WHERE project_id=? ORDER BY created_at ASC,id ASC', [projectId])
  ]);
  let expected = 'GENESIS'; let auditValid = true;
  for (const event of allEvents) {
    if (event.previous_hash !== expected) auditValid = false;
    const digest = eventHash({ projectId: event.project_id, milestoneId: event.milestone_id, type: event.type, actorId: event.actor_id, actorName: event.actor_name, detail: event.detail, reference: event.reference, previous: event.previous_hash, createdAt: event.created_at });
    if (event.event_hash !== digest) auditValid = false;
    expected = event.event_hash;
  }
  return { ...project, milestones: milestones.map((m) => ({ ...m, reviews: reviews.filter((r) => r.milestone_id === m.id && r.revision === m.revision), evidenceHistory: evidence.filter((e) => e.milestone_id === m.id) })), reviewers, events, audit: { valid: auditValid, checked: allEvents.length } };
}
