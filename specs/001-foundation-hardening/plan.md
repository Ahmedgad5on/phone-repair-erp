# Technical Implementation Plan: Foundation Hardening

**Document Version:** 1.0.0  
**Status:** Draft / Pending Owner Approval  
**Plan Path:** `specs/001-foundation-hardening/plan.md`  
**Specification Reference:** `specs/001-foundation-hardening/spec.md`  
**Target Milestone:** Phase 3 — Milestone 1  
**Target Git Branch:** `feature/001-foundation-hardening`  
**Governing Architecture:** Constitution v1.0.1 | DEC-001, DEC-020, DEC-027, DEC-029, DEC-036 | ADR-001, ADR-020, ADR-036  

---

## 1. Architectural Design per Item

```text
       +--------------------------------------------------------------------------------+
       |                           FOUNDATION HARDENING ARCHITECTURE                    |
       |                                                                                |
       |  [ITEM 2: PERIMETER DEFENSE]                                                   |
       |  Inbound Request -> [subnet-guard.ts]                                          |
       |                      |-- Public IP?              ---> 403 Forbidden (Blocked)  |
       |                      |-- Missing Device Token?   ---> 403 Forbidden (Blocked)  |
       |                      \-- LAN IP + Valid Token    ---> ALLOW to API             |
       |                                                               |                |
       |  [ITEM 3: LOGICAL RESERVATION]                                v                |
       |  Repair Intake (IN_REPAIR)  ------------------------> [items table]            |
       |  (Reserves parts: +reserved_quantity)                 |                        |
       |                                                       | stock_quantity = 1     |
       |  Retail POS Sale (POST /api/sales)                  | reserved_quantity = 1  |
       |  (Checks: stock - reserved >= cart_qty)               | available_stock = 0    |
       |  Result: 409 Conflict (Stock Contention Blocked) <----+                        |
       |                                                                                |
       |  [ITEM 1: DURABILITY GUARANTEE]                                                |
       |  Transaction Commit ---------------------------------> [better-sqlite3 WAL]   |
       |  (PRAGMA synchronous = FULL)                           | Immediate fsync on SSD|
       |  Result: RPO = 0 on sudden electrical power cut <-----+                        |
       +--------------------------------------------------------------------------------+
```

### Item 1: SQLite Durability Engine (`synchronous = FULL`)
- **Location:** `server/src/db/database.ts`
- **Mechanism:** Centralize all connection-level PRAGMAs. Update line 16 from `db.pragma('synchronous = NORMAL')` to `db.pragma('synchronous = FULL')`.
- **System Impact:** Guarantees every committed transaction writes an immediate `fsync` flush to the WAL index, closing `RISK-007`. Note: `synchronous = 2` is the SQLite internal integer representation for `FULL` mode.

### Item 2: Subnet Firewall Default-DENY & Device Token Gate
- **Location:** `server/src/middleware/subnet-guard.ts`
- **Mechanism (DEC-043 Alignment):**
  - Verify client remote address against authorized subnets: Loopback (`127.0.0.1`, `::1`) and ratified LAN subnets (`192.168.1.0/24`, `10.0.0.0/8`).
  - Reject non-LAN / public IPs with `HTTP 403 Forbidden` (`{ error: "LAN_ACCESS_ONLY" }`).
  - **Exempt Routes List:**
    1. `GET /api/health` — Container/system liveness check.
    2. `GET /api/docs*` — Swagger API documentation.
    3. `POST /api/security/devices/register` — Workstation onboarding endpoint (Admin JWT required).
  - **Workstation Bootstrap Flow:**
    - Host node connects via loopback (`127.0.0.1`/`::1`) with pre-seeded master token.
    - Secondary LAN stations access `POST /api/security/devices/register` with Admin authentication to receive a cryptographically generated `device_token` stored in station client state.
  - For all other non-exempt operational endpoints, incoming LAN requests must provide a valid `x-device-token` header registered in `trusted_devices` (`is_whitelisted = 1`).
  - Remove silent fallback-ALLOW in development paths, closing `RISK-011`.

### Item 3: Logical Stock Reservation (`reserved_stock`)
- **Location:** `server/src/db/migrations/`, `server/src/modules/repair/`, `server/src/modules/retail/`
- **Mechanism:**
  - Database schema: Ensure `items` table includes `reserved_quantity INTEGER NOT NULL DEFAULT 0` with constraint `CHECK (stock_quantity >= reserved_quantity)`.
  - Repair module: When a ticket with requested parts transitions to `IN_REPAIR`, execute an atomic update inside `db.transaction`:
    `UPDATE items SET reserved_quantity = reserved_quantity + ? WHERE id = ?`
  - POS checkout: Calculate `available_quantity = stock_quantity - reserved_quantity`. If `requested > available_quantity`, abort checkout with `HTTP 409 Conflict` (`{ error: "INSUFFICIENT_AVAILABLE_STOCK", reserved: X }`).
  - Delivery/Cancellation: Reconcile or release `reserved_quantity`, closing `RISK-010`.

---

## 2. Files Touched

