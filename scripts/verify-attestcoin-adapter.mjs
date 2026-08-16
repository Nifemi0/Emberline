import { AbiCoder, Wallet, id, keccak256 } from 'ethers';
import { projectIdBytes32, verifyUscReview } from '../services/attestcoin.mjs';

const abi = AbiCoder.defaultAbiCoder();
const reviewer = Wallet.createRandom();
const registry = Wallet.createRandom().address;
const verifier = Wallet.createRandom().address;
const projectId = 'EMB-ADAPTER-TEST';
const milestoneId = 7;
const revision = 2;
const commitment = `0x${'ab'.repeat(32)}`;

const topics = [
  id('ReviewRecorded(bytes32,uint256,uint256,bytes32,address,bool)'),
  projectIdBytes32(projectId),
  abi.encode(['uint256'], [milestoneId]),
  abi.encode(['uint256'], [revision])
];
const reviewLog = [
  registry,
  topics,
  abi.encode(['bytes32', 'address', 'bool'], [commitment, reviewer.address, true])
];
const chunks = [
  abi.encode(
    ['uint64', 'uint64', 'address', 'bool', 'address', 'uint256', 'bytes'],
    [0, 150000, reviewer.address, false, registry, 0, '0x']
  ),
  abi.encode(
    ['uint64', 'uint128', 'uint128', 'tuple(address account,bytes32[] storageKeys)[]', 'uint8', 'bytes32', 'bytes32'],
    [11155111, 1, 2, [], 0, `0x${'00'.repeat(32)}`, `0x${'00'.repeat(32)}`]
  ),
  abi.encode(
    ['uint8', 'uint64', 'tuple(address address_,bytes32[] topics,bytes data)[]', 'bytes'],
    [1, 100000, [reviewLog], '0x']
  )
];
const encodedTransaction = abi.encode(['uint8', 'bytes[]'], [2, chunks]);
const txHash = keccak256(encodedTransaction);
const proof = {
  chainKey: 1,
  headerNumber: 123,
  txHash,
  txBytes: encodedTransaction,
  merkleProof: { root: `0x${'01'.repeat(32)}`, siblings: [] },
  continuityProof: { lowerEndpointDigest: `0x${'02'.repeat(32)}`, roots: [] }
};
const config = {
  mode: 'usc', network: 'Creditcoin Testnet', chainId: 102031,
  sourceChain: 'Ethereum Sepolia', sourceChainKey: 1,
  rpcUrl: 'https://rpc.cc3-testnet.creditcoin.network',
  proofBuilderUrl: 'https://proof-gen-api.cc3-testnet.creditcoin.network/',
  sourceRegistry: registry,
  decoderContract: '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f',
  uscContract: verifier,
  chainInfoPrecompile: '0x0000000000000000000000000000000000000fD3',
  blockProverPrecompile: '0x0000000000000000000000000000000000000FD2'
};
const dependencies = {
  createProofBuilder: () => ({ getProof: async () => ({ success: true, data: proof }) }),
  createBlockProver: () => ({ verifySingle: async () => true })
};
const input = {
  reviewerAddress: reviewer.address,
  projectId,
  milestoneId,
  revision,
  evidenceCommitment: commitment,
  approved: true,
  sourceTxHash: txHash
};

const accepted = await verifyUscReview(input, config, dependencies);
if (!accepted.valid || !accepted.proofId || accepted.contractProof.encodedTransaction !== encodedTransaction) {
  throw new Error('Valid Attestcoin binding was rejected or contract proof was omitted.');
}

let mismatchRejected = false;
try { await verifyUscReview({ ...input, revision: revision + 1 }, config, dependencies); } catch (error) { mismatchRejected = error.code === 'attestcoin_binding_mismatch'; }
if (!mismatchRejected) throw new Error('Tampered Attestcoin binding was accepted.');

let precompileRejected = false;
try { await verifyUscReview(input, config, { ...dependencies, createBlockProver: () => ({ verifySingle: async () => false }) }); } catch (error) { precompileRejected = error.code === 'invalid_attestcoin_proof'; }
if (!precompileRejected) throw new Error('Rejected BlockProver result was accepted.');

let wrongRegistryRejected = false;
try { await verifyUscReview(input, { ...config, sourceRegistry: Wallet.createRandom().address }, dependencies); } catch (error) { wrongRegistryRejected = error.code === 'invalid_attestcoin_review'; }
if (!wrongRegistryRejected) throw new Error('Review event from the wrong registry was accepted.');

console.log('Emberline Attestcoin adapter: passed');
console.log('  official EVM receipt encoding: decoded');
console.log('  exact review event binding: enforced');
console.log('  destination contract proof payload: produced');
console.log('  BlockProver rejection: enforced');
