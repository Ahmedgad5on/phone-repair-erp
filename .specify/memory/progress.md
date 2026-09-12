# SpecKit SDD Progress Tracker

**Last Updated:** 2026-09-12T05:35:00+03:00  
**SpecKit CLI Version:** specify 1.0.6  
**Status:** Phase 1 (Deep Discovery) CLOSED | Phase 2 (Foundation Setup) COMPLETE | Phase 3 (Implementation / Specification) ACTIVE

---

## 1. Current Phase & Sub-Step
- **Phase:** Phase 3: Implementation & Specification Planning (Active)
- **Sub-Step:** Step 3.2 — Batch 1 Hardening Executed (TASK-1.1 & TASK-1.2 Verified, 171 Passing Tests) | Awaiting Owner Gate for Batch 2
- **Phase 2 Closure State:** 100% Complete & Signed Off (All 7 Foundation Artifacts Ratified by Owner)

### 1.1 Foundation Complete Declaration (Phase 2 Ratified Artifacts)

| Artifact | Canonical Path | Version / Scope | Status | Ratification Date |
| :--- | :--- | :--- | :--- | :--- |
| **Constitution** | `.specify/memory/constitution.md` | v1.0.1 (incorporating DEC-041 warranty governance) | Ratified Supreme Law | 2026-09-12 |
| **Decisions Register** | `.specify/memory/decisions.md` | 43 Decisions (`DEC-001`..`043`), 40 ADRs (`ADR-001`..`040`) | 42 CLOSED in Phase 2, DEC-043 Ratified in Phase 3 | 2026-09-12 |
| **Risk Register** | `.specify/memory/risks.md` | 11 Tracked Risks (`RISK-001`..`011`: 1 Open, 8 Mitigating, 2 Mitigated [`RISK-007`, `RISK-011`]) | Active Living Document | 2026-09-12 |
| **Domain Glossary** | `.specify/memory/glossary.md` | v1.0.0 (12 Ratified Domain Terms + Invalid Usages) | Ratified Living Document | 2026-09-12 |
| **Repository README** | `README.md` | Architecture Blueprint, Setup, Baseline (159/66), Honest Gaps | Ratified Master Overview | 2026-09-12 |
| **Contributing Guide** | `CONTRIBUTING.md` | SpecKit SDD Lifecycle, Adversarial Protocol, Dual Naming | Ratified Contributor Standard | 2026-09-12 |
| **Environment Template** | `.env.example` | Operational Config, Secret Placeholders, Settings Distinction | Ratified Environment Spec | 2026-09-12 |

> [!NOTE]
> **Future Candidate (Recorded per Owner Gate C — NOT in Hardening Scope):**  
> `AUTH_SECRET` vs `JWT_SECRET` dual-path — possible consolidation / enforce no-fallback in production. Requires separate future owner gate.

---

## 2. Governance & Protocol Invariants

1. **Unique ID Discipline (FIX-1):** Monotonic counters strictly maintained across project lifetime (`ASM-001`..`ASM-011`, `RISK-001`..`RISK-011`, `AMB-001`..`AMB-047`, `DEC-001`..`DEC-043`, `ADR-001`..`ADR-040`).
2. **DEC to ADR Invariant:** Every architectural decision (`DEC-001` through `DEC-042`) is mapped to a formal architectural decision record (`ADR-001` to `ADR-040`) for Phase 2; Phase 3 decisions (`DEC-043+`) map to ratified spec/plan tasks.
3. **Risk Status Invariant:** `Mitigated` is reserved exclusively for verified, executed proof. In-progress mitigations are marked `Mitigating`.
4. **Canonical Path:** Single authoritative source is `c:\Users\Eng_Ahmed\Desktop\pro\.specify\memory\progress.md`.

---

## 3. Cumulative Ratified Decisions Register (DEC-001 to DEC-043)

