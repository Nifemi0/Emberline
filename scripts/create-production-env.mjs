import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const secretsDir = join(process.cwd(), '.secrets');
const envPath = join(secretsDir, 'render.env');
const addresses = JSON.parse(await readFile(join(secretsDir, 'addresses.json'), 'utf8'));
let deployment = {};
try { deployment = JSON.parse(await readFile(join(secretsDir, 'deployment.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }

let existing = {};
try {
  for (const line of (await readFile(envPath, 'utf8')).split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator > 0) existing[line.slice(0, separator)] = line.slice(separator + 1);
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }

const token = (name) => existing[name] || randomBytes(32).toString('hex');
const values = {
  NODE_ENV: 'production',
  PORT: '8899',
  EMBERLINE_OWNER_TOKEN: token('EMBERLINE_OWNER_TOKEN'),
  EMBERLINE_IMPLEMENTER_TOKEN: token('EMBERLINE_IMPLEMENTER_TOKEN'),
  EMBERLINE_TECHNICAL_TOKEN: token('EMBERLINE_TECHNICAL_TOKEN'),
  EMBERLINE_STAKEHOLDER_TOKEN: token('EMBERLINE_STAKEHOLDER_TOKEN'),
  EMBERLINE_AUDITOR_TOKEN: token('EMBERLINE_AUDITOR_TOKEN'),
  EMBERLINE_TECHNICAL_WALLET: addresses.reviewerTechnical,
  EMBERLINE_STAKEHOLDER_WALLET: addresses.reviewerStakeholder,
  EMBERLINE_AUDITOR_WALLET: addresses.reviewerAuditor,
  EMBERLINE_DB_PATH: '/data/emberline.db',
  ALLOW_LOCAL_ATTESTATIONS: 'false',
  ATTESTCOIN_MODE: deployment.attestcoinVerifier ? 'usc' : 'unconfigured',
  ATTESTCOIN_NETWORK: 'Creditcoin Testnet',
  ATTESTCOIN_CHAIN_ID: '102031',
  ATTESTCOIN_SOURCE_CHAIN: 'Ethereum Sepolia',
  ATTESTCOIN_SOURCE_CHAIN_KEY: '1',
  ATTESTCOIN_RPC_URL: 'https://rpc.cc3-testnet.creditcoin.network',
  ATTESTCOIN_PROOF_BUILDER_URL: 'https://proof-gen-api.cc3-testnet.creditcoin.network/',
  ATTESTCOIN_SOURCE_REGISTRY: deployment.sourceRegistry || '',
  ATTESTCOIN_DECODER_CONTRACT: '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f',
  ATTESTCOIN_USC_CONTRACT: deployment.attestcoinVerifier || ''
};

await writeFile(envPath, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
console.log('Production environment written to .secrets/render.env. Secret values were not printed.');
