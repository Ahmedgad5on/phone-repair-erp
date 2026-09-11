# Modular Mobile ERP 2.0 (Desktop-First Enterprise Edition)

An enterprise-grade, offline-first Desktop ERP & POS system built specifically for the mobile phone ecosystem (Repair Workshops, Retail/Accessories, Spare Parts Wholesale, E-Wallets/Fintech, Multi-Warehouse Distribution, and Corporate Service Contracts).

---

## 1. Quick Start & Desktop Launch

### Option A: One-Click Windows Launch (Vite + Node Server):
Double-click `start-erp.bat` in the project root, or execute via PowerShell:
```powershell
./start-erp.bat
```

### Option B: Native Desktop Window (Electron Wrapper):
```powershell
npm run electron:start
```

### Option C: Manual Development Startup:
```bash
# Terminal 1: Backend API Server with WebSockets (Port 5000)
cd server
npm run dev

# Terminal 2: Desktop React Client with Tailwind & Dark Mode (Port 3000)
cd client
npm run dev
```
Open your browser at: `http://localhost:3000`

### Interactive API Documentation (Swagger / OpenAPI):
Open: `http://localhost:5000/api/docs`

---

## 2. System Architecture & Modular Engine

### 13 Fully Integrated Modules (5 Core Operations + 8 Enterprise ERP Modules):

#### Core Operations Modules:
1. **Core & Store Management**: Store settings, RBAC (6 Roles), Shift Handover & Drawer Cash Deficit Accounting, Customer CRM, WhatsApp Cloud Engine simulator, Google Reviews follow-up scheduler.
2. **Repair Lab Module**: Intake wizard with physical checklist & passcodes, SLA countdown timers (Red = Urgent/Overdue, Yellow = In Progress, Green = Ready), dynamic technician commission calculation `Profit = (Labor - Parts) * Tech %`, scrap disassembly warehouse, and AI board diagnostic assistant.
3. **Retail POS Module**: High-speed keyboard navigation (F1-F12), USB barcode gun scanning, two-step checkout option (Salesperson draft $\to$ Cashier complete), strict IMEI serial validation, aging dead stock alerts (>60 days), and Missing Demand Log (خزانة النواقص).
4. **Spare Parts Wholesale Module**: Multi-tier quality grading (OEM Service Pack, Refurbished, OLED, Incell), 3-tier pricing (Tier 1: Tech Wholesale, Tier 2: End-User Retail, Tier 3: Regional Bulk), cross-model compatibility matrix, and RMA security seal validation.
5. **Fintech & E-Wallets Module**: E-Wallets tracking (Vodafone Cash, InstaPay, Fawry, Aman), hard limit alerts with **95% threshold regulatory auto-lock**, anti-fraud cash-out enforcement (mandatory TxID & sender phone), and telecom statement reconciliation.

#### Enterprise ERP Modules (New Proposals 1-8):
6. **Accounting & General Ledger (`/accounting`)**: Standard chart of accounts (Assets, Liabilities, Equity, Revenue, Expenses), double-entry balanced journal entries enforcement (`debit === credit`), real-time Trial Balance, Balance Sheet, and Income Statement generation.
7. **Advanced Multi-Warehouse Inventory (`/inventory`)**: Multi-warehouse stock tracking, inter-warehouse stock transfers, Weighted Average Cost (WAC) valuation, and cycle count variance reporting.
8. **Reports & Business Intelligence (`/reports`)**: Interactive sales trend charts (7-day distribution), category revenue progress meters, top repaired phone models, engineer labor revenue metrics, PDF report generation, and automated email reporting.
9. **Procurement & Supply Chain (`/procurement`)**: Purchase requisitions workflow, Goods Received Notes (GRN) with warehouse auto-incrementing, and competitor/supplier price quotes comparison.
10. **HR & Employee Management (`/hr`)**: Daily check-in/out attendance tracking, leave requests management (Annual, Sick, Unpaid), and automated monthly payroll calculation with technician repair commissions.
11. **Engineering Projects & Tasks (`/projects`)**: Corporate repair contracts, 3-column Kanban board (`TODO`, `IN_PROGRESS`, `DONE`), task assignment, and technician labor hours time logger.
12. **Customer Loyalty Program (`/loyalty`)**: Tier-based customer rewards (Bronze, Silver, Gold, Platinum), rewards catalog, and points-for-discount redemptions.
13. **Electronic Appointment Booking (`/appointments`)**: Lab appointment scheduling with calendar slot availability verification.

