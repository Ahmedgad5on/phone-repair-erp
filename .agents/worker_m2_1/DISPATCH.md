## 2026-09-10T03:18:52Z
You are Worker M2 (POS & Retail Sales).
Your Working Directory: c:\Users\Eng_Ahmed\Desktop\pro\.agents\worker_m2_1
Authoritative Requirements: c:\Users\Eng_Ahmed\Desktop\pro\ORIGINAL_REQUEST.md
Master Plan: c:\Users\Eng_Ahmed\Desktop\pro\PROJECT.md
Survey Analysis: c:\Users\Eng_Ahmed\Desktop\pro\.agents\explorer_server_1\analysis.md and c:\Users\Eng_Ahmed\Desktop\pro\.agents\explorer_client_1\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write Ownership (exclusively):
- server/src/modules/retail/
- client/src/views/PosView.tsx
- client/src/components/retail/

Your Objectives:
Implement all R2 requirements:
1. Split Payment Multi-Method:
   - Support paying an invoice across multiple methods (Cash + Card + Mobile Wallet).
   - Record in `invoice_payments` table (invoice_id, method, amount).
   - Create client/src/components/retail/SplitPaymentModal.tsx with per-method inputs summing to invoice total.
2. Installment Sales Engine:
   - Support creating a sale with down payment and installment schedule in `installment_plans` and `installment_payments`.
   - Add `GET /api/installments/:id/schedule` (or `/api/retail/installments/:id/schedule`).
   - Send WhatsApp reminders 2 days before due date via notification module.
   - Create client/src/components/retail/InstallmentSalesModal.tsx.
3. Trade-In Device Valuation:
   - Record device condition, IMEI, and trade-in value in `trade_in_assessments`.
   - Create client/src/components/retail/TradeInModal.tsx.
   - Apply trade-in credit against current invoice total.
4. Dynamic Discount Engine:
   - Server-side discount rule evaluation at `POST /api/sales/cart/apply-discounts` (or `/api/retail/cart/apply-discounts`).
   - Support min_qty, customer_tier, time_window, coupon_code.
   - Enforce role limits: CASHIER <= 10%, MANAGER <= 30%, ADMIN unlimited.
5. Return & Exchange Management:
   - `POST /api/sales/:id/return` (or `/api/retail/sales/:id/return`) with items and reason.
   - Restore stock, record in `sale_returns` and `sale_return_items`, generate credit note / refund transaction.
   - Prevent returning more than originally sold.
6. Tax Rounding & Precision Fix:
   - Replace JavaScript floating-point in tax/totals with integer-cent arithmetic (piastres/millimes internally).
7. Void Sale Audit Log:
   - In DELETE/void sale endpoint (`DELETE /api/retail/sales/:id` or `/api/sales/:id`), REQUIRE a non-empty `reason`.
   - If reason is missing or empty, return HTTP 400 with `{ error: "Reason required" }`.
   - Insert into `audit_log` with action `VOID_SALE`, user_id, sale_id, reason, timestamp.
8. Negative Inventory Prevention:
   - In sale completion, check requested quantity against current stock.
   - Reject with HTTP 409 and itemized stock errors `{ error: "Insufficient stock", items: [...] }` if requested > stock.
9. Cart State Persistence:
   - Persist active cart to `sessionStorage` on every change in PosView.tsx.
   - Restore cart from `sessionStorage` on page load/refresh.
10. Strict IMEI Stock Validation:
    - Before completing sale of phone/IMEI item, verify `imei_records.status = 'IN_STOCK'`.
    - Reject if not IN_STOCK.
    - Update `imei_records.status` to 'SOLD' upon sale completion.

Verification:
- Run `npx tsc --noEmit` in server/ (0 errors).
- Run `npx tsc -b` in client/ (0 errors).
- Run `npm test` in server/ (all 117 tests pass).
- Document changes and verification in changes.md and handoff.md in your working directory.
- Send completion message to orchestrator.