| ID | Topic | Confirmed Decision / Technical Invariant | Citation | Date |
|---|---|---|---|---|
| **DEC-001** | Durability Config | `journal_mode = WAL`, `foreign_keys = ON`, `synchronous = FULL`, `busy_timeout = 5000` (Queued as **ADR-001**) | `server/src/db/database.ts#L15-L20` | 2026-09-12 |
| **DEC-002** | Backup Trigger | Immediate automated database backup snapshot triggered upon closing every shift (`/shifts/close`), plus midnight safety backup. | `server/src/modules/core/core.router.ts#L251` | 2026-09-12 |
| **DEC-003** | USB Mirroring | Automated mirror to external USB (`E:\ERP_Backups`). Visible UI alert + `audit_log` warning entry on failure. | `server/src/services/backup.service.ts#L81-L98` | 2026-09-12 |
| **DEC-004** | Retention Policy | Local backup retention set to 30 days. Automated rotation prunes files older than 30 days. | `server/src/index.ts#L283-L295` | 2026-09-12 |
| **DEC-005** | DR Objectives | Recovery objectives: RPO = 0 (zero committed sales loss via `synchronous = FULL`), RTO <= 15 minutes. | Confirmed by User | 2026-09-12 |
| **DEC-006** | Migrations Policy | Forward-only, non-destructive migrations in `schema_migrations` executed inside startup transactions. | `server/src/db/migrations.ts#L1810-L1825` | 2026-09-12 |
| **DEC-007** | LAN Concurrency | Sized for up to 10 concurrent stations sharing SQLite instance via Express on port 5000 with 5000ms busy timeout. | `server/src/db/database.ts#L18` | 2026-09-12 |
| **DEC-008** | ETA Tax Scope | Live ETA portal submission deferred to post-v1. Local cryptographic QR/UUID hash generation remains active. | `server/src/modules/integrations/integrations.router.ts#L140` | 2026-09-12 |
| **DEC-009** | Egyptian VAT | 14% VAT standard rate applied per item in integer piastres with clear distinction between taxable and tax-exempt lines. | `server/src/modules/retail/currency.ts#L54` | 2026-09-12 |
| **DEC-010** | Bilingual UI | Bilingual UI: Arabic default with RTL layout, English toggleable with LTR layout across all views and modals. | `client/src/i18n/LanguageContext.tsx#L16-L26` | 2026-09-12 |
| **DEC-011** | Currency Precision | All financial totals, discounts, taxes, and split payments strictly computed in integer piastres (`1 EGP = 100 Piastres`). | `server/src/modules/retail/currency.ts#L1-L24` | 2026-09-12 |
| **DEC-012** | Business Day | Financial day boundaries and Z-reports determined strictly by explicit cashier handover with recorded cash variance. | `server/src/modules/core/core.router.ts#L251-L277` | 2026-09-12 |
| **DEC-013** | Shutdown Hooks | Enable Electron `before-quit` and Windows Console `SIGINT` to close SQLite connection cleanly and checkpoint WAL. | `electron/main.cjs#L15`, `database.ts#L12` | 2026-09-12 |
| **DEC-014** | Integrity Drill | Automated weekly `PRAGMA integrity_check` executed against the latest database backup. | `server/src/services/backup.service.ts#L60-L75` | 2026-09-12 |
| **DEC-015** | Failure Alerting | Persistent red banner visible to MANAGER and ADMIN upon dashboard entry if backup fails or USB missing, plus `audit_log` event. | `server/src/services/backup.service.ts#L96` | 2026-09-12 |
| **DEC-016** | Thermal Printing | Direct raw byte ESC/POS dispatch via Electron IPC in desktop mode for 80mm thermal receipts; browser print as fallback. | `electron/main.cjs#L59`, `escPosDirect.ts#L2` | 2026-09-12 |
| **DEC-017** | Barcode Scanner | Global HID barcode scanner interceptor active with < 35ms inter-keystroke threshold for rapid cart insertion. | `client/src/services/hardware.service.ts#L29` | 2026-09-12 |
| **DEC-018** | Cash Drawer Kick | Automated ESC/POS drawer kick pulse triggered upon completing cash tender. | `client/src/utils/escPosDirect.ts#L23` | 2026-09-12 |
| **DEC-019** | WhatsApp Target | Official future integration target established as Meta WhatsApp Cloud API; internal simulation active during v1. | `server/src/services/whatsapp.service.ts#L6` | 2026-09-12 |
| **DEC-020** | Strict LAN Perimeter | Zero remote access in v1 baseline. ERP strictly locked to local shop LAN via `subnetAndDeviceGuard`. | `server/src/middleware/subnet-guard.ts#L4` | 2026-09-12 |
| **DEC-021** | Sales Returns | Sales returns require mandatory non-empty reason, over-return guard, automatic inventory restock, and credit note issuance. | `server/src/modules/retail/returns.service.ts#L25` | 2026-09-12 |
| **DEC-022** | Installments | Automated installment schedule with annual markup and automated WhatsApp reminder triggers 2 days prior to due dates. | `server/src/modules/retail/installments.service.ts#L149` | 2026-09-12 |
| **DEC-023** | Stocktake Freeze | Temporary sales freeze on items undergoing active physical inventory count to prevent false variances. | `server/src/repositories/inventory.repository.ts#L116` | 2026-09-12 |
| **DEC-024** | Price Authorization | Modifying retail/cost prices strictly restricted to MANAGER and ADMIN roles with mandatory before/after audit trail in `audit_log`. | `server/src/modules/inventory/inventory.service.ts#L276` | 2026-09-12 |
| **DEC-025** | Constitution Lifecycle | Clean replacement and ratification as Version 1.0.0 in Phase 2 instead of amending boilerplate template. | User Directive / AMB-012 | 2026-09-12 |
| **DEC-026** | Single-Branch Scope | Single-branch operation confirmed. The inter-branch transfer module found in code is EXPLICITLY OUT-OF-SCOPE for v1 (frozen legacy module). | User Decision Q36 / AMB-047 | 2026-09-12 |
| **DEC-027** | Power Outage Reliance | No physical UPS data cable connected. Durability relies on `synchronous = FULL` (DEC-001) + OS hooks (DEC-013). | User Review Q24a / AMB-038 | 2026-09-12 |
| **DEC-028** | Admin Functional CFO | No separate CFO role exists; ADMIN functionally acts as CFO. Payment approvals > 5000 EGP require ADMIN approval. | User Decision Q37 / AMB-046 | 2026-09-12 |
| **DEC-029** | WhatsApp Quote Pre-Auth | Estimate sent via WhatsApp; customer replies via text; technician logs manually in ERP. No public URL/portal in v1. | User Decision Q38 / AMB-040 | 2026-09-12 |
| **DEC-030** | Stocktake Open Cart Conflict | Items in active cycle count reject POS checkout with HTTP 409; Manager override permitted with audit entry; batch settles on pre-freeze stock. | User Decision Q39 / AMB-039 | 2026-09-12 |
| **DEC-031** | Warranty Parts Accounting | Spare parts consumed during warranty repairs are tracked and posted as reportable `WARRANTY EXPENSE`. | User Decision Q40a / AMB-042a | 2026-09-12 |
| **DEC-032** | Replaced Part Warranty Period | Replaced parts inherit remaining original repair warranty window without extension or renewal. | User Decision Q40b / AMB-042b | 2026-09-12 |
| **DEC-033** | Warranty Void Authority | Voiding warranty due to customer physical damage or water ingress strictly requires MANAGER approval with audit log. | User Decision Q40c / AMB-042c | 2026-09-12 |
| **DEC-034** | Purchase Order Approval Ceiling | Supplier Purchase Orders > 10,000 EGP require mandatory MANAGER or ADMIN approval before transmission (independent of payment ceiling). | User Decision Q41 / AMB-043 | 2026-09-12 |
| **DEC-035** | Rejected Supplier Returns | Supplier return rejected by vendor moves item to `DEFECTIVE_SCRAP`, saleable only with Manager approval, recording book loss. | User Decision Q42 / AMB-044 | 2026-09-12 |
| **DEC-036** | Logical Parts Reservation | Transitioning repair ticket to `IN_REPAIR` immediately activates logical `reserved_stock`, locking parts from POS retail checkout. | User Decision / AMB-041 | 2026-09-12 |
| **DEC-037** | Bundle Size Ceiling | Strict `index.js` <= 80KB limit confirmed (via modal/view React.lazy code-splitting) alongside the Vite 500KB vendor chunk ceiling. | `PROJECT.md#L63` / Round 1.3 | 2026-09-12 |
| **DEC-038** | Stolen IMEI Registry Scope | In-Scope (v1) as internal advisory records only. Never auto-refuses service; refusal requires explicit Manager confirmation + `audit_log`. Zero external integrations. | Owner Decision DEC-038 | 2026-09-12 |
| **DEC-039** | AI Demand Forecasting Scope | Frozen (non-active in v1). Code remains as legacy placeholder; revisit at P2 once historical transaction data accumulates (same as DEC-026). | Owner Decision DEC-039 | 2026-09-12 |
| **DEC-040** | HR Payroll Scope & Access | In-Scope (v1) for technician commission calculation. Access restricted strictly to MANAGER and ADMIN (HTTP 403). Salary modifications require `audit_log`. | Owner Decision DEC-040 | 2026-09-12 |
| **DEC-041** | Warranty Duration & Grace Policy | Durations are configurable per part category in settings (defaults: 90 days screens, 60 days batteries, 30 days other repairs/labor). Replaced parts inherit original window; minimum 3-day testing grace applies if remaining window < 3 days. | Owner Decision DEC-041 | 2026-09-12 |
| **DEC-042** | Warranty Voiding Evidence | Warranty voiding on grounds of physical damage or liquid ingress requires attached photographic evidence AND Manager approval with synchronous audit logging. | Owner Decision DEC-042 | 2026-09-12 |
| **DEC-043** | LAN Perimeter & Seed Token | Authorizes `::1` / `::ffff:127.0.0.1` (IPv6 loopback) for Windows/Node24/Electron host; constrains LAN subnets strictly to `192.168.1.0/24` and `10.0.0.0/8` per ADR-020; mandates crypto-random seed value for `master-pos-station-token`. | `server/src/middleware/subnet-guard.ts#L4-L20`, `server/src/db/seed.ts#L18-L30` | 2026-09-12 |