### Core Architecture & Database
- `[MODIFY]` [server/src/db/database.ts](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/db/database.ts#L16) — Set `PRAGMA synchronous = FULL`.
- `[NEW]` [server/src/db/migrations/007_add_reserved_quantity_to_items.ts](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/db/migrations/007_add_reserved_quantity_to_items.ts) — Schema migration for `reserved_quantity` and check constraints.

### Middleware & Security
- `[MODIFY]` [server/src/middleware/subnet-guard.ts](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/middleware/subnet-guard.ts#L8-L35) — Enforce default-DENY HTTP 403 and validate `x-device-token`.

### Business Modules
- `[MODIFY]` [server/src/modules/repair/repair.service.ts](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/repair/repair.service.ts) — Trigger stock reservation on `IN_REPAIR` and release/deduct on terminal status.
- `[MODIFY]` [server/src/modules/retail/retail.router.ts](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/retail/retail.router.ts#L360) — Enforce `available_stock = stock - reserved` check returning HTTP 409 on contention.

### Regression Test Suites
- `[MODIFY]` [server/test/api.test.ts](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/test/api.test.ts#L1040-L1060) — Update Test Suite 52 assertion to verify `PRAGMA synchronous === 2`.
- `[NEW]` [server/test/api.test.ts](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/test/api.test.ts) — Add Test Suite 67 (Subnet Guard Default-DENY HTTP 403) and Test Suite 68 (POS vs Repair Stock Reservation Contention HTTP 409).

---

## 3. Dependency-Ordered Task Breakdown (≤ 2h Granularity)

| Task ID | Priority | Description & Scope | Dependencies | Est. Time | Verification / Test Pass Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TASK-1.1** | `P0` | **Centralize SQLite Durability & Enforce synchronous=FULL**<br>Update `server/src/db/database.ts#L16` to `synchronous = FULL`. Update Test Suite 52 in `api.test.ts` to assert `synchronous === 2` (the internal SQLite integer value for `FULL`). | None | 0.5h | `npm test` passes with Test Suite 52 asserting `synchronous` mode is 2 (`FULL`). Zero test regressions. |
| **TASK-1.2** | `P0` | **Implement Subnet Guard Default-DENY & Device Token Gate**<br>Refactor `server/src/middleware/subnet-guard.ts` to reject public IPs and unregistered device tokens with HTTP 403. Implement device registration bootstrap endpoint and update test harness. Add Test Suite 67 in `api.test.ts`. | TASK-1.1 + Test Harness Strategy (Seed test token & inject `x-device-token` into test harness requests) | 2.5h | Automated tests verify: (1) public IP returns HTTP 403, (2) missing token returns HTTP 403, (3) exempt `/api/health` succeeds without token, (4) valid LAN token succeeds. Full 159-test baseline passes without 403 lockout. |
| **TASK-1.3** | `P0` | **Database Schema Migration for `items.reserved_quantity`**<br>Create migration `007_add_reserved_quantity_to_items.ts` adding column and `CHECK (stock_quantity >= reserved_quantity)`. | TASK-1.1 | 1.0h | Migration executes cleanly on startup; check constraint prevents `reserved_quantity > stock_quantity`. |
| **TASK-1.4** | `P0` | **Repair Intake Stock Reservation & Release Lifecycle**<br>Connect `repair.service.ts` to atomically reserve parts upon moving to `IN_REPAIR`, deduct upon `DELIVERED`, and release on `CANCELLED`. | TASK-1.3 | 1.5h | Ticket status transitions accurately increment/decrement `items.reserved_quantity` in test assertions. |
| **TASK-1.5** | `P0` | **POS Retail Checkout Contention Defense (HTTP 409)**<br>Update `retail.router.ts` checkout validation to evaluate `available_stock = stock - reserved`. Reject oversell with HTTP 409. Add Test Suite 68. | TASK-1.4 | 1.5h | POS checkout of reserved repair item strictly returns HTTP 409 Conflict. Full regression suite passes (>=161 tests). |

---

## 4. Forced Review Checkpoints & Batching Rule

In accordance with [CONTRIBUTING.md Section 2.3](file:///c:/Users/Eng_Ahmed/Desktop/pro/CONTRIBUTING.md#L72-L79):
- **Batch 1 (Architecture & Security Perimeter):** Execute **TASK-1.1** + **TASK-1.2** $\to$ **STOP for Adversarial Review Brief 1**.
- **Batch 2 (Database Schema & Reservation Engine):** Execute **TASK-1.3** + **TASK-1.4** + **TASK-1.5** $\to$ **STOP for Adversarial Review Brief 2**.

---

## 5. Explicit Out-of-Scope Statement

The following items are **EXPLICITLY OUT-OF-SCOPE** for this hardening package and require separate, subsequent owner approval gates:
1. **F2 Candidate:** Harmonization of `AUTH_SECRET` vs `JWT_SECRET` (logged as future candidate in `progress.md`).
2. **External Cloud Services:** Any connection to external APIs (WhatsApp Cloud API remains simulated).
3. **UI/UX Refactoring:** No visual modifications outside of standard error toasts/modals for HTTP 409 and 403 responses.
