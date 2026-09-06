import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AbiCoder,
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  id,
  keccak256,
  parseEther,
  toUtf8Bytes
} from 'ethers';
import { proofProvider } from '@gluwa/usc-sdk';

// This is an owner-only Creditcoin Testnet refresh for the published live sample.
// It never reads or writes a mainnet endpoint and never prints private key material.
const root = process.cwd();
const secretsDir = join(root, '.secrets');
const artifactsDir = join(root, 'artifacts');
const addresses = JSON.parse(await readFile(join(secretsDir, 'addresses.json'), 'utf8'));
const deployment = JSON.parse(await readFile(join(secretsDir, 'deployment.json'), 'utf8'));
const password = (await readFile(join(secretsDir, 'wallet-password.txt'), 'utf8')).trim();
const creditcoin = new JsonRpcProvider(deployment.networks.creditcoin.rpc);
const sepolia = new JsonRpcProvider(deployment.networks.sepolia.rpc);
const deployer = (await Wallet.fromEncryptedJson(await readFile(join(secretsDir, 'deployer.json'), 'utf8'), password)).connect(creditcoin);
const implementer = (await Wallet.fromEncryptedJson(await readFile(join(secretsDir, 'implementer.json'), 'utf8'), password)).connect(creditcoin);
const reviewers = [
  {
    role: 'technical',
    address: addresses.reviewerTechnical,
    walletFile: 'reviewerTechnical.json'
  },
  {
    role: 'stakeholder',
    address: addresses.reviewerStakeholder,
    walletFile: 'reviewerStakeholder.json'
  }
].map(async (reviewer) => ({ ...reviewer, wallet: (await Wallet.fromEncryptedJson(await readFile(join(secretsDir, reviewer.walletFile), 'utf8'), password)).connect(creditcoin) }));
const reviewerWallets = await Promise.all(reviewers);
const sourceReviewers = await Promise.all(reviewerWallets.map(async (reviewer) => ({ ...reviewer, wallet: reviewer.wallet.connect(sepolia) })));

