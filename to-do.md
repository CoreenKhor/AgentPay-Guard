# Engineering Task Board & Implementation Tracker

## 1. Project Overview & Branch Strategy

AgentPay Guard is an inline financial governance layer for autonomous agents on Solana. To enable parallel execution without merge conflicts, work is divided into three distinct functional roles. 

Team members will select their preferred role from the three options below and link their feature branch accordingly:

| Role / Domain | Assigned Teammate | Available Branches | Primary Directories |
|---|---|---|---|
| **Role 1: Solana On-Chain & Financial Hub** | `[Member 1 - TBD]` | `coreen` / `jish` / `vera` | `programs/agentpay-guard/`, `tests/anchor/` |
| **Role 2: PayBind Engine & Agent Interceptor** | `[Member 2 - TBD]` | `coreen` / `jish` / `vera` | `packages/paybind-core/`, `packages/agent-sdk/` |
| **Role 3: Anomaly Sentinel, HITL & Dashboard** | `[Member 3 - TBD]` | `coreen` / `jish` / `vera` | `packages/anomaly-sentinel/`, `packages/dashboard/` |
| **Shared Infrastructure** | All Members | `main` | Root, `tests/adversarial/`, `assets/` |

> *Note: Pre-created feature branches (`coreen`, `jish`, `vera`) are ready on the remote. Once members claim their roles, update the table above with your chosen branch and name.*

### Git Workflow Guidelines
1. Pull latest `main` before starting work:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
2. Work strictly inside your assigned directories on your designated branch:
   ```bash
   git checkout <your-branch>
   ```
3. Push branch updates regularly to remote:
   ```bash
   git push origin <your-branch>
   ```
4. Merge protocol: Push from your feature branch, test integration, and merge into `main`.

---

## 2. Directory Layout & Module Allocation

```text
AgentPay-Guard/
├── README.md                          # Architectural specification & threat model (Shared)
├── to-do.md                           # Team task board & progress tracker (Shared)
├── programs/                          # [Member 1 - TBD]
│   └── agentpay-guard/
│       ├── src/
│       │   ├── lib.rs                 # Program entrypoint & instruction dispatch
│       │   ├── state/                 # Account structs: VaultAuthority, ExecutionReceipt, Policy
│       │   ├── instructions/          # Handlers: initialize, bind_payment, settle, freeze
│       │   └── errors.rs              # Program-specific error definitions
│       └── Cargo.toml
├── packages/
│   ├── paybind-core/                  # [Member 2 - TBD] Cryptographic intent binding & JSON hashing
│   ├── agent-sdk/                     # [Member 2 - TBD] Runtime interceptor for LangChain / ElizaOS
│   ├── anomaly-sentinel/              # [Member 3 - TBD] Sliding-window rate limiter & loop detection
│   └── dashboard/                     # [Member 3 - TBD] Telemetry visualizer & HITL escalation portal
├── assets/
│   ├── diagrams/                      # System diagrams & architecture flows
│   └── screenshots/                   # Verification captures & demo graphics
├── tests/
│   ├── anchor/                        # [Member 1 - TBD] LiteSVM & Bankrun smart contract unit tests
│   └── adversarial/                   # [All Members] Prompt injection & infinite loop test harness
└── .agents/skills/                    # Team reference playbooks & procedural skills (Shared)
```

---

## 3. Implementation Progress

### Completed Foundation (What Has Been Done So Far)
- [x] Initialized Git repository workspace and synchronized with upstream.
- [x] Authored architectural specification, threat model, and technical roadmap in `README.md`.
- [x] Formulated four-layer verification protocol (PayBind, Anomaly Sentinel, Deterministic Policy, Financial Hub).
- [x] Generated high-contrast native SVG architecture diagram (`assets/diagrams/protocol_architecture.svg`) and verified GitHub rendering.
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

## 4. Work Breakdown by Role (Pending Team Selection)

### Role 1: Solana On-Chain & Financial Hub Lead (`Member 1 - TBD`)
*Reference Skills: [solana-anchor-development](.agents/skills/solana-anchor-development/SKILL.md) & [agent-wallet-security](.agents/skills/agent-wallet-security/SKILL.md)*

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

### Role 2: PayBind Engine & Agent Interceptor Lead (`Member 2 - TBD`)
*Reference Skills: [paybind-intent-protocol](.agents/skills/paybind-intent-protocol/SKILL.md) & [agent-middleware-interceptor](.agents/skills/agent-middleware-interceptor/SKILL.md)*