---

## 3. Security, Hardening & Enterprise DevOps

- **Parameterized Schema & SQLi Protection**: Safe PRAGMA table inspections and parameterized queries preventing SQL injection attacks.
- **Strict JWT & API Key Authentication**: Mandatory `JWT_SECRET` environment variable with production safeguards, plus `x-api-key` header verification for external services.
- **Granular Rate Limiting**: Dedicated rate limiters for authentication endpoints (20 req / 15 min) and API routes (300 req / 15 min).
- **Two-Factor Authentication (2FA TOTP)**: Native RFC 6238 time-based one-time password generation and token verification.
- **Active Session Management**: Device and user-agent tracking with selective session revocation.
- **Real-Time WebSockets (`ws://localhost:5000/ws`)**: Instant notifications for ticket creation, sales, appointments, and low-stock alerts.
- **Online SQLite Backup & WAL-2 Incremental Vacuum**: Automatic and on-demand hot backups with auto-pruning (maintaining latest 10 copies) and scheduled VACUUM routines.
- **In-Memory TTL Caching**: High-performance in-memory cache for fast data retrieval with automatic pattern-based invalidation.
- **Input Validation & Sanitization**: Strict Zod schema validation on inbound payloads and XSS sanitization removing malicious script tags.
- **Docker Ready**: Multi-stage `Dockerfile` and `docker-compose.yml` for unified backend and frontend orchestration.
- **Continuous Integration (CI)**: Automated GitHub Actions pipeline (`.github/workflows/ci.yml`) running backend automated tests and frontend build on every push.

---

## 4. UI/UX Features & Accessibility

- **Instant Bilingual Switcher**: Seamless 1-click toggle between full Arabic (`dir="rtl"`) and English (`dir="ltr"`).
- **Persistent Dark / Light Theme**: Built-in theme switcher with `localStorage` state persistence and Tailwind `dark` class support.
- **Universal Global Search (`Ctrl + K`)**: Modal searching simultaneously across customers, serials, tickets, phone IMEIs, and purchase orders.
- **Printer Configuration Modal**: Support for Thermal 80mm ESC/POS receipts vs Standard A4 Invoices with live test print.
- **Interactive Notifications Center**: Live bell counter fed by native WebSocket connection.
- **Skeleton Loaders & Empty States**: Polished loading animations (`TableSkeleton`, `CardSkeleton`) and illustrated empty states.

---

## 5. Keyboard Hotkeys

| Hotkey | Action |
|--------|--------|
| **F1** | Focus Barcode Scanner / POS Screen |
| **F2** | Tender POS Payment & Print ESC/POS Receipt / Deliver Ticket |
| **F3** | Draft Sale to Cashier Queue (Two-Step Checkout) |
| **F4** | E-Wallets & Fintech Balances |
| **F7** | Dashboard & Executive Overview |
| **F8** | Customer CRM Profiles & WhatsApp Outbox |
| **F9** | Shift Handover & Cash Drawer Balance |
| **F10** | Store Onboarding & Modular Feature Flags |
| **Ctrl + K** | Open Universal Global Search |
| **Esc** | Clear Active Cart / Close Modals |

---

## 6. Automated Testing & Verification

Run the full automated test suite covering all 14 test suites:
```bash
npm test
```

Expected output:
```text
==============================================
🏁 AUTOMATED TEST RESULTS: 37 PASSED, 0 FAILED
==============================================
```

Build the client frontend bundle:
```bash
npm run build:client
```