const milestoneId = 1;
const revision = 0;
const quorum = 2;
const projectId = deployment.projectId;
const projectAddress = deployment.projectEscrow;
const verifierAddress = deployment.attestcoinVerifier;
const sourceRegistryAddress = deployment.sourceRegistry;
const projectAbi = [
  'function fund() payable',
  'function getMilestone(uint256) view returns (uint256 amount, bytes32 evidenceCommitment, uint256 approvals, uint256 rejections, uint256 revision, uint8 state)',
  'function submitEvidence(uint256,bytes32)',
  'function recordReview(uint256,bool,bytes32)',
  'function releaseMilestone(uint256)',
  'function approvedReviewers(address) view returns (bool)'
];
const sourceRegistryAbi = [
  'function reviewers(address) view returns (bool)',
  'function recordReview(bytes32,uint256,uint256,bytes32,bool)'
];
const verifierAbi = [
  'function submitReviewProof(uint64,bytes,tuple(bytes32 root,tuple(bytes32 hash,bool isLeft)[] siblings),tuple(bytes32 lowerEndpointDigest,bytes32[] roots)) returns (bytes32 proofId)'
];
const projectForOwner = new Contract(projectAddress, projectAbi, deployer);
const projectForImplementer = new Contract(projectAddress, projectAbi, implementer);
const verifier = new Contract(verifierAddress, verifierAbi, deployer);
const sourceRegistry = new Contract(sourceRegistryAddress, sourceRegistryAbi, sepolia);
const proofBuilder = new proofProvider.service.ProofBuilder(1, 'https://proof-gen-api.cc3-testnet.creditcoin.network/', 20000);
const abi = AbiCoder.defaultAbiCoder();
const checkpointPath = join(artifactsDir, 'live-refresh-checkpoint.json');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sendAndWait = async (label, txPromise) => {
  const tx = await txPromise;
  console.log(`${label}: submitted ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`${label} reverted.`);
  console.log(`${label}: confirmed in block ${receipt.blockNumber}`);
  return receipt;
};
const writeCheckpoint = async (checkpoint) => {
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(join(artifactsDir, 'live-refresh-checkpoint.json'), `${JSON.stringify(checkpoint, null, 2)}\n`);
};
const getProof = async (sourceTxHash) => {
  const sourceReceipt = await sepolia.getTransactionReceipt(sourceTxHash);
  if (!sourceReceipt) throw new Error(`Sepolia receipt is unavailable for ${sourceTxHash}.`);
  console.log(`Waiting for Attestcoin to attest Sepolia block ${sourceReceipt.blockNumber} before requesting the proof.`);
  await proofBuilder.waitUntilHeightAttested(1, sourceReceipt.blockNumber, 15000, 600000, 10000);
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const result = await proofBuilder.getProof(sourceTxHash);
    if (result?.success && result.data) return result.data;
    if (attempt === 1 || attempt % 4 === 0) console.log(`Proof builder is still indexing ${sourceTxHash} (attempt ${attempt}/20).`);
    await sleep(15000);
  }
  throw new Error(`Proof builder did not return a proof for ${sourceTxHash} within the retry window.`);
};

const [creditcoinChainId, sepoliaChainId] = await Promise.all([creditcoin.getNetwork(), sepolia.getNetwork()]);
if (Number(creditcoinChainId.chainId) !== 102031) throw new Error(`Refusing to run: Creditcoin chain id is ${creditcoinChainId.chainId}, expected 102031.`);
if (Number(sepoliaChainId.chainId) !== 11155111) throw new Error(`Refusing to run: source chain id is ${sepoliaChainId.chainId}, expected Sepolia 11155111.`);
const [deployerBalance, implementerBalance] = await Promise.all([creditcoin.getBalance(deployer.address), creditcoin.getBalance(implementer.address)]);
if (deployerBalance < parseEther('0.05')) throw new Error(`Deployer has only ${formatEther(deployerBalance)} test CTC; refusing to continue.`);
if (implementerBalance < parseEther('0.02')) throw new Error(`Implementer has only ${formatEther(implementerBalance)} test CTC; refusing to continue.`);
const current = await projectForOwner.getMilestone(milestoneId);
if (![0, 1].includes(Number(current[5]))) throw new Error(`Milestone ${milestoneId} is not pending or submitted; refusing to create a duplicate release.`);
for (const reviewer of reviewerWallets) {
  if (!(await projectForOwner.approvedReviewers(reviewer.address))) throw new Error(`Reviewer ${reviewer.address} is not authorized on the project.`);
  if (!(await sourceRegistry.reviewers(reviewer.address))) throw new Error(`Reviewer ${reviewer.address} is not authorized on the Sepolia source registry.`);
}

let evidenceCommitment;
let fundingReceipt;
let sourceResults;
if (Number(current[5]) === 0) {
  const observedAt = new Date().toISOString();
  const evidence = {
    schemaVersion: 'emberline.live-evidence.v1',
    projectId,
    projectAddress,
    network: 'Creditcoin Testnet',
    sourceNetwork: 'Ethereum Sepolia',
    milestoneId,
    revision,
    observedAt,
    statement: 'Independent source-chain reviews approved the next Emberline milestone and Creditcoin released its escrow tranche.'
  };
  evidenceCommitment = keccak256(toUtf8Bytes(JSON.stringify(evidence)));
  evidence.commitment = evidenceCommitment;
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(join(artifactsDir, 'live-evidence-milestone-1.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Fresh evidence commitment: ${evidenceCommitment}`);

  fundingReceipt = await sendAndWait('Fund milestone 1 (0.02 CTC)', projectForOwner.fund({ value: parseEther('0.02') }));
  await writeCheckpoint({ projectId, projectAddress, milestoneId, revision, evidenceCommitment, fundingTxHash: fundingReceipt.hash });
  await sendAndWait('Submit milestone evidence', projectForImplementer.submitEvidence(milestoneId, evidenceCommitment));

  sourceResults = [];
  for (const reviewer of sourceReviewers) {
    const registryWithReviewer = new Contract(sourceRegistryAddress, sourceRegistryAbi, reviewer.wallet);
    const receipt = await sendAndWait(`Sepolia ${reviewer.role} review`, registryWithReviewer.recordReview(projectId, milestoneId, revision, evidenceCommitment, true));
    sourceResults.push({ role: reviewer.role, address: reviewer.address, sourceTxHash: receipt.hash });
  }
  await writeCheckpoint({ projectId, projectAddress, milestoneId, revision, evidenceCommitment, fundingTxHash: fundingReceipt.hash, reviewers: sourceResults });
} else {
  const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  evidenceCommitment = checkpoint.evidenceCommitment;
  fundingReceipt = { hash: checkpoint.fundingTxHash };
  sourceResults = checkpoint.reviewers;
  if (!evidenceCommitment || !fundingReceipt.hash || !Array.isArray(sourceResults) || sourceResults.length < quorum) throw new Error('Submitted milestone has no complete refresh checkpoint.');
  if (String(current[1]).toLowerCase() !== String(evidenceCommitment).toLowerCase()) throw new Error('Refresh checkpoint does not match the submitted on-chain commitment.');
  console.log(`Resuming submitted milestone ${milestoneId} from the saved refresh checkpoint.`);
}

