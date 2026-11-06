# dApp Support Agent — Pharos Agent Arena

**Task:** Easy · Support / Reporting · 50 points (+50 optional video)

**Live demo (expected):** https://dapp-support-agent.trantanlong2411.workers.dev/  
**GitHub:** https://github.com/trantanlong2411-droid/dApp-Support-Agent  
**Official Pharos Chain MCP:** https://github.com/PharosNetwork/pharos-mcp — hosted service at https://mcp.pharos.xyz/mcp

A read-only agent that takes a transaction hash, retrieves the on-chain transaction and receipt, identifies supported failure patterns, explains the result without jargon, and suggests safer next steps. It works as a public website that reviewers can use without a wallet or password.

## Important network distinction

The official hosted **Pharos Chain MCP** points to **Pharos Mainnet (chain ID 1672)**. The app uses actual MCP Streamable HTTP messages — `initialize`, `notifications/initialized`, `tools/call` — to invoke:

- `get_chain_info` to reject wrong-chain responses
- `get_transaction` for sender, receiver, input data and gas limit
- `get_transaction_receipt` for block number, success/failure and gas used
- `eth_call` at the parent block **only for a failed mined transaction**, to try extracting revert data

**Atlantic Testnet (chain 688689)** is also supported through an explicitly separate read-only JSON-RPC adapter; it is not advertised as the hosted Chain MCP. The user selects the network before submitting a hash. This avoids silently giving Mainnet answers for Atlantic transactions.

## Task rubric

| Pharos requirement | Implementation |
|---|---|
| Accept transaction hash and fetch transaction/receipt via Chain MCP | Mainnet uses official hosted MCP, validates chain ID 1672, loads exact hash and mined receipt, and performs optional read-only revert replay. |
| Identify failure reason (revert, gas, balance or allowance) | Classifier decodes ABI Error(string), Panic(uint256), ERC20InsufficientAllowance and ERC20InsufficientBalance. If gasUsed meets gasLimit, marks **POSSIBLE out-of-gas**, not conclusive. Missing native gas funds usually rejects a transaction **before** mining and therefore has no mined receipt to look up. |
| Explain without jargon and suggest a fix | Human-readable title, summary, evidence, confidence, targeted corrective actions, and explorer transaction link. |
| Demonstrate three failure types | Reproducible unit tests and **explicitly labeled synthetic examples** for contract revert, insufficient ERC20 allowance, and possible gas exhaustion; additionally illustrates pre-broadcast insufficient gas currency. **These are not actual failed on-chain transactions.** To make complete reviewer proof, supply three real failed tx hashes and verify them live. |

## Why accurate failure diagnosis is hard

- `eth_getTransactionReceipt.status = 0x0` proves a mined transaction did not succeed, **not why** it failed.
- `eth_call` against the parent block does not replay the exact state/order of the original mined transaction. It may produce a useful revert error, but could disagree with the actual execution.
- Fully consumed gas indicates possible out-of-gas, but a revert can also consume the full available gas. The app does not treat this as definitive without tracing.
- Insufficient funds for gas is commonly detected before broadcast. No valid failed mined hash exists in that scenario. The app never invents a hash or blockchain receipt.
- A missing receipt may mean pending or unknown, not a transaction failure.
- Hosted MCP does not expose `debug_traceTransaction` / `trace_*` today; the app cannot manufacture unavailable trace evidence.

These caveats are surfaced to every reviewer alongside the actual diagnosis.

## Web endpoints

| Method | Endpoint | Function |
|---|---|---|
| GET | `/` | Public interface, no login |
| GET | `/api/health` | Network and source descriptions, safety status |
| GET | `/api/demos` | Synthetic test fixtures, clearly labeled (no fake hashes) |
| POST | `/api/analyze` | `{"hash":"0x...","network":"mainnet"|"atlantic"}`, live on-chain diagnosis |

**Never enter a private key.** No wallet connection, transaction signing, approving or sending is present. The server's upstream endpoint is fixed to prevent user-controlled external requests. A simple 8-requests-per-minute/IP gate limits expensive public analysis calls; this is basic abuse resistance rather than a globally coordinated rate limiter.

## Authentic failed-transaction evidence (verified 6 November 2026)

