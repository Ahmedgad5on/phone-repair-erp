# Modular Mobile Repair Lab, Retail POS & Fintech ERP

A mission-critical, local-first on-premise Enterprise Resource Planning (ERP) platform engineered specifically for mobile phone repair laboratories, retail accessory counters, spare parts wholesale distribution, and localized fintech/e-wallet operations in Egypt. The system provides real-time transactional durability, strict inventory-repair allocation isolation, double-entry financial accounting, and forensic audit logging running entirely on an isolated Local Area Network (LAN).

---

> [!IMPORTANT]
> ### Architectural Boundary: LAN-First On-Premise Isolation (DEC-020)
> Under ratified decision **DEC-020**, this system is strictly deployed as an **on-premise local-first application within the store's physical Local Area Network (LAN)**:
> - **Zero Cloud SaaS Dependency:** Internet connection drops never halt point-of-sale checkouts, repair intakes, thermal receipt printing, or cash drawer triggers.
> - **Sub-50ms Hardware Response:** Barcode scanners, thermal ESC/POS printers, and cash drawers interact directly with the local server without web latency.
> - **Absolute Data Sovereignty & Privacy:** Customer device IMEIs, repair passcodes, national IDs, and financial ledgers are strictly forbidden from public cloud exposure. Inbound public web ingress is blocked at the subnet boundary (`subnet-guard.ts`).

---

## Architecture Blueprint

```text
       +-----------------------------------------------------------------------+
       |                         STORE LOCAL AREA NETWORK (LAN)                |
       |                                                                       |
       |  +--------------------+   +--------------------+   +---------------+  |
       |  | Cashier Terminal 1 |   | Cashier Terminal 2 |   | Tech Bench 1  |  |
       |  | (Web Browser /     |   | (Web Browser /     |   | (Web Browser) |  |
       |  |  Vite SPA :3000)   |   |  Electron App)     |   |               |  |
       |  +---------+----------+   +---------+----------+   +-------+-------+  |
       |            |                        |                      |          |
       |            +-------------------+----+----------------------+          |
       |                                | HTTP / REST & WebSockets             |
       |                                v                                      |
       |  +-----------------------------------------------------------------+  |
       |  |                   ON-PREMISE LOCAL SERVER (:5000)               |  |
       |  |                                                                 |  |
       |  |  [Express 5 Node.js API] <---> [Subnet Guard LAN Firewall]      |  |
       |  |            |                                                    |  |
       |  |  +---------v-------------------------------------------------+  |  |
       |  |  |                     Core Engine Layers                    |  |  |
       |  |  |  - Repair Lab State Machine     - Retail POS & Splits     |  |  |
       |  |  |  - Double-Entry General Ledger  - Fintech Wallet Ceiling  |  |  |
       |  |  |  - Inventory & Stocktake Locks  - Forensic Audit Logger   |  |  |
       |  |  +-----------------------------------+-----------------------+  |  |
       |  |                                      |                          |  |
       |  |                                      v                          |  |
       |  |            [SQLite Database (better-sqlite3) in WAL Mode]       |  |
       |  |            - Location: server/data/erp.db                       |  |
       |  |            - Synchronous: NORMAL [As-Built — ratified target:   |  |
       |  |              FULL per DEC-001/ADR-001, pending implementation]  |  |
       |  |            - Hot Online Backups: backups/erp-backup-*.db        |  |
       |  +-----------------------------+-----------------------------------+  |
       |                                | USB / Serial / Network Adapter       |
       |                                v                                      |
       |  +-----------------------------------------------------------------+  |
       |  |                      HARDWARE PERIPHERALS                       |  |
       |  |  - Thermal ESC/POS Receipt Printer (80mm / USB / LAN)           |  |
       |  |  - Electronic Cash Drawer (RJ11/RJ12 Kick via ESC/POS)          |  |
       |  |  - USB Barcode / QR Scanner (HID Keyboard Emulation)            |  |
       |  +-----------------------------------------------------------------+  |
       +-----------------------------------------------------------------------+
```

---

## Institutional Memory & Governance (`.specify/memory`)

This project strictly adheres to **Spec-Driven Development (SDD)**. Code changes never precede verified specifications and architectural consensus. All project governance, constraints, and institutional memory reside canonically within `.specify/memory`:

