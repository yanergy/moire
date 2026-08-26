# Diff Viewer — Project Plan

A desktop application for viewing the differences between two branches of a local Git repository, with a look and feel modeled on GitHub's pull-request diff view and PhpStorm's diff tool.

**Stack:** Vue 3 · Vite 8 · Electron 44 · TypeScript · Tailwind CSS v4 · shadcn-vue
**Data source:** Local repository via the system `git` binary (no GitHub API, no authentication)

---

## 1. Goals and Non-Goals

### Goals

- Open any local Git repository and compare two refs (branches, tags, or commits).
- Compare a branch against the working tree (uncommitted changes), since the app is used _alongside_ active development.
- Render diffs with syntax highlighting, side-by-side and unified views, and intra-line change highlighting — comparable to PhpStorm/VS Code quality.
- Show a changed-file tree with status badges and line counts, GitHub-style.
- Stay live: refresh automatically when branches move or files change on disk.
- Handle large repositories and large diffs without freezing the UI.

### Non-Goals (for v1)

- GitHub API / remote-only comparison (repo is always cloned locally).
- Editing, staging, committing, or any write operations on the repository.
- Three-way merge or conflict resolution views.
- Multi-repo workspaces (one repo open at a time).

---

## 2. Current State and Install List

The project is scaffolded with create-vue: Vue 3.5, Vite 8, TypeScript, Pinia, Vitest (+ jsdom, @vue/test-utils), ESLint + oxlint + Prettier, and Electron 44 as a devDependency.

### Already covered

| Need                       | Covered by                                       |
| -------------------------- | ------------------------------------------------ |
| Renderer framework & build | `vue`, `vite`, `@vitejs/plugin-vue`              |
| State management           | `pinia`                                          |
| Unit tests (git parsers)   | `vitest`                                         |
| Component tests            | `jsdom`, `@vue/test-utils`                       |
| Lint / format              | `eslint`, `oxlint`, `prettier`                   |
| Electron runtime           | `electron@^44`                                   |
| `@` → `src` path alias     | create-vue default (also required by shadcn-vue) |

### To install now

```bash
# Electron ↔ Vite integration (Vite 8 compatible)
npm i -D vite-plugin-electron

# Styling + components
npm i tailwindcss @tailwindcss/vite
npx shadcn-vue@latest init

# Core runtime
npm i simple-git monaco-editor electron-store chokidar
```

> simple-git - git helper tool
>
> monaco-editor - file viewer
>
> electron-store - electron settings storage
>
> chokidar - file watching

### To install later

```bash
npm i vue-virtual-scroller        # Phase 4: file tree virtualization
npm i -D electron-builder         # Phase 5: packaging
```

### Why vite-plugin-electron (not electron-vite)

electron-vite's latest release (5.0.0) pins its Vite peer range to ^5–^7, so it conflicts with this project's `vite@^8`. vite-plugin-electron v1 explicitly supports Vite 7 and 8 (it adapts to `rolldownOptions` on Vite 8+) and, crucially, layers onto an **existing** Vite project instead of replacing the build tool — the current `vite.config.ts`, plugin-vue, and devtools setup stay as-is. `vite-plugin-electron-renderer` is _not_ needed: the renderer never uses Node APIs by design.

---

## 3. Architecture

### Process model

```
┌─────────────────────────────────────────────────┐
│ Main process (Node)  — electron/main.ts         │
│  - GitService (simple-git wrapper)              │
│  - RepoWatcher (chokidar on .git/ + worktree)   │
│  - Settings store (recent repos, preferences)   │
│  - Native dialogs (folder picker)               │
└──────────────┬──────────────────────────────────┘
               │ IPC (invoke/handle + push events)
┌──────────────▼──────────────────────────────────┐
│ Preload — electron/preload.ts (contextBridge)   │
│  - Narrow, typed API surface only               │
└──────────────┬──────────────────────────────────┘
┌──────────────▼──────────────────────────────────┐
│ Renderer (Vue 3 + Vite) — src/                  │
│  - Pinia stores (repo, comparison, ui)          │
│  - shadcn-vue components + Tailwind v4          │
│  - Monaco DiffEditor for rendering              │
│  - Virtualized file tree sidebar                │
└─────────────────────────────────────────────────┘
```

