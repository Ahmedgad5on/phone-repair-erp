# Feature Specification: Customer Loyalty Tiers (Light-Weight)

**Document Version:** 1.0.0  
**Status:** Draft / Pending Wave Gate Review  
**Specification Path:** `specs/006-loyalty-tiers/spec.md`  
**Target Milestone:** Phase 3 — Wave: Profitability & Collections (Feature 006)  
**Governing Architecture:** Constitution v1.0.1 | DEC-011, DEC-024, DEC-028, DEC-046 | ADR-024  
**Target Git Branch:** `feature/006-loyalty-tiers`  
**Created:** 2026-09-13  

---

## 1. Executive Summary & Problem Statement (The "WHY")

In consumer electronics retail and device maintenance, customer acquisition is expensive while repeat customers drive the majority of net profit. While the repository contains a legacy points catalog (`loyalty_rewards`, `loyalty_redemptions`), points programs in local workshops suffer from operational friction: customers forget their point balances, cashiers struggle with points-to-cash conversion, and point liabilities complicate balance sheets:
1. **Lack of Transparent Tier Recognition:** The shop has no automated way to distinguish a first-time visitor from a VIP client who has spent over 50,000 EGP across repairs and hardware purchases.
2. **Disconnected Discounting:** Cashiers manually negotiate discounts on an ad-hoc basis. There is no automated policy granting a modest, predictable discount bonus to loyal clients.
3. **Discount Stacking Runaway Risk:** If customer discounts stack on top of cashier role discounts, total invoice discounts could easily exceed authorized boundaries and wipe out profit margins.
4. **Arbitrary VIP Assignment:** Customer tags (such as `VIP` or `WHOLESALE`) are currently edited in free text without audit trails, creating opportunities for cashier favoritism.

Feature 006 introduces a **Light-Weight Customer Loyalty Tier Engine**:
- Tier assignment (`BRONZE`, `SILVER`, `GOLD`) determined strictly by verified Lifetime Purchase Value (LTV).
- Tier thresholds configured in `settings` (never hardcoded).
- Tier discount bonus seamlessly integrates into `DiscountService.evaluateCart`, stacking cleanly under the unbreachable **30% Manager Ceiling**.
- All tier promotions, demotions, and manual overrides are synchronously audited with real actor IDs (`DEC-046`).
- **Zero points liability and zero auto-charges in v1: purely tier-driven recognition.**

---

## 2. Scope Boundaries

### In-Scope
1. **Lifetime Purchase Value (LTV) & Tier Assignment (`FR-017`):**
   - Customer LTV is the verified sum of completed sales and delivered repair tickets in integer piastres.
   - Three standard tiers:
     - **BRONZE:** Entry tier ($0 \le \text{LTV} < \text{Threshold}_{\text{SILVER}}$).
     - **SILVER:** Valued repeat customer ($\text{Threshold}_{\text{SILVER}} \le \text{LTV} < \text{Threshold}_{\text{GOLD}}$). Default: 5,000 EGP (500,000 piastres).
     - **GOLD:** VIP customer ($\text{LTV} \ge \text{Threshold}_{\text{GOLD}}$). Default: 20,000 EGP (2,000,000 piastres).
   - Dynamic settings governance: Thresholds are read from the `settings` table, never hardcoded.
2. **Tier-Aware Discount Stacking Under 30% Ceiling (`FR-018`):**
   - Tier bonus percentages configurable in `settings`:
     - BRONZE: 0% bonus.
     - SILVER: Default 3% bonus.
     - GOLD: Default 7% bonus.
   - Discount engine integration: When evaluating a cart, `effective_discount_ceiling = \min(30\%, \text{RoleMaxPct} + \text{TierBonusPct})`.
   - Invariant: Stacking for Cashiers and Managers can NEVER exceed the 30% Manager Ceiling under any circumstances (even if Cashier has 10% base + 7% tier = 17%, it stays under 30%; if Manager has 30% base + 7% tier, it is clamped strictly to 30%). Administrative roles (ADMIN, SUPERADMIN, OWNER) are explicitly exempt and retain 100% discount authority per the ratified role matrix (DEC-024, DEC-028).
3. **Tier Mutation Audit & Recalculation Engine (`FR-019`):**
   - Automated tier re-evaluation triggered upon completing a sale (`POST /api/retail/sales`) or delivering a repair ticket (`PATCH /api/repair/tickets/:id/status` to `DELIVERED`).
   - Manual tier override endpoint `POST /api/customers/:id/tier-override` restricted strictly to `MANAGER` or `ADMIN` with mandatory justification reason.
   - Synchronous audit log emitted: `CUSTOMER_TIER_CHANGED` capturing old tier, new tier, triggering LTV, and actor user ID.