The [official hosted Pharos Chain MCP read-only discovery run](https://github.com/trantanlong2411-droid/dApp-Support-Agent/actions/runs/42182142624) found **five actual Mainnet transactions with mined receipt status 0x0**:

| Transaction | Block | Verified diagnostic result |
| --- | ---: | --- |
| [0xd39a03…c2f5e](https://pharosscan.xyz/tx/0xd39a037dbe20a72ce2ebc097494478a1ab573021b8f128a36aa83933fc2c2f5e) | 22257405 | Confirmed execution failure; specific reason not available |
| [0x5b41bf…67826](https://pharosscan.xyz/tx/0x5b41bfba0b492605fff936af1c18ff20e28ba68c1ddf214073645b4421067826) | 22257341 | Confirmed execution failure; read-only simulation reported generic revert |
| [0x8d49ea…1e290](https://pharosscan.xyz/tx/0x8d49ea3c234c980129b4ebf281b449e4fbad18758c7133e44b122ef294f1e290) | 22257237 | Confirmed execution failure; generic revert |
| [0x70e4a0…46937](https://pharosscan.xyz/tx/0x70e4a044b3b8bb540a46d39ca9ab05d37d5ef6f99ce46620d86d0594a6846937) | 22257237 | Confirmed execution failure; generic revert |
| [0x0b4d1c…0598b8](https://pharosscan.xyz/tx/0x0b4d1c8b7503120e418bf42016c25ef2dcb8b7eaa5b8fac8328edb86770598b8) | 22257237 | Confirmed execution failure; generic revert |

The app exposes all five through **\`GET /api/verified-failures\`** and its public **Verified failed Mainnet transactions** section; reviewers click a button to recheck them directly using Chain MCP.

**Evidence boundary:** Five status-zero transactions are five genuine failures, but **not five distinct root causes**. Historical replay exposed a generic revert on four and no reliable specific reason on one. The separate synthetic fixtures prove the engine can explain three different *failure patterns* (revert reason, allowance, probable gas shortage) without inventing on-chain evidence. [Verified receipt data](proof/verified-mainnet-failed-transactions.json).

## Three actual hosted Chain MCP read-only execution failures (verified 6 November 2026)

[Live Chain MCP workflow — successful](https://github.com/trantanlong2411-droid/dApp-Support-Agent/actions/runs/42186491783) ran **three different eth_call requests on the real Circle USDC contract** on Pharos Mainnet (chain 1672). Unlike fabricated fixtures, hosted Pharos MCP actually returned:

| Failure scenario | MCP returned | Diagnosis |
| --- | --- | --- |
| No ERC-20 allowance | ERC20: transfer amount exceeds allowance | INSUFFICIENT_ALLOWANCE (high confidence) |
| Insufficient token balance | ERC20: transfer amount exceeds balance | INSUFFICIENT_TOKEN_BALANCE (high confidence) |
| Gas too low | The execution has run out of gas. | OUT_OF_GAS_POSSIBLE (medium; only the simulated call) |

**Proof distinction:** these three are **real read-only execution failures from Mainnet Chain MCP** but are **not three mined failed transactions**. The app also exposes five independently confirmed failed Mainnet receipt hashes, with currently unknown or generic revert root causes. Do not claim three separate mined causes without stronger on-chain evidence.

The reviewer-facing website now displays these three real-MCP observations separately from the synthetic example cards. No key, wallet, gas or signing is involved.

## How to review

1. Open the deployed Worker page and choose **Pharos Mainnet · Official Chain MCP**.
2. Paste a real Pharos Mainnet transaction hash (preferably a confirmed failed transaction) and select **Explain transaction**.
3. Read the on-chain receipt status, gas fields and source. If the receipt failed, inspect the decoded error or the carefully qualified gas clue. **Do not assume all failures are proven recoverable.**
4. Review three **simulated** failure explanation cards: ordinary contract revert, missing ERC20 allowance, and gas-limit exhaustion. The demos include action steps and confidence statements.
5. To verify a real Atlantic transaction, switch to the separately labeled Atlantic mode. The **Fill confirmed Atlantic example** button provides a previously verified successful testnet USDC transfer; this demonstrates real receipt retrieval but is **not proof of a failed transaction**.
6. Capture real on-chain failed transaction results with distinct diagnoses, when available, and add them to the proof folder before claiming all three on-chain failure types.

## Tests and deploy

```bash
npm install
npm test
npm run build      # Wrangler dry-run only
npx wrangler deploy # deploy the linked Cloudflare Worker
```

Cloudflare → Workers & Pages → **dapp-support-agent** → Settings → Builds: use GitHub repository `trantanlong2411-droid/dApp-Support-Agent`, branch `main`, project root `/`, deploy command **`npx wrangler deploy`**. A dry-run build **does not deploy**.

[CI tests and live Chain MCP verification](https://github.com/trantanlong2411-droid/dApp-Support-Agent/actions/workflows/verify.yml) checks actual MCP protocol calls, both networks and the Worker bundle.

## Privacy and safe operation

The site does not ask for Telegram tokens, bot secrets, wallet signatures, passwords or private keys. Transactions are public on-chain information. URL and transaction hash are not secret, but exercise care if an address can identify you. The front-end never executes a model prompt or arbitrary code from transaction metadata. Error text is shown with `textContent` to prevent HTML injection. All outgoing diagnostic calls use configured fixed network endpoints.

## References

- [Pharos MCP repository, tools and hosted endpoint](https://github.com/PharosNetwork/pharos-mcp)
- [Ethereum JSON-RPC receipt semantics](https://ethereum.org/developers/docs/apis/json-rpc/#eth_gettransactionreceipt)
- [Ethers v6 error/revert decoding](https://docs.ethers.org/v6/api/utils/errors/)