---

## 4. Cumulative Open Ambiguities Register (Active / Resolved)

| ID | Area | Ambiguity Description | Tag | Status | Citation / Resolution Vehicle |
|---|---|---|---|---|---|
| AMB-004a | B (Non-Functional) | Enforce strict `index.js` < 80KB limit vs relying solely on the 500KB chunk ceiling | Deferrable | Resolved | Resolved via DEC-037 |
| AMB-012 | Foundation | `constitution.md` Lifecycle in Phase 2: Clean replacement/ratification v1.0.0 vs Amend template | Blocking | Resolved | Resolved via DEC-025 |
| AMB-037 | H (Hardware) | Customer Facing Display (CFD) dual-screen live cart mirroring feature scope | Deferrable (P2) | Deferred to P2 | Resolved via Owner Review Q29b |
| AMB-038 | F (Continuity) | Physical USB-connected UPS presence on shop server | Blocking | Resolved | Resolved via DEC-027 |
| AMB-039 | I (Workflows) | Frozen cycle count item already present in open POS cart: rejection with HTTP 409 | Blocking | Resolved | Resolved via DEC-030 |
| AMB-040 | I (Workflows) | Customer repair quote pre-approval: WhatsApp track link vs verbal manual override | Blocking | Resolved | Resolved via DEC-029 |
| AMB-041 | I (Workflows) | Repair parts reservation model (`reserved_stock`) vs immediate stock deduction | Blocking | Resolved | Resolved via DEC-036 |
| AMB-042 | I (Workflows) | Repair warranty re-intake lifecycle: expense tracking, window inheritance, void authority | Blocking | Resolved | Resolved via DEC-031, DEC-032, DEC-033 |
| AMB-043 | I (Workflows) | Purchase order approval threshold (>10,000 EGP) and manager authorization | Blocking | Resolved | Resolved via DEC-034 |
| AMB-044 | I (Workflows) | Defective supplier return lifecycle: stock quarantine, scrap, and book loss | Blocking | Resolved | Resolved via DEC-035 |
| AMB-045 | Governance | DEC Conflict Scan resolution status | Blocking | Resolved | Resolved (0 Structural Conflicts) |
| AMB-046 | Roles | Separate CFO role vs Admin acting as functional CFO | Blocking | Resolved | Resolved via DEC-028 |
| AMB-047 | Scope | Multi-branch and inter-branch transfer active vs out of scope | Blocking | Resolved | Resolved via DEC-026 |

