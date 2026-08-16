# Emberline testnet deployment

Deployed on 16 August 2026.

## Public wallets

| Role | Address |
| --- | --- |
| Deployer | `0x0f97226Ad84F9d97A0dF47ab1f050a2b2987CCF5` |
| Implementer | `0xDFd851dD2ffc00CeD4bec4dDF8DBc1c232DfA1EA` |
| Technical reviewer | `0x3fA66617eC9ce26dADf786E5bC64262055271D68` |
| Stakeholder reviewer | `0xC50c45990FD8D235d4B151E755ee1ADF079f2540` |
| Auditor reviewer | `0x501560659d92277A12A1F1990776D9B7f46A370a` |

The deployer received 0.05 Sepolia ETH and 10,000 test CTC from public faucets. Each reviewer received 0.002 Sepolia ETH and 0.05 test CTC; the implementer received 0.05 test CTC.

## Contracts

| Network | Contract | Address | Deployment transaction |
| --- | --- | --- | --- |
| Ethereum Sepolia | `EvidenceReviewRegistry` | [`0x525749ab5390166fCEa076D50d5168d1db476cE7`](https://sepolia.etherscan.io/address/0x525749ab5390166fCEa076D50d5168d1db476cE7) | [`0x6e2f8b...fcf0a`](https://sepolia.etherscan.io/tx/0x6e2f8ba4a69edb58cae21c4f44956bc4e1764eab4eb8299b82bcdefdef0fcf0a) |
| Creditcoin testnet | `AttestcoinReviewVerifier` | [`0x525749ab5390166fCEa076D50d5168d1db476cE7`](https://creditcoin-testnet.blockscout.com/address/0x525749ab5390166fCEa076D50d5168d1db476cE7) | [`0x66e191...da936`](https://creditcoin-testnet.blockscout.com/tx/0x66e1917d305939d96168b0bde33ac6a1e6cc099b31df3b7c4fcb9516ad4da936) |
| Creditcoin testnet | `EmberlineProject` | [`0xB236da47fe9215E18C729050fEd3f4B77FcBBffE`](https://creditcoin-testnet.blockscout.com/address/0xB236da47fe9215E18C729050fEd3f4B77FcBBffE) | [`0x279417...3c881`](https://creditcoin-testnet.blockscout.com/tx/0x2794178c36b43c427f458a08c5ba6df11fc53028a32c9f820d782a24d393c881) |

Project ID: `0x4ef2ce7025b91eb08aa02e50567a6450b755103065f7a11325d9a5fb34f1252e`.

Local keystores are encrypted in `.secrets/`, which is excluded from version control. Never commit that directory or its password file.
