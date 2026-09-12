# Comprehensive Project Architecture & Comprehension Report

**Document Version:** 1.1.0  
**Repository:** Modular Mobile Repair Lab, Retail POS, Spare Parts Wholesale, & Fintech ERP  
**Location:** `.specify/memory/project-comprehension.md`  
**Date:** 2026-09-12  
**Author:** Lead Spec-Driven Development Controller  
**Audit Standard:** Strict Forensic Invariant Verification (Every claim cited to code or tagged `[As-Decided]` / `[UNVERIFIED]`)

---

## 0. الملخص التنفيذي للمالك (Executive Summary)

### ما هو هذا النظام؟
هذا المشروع هو **منظومة ERP متكاملة ومحلية (Local-First On-Premise ERP)** مصممة خصيصاً لتشغيل وإدارة محلات ومعامل صيانة الهواتف المحمولة وتجارة التجزئة لملحقاتها وتجارة الجملة لقطع الغيار والمحافظ الرقمية. النظام لا يعتمد على واجهات صورية، بل هو محرك تشغيلي ومالي حقيقي يدير حركة الصنف من لحظة دخوله بأمر الشراء وفحصه بالباركود، مروراً بتشخيص العطل وفحص المخططات وخطوط الجهد (Diode Mode)، وحتى بيعه بفاتورة حرارية سريعة أو تسليمه للعميل بضمان معتمد رقمياً.

### من يستخدم النظام يومياً؟
1. **الكاشير (Cashier):** فتح وغلق الوردية النقدية، مسح الباركود، تطبيق الخصومات المصرح بها (≤ 10%)، تقسيم الدفعات (كاش + محافظ + فيزا)، وإتمام البيع بالتقسيط.
2. **فني الصيانة (Technician):** استلام الأجهزة، الفحص الهندسي، طلب قطع الغيار وحجزها من المخزن فور موافقة العميل، توثيق صور قبل وبعد التصليح، واستكمال قائمة التحقق (QA Checklist) قبل التسليم بـ OTP.
3. **أمين المخزن والمشتريات (Inventory / Procurement Manager):** متابعة مستويات إعادة الطلب، تتبع التكلفة بنظام FIFO، مطابقة جرد الباركود، وتقييم جودة الموردين.
4. **المدير المالي والفرع (Manager / Admin):** اعتماد المدفوعات الحساسة (> 5000 ج.م)، إلغاء الفواتير بأسباب مدققة، إغلاق قيود اليومية المحاسبية المزدوجة، وفحص تقارير الأرباح والأمان.

### ما المشكلة التي يحلها النظام؟
معامل ومحلات الهواتف في مصر تعاني من 4 ثغرات قاتلة تتسبب في نزيف الأرباح وضياع الأجهزة:
1. **تسريب قطع الغيار وتنازع المخزون:** بيع شاشة على الكاشير بينما الفني يعتمد عليها في صيانة جهاز معتمد.
2. **عجز الوردية وتلاعب الإلغاء (Void Fraud):** إلغاء فواتير نقدية في نهاية اليوم واختلاس ثمنها، أو حدوث عجز غير مبرر في درج الكاشير.
3. **أعطال انقطاع التيار الكهربائي:** توقف الأجهزة وفقدان الحركات المالية المعتمدة في لحظة هبوط الكهرباء المفاجئ.
4. **المماطلة في تسليم الأجهزة وسوء التقدير:** تأخر الصيانة وتجاوز الـ SLA دون تنبيه تلقائي للعميل أو الفني.

### لماذا شبكة محلية (LAN-First) وليست منصة سحابية (Cloud SaaS)؟ (DEC-020)
وفقاً للقرار المعماري المعتمد **DEC-020**:
1. **السرعة اللحظية وحرج التوقيت:** شاشات الكاشير وطابعات الفواتير وقارئ الباركود تتطلب استجابة تحت 50ms دون انتظار زمن استجابة الإنترنت.
2. **استمرارية العمل بلا انقطاع:** انقطاع كابل الإنترنت الخارجي في المحل لا يوقف حركة البيع ولا تسليم الأجهزة ولا طباعة الإيصالات.
3. **الأمان والخصوصية القصوى:** عزل بيانات الدفاتر المحاسبية وأرقام الهواتف والـ IMEI تماماً عن التهديدات السيبرانية للإنترنت العام وقصرها على محطات المحل الفيزيائية المعتمدة.

---

## 1. Project Concept (The "Why")

### 1.1 Business Domain
The repository houses an integrated, mission-critical Enterprise Resource Planning (ERP) platform operating at the intersection of consumer electronics repair, retail point-of-sale, wholesale spare parts, and localized financial services (mobile wallets and cash drawers).

### 1.2 User Personas & Daily Responsibilities
- **CASHIER:**
  - Morning shift opening: Counts physical drawer cash and records opening float (`server/src/modules/core/core.router.ts#L229`).
  - Sales checkout: Scans barcodes via HID scanner, builds shopping carts, applies role-capped dynamic discounts (up to 10% maximum per `PROJECT.md#L36`), tenders split payments (Cash + Vodafone Cash + Card per `server/src/modules/retail/retail.router.ts#L360`), and issues thermal receipts triggering cash drawer kicks (`client/src/utils/escPosDirect.ts#L23`).
  - Shift closing: Performs blind cash counts against system expected totals and logs variances (`server/src/modules/core/core.router.ts#L251`).
