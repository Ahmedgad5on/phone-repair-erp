# Changes Report — Worker M1 (Repair Lab & Technician Workflow)

## Summary of Completed Changes

### 1. Interactive Kanban Board with @dnd-kit/core (R1.1)
- **File**: `client/src/components/repair/KanbanBoard.tsx`
  - Created a 6-column drag-and-drop board using `@dnd-kit/core` (`DndContext`, `useDroppable`, `useDraggable`, `DragOverlay`, `PointerSensor`).
  - The 6 columns correspond strictly to workflow stages:
    1. **Received / Intake** (`INTAKE`)
    2. **Diagnosed** (`DIAGNOSING`)
    3. **In Repair** (`IN_REPAIR`)
    4. **QA** (`WAITING_APPROVAL` / `QA`)
    5. **Ready for Pickup** (`READY`)
    6. **Delivered** (`DELIVERED`)
  - Gated state transitions:
    - Dragging or moving to `READY` automatically triggers the Post-Repair QA Checklist modal (`QAChecklistModal`).
    - Dragging or moving to `DELIVERED` requires 4-digit Handover OTP verification (`showOtpModal`).
  - Integrated into `client/src/views/RepairLabView.tsx` with a view switcher (`Kanban` vs `Grid Cards`).

### 2. State Machine Transition Validation (R1.5)
- **File**: `server/src/modules/repair/repair.service.ts`
  - Added transition table `ALLOWED_TRANSITIONS` and `validateStatusTransition` function.
  - Rejects invalid transitions (e.g., jumping from `RECEIVED` directly to `DELIVERED`) with HTTP 422 `{ error: "Invalid status transition", ... }`.
  - Enforces that transitioning to `READY` requires a non-empty `qa_checklist` payload, returning 422 `{ error: "Post-repair QA checklist is mandatory before marking ticket READY" }` if absent.
  - Normalized legacy status aliases (`RECEIVED` -> `INTAKE`, `DIAGNOSED` -> `DIAGNOSING`, `IN_PROGRESS` -> `IN_REPAIR`).

### 3. QR Code Customer Tracking Portal (R1.2)
- **Files**:
  - `server/src/modules/repair/repair.service.ts` (`generateTrackingQrBuffer` using `bwip-js` to produce PNG QR buffers).
  - `server/src/modules/repair/repair.router.ts`:
    - `GET /tickets/:id/tracking-qr` (streams PNG QR image or returns base64).
    - `GET /portal/track?ticket=<ticket_number>` (public customer tracking API).
  - `client/src/components/repair/QrTrackingModal.tsx` (Client modal using `bwip-js` to render QR code canvas linking to `<base_url>/portal/track?ticket=<number>`).
  - `client/src/views/CustomerTrackingPortal.tsx` (Public tracking portal showing ticket status, 6-step progress stepper, technician name, estimated ready date, photo timeline, and estimate pre-authorization approve/reject buttons).
  - `client/src/App.tsx` (Configured URL routing so `/portal/track` loads the customer portal).

### 4. WhatsApp Pre-Authorization Cost Approval (R1.3)
- **Files**:
  - `server/src/modules/repair/repair.router.ts`:
    - `PATCH /tickets/:id/send-estimate`: Updates ticket estimate and records quote request; sends WhatsApp message via `whatsappService.sendMessage`.
    - `PATCH /tickets/:id/estimate-response`: Customer approval/rejection endpoint that transitions ticket based on approval.
  - `client/src/views/RepairLabView.tsx`: Added WhatsApp Cost Estimate Pre-Authorization dialog for technicians with live cost, diagnostics input, and one-click WhatsApp dispatch.

### 5. SLA Timer Persistence & Escalation Engine (R1.4, R5.1)
- **Files**:
  - `server/src/modules/repair/repair.router.ts`: `POST /tickets` persists `sla_started_at = CURRENT_TIMESTAMP` and calculates `sla_deadline` based on priority.
  - `server/src/modules/repair/repair.service.ts`:
    - Added `checkSlaEscalations()` function that scans open tickets where deadline passed, escalates ticket priority to `URGENT`, and broadcasts `TICKET_SLA_BREACH` event over WebSocket.
    - Added background 5-minute interval timer to run `checkSlaEscalations()`.

### 6. Post-Repair QA Checklist Enforcement (R1.6)
- **Files**:
  - `server/src/modules/repair/repair.router.ts`: Added `PATCH /tickets/:id/qa-checklist` and status enforcement.
  - `client/src/components/repair/QAChecklistModal.tsx`: 10-point comprehensive hardware test checklist (Power/Current, Screen/Touch, Cameras/Flash, FaceID/TouchID, Audio/Speakers, Connectivity, Charging Port, Proximity Sensors, Structural Fasteners, Cosmetic Cleaning) with progress bar and submit confirmation.

### 7. Ticket Search by IMEI/Serial Number (R1.7)
- **Files**:
  - `server/src/modules/repair/repair.router.ts`: Added `GET /api/repair/search?imei=<val>` with composite SQLite index `idx_tickets_imei_sn_status` on `(imei_sn, status)` for fast search across IMEI, ticket number, customer name, and phone.
  - `client/src/views/RepairLabView.tsx`: Integrated live searching via `handleSearchTickets` into the search bar.

### 8. Photo Evidence Timeline (R1.8)
- **Files**:
  - `server/src/modules/repair/repair.router.ts`: Created `ticket_photos` table and endpoints (`GET /tickets/:id/photos`, `POST /tickets/:id/photos`, `DELETE /photos/:photoId`). Supports Base64 data URLs and remote URLs categorized by stage (`BEFORE`, `DURING`, `AFTER`).
  - `client/src/components/repair/PhotoTimelinePanel.tsx`: Chronological timeline panel with stage filters, image file upload, and fullscreen image viewer.

### 9. Spare Parts Out-of-Stock / Low-Stock Warnings (R1.9)
- **Files**:
  - `server/src/modules/repair/repair.router.ts`: Added `GET /api/repair/parts/available` and `GET /api/repair/parts/stock/:id` returning live inventory counts and `reorder_point`.
  - `client/src/views/RepairLabView.tsx`: In the Ticket Intake modal, added a spare parts selector that evaluates stock; if `stock_quantity <= reorder_point`, displays a warning badge, and if `stock_quantity === 0`, displays a critical out-of-stock warning.

### 10. Repair Notes Template Library (R1.10)
- **Files**:
  - `server/src/modules/repair/repair.service.ts` & `repair.router.ts`: Initialized `repair_notes_templates` table and seeded with 5 default diagnosis templates (Broken Screen, Battery Degradation, Liquid Damage, Charging Port, Audio IC).
  - `client/src/components/repair/NotesTemplatePicker.tsx`: Fast-insert diagnosis badges and custom template creation modal.
  - `client/src/views/RepairLabView.tsx`: Integrated template picker into reported defects section in intake wizard.

### 11. Automated Verification & Unit Tests
- **File**: `server/src/modules/repair/repair.test.ts`
  - Created 7 test suites validating state machine rejection (422), QA checklist gating, SLA escalations, QR code generation via `bwip-js`, templates seeding, and composite index. All 7 tests pass.
  - Ran full test suite: 117 automated tests passing with 0 failures.
