# Engineering Task Board & Implementation Tracker

## 1. Project Overview & Branch Strategy

AgentPay Guard is an inline financial governance layer for autonomous agents on Solana. To enable parallel execution without merge conflicts, work is divided across dedicated feature branches based on module boundaries:

| Contributor | Feature Branch | Core Ownership | Primary Directories |
|---|---|---|---|
| **Coreen** | `coreen` | Backend: Solana On-Chain Programs, Vault PDAs, Financial Hub | `programs/agentpay-guard/`, `tests/anchor/` |
| **Jish** | `jish` | Backend: PayBind Engine, Anomaly Sentinel, Agent SDK Interceptor | `packages/paybind-core/`, `packages/anomaly-sentinel/`, `packages/agent-sdk/` |
| **Vera** | `vera` | Frontend: Telemetry Dashboard, HITL Escalation Portal & Visualizer | `packages/dashboard/` |
| **Shared** | `main` | Production-ready, verified integration builds | Root, `tests/adversarial/`, `assets/` |

### Git Workflow Guidelines
1. Pull latest `main` before starting: `git fetch origin && git rebase origin/main`
2. Work strictly inside your assigned directories and branch:
   - Coreen: `git checkout coreen` (On-Chain Backend)
   - Jish: `git checkout jish` (Off-Chain Engine & Middleware Backend)
   - Vera: `git checkout vera` (Frontend Dashboard & UI Portal)
3. Push branch updates regularly to remote: `git push origin <branch-name>`
4. Submit PRs against `main` for milestone integrations with passing unit/integration tests.

---

## 2. Directory Layout & Module Allocation

```text
AgentPay-Guard/
├── README.md                          # Architectural specification & threat model (Shared)
├── to-do.md                           # Team task board & progress tracker (Shared)
├── programs/                          # [Backend: Coreen]
│   └── agentpay-guard/
│       ├── src/
│       │   ├── lib.rs                 # Program entrypoint & instruction dispatch
│       │   ├── state/                 # Account structs: VaultAuthority, ExecutionReceipt, Policy
│       │   ├── instructions/          # Handlers: initialize, bind_payment, settle, freeze
│       │   └── errors.rs              # Program-specific error definitions
│       └── Cargo.toml
├── packages/
│   ├── paybind-core/                  # [Backend: Jish] Cryptographic intent binding & canonical JSON hashing
│   ├── agent-sdk/                     # [Backend: Jish] Runtime interceptor for LangChain / ElizaOS
│   ├── anomaly-sentinel/              # [Backend: Jish] Sliding-window rate limiter & loop detection daemon
│   └── dashboard/                     # [Frontend: Vera] Telemetry visualizer & HITL escalation portal
├── assets/
│   ├── diagrams/                      # System diagrams & architecture flows
│   └── screenshots/                   # Verification captures & demo graphics
├── tests/
│   ├── anchor/                        # [Backend: Coreen] LiteSVM & Bankrun smart contract unit tests
│   └── adversarial/                   # [All] Prompt injection & infinite loop test harness
└── .agents/skills/                    # Team reference playbooks & procedural skills (Shared)
```

---

## 3. Implementation Progress

### Completed Foundation (What Has Been Done So Far)
- [x] Initialized Git repository workspace and synchronized with upstream.
- [x] Authored architectural specification, threat model, and technical roadmap in `README.md`.
- [x] Formulated four-layer verification protocol (PayBind, Anomaly Sentinel, Deterministic Policy, Financial Hub).
- [x] Scaffolded modular directory layout (`programs/`, `packages/`, `tests/`, `assets/`).
- [x] Authored 7 technical engineering skills in `.agents/skills/`:
  - `solana-anchor-development`
  - `agent-wallet-security`
  - `paybind-intent-protocol`
  - `agent-middleware-interceptor`
  - `velocity-heuristics-sentinel`
  - `hitl-escalation-workflow`
  - `adversarial-attack-simulation`
- [x] Established Git branch structure (`main`, `coreen`, `jish`, `vera`).

---

## 4. Work Breakdown by Team Member

### Coreen (`coreen` branch) — Backend: Solana On-Chain & Financial Hub Lead
*Reference Skill: [solana-anchor-development](.agents/skills/solana-anchor-development/SKILL.md) & [agent-wallet-security](.agents/skills/agent-wallet-security/SKILL.md)*

- [ ] **Anchor Program Setup:**
  - [ ] Initialize Anchor workspace inside `programs/agentpay-guard/`.
  - [ ] Configure `Anchor.toml` for Solana Devnet and Localnet.
- [ ] **State Machine & Account Modeling (`src/state/`):**
  - [ ] Implement `VaultAuthority` PDA: agent pubkey, sentinel pubkey, bump, freeze status, daily budget.
  - [ ] Implement `SpendingPolicy` PDA: per-tx limit, allowed program/recipient IDs, daily volume accumulator.
  - [ ] Implement `ExecutionReceipt` PDA: session ID, payload hash, amount, timestamp.
- [ ] **Instruction Handlers (`src/instructions/`):**
  - [ ] `initialize_vault`: Set up agent treasury vault PDA and bind authority keys.
  - [ ] `update_policy`: Modify spending limits and recipient whitelist.
  - [ ] `settle_payment`: Atomically verify payload hash, log receipt, and disburse SOL/tokens via PDA signer seeds.
  - [ ] `freeze_vault`: Emergency freeze callable by `sentinel_key` to halt all transfers immediately.
