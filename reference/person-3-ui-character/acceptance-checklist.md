# Acceptance checklist - Person 3 - UI (Common PRD section 10)
Status as of the last test run (98 automated tests passing; no manual run in a real Tauri window yet).
- [x] Command entry and transcript are usable. (`App.test.tsx` composer validation, mock workflow)
- [x] Plan is visible before execution. (`App.test.tsx` mock workflow; reducer plan tests)
- [x] Confirmation and cancel controls work. (`App.test.tsx` approve/reject/T2/T3/cancel/timeout tests; against Mock and a scripted live client, not the real backend)
- [x] Character reflects real task state. (`outcome.test.ts` totality and mapping; success never without evidence or in Mock mode)
- [x] Success, failed, partial, and cancelled states differ. (`eventReducer.test.ts` outcome tests; distinct labels and character poses)
- [~] Keyboard navigation and reduced-motion basics work. Automated: Tab trap, Escape, Ctrl+K, Ctrl+., reduced-motion attribute. Not done: manual screen-reader pass, real-window check.
- [ ] Desktop shell compiled and installer produced. NOT DONE: Rust toolchain missing on this machine.
- [ ] Live path verified against the real backend. NOT DONE: depends on Person 1/2/4 integration.