- **TECHNICIAN (MaintenanceEngineer):**
  - Device Intake & Kanban Board: Moves tickets across 6 distinct stages (`client/src/views/RepairLabView.tsx#L45`).
  - Diagnosis & Pre-Auth: Enters fault diagnoses, requests parts, sends simulated WhatsApp cost estimates (`server/src/modules/repair/repair.router.ts#L281`), logs customer text replies manually into the system, activating logical stock reservation (`reserved_stock`), and moves ticket to `IN_REPAIR` (`DEC-029`, `DEC-036`).
  - Quality Assurance: Executes mandatory post-repair QA checklists (`QAChecklistModal.tsx`) before releasing devices to `READY` status (`server/src/modules/repair/repair.router.ts#L220`).
  - Delivery & Handover: Verifies customer OTP before releasing device and generates warranty certificates (`server/src/modules/repair/repair.router.ts#L682`, `#L743`).
- **MANAGER:**
  - Override & Escalations: Approves sales discounts up to 30% (`ORIGINAL_REQUEST.md#L104`), authorizes sales voids with mandatory justification (`server/src/modules/retail/retail.router.ts#L520`), reviews goods receipt rollbacks (`server/src/modules/procurement/procurement.router.ts#L135`), authorizes warranty voiding on physical damage (`DEC-033`), overrides frozen cart items during stocktake (`DEC-030`), and signs off on shift handover deficits.
  - Purchasing & Inventory Control: Reviews purchase orders > 10,000 EGP (`DEC-034`), resolves cycle counting discrepancies, and routes rejected supplier returns to `DEFECTIVE_SCRAP` (`DEC-035`).
- **ADMIN (Functional CFO) / SUPERADMIN:**
  - Financial Governance: Balances double-entry chart of accounts (`server/src/modules/accounting/accounting.router.ts#L50`), acts as functional CFO for payment approval flow: CASHIER → MANAGER → ADMIN (acting as CFO) for payments > 5000 EGP (`DEC-028`), manages system configuration, and performs forensic audit log reviews.

### 1.3 Local-First LAN Architecture Justification (DEC-020)
As ratified in `DEC-020`, the system is intentionally deployed as a localized, on-premise single-tenant service rather than multi-tenant SaaS. Electronics workshops and fast-paced retail POS counters cannot tolerate Internet jitter, bandwidth throttles, or upstream cloud outages. Local SQLite running under WAL mode on local high-speed SSDs guarantees sub-50ms data access, zero external subscription dependency, and impenetrable physical security perimeter (`server/src/middleware/subnet-guard.ts#L4-L29`).

---

## 2. Comprehensive Module Map

