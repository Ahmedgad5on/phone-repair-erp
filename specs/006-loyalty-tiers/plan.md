# Technical Implementation Plan: Customer Loyalty Tiers (Light-Weight)

**Document Version:** 1.0.0  
**Status:** Draft / Pending Wave Gate Review  
**Plan Path:** `specs/006-loyalty-tiers/plan.md`  
**Specification Reference:** `specs/006-loyalty-tiers/spec.md`  
**Target Milestone:** Phase 3 — Wave: Profitability & Collections (Feature 006)  
**Governing Architecture:** Constitution v1.0.2 | DEC-011, DEC-024, DEC-028, DEC-046 | ADR-024  
**Target Git Branch:** `feature/006-loyalty-tiers`  
**Created:** 2026-09-13  

---

## 1. Architectural Blueprint

```text
       +-----------------------------------------------------------------------------------------+
       |             FEATURE 006: CUSTOMER LOYALTY TIERS (LIGHT-WEIGHT)                          |
       |                                                                                         |
       |  [ITEM 1: DYNAMIC TIER CONFIGURATION & LTV CALCULATION (FR-017)]                        |
       |  settings table:                                                                        |
       |    loyalty_tier_silver_threshold_piastres = 500000 (5,000 EGP)                          |
       |    loyalty_tier_gold_threshold_piastres   = 2000000 (20,000 EGP)                        |
       |    loyalty_tier_silver_bonus_pct          = 3                                           |
       |    loyalty_tier_gold_bonus_pct            = 7                                           |
       |          |                                                                              |
       |          +--> Customer LTV = SUM(completed sales) + SUM(delivered repairs)              |
       |                 |-- LTV < Silver Threshold  ---> BRONZE (0% bonus)                      |
       |                 |-- LTV < Gold Threshold    ---> SILVER (3% bonus)                      |
       |                 \-- LTV >= Gold Threshold   ---> GOLD (7% bonus)                        |
       |                                                                                         |
       |  [ITEM 2: TIER-AWARE DISCOUNT ENGINE & CEILING CLAMPING (FR-018)]                       |
       |  DiscountService.evaluateCart(req)                                                      |
       |          |                                                                              |
       |          +--> Fetch customer tier (e.g. GOLD = +7% bonus)                               |
       |          +--> Role Base Limit (e.g. CASHIER = 10% base limit)                           |
       |          +--> Combined Limit = 10% + 7% = 17%                                           |
       |          +--> If user is MANAGER: base 30% + 7% = 37%                                   |
       |                 \---> STRICT CLAMP: MIN(30%, 37%) = 30% MAX CEILING                    |
       |          \--> If user is ADMIN/OWNER: Unlimited 100% (Exempt from 30% clamp)            |
       |                                                                                         |
       |  [ITEM 3: TIER RE-EVALUATION & MANUAL OVERRIDE AUDIT (FR-019)]                          |
       |  POST /api/customers/:id/tier-override                                                  |
       |          |                                                                              |
       |          +--> Role != MANAGER / ADMIN? ---> HTTP 403 Forbidden                          |
       |          +--> Missing reason?          ---> HTTP 422 Unprocessable Entity               |
       |          \--> Authorized Manager:                                                       |
       |                 +--> Update customers.loyalty_tier                                      |
       |                 \--> Emit audit_log: CUSTOMER_TIER_OVERRIDDEN with real manager ID      |
       +-----------------------------------------------------------------------------------------+
```

---

## 2. Target Files & Database Schema Modifications

### Files Touched / Created:
1. **Migration File:** `server/src/db/migrations/016_profitability_and_collections.ts`
   - Add columns to `customers`:
     - `loyalty_tier TEXT DEFAULT 'BRONZE'` (CHECK: loyalty_tier IN ('BRONZE', 'SILVER', 'GOLD'))
     - `lifetime_spend_piastres INTEGER DEFAULT 0`
     - `tier_override INTEGER DEFAULT 0`
     - `tier_override_reason TEXT`
     - `tier_updated_at TEXT`
   - Seed initial dynamic settings rows in `settings` table if not present:
     - `loyalty_silver_threshold_piastres` = `'500000'`
     - `loyalty_gold_threshold_piastres` = `'2000000'`
     - `loyalty_silver_bonus_pct` = `'3'`
     - `loyalty_gold_bonus_pct` = `'7'`
