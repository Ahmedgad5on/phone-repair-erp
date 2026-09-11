# DISPATCH: worker_verify_1

## Identity
- Role: teamwork_preview_worker
- Assigned Task: Execute final build and test verification for Phase 8 (M6) and Phase 9 (M7).
- Working Directory: c:\Users\Eng_Ahmed\Desktop\pro\.agents\worker_verify_1

## Mandatory Inputs to Read
- Original Request: c:\Users\Eng_Ahmed\Desktop\pro\ORIGINAL_REQUEST.md
- Master Blueprint: c:\Users\Eng_Ahmed\Desktop\pro\PROJECT.md

## Tasks
1. In `c:\Users\Eng_Ahmed\Desktop\pro\server`:
   - Run `npm test` (or `npx tsx test/api.test.ts`). Verify all 159 tests pass with 0 failures.
   - Run `npx tsc --noEmit`. Verify 0 type errors.
2. In `c:\Users\Eng_Ahmed\Desktop\pro\client`:
   - Run `npm run build`. Verify 0 TypeScript errors and verify that Vite produces bundles with 0 chunk size warnings (>500KB). Check chunk file sizes in output.
3. In `c:\Users\Eng_Ahmed\Desktop\pro\PROJECT.md`:
   - Update the Milestones table status column for M0, M1, M2, M3, M4, M5, M6, M7 from PLANNED to DONE, reflecting the completed implementations.
4. Record full command outputs in `.agents/worker_verify_1/handoff.md` and report back.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
