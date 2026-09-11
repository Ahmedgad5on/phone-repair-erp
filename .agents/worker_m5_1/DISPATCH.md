## 2026-09-10T03:00:15Z

You are Worker M5 (Client Bundle Splitting & Vite Config).
Your Working Directory: c:\Users\Eng_Ahmed\Desktop\pro\.agents\worker_m5_1
Authoritative Requirements: c:\Users\Eng_Ahmed\Desktop\pro\ORIGINAL_REQUEST.md
Master Plan: c:\Users\Eng_Ahmed\Desktop\pro\PROJECT.md
Detailed Investigation Report: c:\Users\Eng_Ahmed\Desktop\pro\.agents\explorer_client_1\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Objective:
Implement Milestone M5 (Client Dependencies & Bundle Optimization):
1. In client/, install @dnd-kit/core and @dnd-kit/utilities:
   Run: `npm install @dnd-kit/core @dnd-kit/utilities`
   Verify it is saved in client/package.json.
2. In client/vite.config.ts:
   Configure build options to optimize chunking and enforce the 500KB threshold:
   - `build.chunkSizeWarningLimit: 500`
   - `build.rollupOptions.output.manualChunks`:
     Split vendor chunks:
     * `vendor-react`: ['react', 'react-dom']
     * `vendor-icons`: ['lucide-react']
     * `vendor-bwip`: ['bwip-js']
     * `vendor-dndkit`: ['@dnd-kit/core', '@dnd-kit/utilities']
3. In client/src/App.tsx:
   - Replace all remaining synchronous view imports (PosView, RepairLabView, SparePartsView, FintechView, ShiftView, CrmView, SettingsView, DashboardView) with `React.lazy()` dynamically imported views.
   - Ensure they are rendered inside `<React.Suspense fallback={<SkeletonLoader />}>` (or appropriate spinner/fallback).
4. Run verification in client/:
   - `npx tsc -b` -> 0 errors!
   - `npm run build` -> MUST complete with 0 errors and ZERO Vite warnings about chunks > 500KB! (index.js must be well under 500KB, e.g. < 100KB).
5. Document all changes, file paths, build outputs, and chunk sizes in changes.md and handoff.md in your working directory.
6. Send completion message to orchestrator.