---

## 5. Cumulative Assumptions Register (11 Active)

| ID | Assumption Description | Confidence | Impact | Status | Citation |
|---|---|---|---|---|---|
| ASM-001 | Codebase operates locally on SQLite WAL mode and will not migrate to Postgres/MySQL in v1 | High | High | Confirmed | `PROJECT.md#L4` |
| ASM-002 | Electron desktop wrapper packages web client build assets directly from `client/dist` | High | Low | Confirmed | `ORIGINAL_REQUEST.md#L20` |
| ASM-003 | External notifications (WhatsApp/SMS) operate through internal service layer/webhook abstraction | Medium | Medium | Confirmed | `ORIGINAL_REQUEST.md#L52` |
| ASM-004 | The existing `constitution.md` is an unpopulated SpecKit template with placeholder tags | High | Medium | Confirmed | `.specify/memory/constitution.md` |
| ASM-005 | SQLite Durability: `synchronous = FULL` required to guarantee zero loss of committed sales | High | Critical | Confirmed (DEC-001) | `server/src/db/database.ts#L16` |
| ASM-006 | `index.js` bundle threshold <= 80KB achievable by moving non-critical modals to React.lazy | High | Low | Confirmed (DEC-037) | `PROJECT.md#L63` |
| ASM-007 | Live ETA portal communication requires e-token digital signatures and is out of v1 scope | High | High | Confirmed (DEC-008) | `server/src/modules/integrations/integrations.router.ts#L140` |
| ASM-008 | Local shop LAN operates with <= 10 concurrent stations sharing SQLite via Express | High | High | Confirmed (DEC-007) | `server/src/db/database.ts#L18` |
| ASM-009 | Hardware environment comprises standard 80mm ESC/POS thermal printers and HID barcode scanners | High | High | Confirmed (DEC-016) | `client/src/services/hardware.service.ts` |
| ASM-010 | Shift handover is primary checkpoint for physical cash reconciliation and safety backups | High | Critical | Confirmed (DEC-002) | `server/src/modules/core/core.router.ts#L251` |
| ASM-011 | Physical shop server operates without hardware USB-UPS signaling; relies strictly on fsync durability | High | High | Confirmed | User Review Q24a |

