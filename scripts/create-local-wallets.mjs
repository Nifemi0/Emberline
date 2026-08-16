import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Wallet } from 'ethers';

const secretsDir = join(process.cwd(), '.secrets');
const manifestPath = join(secretsDir, 'addresses.json');

try {
  const existing = JSON.parse(await readFile(manifestPath, 'utf8'));
  console.log('Existing Emberline wallets retained:');
  for (const [role, address] of Object.entries(existing)) console.log(`  ${role}: ${address}`);
  process.exit(0);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await mkdir(secretsDir, { recursive: true, mode: 0o700 });
const password = randomBytes(32).toString('hex');
const roles = ['deployer', 'implementer', 'reviewerTechnical', 'reviewerStakeholder', 'reviewerAuditor'];
const addresses = {};

for (const role of roles) {
  const wallet = Wallet.createRandom();
  const encrypted = await wallet.encrypt(password);
  await writeFile(join(secretsDir, `${role}.json`), encrypted, { mode: 0o600 });
  addresses[role] = wallet.address;
}

await writeFile(join(secretsDir, 'wallet-password.txt'), `${password}\n`, { mode: 0o600 });
await writeFile(manifestPath, `${JSON.stringify(addresses, null, 2)}\n`, { mode: 0o600 });
await writeFile(
  join(secretsDir, 'wallet-addresses.env'),
  [
    `EMBERLINE_DEPLOYER_WALLET=${addresses.deployer}`,
    `EMBERLINE_IMPLEMENTER_WALLET=${addresses.implementer}`,
    `EMBERLINE_TECHNICAL_WALLET=${addresses.reviewerTechnical}`,
    `EMBERLINE_STAKEHOLDER_WALLET=${addresses.reviewerStakeholder}`,
    `EMBERLINE_AUDITOR_WALLET=${addresses.reviewerAuditor}`,
    ''
  ].join('\n'),
  { mode: 0o600 }
);

for (const filename of ['wallet-password.txt', 'addresses.json', 'wallet-addresses.env', ...roles.map((role) => `${role}.json`)]) {
  try { await chmod(join(secretsDir, filename), 0o600); } catch { /* Windows ACLs apply instead. */ }
}

console.log('Created encrypted Emberline wallets:');
for (const [role, address] of Object.entries(addresses)) console.log(`  ${role}: ${address}`);
console.log('Private keys were not printed. Encrypted keystores are under .secrets/.');