All Git and filesystem work lives in the main process. The renderer never touches Node APIs directly (`contextIsolation: true`, `nodeIntegration: false`).

### Vite config sketch

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
    plugins: [
        vue(),
        tailwindcss(),
        electron({
            main: { entry: 'electron/main.ts' },
            preload: { input: 'electron/preload.ts' },
            // no `renderer` key — Node stays out of the renderer
        }),
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
```

### Preload API surface (initial)

```ts
interface DiffViewerApi {
    openRepoDialog(): Promise<string | null>;
    openRepo(path: string): Promise<RepoInfo>;
    getRecentRepos(): Promise<string[]>;
    getBranches(): Promise<BranchInfo[]>;
    getChangedFiles(
        base: string,
        head: string | 'WORKING_TREE',
        mode: 'merge-base' | 'direct'
    ): Promise<ChangedFile[]>;
    getFilePair(base: string, head: string | 'WORKING_TREE', path: string): Promise<FilePair>;
    onRepoChanged(cb: (event: RepoChangeEvent) => void): () => void;
}
```

### Core data shapes

```ts
interface ChangedFile {
    path: string;
    oldPath?: string; // set for renames
    status: 'A' | 'M' | 'D' | 'R';
    additions: number;
    deletions: number;
    binary: boolean;
}

interface FilePair {
    path: string;
    oldContent: string | null; // null for added files
    newContent: string | null; // null for deleted files
    language: string; // inferred from extension, for Monaco
    binary: boolean;
    tooLarge: boolean; // above render threshold
}
```

Defining these shapes early keeps the renderer decoupled from Git specifics.

### Key library choices

| Concern                  | Choice                                  | Rationale                                                                                                                               |
| ------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Electron ↔ Vite          | `vite-plugin-electron` (simple mode)    | Vite 8 compatible; adds onto the existing create-vue config                                                                             |
| Git access               | `simple-git`                            | Thin wrapper over the system git binary; users are developers, git is guaranteed present                                                |
| Diff rendering           | `monaco-editor` (DiffEditor)            | Side-by-side + inline views, syntax highlighting, intra-line diffs, unchanged-region folding — the PhpStorm look for free               |
| UI components            | `shadcn-vue` (Reka UI + Tailwind)       | Copy-in components: Combobox, Tabs, Dialog, Tooltip, ScrollArea, Checkbox, Badge — everything the chrome needs, fully ownable/themeable |
| Styling                  | Tailwind CSS v4 via `@tailwindcss/vite` | CSS-first config, no `tailwind.config.js` needed; shadcn-vue's theming layer sits on top                                                |
| File watching            | `chokidar`                              | Watch `.git/HEAD`, `.git/refs/`, and the working tree                                                                                   |
| State                    | `pinia`                                 | Already installed                                                                                                                       |
| Persistence              | `electron-store`                        | Recent repos, theme, view preferences                                                                                                   |
| File list virtualization | `vue-virtual-scroller`                  | Keeps huge change sets scrollable                                                                                                       |

**Deliberately avoided:** `electron-vite` (Vite peer range ≤7 conflicts with Vite 8), `vite-plugin-electron-renderer` (no Node in renderer), `isomorphic-git`/libgit2 bindings (heavy, unnecessary when git is installed), `jsdiff`/`diff2html` (Monaco covers rendering better).

---

## 4. Git Strategy

- **Changed-file list:** `git diff --name-status -M --numstat <range>` — `-M` enables rename detection; numstat provides +/− counts.
- **Comparison modes:**
    - **Merge-base (default):** `base...head` (three-dot) — matches what a GitHub PR shows.
    - **Direct:** `base..head` (two-dot) — exposed as a toggle for users who want the literal difference.
    - **Working tree:** `git diff <base>` with no second ref; the "new" side of each file is read straight from disk.
- **File contents at a ref:** `git show <ref>:<path>`. For the working tree, read from the filesystem.
- **Binary detection:** numstat reports `-` for binary files; flag them and skip text rendering.
- **Startup check:** verify `git --version` succeeds on launch; show a friendly error dialog if not.

---

## 5. UI Design

### Layout

```
┌────────────────────────────────────────────────────────┐
│ Toolbar: [repo name ▾] [base branch ▾] ⇄ [head ▾]      │
│          [merge-base|direct] [split|unified] [refresh] │
├──────────────┬─────────────────────────────────────────┤
│ File tree    │                                         │
│ (grouped by  │        Monaco DiffEditor                │
│  directory)  │        (side-by-side or inline)         │
│              │                                         │
│ ✓ M src/a.ts │   [prev change] [next change]           │
│   A src/b.ts │                                         │
│   D old.css  │                                         │
├──────────────┴─────────────────────────────────────────┤
│ Status bar: 14 files changed, +312 −87                 │
└────────────────────────────────────────────────────────┘
```

### Components (mapped to shadcn-vue)

| App component                                                                                                   | Built from                                                                         |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| BranchSelector (searchable dropdown; local branches first, then remotes; "Working tree" entry on the head side) | `Combobox` / `Command` + `Popover`                                                 |
| Comparison-mode & view toggles                                                                                  | `Tabs` or `ToggleGroup`                                                            |
| FileTree (directory-grouped, collapsible, virtualized; filter box; viewed checkboxes)                           | `ScrollArea`, `Collapsible`, `Checkbox`, `Input`, `Badge` + `vue-virtual-scroller` |
| Status badges (green A, blue M, red D, purple R) with +/− counts                                                | `Badge` variants                                                                   |
| Toolbar buttons, refresh, prev/next change                                                                      | `Button`, `Tooltip`                                                                |
| Error dialogs (git missing, not a repo)                                                                         | `AlertDialog`                                                                      |
| EmptyStates (no repo, no diff, file too large)                                                                  | `Card`, `Button`                                                                   |
| BinaryPreview (side-by-side images or "binary file changed" notice)                                             | custom, styled with Tailwind                                                       |
| DiffPane                                                                                                        | Monaco DiffEditor (custom wrapper component)                                       |

### Theming

- shadcn-vue theme tokens (CSS variables) drive all component chrome; dark mode via the `.dark` class, toggled and persisted through `electron-store` + `nativeTheme`.
- Define **matching Monaco themes** (light/dark) that read from the same palette so the editor doesn't clash with the surrounding UI. Dark leans JetBrains Darcula; light leans GitHub.
- Diff status colors defined once as Tailwind theme tokens (`--color-diff-added`, etc.) and reused in badges, tree, and Monaco decorations.

---

## 6. Build Phases

### Phase 1 — Scaffold and plumbing (1–2 days)

- [ ] Add `vite-plugin-electron` (simple mode) with `electron/main.ts` + `electron/preload.ts`; verify HMR for renderer and main-process reload both work with the existing create-vue config
- [ ] Check ESM output: project is `"type": "module"` — confirm the built main/preload load correctly in Electron 44 (plugin defaults should handle it)
- [ ] Tailwind v4 via `@tailwindcss/vite` + `@import "tailwindcss"` in the main CSS file
- [ ] `npx shadcn-vue@latest init`, add first components (`Button`, `Combobox`, `Tooltip`)
- [ ] Context-isolated preload bridge with one typed round-trip
- [ ] Native folder picker → `openRepo` flow
- [ ] `git --version` startup check with error dialog (`AlertDialog`)
- [ ] Recent-repos persistence via `electron-store`

**Exit criteria:** app opens with shadcn-styled UI, user can pick a repo folder, main process confirms it's a Git repo.

### Phase 2 — Git integration (2–3 days)

- [ ] `GitService` in main: branch listing, changed-file list (both range modes + working tree), file-pair retrieval
- [ ] Rename and binary detection
- [ ] Vitest unit tests for git output parsing (numstat/name-status parsers, `-z` NUL-separated output)

**Exit criteria:** given two refs, the main process returns correct `ChangedFile[]` and `FilePair` data for a real repo, verified by tests.

### Phase 3 — Core UI (3–5 days)

- [ ] **Spike first:** Monaco DiffEditor rendering a hardcoded file pair inside Electron (worker loading needs Vite config attention — de-risk before building around it)
- [ ] Toolbar with branch Comboboxes and mode toggles
- [ ] File tree sidebar wired to `getChangedFiles`
- [ ] File selection → `getFilePair` → Monaco with correct language
- [ ] Split/unified toggle, change navigation
- [ ] Status bar totals

**Exit criteria:** end-to-end flow — open repo, pick branches, browse and read every changed file.

### Phase 4 — Live updates and polish (3–4 days)

- [ ] `RepoWatcher`: chokidar on `.git/HEAD`, `.git/refs/`, working tree; debounced push events over IPC
- [ ] Auto-refresh of file list and open diff on change
- [ ] Virtualized file tree (`vue-virtual-scroller`); lazy file-content loading
- [ ] Size threshold with "Load diff" gate for huge files
- [ ] Binary/image preview
- [ ] Rename display (`old → new`)
- [ ] Dark/light theme toggle with matching Monaco themes; filter box; viewed checkboxes

**Exit criteria:** app stays responsive on a large repo (e.g., a monorepo with a 500-file diff) and reflects new commits without manual refresh.

### Phase 5 — Packaging and release (1–2 days)

- [ ] `electron-builder` config for Windows/macOS/Linux
- [ ] App icon, window state persistence (size/position)
- [ ] Basic error reporting surface (log file in userData)

---

## 7. Risks and Mitigations

| Risk                                                                 | Impact                    | Mitigation                                                                                        |
| -------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| Monaco worker loading under Vite 8 + Electron                        | Blocks all diff rendering | Spike it first thing in Phase 3                                                                   |
| ESM main/preload output quirks (`"type": "module"` project)          | App fails to launch       | Verify in Phase 1 on first run; plugin marks main/preload as node platform by default             |
| shadcn-vue expects the `@` alias                                     | CLI/init friction         | Already satisfied — create-vue sets `@` → `src`                                                   |
| Very large files/diffs freeze the renderer                           | Poor UX on real repos     | Size gate, lazy loading, virtualized lists                                                        |
| Git output parsing edge cases (renames, spaces in paths, submodules) | Wrong file lists          | Use `-z` (NUL-separated) output; parser unit tests                                                |
| Watcher event storms during rebases/checkouts                        | UI thrash                 | Debounce + coalesce events in main before pushing to renderer                                     |
| Non-UTF-8 file encodings                                             | Garbled diff text         | Detect and fall back to a "binary-ish" notice or best-effort decode                               |
| Tailwind preflight vs Monaco styles                                  | Editor rendering glitches | Scope-test early in the Phase 3 spike; exclude Monaco container from conflicting resets if needed |

---

## 8. Suggested Repository Layout

```
diff-viewer/
├─ vite.config.ts               # vue + tailwindcss + electron plugins
├─ components.json              # shadcn-vue config
├─ electron/
│  ├─ main.ts                   # app lifecycle, window creation
│  ├─ preload.ts                # contextBridge API
│  ├─ git/GitService.ts
│  ├─ git/parsers.ts            # numstat / name-status parsing
│  ├─ watcher/RepoWatcher.ts
│  └─ ipc/handlers.ts
├─ src/                         # renderer (existing create-vue structure)
│  ├─ main.ts
│  ├─ App.vue
│  ├─ assets/main.css           # @import "tailwindcss" + theme tokens
│  ├─ stores/                   # repo.ts, comparison.ts, ui.ts
│  ├─ components/
│  │  ├─ ui/                    # shadcn-vue copied components
│  │  ├─ Toolbar.vue
│  │  ├─ BranchSelector.vue
│  │  ├─ FileTree.vue
│  │  ├─ DiffPane.vue
│  │  ├─ BinaryPreview.vue
│  │  └─ EmptyState.vue
│  └─ shared → ../shared
├─ shared/
│  └─ types.ts                  # ChangedFile, FilePair, RepoChangeEvent
└─ tests/
   └─ parsers.spec.ts
```

Total estimated effort: **10–16 working days** for a polished v1.