---

## 6. Cumulative Risks Register (11 Active)

| ID | Risk Description | Severity | Status | Proposed Mitigation | Citation |
|---|---|---|---|---|---|
| RISK-001 | Divergence between existing code and specifications | High | Mitigating | protocol ratified; full cross-artifact audit scheduled as Phase 3 begins | `project-comprehension.md` |
| RISK-002 | Multi-station POS / Wallet concurrency race conditions | High | Mitigating | Confirmed: `BEGIN IMMEDIATE` transactions + optimistic versioning + DB CHECK constraints | `PROJECT.md#L8` |
| RISK-003 | Frontend bundle bloat exceeding Vite 500KB budget | Medium | Mitigating | Confirmed: 500KB chunk limit; validating 80KB index.js in AMB-004a | `PROJECT.md#L10` |
| RISK-004 | Unauthorized financial mutation / void without audit | High | Mitigating | Confirmed: Synchronous audit log + HTTP 400 on missing reason + RBAC limits | `PROJECT.md#L39` |
| RISK-005 | Amendment log pollution if empty template is treated as amended | High | Mitigating | Replace template with ratified clean Constitution v1.0.0 in Phase 2 (AMB-012) | User Directive |
| RISK-006 | SQLite PRAGMA contention/lockout if PRAGMAs aren't centralized | Medium | Mitigating | PRAGMAs centralized in `server/src/db/database.ts#L15-L20` | `server/src/db/database.ts` |
| RISK-007 | Loss of committed sales data on sudden shop power loss with `synchronous = NORMAL` | Critical | Mitigated (DEC-001) | Adopted `synchronous = FULL` per FIX-6/ADR-001; verified in Test Suite 52 (`synchronous === 2`) | FIX-6 Decision / `ADR-001` |
| RISK-008 | Database corruption or hardware disk failure without external backups | High | Mitigating (DEC-002) | Shift-close immediate backup + daily midnight backup + USB mirroring | `server/src/services/backup.service.ts` |
| RISK-009 | Legal/tax exposure from local offline e-invoices (QR/Hash without live ETA sync) | High | Open | Accountant audit required to verify local QR invoice legal compliance in Egypt | User Directive (Q19 review) |
| RISK-010 | Part contention race condition if technician reserves part without immediate stock lock | High | Mitigating (AMB-041) | Implement logical reservation `reserved_stock` locking parts from POS retail checkout | `server/src/modules/repair/repair.router.ts#L652` |
| RISK-011 | LAN perimeter middleware default-allow defeats trusted_devices token gate for unregistered LAN devices | High | Mitigated (DEC-020, DEC-043) | Enforce default-DENY subnet whitelist + workstation token gate; verified in Test Suite 67 (WAN IP, non-ratified subnet, missing token, unregistered token) | Code Discovery (`subnet-guard.ts`) |
