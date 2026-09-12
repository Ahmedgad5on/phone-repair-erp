# Feature Specification: Foundation Hardening (Ratified Invariants Enforcement)

**Document Version:** 1.0.0  
**Status:** Draft / Pending Owner Review  
**Specification Path:** `specs/001-foundation-hardening/spec.md`  
**Target Milestone:** Phase 3 — Milestone 1 (Foundation Hardening)  
**Governing Architecture:** Constitution v1.0.1 | DEC-001, DEC-020, DEC-027, DEC-029, DEC-036 | ADR-001, ADR-020, ADR-036  
**Target Git Branch:** `feature/001-foundation-hardening`  
**Created:** 2026-09-12  

---

## 1. Executive Summary & Problem Statement (The "WHY")

Following the successful ratification of the Phase 2 Foundation, this specification focuses exclusively on **Foundation Hardening**. Prior to developing new feature modules, the system must resolve three critical architectural gaps identified during Discovery and ratified in the Architecture Decision Records.

These three items convert known systemic risks (`RISK-007`, `RISK-011`, and `RISK-010`) into fully enforced, automated invariants:
1. **Durability Invariant:** Moving SQLite from `synchronous = NORMAL` to `synchronous = FULL` to guarantee $RPO = 0$ upon unannounced shop electrical power outages without a hardware UPS cable.
2. **Perimeter Defense:** Eliminating the development fallback-ALLOW in `subnet-guard.ts` to enforce a strict **default-DENY (HTTP 403 Forbidden)** LAN perimeter with registered device token gating.
3. **Stock Reservation Invariant:** Activating logical `reserved_stock` locking upon repair ticket estimate authorization, preventing walk-in retail POS sales from stealing technician parts.

---

## 2. Scope Boundaries

### In-Scope (Strictly Bounded to the 3 Ratified Items)
- **Item 1:** SQLite `synchronous = FULL` PRAGMA centralization & durability assertion.
- **Item 2:** Subnet guard default-DENY HTTP 403 enforcement & workstation device token authentication.
- **Item 3:** Logical spare parts reservation (`reserved_stock`) on repair intake & POS checkout contention rejection.

### Explicitly Out-of-Scope
- **F2 Candidate:** Consolidation of `AUTH_SECRET` vs `JWT_SECRET` (deferred to separate future governance gate).
- **External WhatsApp Cloud API:** Remains internal simulation per DEC-019 / DEC-036.
- **New UI Views or Redesigns:** Zero modification to UI layouts or presentation logic outside of required status/contention error feedback.
- **Multi-Branch Operations:** Excluded per DEC-026.

---

## 3. Functional Requirements (The "WHAT")

### FR-001: Centralized SQLite Durability Engine (`synchronous = FULL`)
- **Requirement Description:** The SQLite database initialization routine in `server/src/db/database.ts` MUST enforce `synchronous = FULL` unconditionally across all application handles. Default PRAGMA configuration must be centralized such that no subsystem can override or dilute synchronization settings.
- **Business Rationale:** Mobile phone repair shops in Egypt face unpredictable electrical grid cuts. Under DEC-027, the server operates on battery-backed hardware lacking USB signaling cables. `synchronous = NORMAL` prevents SQLite structural corruption but risks losing committed transactions still in the WAL buffer. `synchronous = FULL` ensures an immediate `fsync` on transaction commit, guaranteeing zero committed sales or repair intake data loss ($RPO = 0$).
- **Target Risk Closed:** `RISK-007` (Data loss on sudden shop power loss).
- **Verification & Regression Test:**
  - Automated test in `server/test/api.test.ts` (extending Test Suite 52) querying `PRAGMA synchronous;` and asserting strict equality with `2` (`FULL`).

---

### FR-002: Strict Subnet LAN Perimeter & Mandatory Workstation Token Gate
- **Requirement Description:** The subnet firewall middleware (`server/src/middleware/subnet-guard.ts`) MUST enforce strict **default-DENY** behavior:
  1. **IP Whitelist Boundary (DEC-043 Alignment):** Network ingress is strictly restricted to:
     - **Loopback:** `127.0.0.1` and `::1` (including IPv4-mapped IPv6 `::ffff:127.0.0.1`).
     - **Ratified LAN Subnets:** `192.168.1.0/24` and `10.0.0.0/8` (strictly matching ADR-020).
     - Any request arriving from non-whitelisted or public IP addresses MUST be immediately rejected with **HTTP 403 Forbidden** (`{ error: "LAN_ACCESS_ONLY", code: "ACCESS_DENIED" }`).
  2. **Device Token Enforcement:** All incoming requests from LAN stations (`192.168.1.0/24`, `10.0.0.0/8`) to non-exempt operational endpoints MUST present a valid, registered device token via the `x-device-token` header matching an active row in `trusted_devices` (`is_whitelisted = 1`). Requests omitting the token or providing an unregistered token MUST be rejected with **HTTP 403 Forbidden** (`{ error: "DEVICE_NOT_WHITELISTED", code: "DEVICE_UNAUTHORIZED" }`).
  3. **Exempt Routes List:**
     - `GET /api/health` — Liveness and container health check.
     - `GET /api/docs*` — OpenAPI / Swagger documentation endpoints.
     - `POST /api/security/devices/register` — Workstation onboarding bootstrap endpoint (strictly protected by Admin JWT authorization).
  4. **Workstation Bootstrap & Registration Flow:**
     - **Host Node:** The local host server communicating via loopback (`127.0.0.1` / `::1`) is trusted as the primary administrative station. Seed script populates `master-pos-station-token` in `trusted_devices`.
     - **Secondary LAN Stations (Cashier 2, Tech Bench):** A new workstation connects over LAN (`192.168.1.x` / `10.0.0.x`). An Admin signs in and registers the terminal via `POST /api/security/devices/register` providing `{ device_name, mac_or_fingerprint }`. The server returns a signed `device_token` persisted in client storage and sent on all future requests.
  5. **Elimination of Fallback-ALLOW:** The development mode fallback that allowed unrestricted access on missing headers MUST be eliminated from production code paths.
