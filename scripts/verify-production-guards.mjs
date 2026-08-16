import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tokenKeys = ['EMBERLINE_OWNER_TOKEN', 'EMBERLINE_IMPLEMENTER_TOKEN', 'EMBERLINE_TECHNICAL_TOKEN', 'EMBERLINE_STAKEHOLDER_TOKEN', 'EMBERLINE_AUDITOR_TOKEN'];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitForExit = (child) => new Promise((resolve) => child.once('exit', (code) => resolve(code)));

const missingTokenDir = await mkdtemp(join(tmpdir(), 'emberline-prod-missing-'));
const missingEnv = { ...process.env, NODE_ENV: 'production', EMBERLINE_DB_PATH: join(missingTokenDir, 'test.db') };
for (const key of tokenKeys) delete missingEnv[key];
const missing = spawn(process.execPath, ['server.mjs'], { cwd: root, env: missingEnv, stdio: 'ignore' });
const missingExit = await waitForExit(missing);
if (missingExit === 0) throw new Error('Production server started without required actor tokens.');
await rm(missingTokenDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });

const configuredDir = await mkdtemp(join(tmpdir(), 'emberline-prod-configured-'));
const port = 8902;
const configuredEnv = { ...process.env, NODE_ENV: 'production', PORT: String(port), EMBERLINE_DB_PATH: join(configuredDir, 'test.db') };
tokenKeys.forEach((key, index) => { configuredEnv[key] = `production-actor-token-${index}-change-before-launch`; });
delete configuredEnv.ALLOW_LOCAL_ATTESTATIONS;
const configured = spawn(process.execPath, ['server.mjs'], { cwd: root, env: configuredEnv, stdio: 'ignore' });
try {
  const deadline = Date.now() + 15000;
  let health;
  while (Date.now() < deadline) {
    try { const response = await fetch(`http://127.0.0.1:${port}/health`); if (response.ok) { health = await response.json(); break; } } catch {}
    await wait(50);
  }
  if (!health) throw new Error('Configured production server did not become ready.');
  if (health.demoCredentials !== false || health.localAttestationsEnabled !== false) throw new Error('Production safety defaults are incorrect.');
  console.log('Emberline production guards: passed');
  console.log('  missing actor credentials: startup blocked');
  console.log('  demo credentials: hidden');
  console.log('  local attestations: disabled');
} finally {
  configured.kill();
  await wait(100);
  await rm(configuredDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
