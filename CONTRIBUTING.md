# Contributing to Modular Mobile Repair Lab & Retail ERP

Welcome to the **Modular Mobile Repair Lab, Retail POS & Fintech ERP** repository. This document establishes the mandatory engineering standards, Spec-Driven Development (SDD) lifecycle, review protocols, and governance invariants that every contributor — whether human engineer or autonomous AI agent — MUST strictly follow.

---

## 1. Branching & Commits

### 1.1 Branch Strategy
- **Base Branch:** All work branches originate from and merge back into `main` (or active milestone release branch).
- **Naming Standard:** Every branch must follow the pattern:
  ```text
  feature/NNN-feature-name
  ```
  *(e.g. `feature/001-durability-wal-full`, `feature/002-repair-kanban-board`)*
- Direct pushes or commits to `main` without an approved Review Brief are strictly prohibited.

### 1.2 Commit Discipline
- **Granularity:** Exactly **one commit per completed task** (`≤ 2h` unit of work).
- **Conventional Commits Standard:** All commit messages must follow the Conventional Commits specification:
  - `feat:` New user-facing or domain feature
  - `fix:` Bug fix or invariant restoration
  - `test:` Adding or updating automated tests
  - `chore:` Dependency, build configuration, or tooling maintenance
  - `docs:` Documentation and architecture memory changes
  - *(Example: `feat(repair): enforce mandatory QA checklist before READY status`)*

### 1.3 Git Hygiene & Forbidden Files
The following files and patterns must **NEVER** be staged or committed:
- **Environment Secrets:** `.env`, `.env.local`, `.env.production`
- **Database Binaries:** `server/data/erp.db`, `*.db`, `*.db-shm`, `*.db-wal`
- **Backup Archives:** `server/backups/*.db`, `backups/`, `*.tar.gz`, `*.zip`
- **Agent Scratch Files:** `.specify/memory/scratch/*`, `.gemini/*`, temporary diagnostic scripts

---

## 2. Spec-Driven Workflow (SpecKit)

This project operates on **Spec-Driven Development (SDD)**. Code changes never precede verified specifications and architectural consensus. Development strictly executes through the SpecKit slash-command lifecycle:

```text
  /speckit.specify  ---> Drafts structured feature specification from business requirements
        |
        v
  /speckit.clarify  ---> Asks targeted questions to eliminate underspecified requirements
        |
        v
  /speckit.plan     ---> Generates technical architecture and implementation plan
        |
        v
  /speckit.tasks    ---> Produces dependency-ordered, test-driven task list (≤ 2h units)
        |
        v
  /speckit.analyze  ---> Validates cross-artifact consistency across spec, plan, and tasks
        |
        v
  /speckit.implement ---> Executes tasks in bounded batches with adversarial review gates
```

### 2.1 Specification Rules
- **Requirement IDs:** Every functional requirement must carry a monotonic ID: `FR-NNN` (Functional Requirement) or `NFR-NNN` (Non-Functional Requirement).
- **Version Header:** Every specification document must lead with a formal version header (e.g. `Version: 1.0.0 | Date: YYYY-MM-DD | Status: Draft / Ratified`).
- **Traceability:** User stories must explicitly map to corresponding `FR-NNN` IDs.

### 2.2 Task Breakdown Rules
- **Granularity:** Each task in `tasks.md` must represent $\le 2\text{ hours}$ of focused implementation work.
- **Task Metadata:** Every task entry must explicitly state:
  1. Priority level (`P0` Blocker, `P1` Core, `P2` Polish/Non-Blocking).
  2. Concrete prerequisites and dependencies (e.g. `Depends on: Task 1.1`).
  3. Explicit, automated test pass criteria.

### 2.3 Batching & Forced Checkpoints
- **Batch Ceiling:** Implementers may execute at most **3 independent tasks** before stopping for review.
- **Forced Checkpoints:** Execution must **STOP immediately** and present a Review Brief BEFORE proceeding if the next task touches:
  - Database schema, table structures, or SQLite PRAGMAs (`database.ts`, `migrations.ts`).
  - Core architectural boundaries or the Constitution (`.specify/memory/constitution.md`).
  - Security, authentication, or network firewall perimeters (`subnet-guard.ts`, `auth.router.ts`).
  - Financial ledger balancing or money representation (`accounting/`, `currency.ts`).

---

## 3. Adversarial Review Protocol

Quality assurance in this repository is governed by an **Adversarial Review Protocol**. Code is not presumed correct because it compiles; it must withstand active, skeptical scrutiny.

### 3.1 Hostile Reviewer Persona (Canonical Copy)

