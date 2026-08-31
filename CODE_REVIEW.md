# Moiré code review

Date: 2026-08-31 (rechecked). Supersedes the 2026-08-29 review. Scope: the whole repository
(`electron/`, `src/`, config, build, tests).

## Summary

The codebase is, overall, in good shape. The process separation is respected, the parsers and
watcher are carefully thought through, comments explain the "why" rather than the "what", and the
test suite is real. Since the previous review the entire `electron/` backend was converted from
CommonJS `.cjs` to TypeScript `.ts`, so every backend path below has been updated to match. This
review is deliberately critical, so the tone skews negative. That is the assignment, not a
reflection of the average quality.

Findings are grouped by kind and ordered by severity within each group. Each carries a file
reference so it can be actioned directly. Identifiers are kept stable across rechecks, so gaps in
the sequence (for example the removed A4) mark findings that were resolved.

Verification run at recheck time:

- `npx vitest run`: 27 files, 193 tests, all passing.
- `npm run type-check`: clean.
- `npx oxlint .`: clean.

Resolved since the previous review:

- **A4** (reactive Component warning): a full test run no longer emits the "received a Component that
  was made a reactive object" warning, so the symptom is gone. Removed.
- **I6 correctness half**: the store's `baseName` no longer mishandles Windows paths (see I6 below).
  The duplication smell remains, so the finding is kept in reduced form.

---

## Test coverage ("make sure every system is tested")

The suite covers the parsers, the watcher, `GitService`, the menu builder, `theme`, `window-state`,
`settings` (dedup, cap, cascade, round-trips), the IPC handlers (registration, the "No repository is
open" guard, the `repo:open` validation flow, `getCurrentRepoPath`), the preload bridge (surface,
channel forwarding, subscribe/unsubscribe), the logger (rotation, truncation, `logError`), the
comparison store, and the frontend components and lib modules. What remains uncovered:

### Excluded wiring

- `electron/main.ts` (bootstrap), `src/lib/monaco-env.ts` (Monaco worker wiring), and `src/main.ts`
  (renderer entry point) are not unit-tested: they are thin wiring over Electron/Vite that cannot
  meaningfully load under vitest (monaco-env's `?worker` imports don't resolve there). They are
  exercised by running the app.

### Depth caveat

The DiffViewer spec runs against a Monaco stub (`vitest.config.ts` aliases `monaco-editor` and
`@/lib/monaco` to `src/components/__tests__/monaco-stub.ts`), so real diff behavior (change
navigation, model disposal, theme switching) is never exercised against the actual library. That is
a reasonable choice for unit tests, but there is no integration or end-to-end layer at all (the
`e2e/**` exclude in the vitest config points at a directory that does not exist).

---

## Status

Every finding from this review has been actioned: the bugs, the inconsistencies, the antipatterns,
the test-coverage gaps, and the low-severity hardening. What remains is deliberate and documented
above: the excluded bootstrap/worker wiring, and the absence of an integration/end-to-end layer.