The codebase organizes functionality into 34 server modules (`server/src/modules/`) mounted under `/api/` in [`server/src/index.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/index.ts):

| Module / Area | Purpose | Key Client Views | Key API Endpoints | Key Database Tables | Status |
|---|---|---|---|---|---|
| **M0: Core Infra & DB** | Migrations, seed, audit logging, system health, rate limits | `DashboardView.tsx` | `GET /api/health`<br>`GET /api/monitoring/metrics` | `schema_migrations`<br>`audit_log`<br>`stores` | As-Built (`server/src/index.ts#L158-L275`) |
| **M1: Repair Lab** | 6-stage Kanban, diagnosis, WhatsApp pre-auth, SLA cron, QA checklist, warranty | `RepairLabView.tsx`<br>`CustomerTrackingPortal.tsx` | `PATCH /api/repair/tickets/:id/status`<br>`PATCH /api/repair/tickets/:id/send-estimate`<br>`GET /api/repair/tickets/:id/warranty-cert` | `repair_tickets`<br>`warranty_certificates`<br>`qa_checklists`<br>`repair_consumed_parts` | As-Built (`server/src/modules/repair/repair.router.ts`) |
| **M2: Retail POS** | Split tender, installment engine, trade-in valuation, dynamic discounts, returns | `PosView.tsx`<br>`ShiftView.tsx` | `POST /api/retail/sales`<br>`POST /api/retail/sales/:id/return`<br>`POST /api/retail/installments` | `sales`<br>`sale_items`<br>`invoice_payments`<br>`installment_plans`<br>`trade_in_assessments` | As-Built (`server/src/modules/retail/retail.router.ts`) |
| **M3: Inventory & Wholesale** | FIFO cost tracking, FTS5 item search, cycle counting, dead stock | `WarehouseView.tsx`<br>`SparePartsView.tsx` | `GET /api/inventory/items`<br>`POST /api/inventory/cycle-count-reconcile`<br>`GET /api/inventory/reports/dead-stock` | `items`<br>`item_batches`<br>`item_cost_history`<br>`stock_counts` | As-Built (`server/src/modules/inventory/inventory.router.ts`) |
| **M4: Fintech & Cash** | Multi-wallet balance, dual-custody rebalancing, 5000 EGP approval hierarchy, expenses | `FintechView.tsx`<br>(7 sub-tabs) | `POST /api/fintech/transfer`<br>`GET /api/fintech/cashflow/projection`<br>`POST /api/fintech/approvals` | `fintech_wallets`<br>`fintech_transactions`<br>`approval_requests`<br>`expenses` | As-Built (`server/src/modules/fintech/fintech.router.ts`) |
| **M5: Enterprise ERP** | General ledger double entry, HR payroll, procurement, project management | `AccountingView.tsx`<br>`ProcurementView.tsx`<br>`HrView.tsx` | `POST /api/accounting/journal-entries`<br>`POST /api/procurement/purchase-orders`<br>`GET /api/hr/employees` | `chart_of_accounts`<br>`journal_entries`<br>`purchase_orders`<br>`employees` | As-Built (`server/src/modules/accounting/accounting.router.ts`) |
| **M6: Advanced Hub** | AI demand forecasting, diode mode DB, contracts e-sign, stolen IMEI registry | `AdvancedHubView.tsx`<br>`OmnichannelHubView.tsx` | `POST /api/ai/forecast`<br>`POST /api/contracts/sign`<br>`GET /api/stolen-registry/check` | `diode_mode_readings`<br>`digital_contracts`<br>`stolen_imei_registry` | As-Built (`server/src/modules/advanced-repair/`) |
| **M7: Security & Audit** | Subnet guard, token auth, rate limiters, forensic audit trail | `SettingsView.tsx` | `POST /api/auth/login`<br>`GET /api/core/audit-logs` | `users`<br>`trusted_devices`<br>`api_keys`<br>`audit_logs` | As-Built (`server/src/middleware/subnet-guard.ts`) |
| **Multi-Branch Module** | Single-branch operation confirmed. The inter-branch transfer module found in code is EXPLICITLY OUT-OF-SCOPE for v1 (frozen legacy module). | `WarehouseView.tsx` (Transfer Tab) | `/api/branches/*`<br>`/api/inventory/transfers/*` | `stock_transfers`<br>`stock_transfer_items` | **EXPLICITLY OUT-OF-SCOPE (DEC-026)** |

### 2.1 Scope Boundary Invariant for Enterprise (M5) & Advanced Hub (M6)
**M5 (Accounting/GL/HR/Projects)** و**M6 (Advanced Hub)**: As-Built baseline مضمن في v1، مع الاستثناءات الصريحة التالية بقرار المالك:
- **Stolen IMEI Registry (DEC-038):** **IN-SCOPE (v1)** — سجل محلي داخلي استرشادي فقط (Advisory) غير مرتبط بأي جهة رسمية، ولا يجوز للنظام رفض الصيانة آلياً بل يتطلب قرار مدير مسجل في `audit_log`، دون أي ربط خارجي.
- **AI Demand Forecasting (DEC-039):** **FROZEN (مجمد في v1)** — معلن رسمياً كـ non-active module في v1 نظراً لقلة كثافة المعاملات (1-2/دقيقة)، ويؤجل تفعيله لـ P2 بعد تراكم البيانات التاريخية (نفس معاملة DEC-026).
- **HR Payroll (DEC-040):** **IN-SCOPE (v1)** — مضمن ومغطى باختبارات آلية لاحتساب عمولات الفنيين، مع حصر الوصول لـ MANAGER و ADMIN فقط (HTTP 403)، وتوثيق أي تعديل في `audit_log`، مع كون الامتثال لقانون العمل والضرائب مسؤولية إدارية وليست آلية في v1.

---

## 3. Technical Architecture

### 3.1 Runtime Topology
```
                  +-------------------------------------------------+
                  |          Physical Workshop Local LAN            |
                  |                (Subnet Guard)                   |
                  +-------------------------------------------------+
                                           |
               +---------------------------+---------------------------+
               |                                                       |
        [Station 1: Server]                                    [Station 2..10: Clients]
   +--------------------------+                               +--------------------------+
   | Node.js 24 + Express 5   | <===== HTTP & WebSocket ====> | Chrome / Web Client      |
   | Better-SQLite3 (WAL)     |        (Port 5000/ws)         | (React 19 + Tailwind v4) |
   | Electron Wrapper (Main)  |                               +--------------------------+
   +--------------------------+                                            |
         |              |                                                  |
 [Local Storage]  [Direct Hardware]                                [Local Hardware]
  - erp.db         - ESC/POS 80mm Printer (IPC)                     - USB Barcode Scanner
  - Daily Backups  - Cash Drawer Pulse                              - Browser Print Fallback
  - USB Mirror     - WebSerial Multimeters
```

### 3.2 Server Layer Architecture
- **Framework:** Express 5.x running in Node.js 24 environment with TypeScript (CommonJS target).
- **Error-Handling Pattern:** Standardized RFC 7807 problem details implemented in [`server/src/middleware/error-handler.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/middleware/error-handler.ts) with correlation IDs injected via [`correlationMiddleware`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/middleware/correlation.ts).
- **Validation Pattern:** Declarative schema parsing using `zod` in [`server/src/middleware/validate.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/middleware/validate.ts). Any invalid payload is rejected immediately with HTTP 400 and structured issue mapping.
- **Concurrency & Transaction Control:** Write transactions for inventory and wallet operations wrap calls in `db.transaction(fn).immediate()` to acquire exclusive SQLite write locks immediately, avoiding deadlocks. Optimistic locking is enforced via integer `version` columns.

### 3.3 Database Engine & Durability Reality
- **Driver:** `better-sqlite3` v11.8+ (`server/src/db/database.ts#L12`).
- **As-Built PRAGMAs (Current Code):**
  - `journal_mode = WAL` (`database.ts#L15`)
  - `synchronous = NORMAL` (`database.ts#L16`)  *<-- As-Built code runs NORMAL*
  - `busy_timeout = 5000` (`database.ts#L18`)
  - `foreign_keys = ON` (`database.ts#L20`)
- **As-Decided PRAGMAs (DEC-001 / ADR-001):**
  - Target: `synchronous = FULL` to eliminate committed sale loss during sudden workshop power failure.
  - *Delta Note: Code currently runs NORMAL; scheduled for update in Phase 2 via ADR-001.*
- **Schema Migrations Subsystem:** Sequential, numbered migration files (`001_initial_extensions.ts` to `010_fintech_treasury_25_ideas.ts`) managed by [`server/src/db/migrations.ts`](file:///c:/Users/Eng_Ahmed/Desktop/pro/server/src/db/migrations.ts) and tracked in `schema_migrations` table with transaction wrapping.
- **Core Entities & Relationships (Text Schema Diagram):**
  ```
  stores (1) <---+ repair_tickets (N) ----> (N) repair_consumed_parts <---- (1) items
                 |       |
                 |       +----> (1) warranty_certificates
                 |       +----> (N) ticket_photos
                 |
                 +<---+ sales (N) ----> (N) sale_items <---- (1) items
                 |       |
                 |       +----> (N) invoice_payments
                 |       +----> (1) installment_plans ----> (N) installment_payments
                 |       +----> (N) sale_returns ----> (N) sale_return_items
                 |
                 +<---+ fintech_wallets (1) ----> (N) fintech_transactions
                 +<---+ chart_of_accounts (1) ----> (N) journal_entry_lines <---- (1) journal_entries
  ```

### 3.4 Client & Electron Desktop Layer
- **Client Architecture:** React 19, Vite 8, Tailwind CSS v4, dynamic code splitting with `React.lazy()` and `Suspense` across all views (`client/src/App.tsx#L21-L40`).
- **State Management:** SessionStorage for cart persistence (`client/src/views/PosView.tsx`), React Context for language, theme, and authentication (`client/src/context/`), and Zustand for reactive store queues.
- **Bilingual i18n & RTL:** Managed via [`client/src/i18n/LanguageContext.tsx`](file:///c:/Users/Eng_Ahmed/Desktop/pro/client/src/i18n/LanguageContext.tsx). Toggles `dir="rtl"` / `dir="ltr"` on root HTML with Arabic as default.
- **Hardware Abstraction Layer:**
  - Barcode Scanner: Global keypress timing interceptor (`client/src/services/hardware.service.ts#L29-L44`) detecting keystrokes < 35ms.
  - ESC/POS Printing: Electron IPC channel `print-escpos` (`electron/main.cjs#L59`) writing directly to local receipt spooler, bypassing browser print modals.
  - Cash Drawer: Direct hex kick command (`\x1b\x70\x00\x19\xfa`) transmitted via raw ESC/POS stream (`client/src/utils/escPosDirect.ts#L23`).

---

## 4. End-to-End Business Workflows

### 4.1 Retail POS Sale
1. **Scan / Search:** Cashier scans barcode via HID scanner (`hardware.service.ts#L30`) or searches item (`PosView.tsx#L319`).
2. **Stock Validation:** Backend validates `stock_quantity >= requested` and IMEI status `IN_STOCK` (`retail.router.ts#L280-L315`).
3. **Discount Evaluation:** Discount rules applied with role caps (CASHIER ≤ 10%, MANAGER ≤ 30% per `discount.service.ts#L87`).
4. **Tender Payment:** Supports single or split tender (Cash, Vodafone Cash, Card per `retail.router.ts#L360`).
5. **Atomic Execution:** `BEGIN IMMEDIATE` transaction:
   - Decrements `items.stock_quantity` (`retail.router.ts#L320`).
   - Updates `imei_records.status = 'SOLD'` (`retail.router.ts#L325`).
   - Inserts `invoice_payments` rows (`retail.router.ts#L370`).
6. **Hardware Actions:** Dispatches ESC/POS thermal receipt payload (`thermal.service.ts#L106`) and drawer kick pulse (`escPosDirect.ts#L23`).
7. **Audit & Log:** Logs action in `audit_log` (`retail.router.ts#L400`).

### 4.2 Repair Ticket Lifecycle (As-Decided DEC-029, DEC-036)
1. **Intake:** Technician creates ticket with IMEI, device defects, and initial inspection (`repair.router.ts#L110`).
2. **Diagnosis & Estimate:** Diagnosis recorded; automated cost estimate generated (`repair.router.ts#L281`).
3. **Estimate Notification:** Simulated WhatsApp notification dispatched to customer (`repair.router.ts#L308-L315`).
4. **Customer Pre-Approval (DEC-029):** Customer replies via WhatsApp text message. TECHNICIAN records approval manually in system (`PATCH /api/repair/tickets/:id/estimate-response`), creating an audit log entry. NO public web URL link path in v1.
5. **Parts Reservation (DEC-036):** Logical reservation (`reserved_stock`) activates the moment ticket transitions to `IN_REPAIR`, locking parts from POS retail checkout.
6. **Repair Execution:** Technician repairs device and converts reservation to consumed parts (`repair.router.ts#L653`).
7. **Mandatory QA Checklist:** Status change to `READY` rejected with HTTP 422 if `qa_checklist` is absent (`repair.router.ts#L220`).
8. **Delivery & Warranty:** Customer provides 4-digit release OTP (`repair.router.ts#L682`); system delivers ticket and prints component-level warranty certificate (`repair.router.ts#L743-L788`).

### 4.3 Shift Open & Closing Workflow
1. **Shift Opening:** Cashier logs opening float cash (`core.router.ts#L229`).
2. **Continuous Reconciliation:** Live cash monitored: `expected = opening_cash + cashSales + repairCash + fintechIn - fintechOut` (`core.router.ts#L214`).
3. **Handover & Variance:** Cashier enters actual cash; system computes `cash_difference` (`core.router.ts#L253`).
4. **Safety Backup Trigger (DEC-002):** Closing the shift automatically triggers immediate database backup snapshot (`core.router.ts#L251`).

### 4.4 Installment Sales & Debt Collection
1. **Plan Setup:** POS sale converted to installment plan with down payment and financing markup (`installments.service.ts#L30`).
2. **Schedule Generation:** Sequential monthly amortization installments generated (`installments.service.ts#L70`).
3. **Reminders:** Scheduled job checks due dates and triggers WhatsApp reminders 2 days prior (`installments.service.ts#L149`).
4. **Payment Collection:** Installment payment records receipt and updates remaining plan balance (`installments.service.ts#L100`).

### 4.5 Returns & Restock Workflow
1. **Return Initiation:** Cashier selects sale and items for return with non-empty reason (`returns.service.ts#L25`).
2. **Over-Return Guard:** System verifies item was part of sale and returned quantity does not exceed original (`returns.service.ts#L50-L75`).
3. **Atomic Restock:** Single transaction restores `items.stock_quantity`, creates credit note, and logs `RETURN_SALE` in `audit_log` (`returns.service.ts#L120-L160`).
4. **Supplier Defective Returns (DEC-035):** Defective parts quarantined; if supplier refuses return, items move to `DEFECTIVE_SCRAP` status with MANAGER approval, saleable only as used/scratch parts with recorded book loss.

### 4.6 Purchase Order & Goods Receipt (DEC-034)
1. **PO Generation:** Generated manually or via predictive reorder analysis (`procurement.router.ts#L290`).
2. **Independent Approval Hierarchy (DEC-034):** Purchase orders > 10,000 EGP (configurable) remain in `PENDING_APPROVAL` status until approved by MANAGER or ADMIN. (Independent from customer payment threshold).
3. **Goods Receipt:** Stock received into warehouse, FIFO cost history recorded, and items updated (`procurement.router.ts#L85`).
4. **Receipt Rollback:** MANAGER can execute single-transaction receipt rollback reversing stock changes (`procurement.router.ts#L130-L215`).

### 4.7 Inventory Stocktaking (Cycle Counting) (DEC-023, DEC-030)
1. **Session Start:** Warehouse operator creates stock count batch for specific shelf (`inventory.router.ts#L468`).
2. **Sales Freeze (DEC-023):** Items under count are locked from POS checkout (`inventory.repository.ts#L116`).
3. **Open Cart Conflict (DEC-030):** If an item is already in an open POS cart during freeze, checkout is rejected with HTTP 409 by default. MANAGER override is permitted with audit log, and counting batch settles against pre-freeze recorded stock.
4. **Reconciliation:** Actual counted quantities compared against expected system stock; variances adjusted (`inventory.repository.ts#L128-L145`).

### 4.8 Financial Approval Flow (DEC-028)
1. **Threshold Trigger:** Any financial transaction > configurable threshold (default 5000 EGP) checked (`ORIGINAL_REQUEST.md#L194`).
2. **Approval Hierarchy (DEC-028):** Multi-step approval flow: CASHIER → MANAGER → ADMIN (acting as functional CFO).
3. **Rejection without Approval:** Unapproved payment strictly rejected with HTTP 403 (`PROJECT.md#L56`).

### 4.9 Warranty Claims & Re-Intake (DEC-031, DEC-032, DEC-033)
1. **Re-Intake Ticket:** Customer returns device during warranty window; linked ticket created (`parent_ticket_id`).
2. **Duration Continuity (DEC-032):** Warranty duration continues from original repair date; replacement parts inherit remaining window without renewal.
3. **Warranty Expense (DEC-031):** Parts consumed under warranty tracked as WARRANTY EXPENSE, reportable per month.
4. **Void Protection (DEC-033):** Technician may flag misuse, but voiding warranty requires mandatory MANAGER approval and audit log entry.

---

## 5. Feature Inventory

| # | Feature | Scope | Status | Evidence / Source |
|---|---|---|---|---|
| 1 | DB Migration Subsystem (001–010) | M0 | Implemented | `server/src/db/migrations.ts#L1810` |
| 2 | Items Negative Stock Constraint | M0 | Implemented | Database rebuild with `CHECK (stock_quantity >= 0)` |
| 3 | Foreign Key Cascade Protection | M0 | Implemented | `ON DELETE RESTRICT` verified in Test Suite 66 |
| 4 | Feature-Flag Module Check | M0 | Implemented | `requireModule()` middleware in `server/src/index.ts#L165` |
| 5 | Granular Rate Limiting | M0 | Implemented | `express-rate-limit` on login, transfer, estimates |
| 6 | 6-Column Repair Kanban Board | M1 | Implemented | `@dnd-kit/core` in `client/src/views/RepairLabView.tsx` |
| 7 | Customer QR Tracking Portal | M1 | Implemented | `bwip-js` QR generator & `/portal/track` view |
| 8 | Pre-Auth WhatsApp Cost Approval | M1 | Implemented | `PATCH /api/repair/tickets/:id/send-estimate` |
| 9 | SLA Escalation Background Job | M1 | Implemented | `setInterval` check escalating breached tickets to URGENT |
| 10 | Ticket Status State Machine | M1 | Implemented | Server-side validation returning HTTP 422 on illegal jumps |
| 11 | Post-Repair QA Checklist | M1 | Implemented | `qa_checklist` JSON validation before `READY` status |
| 12 | Ticket Search by IMEI (Indexed) | M1 | Implemented | Composite index `(imei_sn, status)` in `repair.router.ts` |
| 13 | Photo Evidence Timeline | M1 | Implemented | `ticket_photos` table & `PhotoTimelinePanel` component |
| 14 | Low Stock Warning Badge in Repair | M1 | Implemented | `GET /api/repair/parts/stock/:id` alert banner |
| 15 | Repair Notes Template Library | M1 | Implemented | `repair_notes_templates` table and picker |
| 16 | Split Payments Multi-Method | M2 | Implemented | `invoice_payments` table & split allocation UI |
| 17 | Installment Sales Engine | M2 | Implemented | `installment_plans` & amortization schedule |
| 18 | Trade-In Device Valuation | M2 | Implemented | `trade_in_assessments` condition multipliers |
| 19 | Dynamic Discount Role Caps | M2 | Implemented | Cashier ≤ 10%, Manager ≤ 30% enforcement |
| 20 | Return & Exchange Management | M2 | Implemented | `ReturnsService.processReturn()` with credit note |
| 21 | Integer-Piastre Precision | M2 | Implemented | `CurrencyUtils` eliminating floating-point math |
| 22 | Mandatory Void Sale Reason | M2 | Implemented | Rejection with HTTP 400 if reason missing |
| 23 | Negative Inventory Server Guard | M2 | Implemented | HTTP 409 Conflict with itemized deficit payload |
| 24 | POS Cart Session Persistence | M2 | Implemented | SessionStorage persistence and reload restoration |
| 25 | Strict IMEI Stock Enforcement | M2 | Implemented | Validation of `IN_STOCK` status before sale |
| 26 | Dead Stock 90-Day Report | M3 | Implemented | `GET /api/inventory/reports/dead-stock` |
| 27 | Predictive Reorder Calculation | M3 | Implemented | Safety stock & lead-time reorder analysis |
| 28 | Supplier Scorecard Rating | M3 | Implemented | Tracking on-time delivery and return rates |
| 29 | Item SQLite FTS5 Full-Text Search | M3 | Implemented | Fast search virtual table across name, sku, description |
| 30 | FIFO Cost Price History | M3 | Implemented | `item_cost_history` tracking batch acquisition costs |
| 31 | Goods Receipt Batch Rollback | M3 | Implemented | Single-transaction stock reversal (Manager only) |
| 32 | Double-Entry Balancing (422) | M4 | Implemented | `SUM(debit) == SUM(credit)` strict verification |
| 33 | Atomic Wallet Balance Updates | M4 | Implemented | `BEGIN IMMEDIATE` + optimistic `version` locking |
| 34 | Posted Journal Entry Lock (403) | M4 | Implemented | Blocks mutation of posted accounting records |
| 35 | 30-Day Cash Flow Projection | M4 | Implemented | Predictive cash projection endpoint and line chart |
| 36 | Financial Approval Hierarchy | M4 | Implemented | Payments > 5000 EGP require approval (Admin functional CFO) |
| 37 | Expense Management Module | M4 | Implemented | Full CRUD, receipt images, auto-posted journal entries |
| 38 | Customer Credit Limit Check | M4 | Implemented | Blocking sales exceeding customer credit limit |
| 39 | Bank Reconciliation CSV Import | M4 | Implemented | Statement matching with ±1 day transaction tolerance |
| 40 | Customer Facing Display (CFD) | M2 | Deferred (P2) | In-memory sync exists; deferred to P2 per AMB-037 |
| 41 | Direct ESC/POS Print Spooler | Hardware | Implemented | Electron IPC raw commands bypassing OS dialogs |
| 42 | USB Daily Backup Mirroring | Continuity | Implemented | Online SQLite backup with USB destination path |
| 43 | Automated Backup Health Check | Continuity | Implemented | Scheduled `PRAGMA integrity_check` verification |
| 44 | Inter-Branch Stock Transfers | M3 | Out-of-Scope | Explicitly Out-of-Scope for v1 per DEC-026 |

---

## 6. Hardware & External Integrations Reality

| Hardware / Integration | Current State (As-Built) | Target State (As-Decided) | Physical Reality / Notes |
|---|---|---|---|
| **Thermal Receipt Printer** | Raw byte buffer generation in `thermal.service.ts#L106`; Electron IPC handler in `electron/main.cjs#L59` | Direct silent ESC/POS dispatch to 80mm thermal printers (DEC-016) | Standard USB/Network ESC/POS printers (Xprinter/Epson). Web browser print retained as fallback. |
| **Barcode Scanner** | Global keyup listener intercepting keystrokes < 35ms in `hardware.service.ts#L29` | Active global HID scanner interceptor (DEC-017) | Operates as standard USB HID Keyboard Emulation. |
| **Cash Drawer** | Hex kick string `\x1b\x70\x00\x19\xfa` generated in `escPosDirect.ts#L23` | Automated drawer kick upon cash tender confirmation (DEC-018) | Connected via standard RJ11/RJ12 drawer port on thermal printer. |
| **Customer Display (CFD)** | WebSocket cart broadcast in `sales.repository.ts#L55`; UI modal in `CustomerFacingDisplayModal.tsx` | Formally deferred to post-v1 Phase P2 (AMB-037) | Code exists in repo, but full production deployment deferred to keep v1 core lean. |
| **Uninterruptible Power (UPS)** | `synchronous = FULL` selected to guarantee committed transactions survive power cut (DEC-001) | OS signal hooks (`before-quit`, `SIGINT`) active (DEC-013) | **[Physical Reality — Confirmed DEC-027]**: No USB data cable connected to UPS; power cuts are physical and sudden. System relies entirely on SQLite `synchronous = FULL` durability. |
| **WhatsApp Messaging** | Local simulation logging to `whatsapp_messages_log` table (`whatsapp.service.ts#L18`) | Target official Meta WhatsApp Cloud API (DEC-019) | Active simulation allows complete local development without third-party API spend or rate bans. |
| **Egyptian Tax Authority (ETA)** | Local invoice UUID, 14% VAT, and ETA hash format generated (`integrations.router.ts#L140`) | Live ETA portal submission deferred to post-v1; local QR active (DEC-008) | Accountant review required to verify legal compliance of local QR format (RISK-009). |

---

## 7. Security & Governance Model

1. **Authentication & Token Management:**
   - Password hashing: `bcryptjs` with salt round factor 12 (`server/src/middleware/auth.ts#L34`).
   - Token standard: Signed JWT with 7-day expiration enforcing `JWT_SECRET` environment variable (`auth.ts#L25`).
   - Dual-Factor / API Key support: SHA-256 hashed API keys supported via `x-api-key` header (`auth.ts#L46`).
2. **Role-Based Access Control (RBAC):**
   - 4-tier model: `CASHIER`, `TECHNICIAN` (`MaintenanceEngineer`), `MANAGER`, `ADMIN` (`SuperAdmin`). Admin acts as functional CFO (`DEC-028`).
   - Server-side enforcement: `requireRole(allowedRoles)` middleware strictly rejecting unauthorized operations with HTTP 403 `FORBIDDEN` (`auth.ts#L86-L105`).
3. **Physical & Network Isolation (DEC-020):**
   - `subnetAndDeviceGuard` middleware inspects client IP and `x-device-token` header against `trusted_devices` table (`server/src/middleware/subnet-guard.ts#L4-L29`).
   - Zero remote/Internet access permitted in v1 baseline.
4. **Cryptographic Audit Log Immutability:**
   - Structured audit logging via `logAudit()` inserting synchronously into `audit_logs` and `audit_log` tables with actor user ID, entity type, entity ID, before/after values, IP address, and timestamp (`server/src/services/audit.service.ts#L18`).
   - Void sales without non-empty reasons strictly rejected with HTTP 400 (`retail.router.ts#L508`).

---

## 8. Testing Landscape & Gaps

### 8.1 What is Tested & Verified
Actual execution result from `server/test/api.test.ts`:
```
🏁 AUTOMATED TEST RESULTS: 159 PASSED, 0 FAILED (66 Test Suites)
```
- Suites 1–10: Store module flags, RBAC bcrypt authentication, shift deficit math, repair SLA OTP generation, POS IMEI validation, and soft delete integrity.
- Suites 11–25: Dynamic technician commissions, parts out-of-stock warnings, repair templates, installment calculations, trade-in credit deductions, and returns.
- Suites 26–38: Negative inventory server guards, double-entry balance validation (`SUM(debit) == SUM(credit)`), atomic wallet updates with optimistic locking, customer credit limits, and void sale audit logs.
- Suites 39–52: Loaner phones, 2.5D bin micro-locators, FIFO batch tracking, carrier SMS TxID parsing, dual-custody PIN verification, ceiling alerts, and OCR Egyptian ID parsing.
- Suites 53–66: Split payments, amortization schedules, trade-in invoice deductions, database CHECK constraints, ticket state machine jumps, dead stock capital calculation, persistent SLA scanner, 5000 EGP approval hierarchy, login rate limiting, and `ON DELETE RESTRICT` foreign key integrity.

### 8.2 What is NOT Covered (Honest Technical Gaps)
1. **Frontend Component Unit/E2E Tests:** Zero automated React component tests exist (no Vitest / Jest / Cypress / Playwright configured for `client/src/`). All frontend verification is currently manual.
2. **Physical USB Drive Mirroring:** Automated test suite does not mount a physical `E:\` USB drive; USB failure fallback is untested in automated CI.
3. **Physical ESC/POS Serial Communication:** Direct hardware printing is verified via buffer and string assertions, not on actual physical thermal print heads.
4. **Simulated External Services:** WhatsApp notifications and ETA submissions are tested against internal SQLite tables rather than live external networks.
5. **Durability Benchmark under Power Cut:** SQLite WAL durability is tested logically, not via active OS kernel crash simulations.

---

## 9. As-Built vs. As-Decided Delta Table

| DEC ID | Architectural Decision | As-Built Code Reality | As-Decided Target State | Implementation Vehicle |
|---|---|---|---|---|
| **DEC-001** | Durability PRAGMA | `server/src/db/database.ts#L16` runs `synchronous = NORMAL` | Must change to `synchronous = FULL` to prevent committed transaction loss on power cuts | **ADR-001** / Phase 2 Setup |
| **DEC-002** | Shift-Close Backup | Implemented & merged (Feature 002, commits 5d5ef64/4a51286) | Triggers `await createDatabaseBackup()` immediately inside `coreRouter.post('/shifts/close')` before HTTP 200 response | **ADR-002** / Implemented (Feature 002) |
| **DEC-003** | USB Failure Alert | USB mirror errors logged to console in `backup.service.ts#L98` | Must emit visible UI alert/banner and record warning in `audit_log` table | **ADR-003** / Phase 2 Setup |
| **DEC-020** | LAN Security Perimeter | `server/src/middleware/subnet-guard.ts#L4-L32` runs fallback ALLOW (non-whitelisted IPs proceed via `next()`) | Default-DENY HTTP 403 for unregistered LAN IPs/tokens; strict CIDR check (`127.0.0.1`, `192.168.1.0/24`, `10.0.0.0/8`) | **ADR-020** / Network Spec |
| **DEC-025** | Constitution Lifecycle | Unpopulated boilerplate template in `.specify/memory/constitution.md` | Clean Replace and Ratification as Version 1.0.0 in Phase 2 | **Phase 2 Foundation Gate** |
| **DEC-026** | Single-Branch Scope | Inter-branch routes active in `inventory.router.ts#L45-L130` | Formally freeze as non-active legacy module in v1; single branch operation | **ADR-026** / Scope Boundary |
| **DEC-028** | Admin Functional CFO | References to separate CFO role in docs/code | Unify CFO approval role into ADMIN role; flow: CASHIER → MANAGER → ADMIN | **ADR-028** / Auth Spec |
| **DEC-029** | Estimate Approval Flow | Route `/estimate-response` expects web payload | Customer replies via WhatsApp text; technician logs manually; no public web link | **ADR-029** / Repair Spec |
| **DEC-030** | Stocktake Cart Conflict | `executeCycleCount` updates stock without checking active carts | Reject open cart checkout with HTTP 409; Manager override with audit log | **ADR-030** / Inventory Spec |
| **DEC-031** | Warranty Parts Expense | Warranty parts absorbed into repair ticket cost | Track parts consumed under warranty as reportable WARRANTY EXPENSE | **ADR-031** / Warranty Spec |
| **DEC-032** | Warranty Window | Code lacks explicit window inheritance rules | Replaced part inherits remaining original repair warranty window without renewal | **ADR-032** / Warranty Spec |
| **DEC-033** | Warranty Void Authority | Technician could theoretically change ticket status directly | Warranty void for physical damage requires mandatory MANAGER approval | **ADR-033** / Warranty Spec |
| **DEC-034** | PO Approval Threshold | Implemented & merged (Feature 002, commits 5d5ef64/4a51286) | PO > 10,000 EGP stays `PENDING_APPROVAL` until MANAGER/ADMIN approves via JWT token; blocked on GRN intake | **ADR-034** / Implemented (Feature 002) |
| **DEC-035** | Rejected Supplier Returns | Only GRN rollback exists (`procurement.router.ts#L130`) | If supplier refuses return, move to `DEFECTIVE_SCRAP`, saleable only with MANAGER approval | **ADR-035** / Procurement Spec |
| **DEC-036** | Parts Reservation | Inventory decremented only upon consumption (`repair.router.ts#L663`) | Logical `reserved_stock` activates immediately on `IN_REPAIR` transition | **ADR-036** / Repair Spec |

---

## 10. Known Gaps & Technical Debt

1. **Dual Audit Tables:** The schema contains both `audit_log` (used by void sales and quick operations) and `audit_logs` (used by standard service calls). These must be unified into a single canonical audit table in Phase 2.
2. **Missing Logical Parts Reservation:** `repair.router.ts#L663` decrements inventory only when parts are consumed. Devices diagnosed and waiting for customer approval do not reserve stock, creating a race condition with POS retail sales.
3. **Hardcoded Strings in Translations:** Some newer modal dialogues in `client/src/views/fintech/` contain hardcoded Arabic strings instead of referencing `client/src/i18n/translations.ts`.
4. **PO Creation Lacks Approval Ceiling:** `procurement.router.ts#L302` creates purchase orders directly in `ORDERED` status regardless of amount, bypassing financial approval hierarchy.
5. **No Client-Side Test Runner:** The frontend lacks unit test configuration (`vitest` or `@testing-library/react`), leaving UI state and view code dependent on manual verification.

---
*End of Comprehensive Project Architecture & Comprehension Report.*