> **Persona Invariant:**  
> *"You are an adversarial, relentlessly thorough code and architecture reviewer. You do NOT assume good faith or correctness. Your job is to actively hunt down edge cases, silent regressions, unchecked invariants, fabricated data, missing citations, floating-point math leaks in monetary paths, bypasses of manager overrides, unindexed queries, and missing automated tests. You scrutinize every single diff line against the Constitution (`.specify/memory/constitution.md`) and ratified ADRs (`.specify/memory/decisions.md`). If an implementer claims tests pass, you demand to see the verbatim terminal output. If an implementer claims an invariant holds, you verify the code enforcement at runtime and schema boundary. You never approve work based on optimism or superficial compilation."*

### 3.2 Sub-Agent Execution Preference
Where the runtime environment supports sub-agents (e.g. `invoke_subagent` using the `code-review` or `research` subagent), the review MUST be conducted by an independent sub-agent session with clean context to eliminate cognitive bias inherited from the implementation phase.

### 3.3 The Canonical Review Brief Format (Verbatim)

Every review checkpoint must present this exact markdown structure:

```markdown
### Review Brief: [Task-ID] - [Task Title]

- **Commit:** `<commit-hash>` | **Branch:** `feature/<NNN-feature-name>`
- **Feature / Spec Link:** `specs/[spec-dir]/spec.md` (FR-NNN / NFR-NNN)
- **Task Link:** `specs/[spec-dir]/tasks.md` (Task ID)
- **Touched Files:**
  - `[NEW]` `path/to/new-file.ts#L1-L80`
  - `[MODIFY]` `path/to/modified-file.ts#L45-L95`
  - `[DELETE]` `path/to/obsolete-file.ts`
- **Touched Governance & Risks:**
  - Linked Decisions: `DEC-NNN` / `ADR-NNN`
  - Linked Risks: `RISK-NNN` (Current status: `Mitigating` / `Mitigated`)

- **Contract & Boundary Invariants:**
  - [ ] Universal integer-piastre compliance verified (Zero floating-point money calculations)
  - [ ] HTTP status code taxonomy strictly aligned (400 Client Bad Request vs 403 Forbidden vs 409 Conflict vs 422 Unprocessable Entity)
  - [ ] Subnet LAN-only isolation respected (DEC-020, zero external cloud dependencies)
  - [ ] Forensic audit log entries emitted synchronously with mandatory justification for sensitive mutations

- **Adversarial Findings (Hostile Reviewer Audit Trail):**
  - **Vector 1:** [Specific attack, bypass, or boundary violation attempted by hostile reviewer persona]
    - *Outcome:* [Blocked / Handled / Rejection reason]
  - **Vector 2:** [Specific failure mode, race condition, or integer overflow attempted]
    - *Outcome:* [Blocked / Handled / Rejection reason]

- **Edge Cases & Failure Modes Handled:**
  - [Edge Case / Failure Mode 1]: [HOW verified: exact test suite/name, manual reproduction step, or formal invariant reasoning]
  - [Edge Case / Failure Mode 2]: [HOW verified: exact test suite/name, manual reproduction step, or formal invariant reasoning]

- **Execution & Test Evidence:**
  ```bash
  # Verbatim command executed:
  npm test
  # Verbatim terminal output showing passing assertions:
  🏁 AUTOMATED TEST RESULTS: 159 PASSED, 0 FAILED (66 Suites)
  ```

- **Residual Risk & Honest Gaps:**
  - [Explicit disclosure of any edge cases, mock boundaries, or pending manual verifications]
```

### 3.4 The Blocking Rule
> [!CAUTION]
> **The Blocking Rule:**  
> Any unchecked verification box, any checkmark asserted without concrete file/line citations, or any claim of passing tests lacking verbatim terminal execution output **AUTOMATICALLY REJECTS the Review Brief**. Execution of the next task batch is strictly blocked until all items are proven with verifiable evidence.

---

## 4. Evidence-Based Definition of Done (DoD)

A task, pull request, or milestone is declared **DONE** only when all four of the following criteria are indisputably satisfied:

1. **Tests Actually Executed with Output Shown:**
   - Code that "compiles without errors" or "looks correct" is **NOT DONE**.
   - Automated tests covering positive path, boundary conditions, and invalid inputs must execute, with the verbatim terminal pass count reported.
   - The baseline test suite (`159 PASSED, 0 FAILED` across 66 suites) must experience zero regressions.
2. **Zero Open TODOs or Mocks:**
   - Production code must contain zero `// TODO`, `// FIXME`, placeholder mocks, or simulated dummy functions in core transaction paths.
