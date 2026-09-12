# Project Domain Glossary & Ubiquitous Language

**Document Version:** 1.0.0  
**Status:** Ratified Living Document  
**Canonical Path:** `.specify/memory/glossary.md`  
**Governing Authorities:** DEC-001 through DEC-042 | Constitution v1.0.1  
**Last Updated:** 2026-09-12  

---

> [!IMPORTANT]
> **Ubiquitous Language Invariant:**  
> This glossary defines the authoritative domain terminology governing all specifications, user interfaces, database models, and communication between developers, agents, and store stakeholders.  
> Every term establishes an exact semantic boundary alongside explicit **Invalid Usages** to prevent conceptual drift.

---

## Ratified Domain Terms (12 Terms)

### 1. Repair Ticket (تذكرة الصيانة)
- **Exact Definition:** The central domain aggregate representing a customer's physical mobile device accepted into the workshop for hardware or software servicing. The ticket strictly transitions through an invariant 6-stage linear state machine (`RECEIVED` / `INTAKE` → `DIAGNOSED` → `IN_REPAIR` → `QA` → `READY` → `DELIVERED`), with `CANCELLED` as the sole terminal abort state (Constitution §2.1.1, `server/src/modules/repair/repair.service.ts#L10-L32`).
- **Invalid Usages:** Must NOT be used to denote standard retail sales transactions, wholesale spare parts purchase orders, or general customer support inquiries.

---

### 2. Shift Handover (تسليم الوردية)
- **Exact Definition:** The mandatory physical and operational procedure demarcating cashier financial responsibility (`/api/core/shifts/close`). Closing a shift requires physical denomination counting (`actual_cash`), records mathematical cash variance against `expected_cash`, verifies custody count of in-lab customer devices (`device_inventory_count`), and immediately triggers an automated, non-blocking backup snapshot (via the online backup API) (DEC-002, DEC-012, Constitution §1 Principle III.4, `server/src/modules/core/core.router.ts#L251-L277`).
- **Invalid Usages:** Must NOT be conflated with calendar midnight (00:00:00) clock turnovers, background cron cycles, or technician workstation logout.

---

### 3. Split Payment (الدفع المجزأ)
- **Exact Definition:** The transaction capability allowing a single point-of-sale or repair delivery invoice to be settled across multiple distinct payment tenders (e.g. Cash + Vodafone Cash / InstaPay + Credit Card) such that the exact sum of tender amounts in integer piastres equals the gross invoice balance without rounding drift (Constitution §1 Principle I.2, `server/src/modules/retail/retail.router.ts#L100-L125`).
- **Invalid Usages:** Must NOT be used to denote consumer installment plans, deferred uncollateralized receivables, or informal debtor balances.

---

### 4. Installment Plan (خطة التقسيط)
- **Exact Definition:** A structured financial consumer credit agreement that records customer National ID (14 digits) and guarantor details, charges a configurable annual markup percentage (`interest_rate`), generates amortized monthly payment schedules using integer-piastre division with final-installment remainder adjustment, and dispatches automated WhatsApp reminders 2 days prior to each due date (DEC-022, ADR-022, `server/src/modules/retail/installments.service.ts#L20-L95`).
- **Invalid Usages:** Must NOT be used to represent informal, open-ended ledger debt accounts (traditional "Daftar") or unscheduled partial advances.

---

### 5. Trade-In Valuation (تقييم الاستبدال)
- **Exact Definition:** The technical evaluation and monetary appraisal of a customer's used mobile device conducted at the counter, applying functional deduction penalties (e.g. cracked back glass, degraded battery) to determine fair purchase value, issuing an instant credit voucher applied strictly as a direct discount against a new retail purchase or repair invoice (`server/src/modules/retail/trade-in.service.ts#L25-L108`).
- **Invalid Usages:** Must NOT be used for salvaging unrepairable parts (scrap harvesting), general warranty returns, or routine customer sales returns.

---

### 6. Cycle Count (الجرد الدوري للمخزون)
- **Exact Definition:** The physical counting and stock reconciliation of a designated shelf, category, or item batch without halting overall store operations. Items included in an active cycle count batch are placed in a temporary sales freeze (`is_frozen = 1`), rejecting POS checkout with HTTP 409 Conflict unless authorized via an audited Manager override (DEC-023, DEC-030, ADR-023, ADR-030, `server/src/repositories/inventory.repository.ts#L116-L150`).
- **Invalid Usages:** Must NOT be confused with full annual financial accounting store closures or routine vendor goods received notes (GRN).