| File | Canonical Path | Purpose & Scope |
| :--- | :--- | :--- |
| **Constitution** | [constitution.md](file:///.specify/memory/constitution.md) | **Supreme Architectural Law (v1.0.1):** Core pillars, error boundary taxonomy (400 vs 403 vs 409 vs 422), coding standards, rounding laws, and formal amendment protocols. |
| **Decisions Register** | [decisions.md](file:///.specify/memory/decisions.md) | **Permanent ADR Register:** 40 formal Architecture Decision Records (`ADR-001` through `ADR-040`) synthesizing 42 owner decisions (`DEC-001` through `DEC-042`). |
| **Domain Glossary** | [glossary.md](file:///.specify/memory/glossary.md) | **Ubiquitous Domain Language (v1.0.0):** 12 ratified domain terms, technical scopes, mathematical invariants, and explicit **Invalid Usages**. |
| **Risk Register** | [risks.md](file:///.specify/memory/risks.md) | **Forensic Risk Management:** 11 tracked systemic risks (`RISK-001` through `RISK-011`) with evidence-based mitigation proofs. |
| **Progress Tracker** | [progress.md](file:///.specify/memory/progress.md) | **Monotonic State Tracker:** Master checklist, discovery history, active phase gates, and monotonic counter integrity (`ASM`, `RISK`, `AMB`, `DEC`, `ADR`). |

### Session Bootstrap Protocol (How a New Agent/Engineer Resumes State)

When beginning a new session or resuming implementation, you must bootstrap context in this exact chronological order:

```text
  Step 1: Read .specify/memory/progress.md
          -> Identify current phase, active task, open gates, and monotonic counter values.
  Step 2: Read .specify/memory/constitution.md
          -> Load non-negotiable architectural pillars, HTTP error mappings, and coding invariants.
  Step 3: Read .specify/memory/glossary.md
          -> Internalize ubiquitous language boundaries and forbidden conceptual confusions.
  Step 4: Check .specify/memory/decisions.md & .specify/memory/risks.md
          -> Review decisions governing the target subsystem and relevant open/mitigating risks.
  Step 5: Output Canonical Session Header:
          [Phase: X | Step: Y | Status: In-Progress | Blockers: None]
```

---

## Local Setup & Development

### Prerequisites
- **Node.js:** `v24.x LTS`
- **Package Manager:** `npm v10+`
- **Operating System:** Windows 10/11 or Ubuntu/Debian Linux on local store host machine
- **Storage:** Local SSD recommended for SQLite WAL performance

### Installation

```bash
# 1. Clone repository and navigate to root
cd /path/to/phone-repair-erp

# 2. Install root and workspace dependencies
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

### Database Initialization & Seeding

The SQLite database (`server/data/erp.db`) automatically creates tables and applies incremental schema migrations on server startup via `runMigrations()`.

To manually run migrations and populate seed data (accounts, admin/cashier/technician users, test inventory, repair tickets, and settings):

```bash
# Execute database migration and seeding
npm run seed
```

### Running the System

```bash
# Option 1: Run full stack concurrently (Backend on :5000 + Frontend on :3000)
npm run dev

# Option 2: Run server only
npm run dev:server

# Option 3: Run client only
npm run dev:client

# Option 4: Launch Native Windows Desktop App (Electron)
npm run electron:start
```

- **Client Web UI:** `http://localhost:3000`
- **Server API Endpoint:** `http://localhost:5000`
- **Swagger / OpenAPI Documentation:** `http://localhost:5000/api/docs`
- **Health Check Endpoint:** `http://localhost:5000/api/health`
- **WebSocket Gateway:** `ws://localhost:5000/ws`

---

## Automated Testing & Test Baseline

The backend test suite is executed using `tsx`:

```bash
# Run full automated regression suite
npm test
```

### Verified Test Baseline: `159 PASSED, 0 FAILED` (66 Suites)

```text
==============================================
🏁 AUTOMATED TEST RESULTS: 159 PASSED, 0 FAILED (66 Suites)
==============================================
```

### What Is Covered:
- **Core Durability & Engine:** SQLite WAL mode verification (`PRAGMA synchronous = NORMAL` [As-Built]), optimistic concurrency locking (`version` column), prepared statement parameterization, and foreign key cascade restrictions (`ON DELETE RESTRICT`).
- **Retail POS & Financial Invariants:** Split payments multi-method balancing (`SUM(tenders) == total`, HTTP 422 on mismatch), installment 6-month integer-piastre amortization, trade-in condition appraisal deductions, and customer credit ceiling enforcement (HTTP 403).
- **Double-Entry Accounting:** Absolute debit/credit balancing ($\sum \text{Debits} \equiv \sum \text{Credits}$, HTTP 422 on unbalanced journal entry), preventing orphan financial lines.
- **Repair Workshop Workflow:** Strict 6-stage linear state machine validation (`RECEIVED` $\to$ `DELIVERED`, rejecting illegal skips with HTTP 422), mandatory QA checklist completion enforcement prior to `READY`, and persistent `sla_started_at` deadline tracking.
- **Managerial & Audit Governance:** Mandatory reason on sale voiding (HTTP 400 if omitted), dual-tier financial approval hierarchy (>5,000 EGP blocked without manager approval per DEC-028), and single-use manager override OTP validation.
- **Security & Backups:** Rate limiting on `/api/auth/login` (6th rapid login attempt blocked with HTTP 429 Too Many Requests after 5 unauthorized attempts, `server/test/api.test.ts#L1216-L1242`), carrier SMS normalization (+20 Egyptian format), and non-blocking SQLite online backup generation.

### Honest Gaps (As-Built Limitations):
- **Durability Pending (RISK-007 / DEC-001):** The database currently runs `synchronous = NORMAL` (which prevents structural SQLite corruption but risks losing recently committed transactions held in the WAL buffer on sudden power loss). The ratified target is `FULL` to guarantee committed sales and repairs survive sudden power cuts without an automated USB-signaled UPS (DEC-027). Implementation is scheduled via the ADR-001 task in Phase 3.
- **Subnet Guard Fallback (RISK-011 / ADR-020):** In development mode, `subnet-guard.ts` currently falls back to `ALLOW` on missing headers rather than strictly rejecting with `HTTP 403 Forbidden`. Ratified mitigation under `ADR-020` is pending implementation.
- **Client Test Coverage:** Frontend React unit tests (`npm run test:client`) are minimal and test execution currently focuses on the server API test suite (`npm test`).
- **Simulated WhatsApp Outbox (DEC-019 / DEC-036):** WhatsApp notification dispatch writes to `whatsapp_messages_log` rather than transmitting over a live external cloud API (strictly conforming to LAN offline isolation).
- **End-to-End UI Automation:** Automated browser E2E test suites (e.g. Playwright / Cypress) are not yet integrated into the CI baseline.
