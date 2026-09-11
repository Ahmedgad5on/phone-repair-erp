# Changes Report - Worker M2 (POS & Retail Sales)

**Worker**: Worker M2  
**Milestone**: M2 (POS & Retail Sales)  
**Date**: 2026-09-10  
**Scope**: `server/src/modules/retail/`, `client/src/views/PosView.tsx`, `client/src/components/retail/`

---

## 1. Summary of Changes

All 10 R2 objectives have been implemented cleanly with zero regressions:

### 1.1 Server-side Changes (`server/src/modules/retail/`)
- **`server/src/modules/retail/currency.ts`**:
  - Implemented `CurrencyUtils` providing integer-piastre (cent) arithmetic for all financial operations.
  - Functions for piastre conversion, line totals, tax calculation, discount computation, and split payment balance verification.
  - Completely eliminates IEEE-754 floating-point drift.
- **`server/src/modules/retail/discount.service.ts`**:
  - Implemented `DiscountService` for dynamic discount rule evaluation at `POST /api/retail/cart/apply-discounts`.
  - Supports `min_qty`, `customer_tier`, `time_start`/`time_end` time window, and `coupon_code`.
  - Strictly enforces role limits: CASHIER ≤ 10%, MANAGER ≤ 30%, ADMIN / SUPERADMIN unlimited.
  - Provides seed initialization for default promotional rules.
- **`server/src/modules/retail/installments.service.ts`**:
  - Implemented `InstallmentsService` managing `installment_plans` and amortized `installment_payments` schedule.
  - Endpoints: `POST /installments`, `GET /installments/:id/schedule`, `POST /installments/payments/:id/pay`, and `POST /installments/send-reminders`.
  - Sends automated WhatsApp reminders 2 days prior to installment due date.
- **`server/src/modules/retail/trade-in.service.ts`**:
  - Implemented `TradeInService` evaluating used devices based on model baseline, condition grading (A/B/C/D), battery health, screen condition, and functional defects.
  - Persists valuations in `trade_in_assessments` and links trade-in credit to sale invoices.
- **`server/src/modules/retail/returns.service.ts`**:
  - Implemented `ReturnsService` for partial/full sales returns (`POST /sales/:id/return` and `GET /sales/:id/returns`).
  - Strict over-return prevention: calculates cumulative previous returns and blocks returning more than originally purchased.
  - Atomically generates unique credit note (`CN-...`), restores inventory stock (`items.stock_quantity`), and restores IMEI status to `'IN_STOCK'`.
- **`server/src/modules/retail/retail.router.ts`**:
  - Enhanced `POST /sales`:
    - Strict IMEI verification against `imei_records.status = 'IN_STOCK'`.
    - Negative inventory prevention: pre-checks stock against requested quantity and rejects with HTTP 409 and itemized stock errors if stock is insufficient.
    - Split payment multi-method support: records per-method breakdown in `invoice_payments` and enforces total equality (HTTP 422 if unbalanced).
    - Updates IMEI records to `'SOLD'` with `sold_sale_id`.
  - Enhanced `DELETE /sales/:id` and `POST /sales/:id/void`:
    - Requires non-empty `reason` (returns HTTP 400 `{ error: "Reason required" }` if missing).
    - Inserts audit entry into `audit_log` with `action = 'VOID_SALE'`, `user_id`, `sale_id`, `reason`, and `timestamp`.
  - Added routes for split payments, installments, trade-in, discount evaluation, and sale returns.
- **`server/src/modules/retail/retail.test.ts`**:
  - Created 27 co-located automated unit and integration tests verifying all R2 requirements.

### 1.2 Client-side Changes (`client/src/components/retail/` and `client/src/views/PosView.tsx`)
- **`client/src/components/retail/SplitPaymentModal.tsx`**:
  - Interactive multi-method payment modal supporting Cash, Visa/Card, Mobile Wallet (Vodafone Cash), and InstaPay.
  - Live allocation progress indicators, per-method reference/auth code inputs, and quick "Fill Remaining" buttons.
  - Disables checkout unless remaining balance is exactly 0.
- **`client/src/components/retail/InstallmentSalesModal.tsx`**:
  - Installment plan creation modal with customizable down payment, tenure (3 to 24 months), and interest rate markup.
  - Full amortization schedule preview table with calculated monthly due dates.
  - Captures guarantor details (Name, Phone, Egyptian National ID).
- **`client/src/components/retail/TradeInModal.tsx`**:
  - Device appraisal modal capturing device model, IMEI, 4-tier condition grading (A+, B, C, D), battery health slider, screen condition, and functional defect toggles.
  - Calculates suggested trade-in value live via server API and applies deduction directly to current POS cart.
- **`client/src/views/PosView.tsx`**:
  - **Cart State Persistence (R2.9)**: Persists active cart to `sessionStorage` (`'erp_pos_active_cart'`) on every modification and restores on view mount.
  - Integrated `SplitPaymentModal`, `InstallmentSalesModal`, and `TradeInModal`.
  - Integrated dynamic coupon code evaluation and role discount limits.
  - Added dedicated **Returns & Credit Notes** tab for invoice lookup, itemized return quantity selection, return reason capture, and credit note issuance.
  - Added **Void Sale Reason Modal** to enforce mandatory non-empty reason.
  - Added **Negative Inventory 409 Error Modal** displaying itemized stock deficit warnings.

---

## 2. Verification Summary

| Check | Command | Result |
|---|---|---|
| Server TypeScript Compilation | `npx tsc --noEmit` (server/) | **0 Errors** (exit code 0) |
| Client TypeScript Compilation | `npx tsc -b` (client/) | **0 Errors** (exit code 0) |
| Retail Unit & Integration Test Suite | `npx tsx src/modules/retail/retail.test.ts` | **27 Passed, 0 Failed** |
| Main Server Automated Test Runner | `npm test` (server/) | **117 Passed, 0 Failed** |