const registeredResults = [];
for (const source of sourceResults) {
  const proof = await getProof(source.sourceTxHash);
  if (String(proof.txHash).toLowerCase() !== source.sourceTxHash.toLowerCase()) throw new Error(`Proof builder returned the wrong transaction for ${source.role}.`);
  const proofId = keccak256(abi.encode(['uint64', 'uint64', 'bytes'], [proof.chainKey, proof.headerNumber, proof.txBytes]));
  const proofRegistrationReceipt = await sendAndWait(`Register ${source.role} USC proof`, verifier.submitReviewProof(proof.headerNumber, proof.txBytes, proof.merkleProof, proof.continuityProof));
  registeredResults.push({ ...source, proofId, proofRegistrationTxHash: proofRegistrationReceipt.hash });
  const projectWithReviewer = new Contract(projectAddress, projectAbi, reviewerWallets.find((item) => item.role === source.role).wallet);
  const reviewReceipt = await sendAndWait(`Record ${source.role} review on Creditcoin`, projectWithReviewer.recordReview(milestoneId, true, proofId));
  registeredResults[registeredResults.length - 1].emberlineReviewTxHash = reviewReceipt.hash;
  await writeCheckpoint({ projectId, projectAddress, milestoneId, revision, evidenceCommitment, fundingTxHash: fundingReceipt.hash, reviewers: registeredResults });
}

const releaseReceipt = await sendAndWait('Release milestone 1', projectForOwner.releaseMilestone(milestoneId));
const finalMilestone = await projectForOwner.getMilestone(milestoneId);
if (Number(finalMilestone[5]) !== 2 || Number(finalMilestone[2]) < quorum || Number(finalMilestone[3]) !== 0) throw new Error('Creditcoin milestone state did not reach Released with quorum.');
const manifest = {
  status: 'verified_testnet_sample',
  network: 'Creditcoin Testnet',
  sourceNetwork: 'Ethereum Sepolia',
  projectId,
  projectAddress,
  verifierAddress,
  evidenceCommitment,
  milestoneId,
  revision,
  approvals: Number(finalMilestone[2]),
  rejections: Number(finalMilestone[3]),
  quorum,
  releasedAmount: `${formatEther(finalMilestone[0])} CTC`,
  reviewers: registeredResults,
  fundingTxHash: fundingReceipt.hash,
  releaseTxHash: releaseReceipt.hash
};
await writeFile(join(root, 'live-attestation.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await rm(join(artifactsDir, 'live-refresh-checkpoint.json'), { force: true });
console.log('LIVE_ATTESTATION_REFRESHED');
console.log(JSON.stringify({ milestoneId, evidenceCommitment, fundingTxHash: fundingReceipt.hash, releaseTxHash: releaseReceipt.hash, reviewers: registeredResults }, null, 2));