- [ ] **PayBind Core Package (`packages/paybind-core/`):**
  - [ ] Implement RFC 8785 JSON canonicalizer to guarantee deterministic serialization across languages.
  - [ ] Implement SHA-256 and BLAKE3 payload hashing for service quotes, API requests, and response schemas.
  - [ ] Build intent verification utilities to compare received response hashes against registered quotes.
- [ ] **Spending Policy Engine:**
  - [ ] Implement local deterministic rule evaluator: per-transaction cap, 24-hour rolling budget, destination allowlist.
  - [ ] Add policy violation classification: distinguish between hard rejection vs. HITL-eligible conditions.
- [ ] **Agent Runtime Interceptor (`packages/agent-sdk/`):**
  - [ ] Create wrapper around Solana `@solana/web3.js` Connection and Keypair wallet adapters.
  - [ ] Intercept transaction requests before signing; invoke PayBind hashing and local policy checks.
  - [ ] Provide drop-in integration plugin/middleware for ElizaOS, LangChain, and Solana Agent Kit.
- [ ] **SDK Unit Tests:**
  - [ ] Test transaction interception, payload binding digest accuracy, and error return strings.

---

### Role 3: Anomaly Sentinel, HITL & Dashboard Lead (`Member 3 - TBD`)
*Reference Skills: [velocity-heuristics-sentinel](.agents/skills/velocity-heuristics-sentinel/SKILL.md) & [hitl-escalation-workflow](.agents/skills/hitl-escalation-workflow/SKILL.md)*

- [ ] **Velocity Heuristics Engine (`packages/anomaly-sentinel/`):**
  - [ ] Implement sliding-window rate limiter: $T_1$ (10s burst), $T_2$ (60s acceleration), $T_3$ (hourly cap).
  - [ ] Implement recursive reasoning loop detector (LRU ring buffer tracking identical tool call fingerprints).
  - [ ] Build automated circuit breaker client: automatically invokes `freeze_vault` on-chain when anomaly threshold is reached.
- [ ] **Human-in-the-Loop (HITL) Gateway:**
  - [ ] Implement ephemeral ticket manager with UUID and expiration timeout (e.g. 180 seconds).
  - [ ] Build escalation notification dispatcher (Webhook / Telegram bot / WebSocket).
  - [ ] Implement cryptographic authorization ticket signer for human approval callbacks.
- [ ] **Telemetry Dashboard (`packages/dashboard/`):**
  - [ ] Build frontend interface showing real-time agent transaction streams, current velocity meters, and active policies.
  - [ ] Display blocked attack notifications with reason codes and session inspection view.
  - [ ] Add one-click manual freeze/unfreeze operator controls.

---

## 5. Team Milestones & Integration Points

| Milestone | Target Date | Integration Dependencies | Deliverable |
|---|---|---|---|
| **M1: Interface Freeze** | Day 3 | Member 1, Member 2, Member 3 | Finalized instruction schemas, Borsh structures, IPC signatures |
| **M2: Core Engines Complete** | Day 8 | Independent branches | Anchor contract compiled, PayBind hashing validated, Sentinel algorithms running |
| **M3: End-to-End Pipeline** | Day 13 | Role 1 + Role 2 + Role 3 | Agent tool call intercepted -> Sentinel verified -> On-chain settled |
| **M4: Attack Suite Validation** | Day 17 | All branches merged to `main` | Passing simulation of prompt injection drain and recursive loops |
| **M5: Colosseum Submission** | Day 21 | Final release | Devnet deployment, live dashboard, 3-minute video walkthrough |

---

## 6. Shared Adversarial Test Suite (`tests/adversarial/`)
*Reference Skill: [adversarial-attack-simulation](.agents/skills/adversarial-attack-simulation/SKILL.md)*

- [ ] **ATK-01 (Prompt Injection Drain):** Agent prompted to transfer entire balance to attacker. Must be blocked by policy allowlist and circuit breaker.
- [ ] **ATK-02 (Infinite Inference Loop):** Agent caught in repetitive tool cycle. Must be halted within 3 iterations by Anomaly Sentinel.
- [ ] **ATK-03 (Payload Substitution):** Rogue provider returns tampered data. Must fail PayBind digest validation.
- [ ] **ATK-04 (Receipt Replay):** Expired or replayed receipt submitted to chain. Must fail PDA collision / nonce validation.
