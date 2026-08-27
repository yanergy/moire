# Diff Viewer — Build Checklist

Status of the work described in `diff-viewer-plan.md`, cross-referenced against the actual code as of 2026-08-27.

## Summary

The app is a complete, tested UI shell running entirely on mock data (`src/lib/mock.ts`). The renderer-side work (Phases 1 and 3) is largely built, but the entire Electron and git backend does not exist yet. There is no preload bridge, no `GitService`, no IPC, and no watcher. All git data is faked.

Note on shadcn-vue: the UI was originally hand-built while shadcn-vue was only initialized (config, `cn()` helper, and supporting deps present, but no components and no `reka-ui`). That has since been reversed. shadcn-vue is now the standard for all interactive controls per `code-conventions.md`, the primitives are installed under `src/components/ui/`, and the bespoke components were migrated onto them (styled with the `--dv-*` tokens to keep the custom look).

Legend: `[x]` done, `[~]` partial, `[ ]` not started.

## Setup and dependencies

- [x] `vite-plugin-electron` installed and wired in `vite.config.ts`
- [x] `tailwindcss` and `@tailwindcss/vite`
- [x] `simple-git`, `monaco-editor`, `electron-store`, `chokidar` installed (only monaco is actually used)
- [x] `vue-virtual-scroller` installed
- [x] `electron-builder` installed, minimal `build` block in `package.json`
- [x] `shadcn-vue` in use. `init` scaffolding plus primitives under `src/components/ui/` (button, badge, input, checkbox, tooltip, toggle-group, scroll-area, command, popover, and their deps); `reka-ui` and `@vueuse/core` installed.

## Phase 1 — Scaffold and plumbing

- [~] `vite-plugin-electron` simple mode. Wired, but the entry is `electron/main.cjs` (plain JS), with no `preload.ts` and no `contextIsolation` or `nodeIntegration` config on the window.
- [x] ESM output concern, sidestepped by using `.cjs`
- [x] Tailwind v4 via `@tailwindcss/vite` and `@import "tailwindcss"`
- [x] shadcn-vue init and components. The toolbar, ref pickers, view toggles, file tree, and selection banner were migrated onto shadcn-vue primitives (styled with the `--dv-*` tokens).
- [ ] Context-isolated preload bridge with one typed round-trip. Not done. The `DiffViewerApi` type is defined in `src/shared/types.ts` but nothing implements it, and there is no `window.api`.
- [ ] Native folder picker to `openRepo`. Not done.
- [ ] `git --version` startup check with error dialog. Not done.
- [ ] Recent-repos persistence via `electron-store`. Not done.

## Phase 2 — Git integration

- [ ] `GitService` (branches, changed files, file pairs). Not done. Exists only as mock string content.
- [ ] Rename and binary detection. Not done. The types support it, but there is no logic.
- [ ] Vitest parser tests (numstat, name-status, `-z`). Not done. The `parsers.spec.ts` shown in the app is mock content. The real tests cover stores, components, language, and the mock module (43 passing).

## Phase 3 — Core UI

- [x] Monaco DiffEditor spike (`MonacoDiff.vue`, env and theme setup in `App.vue`)
- [x] Toolbar with ref selectors and mode toggles (`AppToolbar`, `RefSelector`, `SegmentedToggle`)
- [~] File tree wired to changed files. Wired to `MOCK_FILES` via the store, not `getChangedFiles`.
- [~] File selection to file pair to Monaco. Wired to `mockFilePair`, not `getFilePair`.
- [x] Split and unified toggle, plus prev/next change navigation (`DiffPane` to `SelectionBanner` to `MonacoDiff.goTo`)
- [x] Status bar totals (`StatusBar`)

## Phase 4 — Live updates and polish

- [ ] `RepoWatcher` (chokidar). Not done. Only mock source text.
- [ ] Auto-refresh on change. Not done.
- [ ] Virtualized file tree. Not done. `vue-virtual-scroller` is installed but unused, and the tree renders a plain list.
- [ ] Size threshold and "Load diff" gate. Not done. `FilePair.tooLarge` exists, but there is no UI.
- [ ] Binary and image preview. Not done. There is no `BinaryPreview` component.
- [ ] Rename display (`old` to `new`). Not done in the UI.
- [x] Dark and light theme toggle with matching Monaco themes (`ui` store and `monaco-theme.ts`)
- [x] Filter box (`treeFilter`) and viewed checkboxes (`viewed`)
- [ ] Theme persistence via `electron-store` and `nativeTheme`. Not done. In-memory only, per the store comment.

## Phase 5 — Packaging and release

- [~] `electron-builder` config. Minimal `build` block only. The `pack` script and a `release/` output exist, but there are no per-platform targets.
- [ ] App icon and window-state persistence. Not done.
- [ ] Error reporting and log file in userData. Not done.

## Progress estimate

Phase 3 is roughly 80 percent complete against mocks, Phase 1 roughly 40 percent, and Phases 2, 4, and 5 are barely started. The critical gap is that nothing crosses the Electron IPC boundary yet. The stores are shaped so that swapping mocks for a real backend is a store-level change, so the front end is well positioned, but the entire git and Electron layer remains to be built.
