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

## Bugs (functional correctness)

### B2. Per-repo view state is never reset when switching repositories

`src/stores/comparison.ts`. `openRecent` (line 498) and `removeRecent` (line 447) never clear
`viewed`, `collapsed`, or `treeFilter`. The only writers to those three refs are user actions, so
they leak across repositories:

- The filter box keeps the previous repo's text, hiding files in the newly opened repo.
- Folders stay collapsed if their path matches a collapsed path from the previous repo.
- Any file in the new repo whose path matches a file marked "viewed" in the previous repo shows as
  already viewed (the `viewed` map is keyed by path only).

Reset these when `repoPath` changes (or inside `openRecent` / `removeRecent`).

### B3. `refresh()` blanks the diff instead of reporting a deleted branch

`src/stores/comparison.ts:609`. `refresh` reloads the branch list but keeps the current base/head
and does not call `restoreSelection`. If the compared branch was deleted (and the file watcher or
the View > Refresh menu triggers `refresh`), `loadChangedFiles` throws, the error is swallowed, and
the file list silently empties. The "branch disappeared" notice is produced only by
`restoreSelection`, so the user sees a blank diff with no explanation. Re-validate the range on
refresh and feed missing names into `disappearedBranches`.

---

## Useless or misleading features

### U1. The status bar shows fabricated telemetry

`src/components/diff/StatusBar.vue:21`. Two pieces of the status bar are fake:

- `{{ langLabel }} · UTF-8 · LF` hardcodes the encoding and line ending. The app never detects
  either, so it always claims UTF-8 and LF regardless of the file.
- `watching .git/refs · synced 4s ago` is entirely static text. The "4s ago" never changes and the
  green dot is not wired to any real watcher state.

This presents invented information as live status. Either wire it to real data (the watcher already
knows when it last fired, and the file pair already carries enough to detect line endings) or
remove it.

### U2. `BranchInfo.meta` is dead for real branches, and the current branch is not shown

`electron/git/GitService.cjs:156` (`branches`) never sets `meta`. The only place a value appears is
the hardcoded WORKING TREE row (`meta: 'on disk'` in `src/components/controls/RefSelector.vue:122`).
The type comment in `src/shared/types.ts:53` advertises `'default'`, `'ahead 6'`, etc., none of
which are ever produced, so every real branch renders an empty meta column. Separately, `isCurrent`
is computed by the backend and used only to default the base; it is never displayed, so the ref
dropdown gives no indication of which branch is checked out.

---

## Dead code

### D1. `inferLanguage` and its extension map are unused

`src/lib/language.ts:39` and the `BY_EXTENSION` map (lines 3 to 23). Nothing in the app calls
`inferLanguage`; the only references are its own test. The renderer gets `language` directly from
the backend `FilePair` (`GitService.languageForPath`). So the 20-line map exists solely to feed a
dead function, and it duplicates the backend's `LANGUAGE_BY_EXTENSION`. Only `languageLabel` is
actually used (by `StatusBar`). Deleting `inferLanguage`, `BY_EXTENSION`, and the matching test
removes the very duplication the conventions call out as a deliberate compromise.

### D2. Unused logger exports

`electron/logger.cjs`. `log` (the INFO-level logger, line 40) is never called anywhere, and
`getLogPath` (line 71) is never called (the menu uses the value `initLogging` returns). Both are
dead exports.

### D3. Roughly eleven design tokens are defined but never used

`src/assets/base.css`. These `--moire-*` tokens are defined (in both themes) and exposed as Tailwind
utilities in the `@theme` block, but are referenced nowhere:
`--moire-add`, `--moire-add-strong`, `--moire-del`, `--moire-del-strong`, `--moire-empty`,
`--moire-fold`, `--moire-fold-line`, `--moire-fold-fg`, `--moire-gutter`, `--moire-ruler`,
`--moire-sel-fg`. They belong to a hand-rolled diff renderer that was never built (Monaco is used
instead). Their live equivalents are hardcoded in `monaco-theme.ts` (see I3).

### D4. Config points at test tooling that does not exist

`tsconfig.node.json` includes `cypress.config.*` and `playwright.config.*`; `vitest.config.ts`
excludes `e2e/**`. None of these exist. This is leftover Vite-template scaffolding.

---

## Inconsistencies (docs vs code)

### I1. The architectural boundary the docs call "enforced" is not enforced

`documentation/code-conventions.md:11` states that "a custom oxlint rule" forbids importing
`electron` or `node:*` modules in `src/`. No such rule exists in `.oxlintrc.json` (there is no
`no-restricted-imports` and no `import/no-nodejs-modules`). The boundary is currently maintained by
discipline only. Either add the rule (so the claim becomes true) or correct the doc.

### I2. Docs reference the wrong formatter config filename

`documentation/code-conventions.md:33` cites `.oxfmtrc.jsonc`; the actual file is `.oxfmtrc.json`.

### I3. Diff colors have two sources of truth, contradicting the "never hardcode hex" rule

`documentation/code-conventions.md` (lines 100 and 115) says colors must come from `--moire-*`
tokens and hex must never be hardcoded in components. `src/lib/monaco-theme.ts` hardcodes every diff
color as hex8, and the corresponding tokens are dead (see D3). Editing a `--moire-*` diff token has
no visible effect. The module comment acknowledges this, but it still directly contradicts the
stated rule and is a maintenance trap: two places to change, one of them silently inert.

### I4. The entire main process has no static type checking

None of the tsconfig projects include `electron/**` (`tsconfig.app.json` covers `src/`,
`tsconfig.node.json` covers only the vite/vitest config files, `tsconfig.vitest.json` covers the
tests). The main-process files are `.cjs` with no `checkJs`. So `npm run type-check` never inspects
`GitService`, the IPC handlers, `settings`, the watcher, `theme`, `window-state`, or `logger`. For a
project that treats process separation as non-negotiable, the whole backend is untyped, and type
errors there surface only at runtime or via tests.

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
- `src/components/diff/StatusBar.vue`: no test. This is also the component carrying the fake status
  text (U1).
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

1. B2 (state leaks across repos): user-visible correctness.
2. U1 (fake status text): actively misleading.
3. I1 and I4 (the enforced-boundary claim is false; the backend is untyped): the two findings that
   most undermine the project's stated guarantees.
4. A2 (Monaco bundle size): the largest efficiency win for the packaged app.
5. The settings.cjs and handlers.cjs test gaps: the highest-value untested logic.
6. Everything else as cleanup.