### Explicitly Out-of-Scope
- Points accrual, expiration schedules, and points-to-cash redemption (frozen/legacy in v1).
- Subscription memberships or auto-charging fees.
- Customer smartphone mobile app for tier tracking.

---

## 3. Functional Requirements (The "WHAT")

### FR-017: Lifetime Purchase Value (LTV) & Dynamic Tier Assignment
- **FR-017.1:** Endpoint `GET /api/loyalty/tiers/settings` returns the active tier threshold and discount matrix from the `settings` table.
- **FR-017.2:** Endpoint `PUT /api/loyalty/tiers/settings` allows `MANAGER` or `ADMIN` to update thresholds and discount percentages with synchronous audit logging (`TIER_SETTINGS_UPDATED`).
- **FR-017.3 (LTV Computation):** Customer LTV is computed in integer piastres:
  $$\text{LTV} = \sum \text{sales.total (COMPLETED)} + \sum \text{repair\_tickets.total\_amount (DELIVERED)}$$
- **FR-017.4:** Customer record maintains columns `loyalty_tier` (BRONZE, SILVER, GOLD), `lifetime_spend_piastres`, and `tier_updated_at`.

### FR-018: Tier-Aware Discount Stacking Capped Under Manager 30% Ceiling
- **FR-018.1:** `DiscountService.evaluateCart()` is updated to accept customer loyalty tier.
- **FR-018.2 (Ceiling Invariant & Admin Exception):** $\text{MaxAllowedPct} = \min(30\%, \text{RoleMaxPct} + \text{TierBonusPct})$ applies to CASHIER and MANAGER only. ADMIN bypasses the clamp entirely (original ratified role matrix: ADMIN unlimited).
  $$\text{MaxAllowedPct} = \begin{cases} 100\% & \text{if } \text{role} \in \{\text{'ADMIN'}, \text{'SUPERADMIN'}, \text{'OWNER'}\} \\ \min(30\%, \text{getRoleMaxDiscountPct}(\text{role}) + \text{TierBonusPct}) & \text{otherwise} \end{cases}$$
  - **Cashier (10% base limit):**
    - Cashier + BRONZE (0% bonus) $\implies$ 10% ceiling.
    - Cashier + SILVER (3% bonus) $\implies$ 13% ceiling.
    - Cashier + GOLD (7% bonus) $\implies$ 17% ceiling.
  - **Manager (30% base limit):**
    - Manager + BRONZE (0% bonus) $\implies$ 30% ceiling.
    - Manager + SILVER (3% bonus) $\implies$ $\min(30\%, 33\%) = 30\%$ ceiling (clamped by the hard 30% Manager Ceiling).
    - Manager + GOLD (7% bonus) $\implies$ $\min(30\%, 37\%) = 30\%$ ceiling (clamped by the hard 30% Manager Ceiling).
  - **Admin / SuperAdmin / Owner:**
    - 100% authorized (unlimited governance ceiling; explicitly exempt from the 30% clamp per the ratified role hierarchy in DEC-024/DEC-028).
- **FR-018.3:** Response breakdown indicates `role_max_pct`, `tier_bonus_pct`, `combined_ceiling_pct`, and `is_clamped_by_manager_ceiling`.

### FR-019: Tier Mutation Auditing & Re-Evaluation Engine
- **FR-019.1 (Event Trigger):** Upon sale completion or repair ticket delivery, an asynchronous-safe or in-transaction helper recalculates the customer's total LTV and updates their `loyalty_tier`.
- **FR-019.2 (Promotion Audit):** If LTV crosses a threshold, the customer is promoted, and an audit entry `CUSTOMER_TIER_PROMOTED` is recorded.
- **FR-019.3 (Manual Override RBAC):** `POST /api/customers/:id/tier-override` accepts `{ tier: 'BRONZE'|'SILVER'|'GOLD', reason: string }`. Only `MANAGER` or `ADMIN` can call this endpoint (`HTTP 403 Forbidden` for Cashiers). Reason must be non-empty (`HTTP 422 Unprocessable Entity` if empty). Emits `CUSTOMER_TIER_OVERRIDDEN` audit event with real manager actor ID.

---

## 4. Non-Functional Requirements (NFR)

- **NFR-010 (Zero Hardcoded Business Thresholds):** All spend thresholds and bonus percentages must be fetched from `settings` table with fallback defaults.
- **NFR-011 (Ceiling Invariant Guarantee):** Under no sequence of manual discounts, rule discounts, and tier bonuses may an order discount exceed 30% without explicit Admin authorization.
