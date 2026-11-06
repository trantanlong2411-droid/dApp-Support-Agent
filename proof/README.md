# dApp Support Agent — reviewer evidence status

**Challenge:** Easy / Support & Reporting · 50 points (+50 for an optional walk-through video).

**Repo:** https://github.com/trantanlong2411-droid/dApp-Support-Agent

**Live app:** https://dapp-support-agent.trantanlong2411.workers.dev/

## What has been independently verified

- Source and 8 automated tests, including official MCP streamable HTTP session and distinct failures.
- Cloudflare Worker successfully builds and serves the public website.
- Actual Pharos mainnet Chain MCP tools work against chain 1672; live Mainnet transaction `0x1d4a1ad3b359246a2a8be4fa8ed9a88b37c45c06b5e2a1411b016af0e24dbb5f` is confirmed successful. It proves the live connection but **is not a failed transaction**.
- Actual Atlantic Testnet RPC reads real, successful transaction `0x4a603ea2d43512a76cc21f2d64b09e1ec4e07c34adc929526b514289ccfa61e1`. It is also **not** an on-chain failed transaction.
- Three deterministic **simulation-only** diagnostic paths: contract revert, insufficient allowance, and probable out-of-gas. An additional pre-broadcast gas-insufficiency case explains why it cannot have a mined hash.
- Production smoke test verifies both live network paths and confirms the demos are labeled synthetic.

## Five genuine Mainnet failures now available in the public dashboard

[Actual official MCP block/receipt verification workflow](https://github.com/trantanlong2411-droid/dApp-Support-Agent/actions/runs/42182142624) checked real blocks and found five \`status:0x0\` receipts. The [curated JSON record](./verified-mainnet-failed-transactions.json) contains verified hash, block, gas used/limit and the diagnosis confidence. Public \`/api/verified-failures\` and the interactive dashboard let Pharos reviewers rerun each real hash without an admin password.

The checks do **not** prove three distinct on-chain root causes. The generic revert and unknown-cause outcomes are presented accurately, while three different synthetic test fixtures demonstrate classifier capabilities. The user can supply other confirmed failed hashes to strengthen the last rubric item.

## Task rubric and missing evidence

| Requirement | Status |
|---|---|
| Input hash, fetch transaction and receipt via Chain MCP | **Verified on Mainnet** |
| Explain revert / gas / token approval failure with supporting data | **Unit tests passed; live failure hash needed** |
| Plain-language explanation and possible fix | **Implemented and verified in sample cases** |
| Three distinct failed on-chain scenarios | **Not yet proven with three real failed receipts** |

Reviewers can use the website to validate the implementation, but do not say three *actual* failures were verified until real receipt hashes, logs and diagnosis types have been checked and saved. Never invent failing transaction hashes.

The read-only discovery tool `scripts/discover-failed-transactions.mjs` can search a bounded window of recent Mainnet blocks for genuine status-0 receipts via the official hosted MCP. Its GitHub workflow archives candidates without claiming three distinct root causes unless the evidence supports them.

## How the owner can finish testing

1. Open public homepage and test the three simulation cards to understand expected explanations.
2. Select Mainnet and paste a real known failed Pharos Mainnet transaction. Result must show `FAILED`, evidence `receipt.status 0x0` and a cautious, supported reason.
3. Repeat with hashes from different failure classes, ideally with distinct decoded revert errors and a possible gas exhaustion case.
4. Capture three results along with actual explorer links, keep addresses public and no wallet keys.
5. Submit live Worker URL as Proof Link, GitHub as Repo Link, and explain the three cases in natural-language reviewer notes. No additional proof page needed.

See [main README](../README.md) and [CI Actions](https://github.com/trantanlong2411-droid/dApp-Support-Agent/actions).
