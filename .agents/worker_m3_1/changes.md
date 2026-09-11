# Changes Summary — Milestone 3 (Inventory & Spare Parts)

## 1. Scope & Ownership
- **Exclusive Write Ownership**:
  - `server/src/modules/inventory/`
  - `server/src/modules/procurement/`
  - `server/src/modules/spare-parts/`
  - `client/src/views/SparePartsView.tsx`
  - `client/src/views/WarehouseView.tsx`
  - `client/src/components/inventory/`

---

## 2. Server Implementation Details

### A. Inventory Service (`server/src/modules/inventory/inventory.service.ts`)
- **Self-Healing & Schema Integrity (`ensureTablesAndSeed`)**:
  - Automatically verifies and alters tables if columns are missing: adds `reorder_point` column to `items`, `supplier_name` to `supplier_scores`, and `item_id` to `purchase_order_items`.
  - Automatically rebuilds the FTS5 virtual index (`items_fts`) using `delete-all` and `rebuild` commands so that FTS is synchronized with the existing items table.
  - Seeds default suppliers, supplier scorecard records, initial `item_cost_history` rows, `item_compatibility` records, and dead stock items for realistic testing.
- **Negative Stock DB Constraint & Decrement Guard (R3.1)**:
  - Checked existing table schema check constraints (`CHECK(stock_quantity >= 0)`).
  - Enforced atomic transaction decrements with upfront quantity validation (`WHERE stock_quantity >= ?`) throwing 400/409 errors if on-hand quantity is insufficient.
- **Dead Stock Identification & Clearance Pricing (R3.2)**:
  - `getDeadStockReport(days = 90)`: Filters items where `last_sold_date` or `created_at` exceeds the threshold days and `stock_quantity > 0`. Computes `days_inactive`, `total_tied_capital = stock_quantity * purchase_price`, `total_dead_items`, and `total_dead_units`.
  - `markItemForClearance(itemId, { discount_percent, clearance_price, note })`: Dynamically updates `retail_price` and tags item notes with clearance status.
- **Automatic Reorder Point Calculation (R3.3)**:
  - `getReorderAnalysis(itemId)`: Calculates daily usage from transaction/sales history over the last 30 days (`avg_daily_usage`), factors in supplier `lead_time_days` (default 7) and `safety_factor` (1.5).
  - Formula: `calculated_reorder_point = CEIL(avg_daily_usage * lead_time_days * safety_factor)`.
  - `calculateAndApplyAllReorderPoints()`: Runs recalculation across all items and updates `reorder_point` and `min_limit` columns.
  - Background Job: Runs daily with a timer configured with `.unref()` so tests and processes terminate cleanly.
- **Supplier Scorecard (R3.4)**:
  - Schema: `supplier_scores` tracking `on_time_rate`, `quality_rate`, `return_rate`, `total_orders`, and `tier`.
  - Tier Classification Logic:
    - Tier A (Preferred): on-time rate >= 90% and quality rate >= 90% and return rate <= 3%
    - Tier B (Approved): on-time rate >= 75% and quality rate >= 75% and return rate <= 8%
    - Tier C (Probation): any score below threshold
  - Automatically updated on Purchase Order receipts (`updateSupplierScoreOnPoReceipt`) and RMA returns (`updateSupplierScoreOnReturn`).
- **Inter-Branch Stock Transfers & Two-Phase Approval (R3.5)**:
  - `createStockTransferRequest(...)`: Creates transfer with status `'PENDING'`.
  - `approveStockTransferRequest(id, approvedBy)`: In an immediate transaction, verifies source warehouse has sufficient stock, decrements from source warehouse and increments destination warehouse, updates transfer status to `'APPROVED'`, creates audit log, and emits WebSocket event `wsService.broadcast('STOCK_TRANSFER_APPROVED', ...)`.
  - `rejectStockTransferRequest(id, reason)`: Sets transfer status to `'REJECTED'`.
- **Item Full-Text Search (FTS5) (R3.6)**:
  - `searchItemsFts(query)`: Executes query against SQLite `items_fts` matching tokens with prefix wildcard `*`.
  - Automatically falls back to sanitized SQL `LIKE` if FTS syntax errors occur.
- **Cost Price History & FIFO Valuation (R3.7 & R3.9)**:
  - `recordCostPriceHistory(itemId, costPrice, poId)`: Inserts chronological record into `item_cost_history`.
  - `getFifoValuationReport()`: For every item with on-hand quantity, walks back through `item_cost_history` in FIFO order (most recent acquisition batches covering current inventory). Computes weighted FIFO `cost_per_unit`, `total_fifo_value`, `total_retail_value`, and `unrealized_gain_loss`.
- **Cross-Model Device Compatibility Map (R3.10)**:
  - `getItemCompatibility(itemId)`, `addItemCompatibility(itemId, data)`, `deleteItemCompatibility(itemId, compatId)`.
  - Dual-synchronization between `item_compatibility` and `spare_parts_compatibility` tables.