- [ ] **Contract Testing:**
  - [ ] Write Bankrun / LiteSVM tests covering successful settlement, unauthorized signer rejections, and freeze transitions.

---

### Jish (`jish` branch) — Backend: PayBind Engine, Sentinel & Interceptor Lead
*Reference Skill: [paybind-intent-protocol](.agents/skills/paybind-intent-protocol/SKILL.md), [agent-middleware-interceptor](.agents/skills/agent-middleware-interceptor/SKILL.md) & [velocity-heuristics-sentinel](.agents/skills/velocity-heuristics-sentinel/SKILL.md)*

- [ ] **PayBind Core Package (`packages/paybind-core/`):**
  - [ ] Implement RFC 8785 JSON canonicalizer to guarantee deterministic serialization across languages.
  - [ ] Implement SHA-256 and BLAKE3 payload hashing for service quotes, API requests, and response schemas.
  - [ ] Build intent verification utilities to compare received response hashes against registered quotes.
- [ ] **Spending Policy Engine:**
  - [ ] Implement local deterministic rule evaluator: per-transaction cap, 24-hour rolling budget, destination allowlist.
  - [ ] Add policy violation classification: distinguish between hard rejection vs. HITL-eligible conditions.
- [ ] **Velocity Heuristics & Anomaly Sentinel (`packages/anomaly-sentinel/`):**
  - [ ] Implement sliding-window rate limiter: $T_1$ (10s burst), $T_2$ (60s acceleration), $T_3$ (hourly cap).
  - [ ] Implement recursive reasoning loop detector (LRU ring buffer tracking identical tool call fingerprints).
  - [ ] Build automated circuit breaker daemon: automatically invokes `freeze_vault` on-chain when anomaly threshold is reached.
- [ ] **Agent Runtime Interceptor (`packages/agent-sdk/`):**
  - [ ] Create wrapper around Solana `@solana/web3.js` Connection and Keypair wallet adapters.
  - [ ] Intercept transaction requests before signing; invoke PayBind hashing and local policy checks.
  - [ ] Provide drop-in integration plugin/middleware for ElizaOS, LangChain, and Solana Agent Kit.
- [ ] **SDK & Sentinel Unit Tests:**
  - [ ] Test transaction interception, payload binding digest accuracy, and error return strings.
  - [ ] Test rate-limiter windows and loop-detection triggers.

---

### Vera (`vera` branch) — Frontend: Telemetry Dashboard & HITL Escalation Lead
*Reference Skill: [hitl-escalation-workflow](.agents/skills/hitl-escalation-workflow/SKILL.md)*

- [ ] **Telemetry Dashboard Web Application (`packages/dashboard/`):**
  - [ ] Scaffold modern dashboard UI (Vite / Next.js + CSS tokens & components).
  - [ ] Build real-time agent activity feed and transaction visualizer.
  - [ ] Create live velocity & acceleration metric gauges ($T_1, T_2, T_3$ visual indicators).
  - [ ] Display active spending policies, whitelist addresses, and vault balance overviews.
- [ ] **Security Alerts & Anomaly Inspector View:**
  - [ ] Build blocked attack notification stream with reason codes, violation types, and payload diff views.
  - [ ] Add one-click manual emergency freeze / unfreeze operator trigger controls.
- [ ] **HITL Human Escalation Approval Portal:**
  - [ ] Implement interactive approval queue for transactions exceeding standard thresholds.
  - [ ] Render countdown timers for expiring tickets (e.g. 180s expiration window).
  - [ ] Add one-click approve/reject actions with signature dispatching.
- [ ] **Frontend Integration & E2E Testing:**
  - [ ] Connect dashboard WebSocket/REST endpoints to backend Sentinel and on-chain RPC feeds.
  - [ ] Ensure responsive layout, dark mode styling, and high-fidelity operator UX.

---

## 5. Team Milestones & Integration Points

| Milestone | Target Date | Integration Dependencies | Deliverable |
|---|---|---|---|
| **M1: Interface Freeze** | Day 3 | Coreen, Jish, Vera | Finalized instruction schemas, Borsh structures, IPC signatures |
| **M2: Core Engines Complete** | Day 8 | Independent branches | Anchor contract compiled, PayBind hashing validated, Sentinel algorithms running |
| **M3: End-to-End Pipeline** | Day 13 | `coreen` + `jish` + `vera` | Agent tool call intercepted -> Sentinel verified -> On-chain settled |
| **M4: Attack Suite Validation** | Day 17 | All branches merged to `main` | Passing simulation of prompt injection drain and recursive loops |
| **M5: Colosseum Submission** | Day 21 | Final release | Devnet deployment, live dashboard, 3-minute video walkthrough |

---

## 6. Shared Adversarial Test Suite (`tests/adversarial/`)
*Reference Skill: [adversarial-attack-simulation](.agents/skills/adversarial-attack-simulation/SKILL.md)*

- [ ] **ATK-01 (Prompt Injection Drain):** Agent prompted to transfer entire balance to attacker. Must be blocked by policy allowlist and circuit breaker.
- [ ] **ATK-02 (Infinite Inference Loop):** Agent caught in repetitive tool cycle. Must be halted within 3 iterations by Anomaly Sentinel.
- [ ] **ATK-03 (Payload Substitution):** Rogue provider returns tampered data. Must fail PayBind digest validation.
- [ ] **ATK-04 (Receipt Replay):** Expired or replayed receipt submitted to chain. Must fail PDA collision / nonce validation.