2. **Router & Service Files:**
   - [NEW] [`server/src/modules/loyalty/loyalty.service.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/loyalty/loyalty.service.ts)
   - [MODIFY] [`server/src/modules/loyalty/loyalty.router.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/loyalty/loyalty.router.ts)
   - [MODIFY] [`server/src/modules/retail/discount.service.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/retail/discount.service.ts)
   - [MODIFY] [`server/src/modules/retail/retail.router.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/retail/retail.router.ts) (trigger tier refresh on sale)
   - [MODIFY] [`server/src/modules/repair/repair.router.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/modules/repair/repair.router.ts) (trigger tier refresh on delivery)
3. **Automated Verification Suites:**
   - `server/test/api.test.ts`
     - **Test Suite 82:** Customer Loyalty Tier LTV Engine & Dynamic Settings (FR-017, FR-019.1, NFR-010)
     - **Test Suite 83:** Tier Discount Stacking, 30% Ceiling Enforcement & Audit Log (FR-018, FR-019.3, NFR-011)

---

## 3. Dependency-Ordered Task Breakdown (≤ 2h Granularity)

| Task ID | Priority | Description & Scope | Dependencies | Est. Time | Verification / Test Pass Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TASK-6.1** | `P0` | **Loyalty Schema & Settings Migration (`016`)**<br>Add `loyalty_tier`, `lifetime_spend_piastres`, and `tier_override` columns to `customers`. Insert default settings into `settings` table. | Migration Batch 1 | 0.5h | **Vector D:** Default settings seeded (`loyalty_tier_silver_threshold_piastres`, etc.).<br>**Vector C:** Columns exist in `customers` table with CHECK constraint. |
| **TASK-6.2** | `P0` | **Dynamic Tier Settings Management & LTV Recalculation Service (`FR-017`)**<br>Implement `LoyaltyService.calculateCustomerLTV()` and tier thresholds reader. Implement `GET /api/loyalty/tiers/settings` and `PUT /api/loyalty/tiers/settings` (Manager/Admin only). | TASK-6.1 | 1.0h | Test Suite 82: (1) LTV accurately sums completed sales + delivered repairs in integer piastres, (2) Settings updates change tier boundaries. |
| **TASK-6.3** | `P0` | **Tier-Aware Discount Stacking Engine & 30% Ceiling Clamp (`FR-018`, `NFR-011`)**<br>Update `DiscountService.evaluateCart()`. Combine role max discount + tier bonus. Strictly clamp combined discount to 30% Manager Ceiling for Cashiers and Managers; exempt Admin/Owner (100%). | TASK-6.2 | 1.5h | Test Suite 83: (1) Cashier + SILVER = 13%, (2) Cashier + GOLD = 17%, (3) Manager + GOLD clamped to 30%, (4) Admin uncapped (100%). |
| **TASK-6.4** | `P1` | **Sale & Repair Completion Tier Recalculation Hooks (`FR-019.1`)**<br>Hook into `POST /api/retail/sales` and repair ticket delivery to trigger customer spend update and tier transition. | TASK-6.2 | 1.0h | Test Suite 82: Customer crossing 5,000 EGP on sale completion automatically promoted to SILVER with audit log. |
| **TASK-6.5** | `P0` | **Manual Tier Override RBAC & Audit Trail (`FR-019.3`)**<br>Implement `POST /api/customers/:id/tier-override`. Restrict strictly to `MANAGER` / `ADMIN` with HTTP 403. Require non-empty reason. Emit `CUSTOMER_TIER_OVERRIDDEN` audit event with real manager actor ID. | TASK-6.1 | 1.0h | Test Suite 83: (1) Cashier blocked with 403, (2) Empty reason rejected with 422, (3) Manager succeeds and audit records real actor ID. |
