# Moiré

A desktop app for viewing the diff between two branches of a local Git repository, with a look
and feel modeled on GitHub's pull request diff view and PhpStorm's diff tool.

The name comes from the moiré pattern: overlay two nearly identical grids and the mismatches
surface as a shimmer you cannot miss. That is what a diff does, difference made visible by
superimposition.

## Status

Moiré is an early work in progress. The renderer is a complete, tested UI shell and the git
backend now runs in the Electron main process (branch listing, changed files, and file pairs
over IPC). The renderer is being switched onto it a piece at a time: the ref selectors show the
open repo's real branches, while the file tree and diff pane still read placeholder data from
`src/lib/mock.ts`. The stores are shaped so that swapping each mock for the real backend is a
store level change rather than a component rewrite. See the Checklist below for the full
breakdown of what is done and what remains.

## Stack

Vue 3, Vite 8, Electron 44, TypeScript, Tailwind CSS v4, shadcn-vue (Reka UI), Pinia, and
Monaco for the diff view.

## Getting started

Requires Node `^22.18.0 || >=24.12.0`.

```bash
npm install     # install dependencies
npm run dev     # start Vite and the Electron window with hot reload
```

### Other commands

```bash
npm run pack          # build the renderer and package a desktop app into release/
npm run test:unit     # run the Vitest suite
npm run type-check    # vue-tsc project type check
npm run lint          # oxlint with autofix
npm run format        # oxfmt
```

## UI components

All interactive UI is built on shadcn-vue primitives (Reka UI under the hood), which live in
`src/components/ui/`. Add new primitives with `npx shadcn-vue@latest add <name>`. Do not
hand-write bespoke replacements for something shadcn-vue provides. The primitives are styled
with the project's `--moire-*` design tokens so they match the custom look. See
`documentation/code-conventions.md` for the full rules.

## Checklist

The complete status, grouped by the phases in `documentation/moire-plan.md`. Mark items off
here as work lands. `[x]` is done, `[~]` is partial, `[ ]` is not started.

### Setup and dependencies ✅

- [x] `vite-plugin-electron` installed and wired in `vite.config.ts`.
- [x] `tailwindcss` and `@tailwindcss/vite`.
- [x] `simple-git`, `monaco-editor`, `electron-store`, and `chokidar` installed (only Monaco is
      used so far).
- [x] `vue-virtual-scroller` installed.
- [x] `electron-builder` installed, with a minimal `build` block in `package.json`.
- [x] shadcn-vue in use, primitives under `src/components/ui/`, with `reka-ui` and
      `@vueuse/core`.

### Phase 1, scaffold and plumbing ✅

- [x] Tailwind v4 via `@tailwindcss/vite`.
- [x] ESM output concern sidestepped by using `electron/main.cjs`.
- [x] shadcn-vue init and components migrated onto the primitives, styled with `--moire-*` tokens,
      verified in both themes.
- [x] Harden the Electron entry. `electron/main.cjs` sets `contextIsolation: true`,
  `nodeIntegration: false`, and `sandbox: true` on the window. The preload path is wired in with
  the bridge below.
- [x] Context isolated preload bridge (`electron/preload.cjs`) exposing `window.api`. Implements
  the repo-opening surface of `MoireApi` (`openRepoDialog`, `openRepo`, `getRecentRepos`)
  over `ipcMain.handle` channels in `electron/ipc/`; the git-backend methods land with Phase 2.
- [x] Native folder picker wired to `openRepo`. The toolbar repo-picker menu's "Open folder…"
  item opens it, and `openRepo` validates the folder is a Git repo (`simple-git` `checkIsRepo`)
  in the main process.
- [x] `git --version` startup check with an error dialog. `electron/main.cjs` gates launch on
  `isGitAvailable()` (runs `git --version` via `simple-git`); if git is missing it shows a native
  error box and quits, since the renderer is not up yet and nothing works without git.
- [x] Recent repos persistence via `electron-store` (`electron/settings.cjs`), recorded on each
  successful open, restored on launch, and listed in the toolbar repo-picker menu
  (`RepoPicker.vue`) where each entry can be removed.

### Phase 2, git integration ✅

- [x] `GitService` for branches, changed files, and file pairs. Lives in
  `electron/git/GitService.cjs`, wraps `simple-git`, and is exposed to the renderer over the
  `git:branches`, `git:changed-files`, and `git:file-pair` IPC channels (set on repo open).
  Supports the three-dot merge-base default, two-dot direct, and working-tree comparisons.
- [x] Rename and binary detection. `-M` rename detection surfaces `oldPath`, numstat's dash
  markers flag binaries in the changed-file list, and file pairs withhold binary content and
  flag oversized files.
- [x] Vitest parser tests for numstat, name status, and `-z` output in `tests/parsers.spec.ts`
  (parsers live in `electron/git/parsers.cjs`), with `tests/git-service.spec.ts` covering the
  service orchestration.

### Phase 3, core UI

- [x] Monaco DiffEditor spike.
- [x] Toolbar with ref selectors and mode toggles.
- [x] Split and unified toggle, plus prev and next change navigation.
- [x] Status bar totals.
- [x] Ref selectors wired to the real branch list via `getBranches`, loaded on repo open with a
  default base chosen per repo (the current branch, then main, then master). Switching or closing
  a repo resets the branch selection.
- [~] File tree wired to changed files. Reads `MOCK_FILES` via the store, not
  `getChangedFiles`.
- [~] File selection to file pair to Monaco. Reads `mockFilePair`, not `getFilePair`.

### Phase 4, live updates and polish

- [x] System, light, and dark theme selection with matching Monaco themes. Lives in the native
  application menu (View, Theme) as a radio group. The main process owns it via `nativeTheme`
  (`system` follows the OS) and pushes the resolved theme to the renderer over the preload bridge.
- [x] Filter box and viewed checkboxes.
- [x] Open repo name shown in the native window title.
- [ ] `RepoWatcher` (chokidar) with auto refresh on change.
- [ ] Virtualized file tree using the installed `vue-virtual-scroller`.
- [ ] Size threshold and a "Load diff" gate for large files.
- [ ] Binary and image preview.
- [ ] Rename display, showing the old path moving to the new path, in the UI.
- [x] Theme persistence via `electron-store` and `nativeTheme`. The chosen preference (`system`,
  `light`, or `dark`) is saved on change and restored on launch to seed `nativeTheme`.

### Phase 5, packaging and release

- [~] Full `electron-builder` config with per platform targets. Only a minimal `build` block
  exists today.
- [x] App icon. `build/icon.svg` is the packaging master (macOS-margined squircle around
  the `src/assets/moire-icon.svg` artwork); `build/icon.icns`, `icon.ico`, and `icon.png` are
  generated from it and auto-detected by electron-builder. The dev dock icon is set from the
  PNG in `electron/main.cjs`.
- [ ] Window state persistence.
- [ ] Error reporting and a log file in userData.

## Documentation

- `documentation/code-conventions.md`: code conventions and project rules. Read this before
  making changes.
- `documentation/moire-plan.md`: the full project plan.
