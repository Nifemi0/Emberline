import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import solc from 'solc';
import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  formatEther,
  id,
  parseEther
} from 'ethers';

const root = process.cwd();
const secretsDir = join(root, '.secrets');
const deploymentPath = join(secretsDir, 'deployment.json');
const creditcoinRpc = process.env.ATTESTCOIN_RPC_URL || 'https://rpc.cc3-testnet.creditcoin.network';
const sepoliaRpc = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const decoderLibrary = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';
const blockProver = '0x0000000000000000000000000000000000000FD2';

const addresses = JSON.parse(await readFile(join(secretsDir, 'addresses.json'), 'utf8'));
const password = (await readFile(join(secretsDir, 'wallet-password.txt'), 'utf8')).trim();
const encryptedDeployer = await readFile(join(secretsDir, 'deployer.json'), 'utf8');
const baseWallet = await Wallet.fromEncryptedJson(encryptedDeployer, password);
const creditcoinProvider = new JsonRpcProvider(creditcoinRpc);
const sepoliaProvider = new JsonRpcProvider(sepoliaRpc);
const creditcoinWallet = baseWallet.connect(creditcoinProvider);
const sepoliaWallet = baseWallet.connect(sepoliaProvider);

let deployment = {};
try { deployment = JSON.parse(await readFile(deploymentPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const save = async () => writeFile(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`, { mode: 0o600 });

const sourceNames = [
  'src/EvidenceReviewRegistry.sol',
  'src/EmberlineProject.sol',
  'src/AttestcoinReviewVerifier.sol'
];
const sources = Object.fromEntries(await Promise.all(sourceNames.map(async (name) => [name, { content: await readFile(join(root, name), 'utf8') }])));
const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences'] } }
  }
};
const findImports = (path) => {
  const candidates = [join(root, path), join(root, 'node_modules', path)];
  for (const candidate of candidates) {
    try { return { contents: requireRead(candidate) }; } catch { /* try next */ }
  }
  return { error: `Import not found: ${path}` };
};
function requireRead(path) {
  return process.getBuiltinModule('fs').readFileSync(path, 'utf8');
}
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));

const artifact = (source, name) => output.contracts[source][name];
const linkBytecode = (contractArtifact, address) => {
  let bytecode = contractArtifact.evm.bytecode.object;
  for (const fileReferences of Object.values(contractArtifact.evm.bytecode.linkReferences)) {
    for (const references of Object.values(fileReferences)) {
      for (const reference of references) {
        const start = reference.start * 2;
        bytecode = `${bytecode.slice(0, start)}${address.slice(2).toLowerCase()}${bytecode.slice(start + reference.length * 2)}`;
      }
    }
  }
  return `0x${bytecode}`;
};

const registryArtifact = artifact('src/EvidenceReviewRegistry.sol', 'EvidenceReviewRegistry');
const verifierArtifact = artifact('src/AttestcoinReviewVerifier.sol', 'AttestcoinReviewVerifier');
const projectArtifact = artifact('src/EmberlineProject.sol', 'EmberlineProject');

const [sepoliaBalance, creditcoinBalance] = await Promise.all([
  sepoliaProvider.getBalance(addresses.deployer),
  creditcoinProvider.getBalance(addresses.deployer)
]);
console.log(`Deployer balances: ${formatEther(sepoliaBalance)} Sepolia ETH, ${formatEther(creditcoinBalance)} test CTC`);
if (sepoliaBalance === 0n) throw new Error('Sepolia deployer is not funded yet. Re-run after the faucet transaction confirms.');

if (!deployment.sourceRegistry) {
  const registry = await new ContractFactory(registryArtifact.abi, `0x${registryArtifact.evm.bytecode.object}`, sepoliaWallet).deploy();
  const receipt = await registry.deploymentTransaction().wait();
  deployment.sourceRegistry = await registry.getAddress();
  deployment.sourceRegistryTx = receipt.hash;
  await save();
  console.log(`EvidenceReviewRegistry: ${deployment.sourceRegistry}`);
}

const registry = new Contract(deployment.sourceRegistry, registryArtifact.abi, sepoliaWallet);
for (const reviewer of [addresses.reviewerTechnical, addresses.reviewerStakeholder, addresses.reviewerAuditor]) {
  if (!(await registry.reviewers(reviewer))) {
    const tx = await registry.configureReviewer(reviewer, true);
    await tx.wait();
    console.log(`Authorized Sepolia reviewer: ${reviewer}`);
  }
}

if (creditcoinBalance === 0n) throw new Error('Creditcoin deployer is not funded yet. Sepolia setup is complete; re-run after the CTC faucet request succeeds.');

if (!deployment.attestcoinVerifier) {
  const verifierBytecode = linkBytecode(verifierArtifact, decoderLibrary);
  const verifier = await new ContractFactory(verifierArtifact.abi, verifierBytecode, creditcoinWallet).deploy(
    1,
    deployment.sourceRegistry,
    blockProver
  );
  const receipt = await verifier.deploymentTransaction().wait();
  deployment.attestcoinVerifier = await verifier.getAddress();
  deployment.attestcoinVerifierTx = receipt.hash;
  await save();
  console.log(`AttestcoinReviewVerifier: ${deployment.attestcoinVerifier}`);
}

if (!deployment.projectEscrow) {
  const projectId = id('EMBERLINE-TESTNET-DEMO');
  const project = await new ContractFactory(projectArtifact.abi, `0x${projectArtifact.evm.bytecode.object}`, creditcoinWallet).deploy(
    projectId,
    addresses.implementer,
    [parseEther('0.01'), parseEther('0.02'), parseEther('0.01')],
    deployment.attestcoinVerifier,
    2
  );
  const receipt = await project.deploymentTransaction().wait();
  deployment.projectId = projectId;
  deployment.projectEscrow = await project.getAddress();
  deployment.projectEscrowTx = receipt.hash;
  const configured = new Contract(deployment.projectEscrow, projectArtifact.abi, creditcoinWallet);
  for (const reviewer of [addresses.reviewerTechnical, addresses.reviewerStakeholder, addresses.reviewerAuditor]) {
    await (await configured.configureReviewer(reviewer, true)).wait();
  }
  await save();
  console.log(`EmberlineProject: ${deployment.projectEscrow}`);
}

const remainingCtc = await creditcoinProvider.getBalance(addresses.deployer);
const reviewerGas = parseEther('0.05');
if (remainingCtc > reviewerGas * 5n) {
  for (const recipient of [addresses.implementer, addresses.reviewerTechnical, addresses.reviewerStakeholder, addresses.reviewerAuditor]) {
    if ((await creditcoinProvider.getBalance(recipient)) < reviewerGas) {
      await (await creditcoinWallet.sendTransaction({ to: recipient, value: reviewerGas })).wait();
      console.log(`Funded Creditcoin actor: ${recipient}`);
    }
  }
}

deployment.networks = {
  sepolia: { chainId: 11155111, rpc: sepoliaRpc },
  creditcoin: { chainId: 102031, rpc: creditcoinRpc, decoderLibrary, blockProver }
};
await save();
console.log('Testnet deployment complete. Addresses saved to .secrets/deployment.json.');