---

### 7. Double-Entry Balancing (موازنة القيد المزدوج)
- **Exact Definition:** The foundational mathematical accounting invariant requiring that every transaction impacting financial accounts strictly satisfies:
  $$\sum \text{Debits} \equiv \sum \text{Credits}$$
  Any transaction violating this identity MUST be rejected at the API and database boundary with HTTP 422 Unprocessable Entity. Posted journal entries are permanent and immutable (Constitution §1 Principle II.1-2).
- **Invalid Usages:** Must NOT be used to describe cash drawer balancing, POS cart subtotal calculation, or petty cash expense recording without balanced ledger accounts.

---

### 8. Pre-Auth WhatsApp Estimate (المقايسة المسبقة)
- **Exact Definition:** A structured diagnostic estimate and repair cost quotation dispatched to the customer via WhatsApp text while the device is in `DIAGNOSED` status. Customer authorization received via chat reply must be verified and manually logged in the ERP by the technician before transitioning the ticket to `IN_REPAIR` and activating logical spare parts reservation (`reserved_stock`) (DEC-029, DEC-036, Constitution §2.1.2, `server/src/modules/repair/repair.router.ts#L281-L310`).
- **Invalid Usages:** Must NOT be used as a final tax invoice, a customer pickup delivery receipt, or an inbound public web portal approval link (public web ingress is strictly prohibited per Pillar III.1).

---

### 9. QA Checklist (قائمة فحص الجودة)
- **Exact Definition:** A mandatory technical quality assurance inspection matrix covering core device subsystems (Display, Touch, Charging, Cellular Network, Audio, Cameras) that a technician must complete and record in the system before a repair ticket is permitted to transition to `READY` status (Constitution §2.1.1, `server/src/modules/repair/repair.service.ts#L60-L91`).
- **Invalid Usages:** Must NOT be used for preliminary intake logging (Intake Inspection) or returned retail goods inspection.

---

### 10. Warranty Certificate (شهادة الضمان المعتمدة)
- **Exact Definition:** An auditable digital warranty instrument generated upon ticket delivery (`DELIVERED`), binding replacement part serial numbers and device IMEI to specific warranty terms. Baseline warranty durations are dynamically governed by configurable category settings per DEC-041 (defaults: 90 days for screens, 60 days for batteries, 30 days for other repairs and labor). Warranty replacements strictly inherit the remaining duration of the original certificate without renewal (DEC-032); if the remaining window is < 3 days upon replacement delivery, a minimum 3-day testing grace period applies per DEC-041. Voiding for physical or liquid damage strictly requires Manager approval (DEC-033) and mandatory attached photographic evidence (DEC-042).
- **Invalid Usages:** Must NOT be used to represent manufacturer warranties (authorized agency warranties), non-repair retail accessory receipts, or unrecorded verbal guarantees.

---

### 11. Forensic Audit Log (سجل التدقيق الجنائي)
- **Exact Definition:** A synchronous, append-only, immutable database ledger (`audit_log`) capturing all security-sensitive, overriding, or financial mutations (price changes, sales returns, stock count overrides, warranty voiding, repair estimate approval logging per DEC-029, PO approvals, HR payroll modifications). Every entry records actor user ID, client IP, timestamp, action type, entity ID, before/after states, and non-empty justification (DEC-024, Constitution §1 Principle V.2).
- **Invalid Usages:** Must NOT be confused with transient application debug logs, web server access logs, or console error outputs.

---

### 12. Universal Integer-Piastre Precision (حساب القروش الصحيحة)
- **Exact Definition:** The universal architectural standard storing and computing all monetary figures, discounts, taxes, ledger entries, and installment amortization as 64-bit integers in Egyptian Piastres (`1 EGP = 100 Piastres`), eliminating IEEE 754 floating-point drift across both frontend and backend (DEC-011, Constitution §1 Principle I.1-2, `server/src/modules/retail/currency.ts#L1-L24`). JavaScript safe integer operations are guaranteed up to 9.007 quadrillion piastres (≈ 90 trillion EGP).
- **Invalid Usages:** Floating-point types (`number`, `float`, `double`, or `REAL`) are strictly prohibited for representing money in database schemas, calculations, or API payloads. Display formatting (`toFixed(2)`) is permitted exclusively at user presentation boundaries.