3. **Documentation & Memory Synchronization:**
   - All touched files, new endpoints, and schema changes must be documented in the relevant `.specify/memory/` registers.
   - [progress.md](file:///.specify/memory/progress.md) must reflect the updated task states and monotonic counters.
4. **The Mitigated Rule for Risks:**
   - A risk in [risks.md](file:///.specify/memory/risks.md) may transition to `Mitigated` **ONLY** in the presence of passing automated test evidence or written owner sign-off.
   - Architectural designs or unimplemented plans strictly warrant `Mitigating`. The status `Open` is reserved for risks requiring pending external human action.

---

## 5. Change Management & Governance Invariants

### 5.1 Constitution Amendments (Protocol & Precedent)
The project Constitution ([constitution.md](file:///.specify/memory/constitution.md)) is the supreme architectural authority.
- **Amendment Protocol:** Modifying the Constitution requires:
  1. Incrementing the document version number (e.g. `v1.0.0` $\to$ `v1.0.1`).
  2. Recording an entry in Section 8 (*Amendment Log*) containing the version, calendar date, rationale, and ratified decision IDs.
  3. Explicit, documented ratification by the project owner.
- **The v1.0.1 Precedent (Substance-Then-Process Cure):**
  When DEC-041 warranty rules were initially drafted into §2.1.4 without an immediate version increment, the substance was retroactively confirmed by the owner, but a formal protocol reminder was recorded, the version bumped from `1.0.0` to `1.0.1`, and the entry formally logged. Silent or un-versioned constitutional modifications are strictly banned.

### 5.2 Architectural Decision Records (ADRs & Freeze Rules)
The Decisions Register ([decisions.md](file:///.specify/memory/decisions.md)) is a **CLOSED, FROZEN** register.
- **Freeze Rules:** No ADR may be edited or rewritten arbitrarily. Changes to closed decisions are legitimate ONLY via:
  1. A new authoritative owner decision (`DEC-NNN`).
  2. Full-text review and explicit approval by the project owner.
  3. A formal amendment note appended to the record or a new superseding ADR.
- **The DEC-042 Precedent:**
  When ADR-033 was found to assert a photographic evidence requirement not originally in DEC-033, the owner formally ratified `DEC-042` ("Warranty voiding requires attached photographic evidence AND Manager approval"), reviewed the complete text of `ADR-033`, and tagged the requirement as `[As-Decided per DEC-042]`. Silent edits remain strictly forbidden.

### 5.3 As-Built Dual File-Naming Convention
To prevent file churn while preserving repository structure, contributors must adhere to the established dual naming conventions:
- **Kebab-case (`kebab-case.ts`):** Mandatory for middleware, utility helpers, and core infrastructure files:
  - Examples: `subnet-guard.ts`, `error-handler.ts`, `correlation.ts`, `feature-flag.ts`.
- **camelCase with Dot-Role (`camelCase.dotRole.ts`):** Mandatory for domain services, routers, and business logic:
  - Examples: `repair.service.ts`, `repair.router.ts`, `trade-in.service.ts`, `installments.service.ts`.
- **PascalCase (`PascalCase.tsx`):** Mandatory for all React views, modals, and UI components:
  - Examples: `PosView.tsx`, `RepairLabView.tsx`, `QAChecklistModal.tsx`.

### 5.4 Monotonic Identifier Discipline
Counters for project artifacts are strictly monotonic and permanent across the lifetime of the system:
- `ASM-001`..`ASM-011` (Assumptions)
- `RISK-001`..`RISK-011` (Risks)
- `AMB-001`..`AMB-047` (Ambiguities)
- `DEC-001`..`DEC-042` (Owner Decisions)
- `ADR-001`..`ADR-040` (Architecture Decision Records)
- `FR-NNN` / `NFR-NNN` (Feature Requirements)
Once assigned, an identifier is **never deleted, reused, or renumbered**. If a decision or requirement is superseded, it is marked as `Superseded by [ID]`, preserving historical traceability.

---

## 6. Glossary Compliance & Ubiquitous Language

All code, variable names, database columns, API routes, user interface labels, and specification documents must strictly align with the ubiquitous terminology defined in [glossary.md](file:///.specify/memory/glossary.md).

### 6.1 Strict Semantic Enforcement
- **Repair Ticket (تذكرة الصيانة):** Denotes physical customer device servicing only. Never use to describe retail sales invoices or purchase orders.
- **Shift Handover (تسليم الوردية):** Denotes physical cash drawer reconciliation and device custody counting. Never conflate with calendar midnight (00:00:00) or user logout.
- **Universal Integer-Piastre Precision:** All monetary amounts, taxes, discounts, and ledger entries MUST be stored and computed as 64-bit integers in Egyptian Piastres (`1 EGP = 100 Piastres`). Floating-point types (`REAL`, `float`, `double`, `number` for monetary storage) are strictly prohibited.
- **Trade-In Valuation:** Counter appraisal applying technical deductions for instant purchase discounts. Never confuse with scrap harvesting or warranty returns.

> [!WARNING]
> Any pull request or commit that introduces ambiguous terminology or commits a documented **Invalid Usage** from `glossary.md` will be rejected during adversarial review.