### B. Inventory Router (`server/src/modules/inventory/inventory.router.ts`)
- Mounted all required endpoints:
  - `GET /api/inventory/reports/dead-stock?days=90` & alias `/api/inventory/dead-stock`
  - `POST /api/inventory/items/:id/clearance`
  - `GET /api/inventory/items/:id/reorder-analysis`
  - `POST /api/inventory/reorder-calculation/run`
  - `GET /api/inventory/suppliers/scorecard` & alias `/api/inventory/supplier-scores`
  - `GET /api/inventory/transfers` & `GET /api/inventory/transfers/requests`
  - `POST /api/inventory/transfers`
  - `PATCH /api/inventory/transfers/:id/approve`
  - `PATCH /api/inventory/transfers/:id/reject`
  - `GET /api/inventory/items/search?q=:q`
  - `GET /api/inventory/reports/valuation?method=fifo` & alias `/api/inventory/valuation`
  - `GET /api/inventory/items/:id/compatibility`
  - `POST /api/inventory/items/:id/compatibility`
  - `DELETE /api/inventory/items/:id/compatibility/:compatId`
  - `GET /api/inventory/items/:id/cost-history`
  - `POST /api/inventory/items/:id/cost-history`

### C. Procurement Router (`server/src/modules/procurement/procurement.router.ts`)
- Batch Goods Receipt Rollback (R3.8):
  - `POST /api/procurement/receipts/:id/rollback` and `POST /api/procurement/grn/:id/rollback`.
  - Role check: Requires `req.user.role === 'MANAGER'` (or 'ADMIN'), returns 403 Forbidden otherwise.
  - Atomic Transaction: Checks whether deducting the received stock would cause any item's stock quantity to drop below zero (returns 409 Conflict if negative). Reverses inventory increments, marks receipt as `'ROLLED_BACK'`, inserts inventory audit log, and records rollback in immutable audit chain.
- Integrated Supplier Scorecards:
  - Added `GET /api/procurement/suppliers/scorecard` and alias `/api/procurement/supplier-scores`.
  - Updated `POST /api/procurement/grn` to record cost price history and update supplier scorecard.

### D. Spare Parts Router (`server/src/modules/spare-parts/spare-parts.router.ts`)
- Added aliases for seamless client compatibility:
  - `GET /api/spare-parts/reports/dead-stock`
  - `GET /api/spare-parts/search`
  - `GET /api/spare-parts/compatibility` & `/api/spare-parts/items/:id/compatibility`
  - `POST /api/spare-parts/items/:id/compatibility`
  - `DELETE /api/spare-parts/items/:id/compatibility/:compatId`
- Updated PO reception and RMA routes to update cost history, supplier scores, and audit logging.

---

## 3. Client Implementation Details

### A. New Inventory Components (`client/src/components/inventory/`)
1. `inventoryApi.ts`:
   - Full TypeScript API client wrapping all R3 endpoints with authentication and error handling.
   - Types: `DeadStockResponse`, `SupplierScore`, `ItemCompatibility`, `ReorderAnalysis`, `FifoValuationResponse`.
2. `ClearanceModal.tsx`:
   - Modal for discounting and marking dead stock items for clearance.
   - Quick percentage discount buttons (15%, 25%, 35%, 50%) or custom clearance price input.
   - Shows projected liquidity recovery, tied capital, and profit margin impact.
3. `ItemCompatibilityModal.tsx`:
   - Modal for managing cross-model device compatibility for spare parts.
   - Lists existing compatible phone models with brand badges.
   - Form for adding new device models (Apple, Samsung, Xiaomi, Huawei, etc.) with notes.
   - Real-time deletion of obsolete compatibility records.

### B. Spare Parts View (`client/src/views/SparePartsView.tsx`)
- Added **Dead Stock (المخزون الراكد)** tab:
  - Threshold selector buttons: 30, 60, 90, 180 days.
  - 3 Summary KPI cards: Total Dead Items, Total Units, Total Tied Capital (EGP).
  - Sortable table: Item & SKU, Category, Stock Quantity, Purchase Cost, Tied Capital, Days Inactive.
  - "عرض للتصفية" button that opens `ClearanceModal`.
- Added **إدارة التوافق (Compatibility Management)** button on every row in the Parts Catalog table:
  - Opens `ItemCompatibilityModal` to inspect and map compatible phone models.

### C. Multi-Warehouse View (`client/src/views/WarehouseView.tsx`)
- Added **Supplier Scorecard (أداء الموردين)** tab:
  - KPI summary: Tier A (Preferred), Tier B (Approved), Tier C (Probation), Total Suppliers Evaluated.
  - Comprehensive performance table: Vendor Name, Tier Badge, On-time Delivery Rate (with progress bar), Quality Acceptance Rate, RMA Defect Rate, Total Purchase Orders, Last Evaluation Date.
- Enhanced **Stock Transfers (التحويلات المخزنية)** tab:
  - Pending transfer requests highlighted with yellow badge (`قيد موافقة المدير`).
  - Action buttons: "اعتماد" (Approve) and "رفض" (Reject) calling two-phase transfer endpoints with instant feedback.
  - Added option in New Transfer modal to submit as a Two-Phase Transfer Request requiring manager approval.
- Enhanced **Inventory Valuation (تقييم المخزون)** tab:
  - Toggle between **WAC (المتوسط المرجح)** and **FIFO (الوارد أولاً يصرف أولاً)** valuation methods.
  - When FIFO is active, renders 4 KPI cards (Total Units, Total FIFO Asset Value, Retail Value, Unrealized Gain/Loss) and a detailed FIFO lots breakdown table.

---

## 4. Verification Summary
- `npx tsc -b` in `client/`: 0 errors.
- `npx tsc --noEmit` in `server/`: 0 errors.
- `npm test` in `server/`: 117 passed, 0 failed (0 regressions).
