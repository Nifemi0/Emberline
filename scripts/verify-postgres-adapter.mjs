import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { PostgresStore, initialize, projectView } from '../services/database.mjs';

const memory = newDb({ autoCreateForeignKeyIndices: true });
const { Pool: MemoryPool } = memory.adapters.createPg();
const transactionCommands = [];
class TrackingPool {
  constructor(config) { this.inner = new MemoryPool(config); }
  query(...args) { return this.inner.query(...args); }
  async connect() {
    const client = await this.inner.connect();
    const query = client.query.bind(client);
    return { query: (...args) => { transactionCommands.push(String(args[0]).toUpperCase()); return query(...args); }, release: () => client.release() };
  }
  end() { return this.inner.end(); }
}
const store = new PostgresStore('postgres://emberline:emberline@local/emberline', TrackingPool);

try {
  await initialize(store);
  assert.equal(store.kind, 'postgresql');
  const seeded = await projectView(store, 'EMB-001');
  assert.equal(seeded.name, 'Solar Microgrid · Phase II');
  assert.equal(seeded.milestones.length, 4);
  assert.equal(seeded.reviewers.length, 3);

  await store.run('INSERT INTO idempotency (actor_id,request_key,response_json,signature,created_at) VALUES (?,?,?,?,?)', ['owner-sky', 'quote-check', JSON.stringify({ name: "Owner's project" }), 'signature', new Date().toISOString()]);
  assert.equal(JSON.parse((await store.get('SELECT response_json FROM idempotency WHERE request_key=?', ['quote-check'])).response_json).name, "Owner's project");

  await assert.rejects(store.transaction(async () => {
    assert.notEqual(store.client(), store.pool);
    await store.run('UPDATE projects SET funded_amount=? WHERE id=?', [1, 'EMB-001']);
    throw new Error('force rollback');
  }), /force rollback/);
  assert.ok(transactionCommands.includes('BEGIN'));
  assert.ok(transactionCommands.includes('ROLLBACK'));

  console.log('Emberline PostgreSQL adapter: passed');
  console.log('  schema + seed: verified');
  console.log('  parameterized queries: verified');
  console.log('  same-client transaction + rollback dispatch: verified');
} finally {
  await store.close();
}
