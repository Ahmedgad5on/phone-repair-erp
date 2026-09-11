## 2026-09-10T03:18:52Z
You are Worker M4 (Fintech & Financial Management).
Your Working Directory: c:\Users\Eng_Ahmed\Desktop\pro\.agents\worker_m4_1
Authoritative Requirements: c:\Users\Eng_Ahmed\Desktop\pro\ORIGINAL_REQUEST.md
Master Plan: c:\Users\Eng_Ahmed\Desktop\pro\PROJECT.md
Survey Analysis: c:\Users\Eng_Ahmed\Desktop\pro\.agents\explorer_server_1\analysis.md and c:\Users\Eng_Ahmed\Desktop\pro\.agents\explorer_client_1\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write Ownership (exclusively):
- server/src/modules/fintech/
- server/src/modules/accounting/
- client/src/views/FintechView.tsx
- client/src/views/fintech/
- client/src/views/AccountingView.tsx

Your Objectives:
Implement all R4 requirements:
1. Double-Entry Accounting Validation:
   - In journal entry creation (`server/src/modules/accounting/accounting.router.ts`), validate `SUM(debits) === SUM(credits)`.
   - Reject unbalanced entries with HTTP 422 (change existing line 80 from status(400) to status(422)).
2. Wallet Balance Atomic Updates:
   - Wrap all wallet credit/debit operations in SQLite `BEGIN IMMEDIATE` transactions (`db.transaction(fn).immediate()`).
   - Add optimistic lock on `fintech_wallets.version`: check version matches, increment version on update; fail with conflict if version changed.
3. Prevent Journal Entry Modification:
   - In `server/src/modules/accounting/accounting.router.ts`:
     * Add `PATCH /journal-entries/:id` and `DELETE /journal-entries/:id`.
     * If journal entry status is 'POSTED', block modification and return HTTP 403 with `{ error: "Cannot modify posted journal entry" }`.
     * Allow only ADMIN to create a reversal entry (`POST /journal-entries/:id/reverse`).
4. 30-Day Projected Cash Flow:
   - Add `GET /api/fintech/cashflow/projection?days=30` aggregating incoming installments, recurring expenses, and payables.
   - Return day-by-day projected balance array.
   - Add line chart in FintechView.
5. Financial Approval Hierarchy for Large Payments:
   - Payments > 5000 EGP must go through multi-step approval in `approval_requests` table (CASHIER -> MANAGER -> CFO).
   - If payment > 5000 EGP is attempted without approved request, reject with HTTP 403 with `{ error: "Approval required for payments over 5000 EGP" }`.
   - Show pending approvals badge in FintechView.
6. Expense Management Module:
   - `expenses` table and full CRUD API (`/api/fintech/expenses` or `/api/accounting/expenses`).
   - Attach receipt images via upload module.
   - Auto-post journal entry on expense approval.
7. Customer Credit Limit Management:
   - `credit_limit` and `credit_used` in customers table.
   - Endpoint/guard blocking sale if `credit_used + new_sale > credit_limit`.
   - Credit usage progress bar in customer panel.
8. FintechView Bundle Split:
   - Refactor `client/src/views/FintechView.tsx` (63KB) into focused sub-components under `client/src/views/fintech/` using `React.lazy` + `Suspense` per tab (WalletsTab, LedgerTab, CashFlowTab, ExpensesTab, ApprovalsTab, BankReconciliationTab).
9. Bank Reconciliation Module:
   - `bank_statement_entries` table.
   - `POST /api/fintech/bank/import-csv` parsing CSV and matching against transactions by amount and date (±1 day tolerance).
   - Reconciliation UI showing matched/unmatched counts.
10. Automatic Withholding Tax Calculator:
    - Support `withholding_tax_rules` (supplier_type, rate).
    - Deduct withholding tax on supplier payment, post to liability account, integrate in PDF voucher.

Verification:
- Run `npx tsc --noEmit` in server/ (0 errors).
- Run `npx tsc -b` in client/ (0 errors).
- Run `npm test` in server/ (all 117 tests pass).
- Document changes and verification in changes.md and handoff.md in your working directory.
- Send completion message to orchestrator.
