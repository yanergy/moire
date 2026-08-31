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

The suite is genuinely good: the parsers, the watcher, `GitService`, the menu builder, `theme`, and
`window-state` are all well covered, and the comparison store has an extensive spec. The gaps below
are real, and several violate the project's own rule that "every new frontend file under `src/`
ships with a matching test."

### Backend gaps

- `electron/settings.ts`: entirely untested. This holds the recent-repos dedup and cap
  (`MAX_RECENT_REPOS`), per-repo branch-selection persistence, and the removal cascade
  (`removeRecentRepo` also deletes the repo's `branchSelections`). All of it is pure, testable logic
  with edge cases, and none of it is tested.
- `electron/ipc/handlers.ts`: only `isGitAvailable` is covered (`tests/git-availability.spec.ts`).
  `registerIpcHandlers`, `isGitRepo`, `requireRepo` (the "No repository is open" guard),
  `getCurrentRepoPath`, and the `repo:open` validation flow are untested.
- `electron/logger.ts`: only `formatValue` is tested (`tests/logger.spec.ts`). The log rotation and
  truncation at `MAX_LOG_BYTES`, and stream initialization, are untested.
- `electron/main.ts`, `electron/preload.ts`: untested. Bootstrap and bridge are harder to unit
  test, but the preload is the security-critical surface and deserves at least a shape test.

### Frontend gaps (convention violations)

- `src/App.vue`: no test, despite real logic (the `onMounted` IPC subscriptions, the
  `document.title` watchEffect, the `onUnmounted` cleanup).
- `src/components/pages/MoirePage.vue`: no test.
- `src/lib/monaco-theme.ts`: no test, even though `monacoThemeFor` is a trivial pure function.
- `src/lib/utils.ts`: no test (`cn`).
- `src/lib/monaco-env.ts`, `src/main.ts`: no test (worker wiring and entry point; reasonable to
  exclude in practice, but the convention as written allows no exception).

### Depth caveat

The DiffViewer spec runs against a Monaco stub (`vitest.config.ts` aliases `monaco-editor` to
`src/components/__tests__/monaco-stub.ts`), so real diff behavior (change navigation, model
disposal, theme switching) is never exercised against the actual library. That is a reasonable
choice for unit tests, but there is no integration or end-to-end layer at all (the `e2e/**` exclude
in the vitest config points at a directory that does not exist).

---

## Low severity and defensive

### L1. Git commands do not use `--` to separate options from refs and paths

`electron/git/GitService.ts`. Ranges and pathspecs are interpolated straight into the argument
arrays (for example `` `${ref}:${filePath}` `` at line 171 and the range spread into the `diff`
arrays at lines 215 and 216). Because everything runs through `execFile` and `simple-git` argument
arrays there is no shell injection, and the inputs are git-derived (the branch list and the
changed-file list), so exploitability is low. Still, a ref or path beginning with a leading dash
could be interpreted as an option (argument injection). Inserting `--` before refs and pathspecs is
cheap hardening.

### L2. The repo watcher is never stopped on quit

`electron/watcher/RepoWatcher.ts:253` exposes `stopWatchingRepo`, but `electron/main.ts` never calls
it on `before-quit`; the watcher is only ever replaced when a new repo opens. The OS reclaims the
handles at exit, so this is harmless in practice, but the teardown path is incomplete.

---

## Suggested priority

1. A2 (Monaco bundle size): the largest efficiency win for the packaged app.
2. The `settings.ts` and `handlers.ts` test gaps: the highest-value untested logic.
3. Everything else as cleanup.