- **Business Rationale:** Satisfies Constitution §1 Principle III.1, DEC-020, and DEC-043. Customer PII, device unlock passcodes, phone numbers, and financial cash balances are sealed inside authorized shop hardware.
- **Target Risk Closed:** `RISK-011` (LAN perimeter middleware default-allow).
- **Verification & Regression Test:**
  - Automated test suite in `server/test/api.test.ts` asserting:
    - Inbound request from spoofed external IP `203.0.113.1` returns `HTTP 403 Forbidden`.
    - LAN request missing `x-device-token` returns `HTTP 403 Forbidden`.
    - Request to `GET /api/health` succeeds without token (`HTTP 200`).
    - LAN request with valid registered device token passes with `HTTP 200/201`.

---

### FR-003: Logical Spare Parts Reservation on Repair Intake (`reserved_stock`)
- **Requirement Description:**
  1. **Schema Invariant:** The `items` table MUST maintain `reserved_quantity INTEGER NOT NULL DEFAULT 0` with a database check constraint ensuring available stock is never negative: `CHECK (stock_quantity >= reserved_quantity)`.
  2. **Reservation Trigger:** When a repair ticket transitions to `IN_REPAIR` (or when spare parts are allocated upon verified customer estimate approval per DEC-029), the required quantity for each attached part MUST be atomically incremented in `items.reserved_quantity`.
  3. **POS Checkout Contention Defense:** The retail point-of-sale checkout endpoint (`POST /api/sales`) MUST evaluate available stock as:
     $$\text{Available Stock} = \text{stock\_quantity} - \text{reserved\_quantity}$$
     If a cashier attempts to sell an item where $\text{Cart Quantity} > \text{Available Stock}$, the checkout MUST be rejected with **HTTP 409 Conflict** and payload `{ error: "INSUFFICIENT_AVAILABLE_STOCK", available: X, reserved: Y }`.
  4. **Reservation Lifecycle:**
     - Upon ticket delivery (`DELIVERED`), the parts are deducted from both physical and reserved stock:
       `stock_quantity = stock_quantity - N`, `reserved_quantity = reserved_quantity - N`.
     - Upon ticket cancellation (`CANCELLED`), the reservation is released:
       `reserved_quantity = reserved_quantity - N`.
- **Business Rationale:** Resolves a major daily operational conflict in mobile repair workshops where a screen or battery assigned to an approved customer repair is mistakenly sold at the retail counter by a cashier, halting technician repair delivery and causing angry customer disputes.
- **Target Risk Closed:** `RISK-010` (Part contention race condition between repair lab and POS).
- **Verification & Regression Test:**
  - Automated test suite in `server/test/api.test.ts`:
    - Setup item with `stock_quantity = 1` and `reserved_quantity = 1` (assigned to ticket in `IN_REPAIR`).
    - Attempt POS checkout of 1 unit $\to$ assert rejection with **HTTP 409 Conflict**.
    - Release ticket / deliver $\to$ assert correct decrement to `stock_quantity = 0, reserved_quantity = 0`.

---

## 4. Traceability Matrix & Risk Retirement

| Requirement ID | Architectural Authority | Target Risk ID | Pre-Hardening Status | Post-Hardening Target Status | Automated Regression Verification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-001** | DEC-001 / ADR-001 | `RISK-007` | Mitigating | **Mitigated** | `PRAGMA synchronous; === 2` assertion in `api.test.ts` |
| **FR-002** | DEC-020 / ADR-020 | `RISK-011` | Mitigating | **Mitigated** | Subnet & token rejection HTTP 403 test suite in `api.test.ts` |
| **FR-003** | DEC-029 / ADR-036 | `RISK-010` | Mitigating | **Mitigated** | POS contention rejection HTTP 409 test suite in `api.test.ts` |
