import { blockProver, proofProvider } from '@gluwa/usc-sdk';
import { AbiCoder, JsonRpcProvider, getAddress, id, keccak256 } from 'ethers';

const abi = AbiCoder.defaultAbiCoder();
const reviewRecordedSignature = id('ReviewRecorded(bytes32,uint256,uint256,bytes32,address,bool)');

const appError = (message, status, code) => Object.assign(new Error(message), { status, code });
const normalizeAddress = (value) => { try { return getAddress(value); } catch { return null; } };
export const projectIdBytes32 = (value) => /^0x[0-9a-fA-F]{64}$/.test(value || '') ? value.toLowerCase() : id(String(value));

export const attestcoinConfig = () => ({
  mode: process.env.ATTESTCOIN_MODE || process.env.CREDITCOIN_USC_MODE || 'unconfigured',
  network: process.env.ATTESTCOIN_NETWORK || 'Creditcoin Testnet',
  chainId: Number(process.env.ATTESTCOIN_CHAIN_ID || 102031),
  sourceChain: process.env.ATTESTCOIN_SOURCE_CHAIN || 'Ethereum Sepolia',
  sourceChainKey: Number(process.env.ATTESTCOIN_SOURCE_CHAIN_KEY || 1),
  rpcUrl: process.env.ATTESTCOIN_RPC_URL || 'https://rpc.cc3-testnet.creditcoin.network',
  proofBuilderUrl: process.env.ATTESTCOIN_PROOF_BUILDER_URL || 'https://proof-gen-api.cc3-testnet.creditcoin.network/',
  sourceRegistry: process.env.ATTESTCOIN_SOURCE_REGISTRY || '',
  decoderContract: process.env.ATTESTCOIN_DECODER_CONTRACT || '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f',
  uscContract: process.env.ATTESTCOIN_USC_CONTRACT || '',
  chainInfoPrecompile: '0x0000000000000000000000000000000000000fD3',
  blockProverPrecompile: '0x0000000000000000000000000000000000000FD2'
});

export const isAttestcoinReady = (config = attestcoinConfig()) => Boolean(
  config.rpcUrl && config.proofBuilderUrl && normalizeAddress(config.sourceRegistry) && normalizeAddress(config.uscContract) && config.mode !== 'unconfigured'
);

const defaultDependencies = {
  createProofBuilder: (config) => new proofProvider.service.ProofBuilder(config.sourceChainKey, config.proofBuilderUrl, 15000),
  createBlockProver: (config) => new blockProver.PrecompileBlockProver(new JsonRpcProvider(config.rpcUrl))
};

export function decodeReviewReceipt(encodedTransaction, sourceRegistry) {
  let transactionType; let chunks; let receiptStatus; let logs;
  try {
    [transactionType, chunks] = abi.decode(['uint8', 'bytes[]'], encodedTransaction);
    const type = Number(transactionType);
    if (!Number.isInteger(type) || type < 0 || type > 4) throw new Error('unsupported transaction');
    const receiptIndex = type <= 2 ? 2 : 3;
    [receiptStatus, , logs] = abi.decode(
      ['uint8', 'uint64', 'tuple(address address_,bytes32[] topics,bytes data)[]', 'bytes'],
      chunks[receiptIndex]
    );
  } catch {
    throw appError('The proven source transaction uses an invalid Attestcoin EVM encoding.', 409, 'invalid_attestcoin_review');
  }
  if (Number(receiptStatus) !== 1) {
    throw appError('The proven source transaction failed.', 409, 'invalid_attestcoin_review');
  }
  const registry = normalizeAddress(sourceRegistry);
  const matches = logs.filter((log) => normalizeAddress(log[0]) === registry
    && log[1].length > 0
    && String(log[1][0]).toLowerCase() === reviewRecordedSignature.toLowerCase());
  if (matches.length !== 1 || matches[0][1].length !== 4) {
    throw appError('The proven receipt must contain exactly one Emberline review event from the configured registry.', 409, 'invalid_attestcoin_review');
  }
  try {
    const log = matches[0];
    const [evidenceCommitment, reviewer, approved] = abi.decode(['bytes32', 'address', 'bool'], log[2]);
    return {
      projectId: String(log[1][1]),
      milestoneId: BigInt(log[1][2]),
      revision: BigInt(log[1][3]),
      evidenceCommitment: String(evidenceCommitment),
      reviewer: normalizeAddress(reviewer),
      approved
    };
  } catch {
    throw appError('The proven review event is malformed.', 409, 'invalid_attestcoin_review');
  }
}

export async function verifyUscReview(input, config = attestcoinConfig(), dependencies = defaultDependencies) {
  if (!isAttestcoinReady(config)) {
    throw appError('USC attestations require the Creditcoin RPC, proof builder, source registry, mode, and deployed Emberline verifier contract.', 409, 'attestcoin_unconfigured');
  }
  const reviewerAddress = normalizeAddress(input.reviewerAddress);
  const sourceRegistry = normalizeAddress(config.sourceRegistry);
  if (!reviewerAddress) throw appError('This reviewer does not have a configured source-chain wallet.', 409, 'reviewer_wallet_unconfigured');

  const proofResult = await dependencies.createProofBuilder(config).getProof(input.sourceTxHash);
  if (!proofResult?.success || !proofResult.data) {
    throw appError(proofResult?.error || 'The source transaction is not yet provable. Wait for attestation finality and retry.', 409, 'attestcoin_proof_pending');
  }
  const proof = proofResult.data;
  if (String(proof.txHash).toLowerCase() !== String(input.sourceTxHash).toLowerCase()) {
    throw appError('The proof builder returned a different source transaction.', 409, 'invalid_attestcoin_proof');
  }
  if (Number(proof.chainKey) !== config.sourceChainKey) {
    throw appError('The proof builder returned a proof for a different source chain.', 409, 'invalid_attestcoin_proof');
  }
  const verified = await dependencies.createBlockProver(config).verifySingle(
    proof.chainKey,
    proof.headerNumber,
    proof.txBytes,
    proof.merkleProof,
    proof.continuityProof
  );
  if (!verified) throw appError('The Creditcoin BlockProver precompile rejected the source transaction proof.', 409, 'invalid_attestcoin_proof');

  const decoded = decodeReviewReceipt(proof.txBytes, sourceRegistry);
  const expectedProjectId = projectIdBytes32(input.projectId);
  const matches = decoded.reviewer === reviewerAddress
    && String(decoded.projectId).toLowerCase() === expectedProjectId.toLowerCase()
    && decoded.milestoneId === BigInt(input.milestoneId)
    && decoded.revision === BigInt(input.revision)
    && String(decoded.evidenceCommitment).toLowerCase() === String(input.evidenceCommitment).toLowerCase()
    && decoded.approved === input.approved;
  if (!matches) throw appError('The proven source transaction does not match this reviewer, milestone, evidence revision, or decision.', 409, 'attestcoin_binding_mismatch');

  const proofId = keccak256(abi.encode(
    ['uint64', 'uint64', 'bytes'],
    [proof.chainKey, proof.headerNumber, proof.txBytes]
  ));
  return {
    valid: true,
    proofId,
    sourceTxHash: proof.txHash,
    projectId: expectedProjectId,
    contractProof: {
      blockHeight: proof.headerNumber,
      encodedTransaction: proof.txBytes,
      merkleProof: proof.merkleProof,
      continuityProof: proof.continuityProof
    }
  };
}
