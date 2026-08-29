# Moiré code review

Date: 2026-08-29. Scope: the whole repository (`electron/`, `src/`, config, build, tests).

## Summary

The codebase is, overall, in good shape. The process separation is respected, the parsers and
watcher are carefully thought through, comments explain the "why" rather than the "what", and the
test suite is real (183 passing tests, `type-check` and `oxlint` both clean). This review is
deliberately critical, so the tone below skews negative. That is the assignment, not a reflection
of the average quality.

Findings are grouped by kind and ordered by severity within each group. Each carries a file
reference so it can be actioned directly.

Verification run at review time:

- `npx vitest run`: 25 files, 183 tests, all passing.
- `npm run type-check`: clean.
- `npx oxlint .`: clean.

---

## Inconsistencies (docs vs code)

### I5. `@electron/osx-sign` is used but not declared as a dependency

`build/afterPack.cjs:17` does `require('@electron/osx-sign')`. It resolves only because
`electron-builder` pulls it in transitively. An electron-builder upgrade that restructures its
dependencies would break macOS packaging with no warning. Add it as an explicit devDependency.

### I6. Four near-duplicate `baseName` implementations, one subtly wrong

`src/stores/comparison.ts:59` splits on `/` only; `src/stores/comparison.ts:483` (inline in
`restoreLastRepo`), `src/components/controls/RepoPicker.vue:27`, and `electron/menu.cjs:17`
(`repoLabel`) all split on `/` and `\`. The store's `baseName` therefore mishandles Windows paths
while the others handle them. Consolidate.

---

## Antipatterns and smells

### A1. Gated large files are still fully transferred over IPC

`electron/git/GitService.cjs:217` (`filePair`) returns the full `oldContent` and `newContent` even
when `tooLarge` is set; the renderer stores them in `selectedPair`. The "Load diff" gate only
defers Monaco rendering, not the IPC serialization or the memory cost, so selecting a large file
still pays the full transfer up front. The comment admits "the bytes are still returned." Consider
withholding content until the gate is cleared, then fetching on demand.

### A2. Monaco bundles every language grammar and all workers

`src/components/diff/DiffViewer.vue:1` uses `import * as monaco from 'monaco-editor'`, which pulls
the full editor. The last build emitted roughly 90 language files plus four workers (ts.worker
about 5.9 MB, css.worker about 1 MB, html.worker about 720 KB, json.worker about 410 KB). The app
supports about 13 languages. This inflates the packaged app significantly. Import from
`monaco-editor/esm/vs/editor/editor.api` with an explicit language allowlist, or use
`vite-plugin-monaco-editor`.

### A3. The file tree is mouse-only (no keyboard access)

`src/components/sidebar/FileTreeSidebar.vue`. Rows are `<div>`s with click and dblclick handlers,
no `tabindex`, no `role`, and no key handlers. Selecting a file, toggling a folder, and marking
viewed are all mouse-only. The comment explains why the rows are not `<button>`s (a button cannot
contain the interactive checkbox), but that does not preclude adding `tabindex`, roles, and Enter or
Space handling.

### A4. A component prop is made reactive, triggering a Vue warning

`src/components/diff/DiffPlaceholder.vue:7` takes `icon: Component`. Passing a component through a
reactive prop makes Vue log "received a Component that was made a reactive object" (visible in the
test run). Wrap the icons with `markRaw` at the call sites or otherwise keep them raw.

### A5. `vueDevTools()` is registered unconditionally

`vite.config.ts:14`. The plugin is not limited to `command === 'serve'`. Recent versions self-limit
to dev, so the practical impact is probably nil, but relying on that is fragile. Guard it
explicitly. (Low confidence; flagged for verification rather than as a confirmed defect.)

---

## Test coverage ("make sure every system is tested")

The suite is genuinely good: the parsers, the watcher, `GitService`, the menu builder, `theme`, and
`window-state` are all well covered, and the comparison store has an extensive spec. The gaps below
are real, and several violate the project's own rule that "every new frontend file under `src/`
ships with a matching test."

### Backend gaps

- `electron/settings.cjs`: entirely untested. This holds the recent-repos dedup and cap
  (`MAX_RECENT_REPOS`), per-repo branch-selection persistence, and the removal cascade
  (`removeRecentRepo` also deletes the repo's `branchSelections`). All of it is pure, testable logic
  with edge cases, and none of it is tested.
- `electron/ipc/handlers.cjs`: only `isGitAvailable` is tested. `registerIpcHandlers`, `isGitRepo`,
  `requireRepo` (the "No repository is open" guard), `getCurrentRepoPath`, and the `repo:open`
  validation flow are untested.
- `electron/logger.cjs`: only `formatValue` is tested. The log rotation and truncation at
  `MAX_LOG_BYTES`, and stream initialization, are untested.
- `electron/main.cjs`, `electron/preload.cjs`: untested. Bootstrap and bridge are harder to unit
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

`electron/git/GitService.cjs`. Ranges and pathspecs are interpolated straight into the argument
arrays (for example `` `${base}...${head}` `` and `` `${ref}:${filePath}` ``). Because everything
runs through `execFile` and `simple-git` argument arrays there is no shell injection, and the inputs
are git-derived (the branch list and the changed-file list), so exploitability is low. Still, a ref
or path beginning with `-` could be interpreted as an option (argument injection). Inserting `--`
before refs and pathspecs is cheap hardening.

### L2. The repo watcher is never stopped on quit

`electron/watcher/RepoWatcher.cjs` exposes `stopWatchingRepo`, but `electron/main.cjs` never calls
it on `before-quit`; the watcher is only ever replaced when a new repo opens. The OS reclaims the
handles at exit, so this is harmless in practice, but the teardown path is incomplete.

---

## Suggested priority

1. A2 (Monaco bundle size): the largest efficiency win for the packaged app.
2. The settings.cjs and handlers.cjs test gaps: the highest-value untested logic.
3. Everything else as cleanup.
