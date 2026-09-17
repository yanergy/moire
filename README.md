# Moiré

A desktop app for viewing the diff between two branches of a local Git repository, with a look
and feel modeled on GitHub's pull request diff view and PhpStorm's diff tool.

The name comes from the moiré pattern: overlay two nearly identical grids and the mismatches
surface as a shimmer you cannot miss. That is what a diff does, difference made visible by
superimposition.

## Screenshots

![Overview of the Moiré window in split view](documentation/screenshots/overview.png)

| Unified view                                                                       | Image preview                                                                             |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| ![The same diff in the unified layout](documentation/screenshots/unified-view.png) | ![Side by side image preview for a changed PNG](documentation/screenshots/image-view.png) |

## Requirements

- macOS, Windows, or Linux (only macOS has been verified so far, see [Known issues](#known-issues)).
- To run from source or build the app: Node `^22.18.0 || >=24.12.0`.
- A local Git repository with at least two branches to compare.

## Running the app

There are two ways to get the app on screen. Running from source is the quickest. Building a
packaged app gives you a standalone `.app` you can keep in your Applications folder.

### Option 1: run from source

```bash
npm install     # install dependencies (first time only)
npm run dev     # start Vite and the Electron window with hot reload
```

The window opens automatically. Code changes reload live.

### Option 2: build and install a standalone app

```bash
npm run pack    # build the renderer and package the app into release/
```

On macOS this writes a `.dmg` and a `.zip` for both Apple Silicon (`arm64`) and Intel (`x64`) into
`release/`. Open the `.dmg` and drag Moiré into Applications.

Because the app is not code-signed, macOS Gatekeeper blocks it on first launch. To open it the
first time, right-click (or Control-click) the app in Applications and choose **Open**, then
confirm. After that it opens normally. (Windows and Linux targets are configured but unverified.)

### Releasing a new version

Moiré checks for updates on launch. It asks the GitHub Releases API for the latest release of
`yanergy/moire`, compares that release tag to the running version (`app.getVersion()`, which reads
the `version` field from `package.json`), and pops a native dialog when the release is newer,
offering to open the release page. The app is not code-signed, so it cannot install updates itself.
The popup only notifies, and the user downloads and installs the new build by hand.

For that check to work, a release has to be published and its tag has to match the version in
`package.json`. To cut a release:

1. Bump `version` in `package.json` (for example `1.0.0` becomes `1.1.0`).
2. Run `npm run pack` to build the installers into `release/`.
3. Publish a GitHub release whose tag is `v` followed by that version (for example `v1.1.0`), with
   the built `.dmg` and `.zip` files attached as assets. The `gh` CLI does both at once:

    ```bash
    gh release create v1.1.0 release/*.dmg release/*.zip \
      --title "Moiré 1.1.0" --notes "What changed"
    ```

Two caveats. The update check only reaches users whose installed build already contains it, so the
first release that ships this feature (and every build before it) has to be announced by hand.
Releases after it are detected automatically. And because the comparison is numeric (major, then
minor, then patch), the release tag and the `package.json` version have to stay in step, otherwise
the popup never appears.

## Using the app

1. **Pick a repository.** Click the repository button in the top-left and choose **Open folder…**,
   or select one you opened before from **Recent**. You can also use **File > Open Repository…**
   (`Cmd/Ctrl+O`).
2. **Choose the two branches.** Set the **base** on the left and the **head** on the right. Base is
   the branch you compare against (often `main`); head is the branch whose changes you want to see.
   The swap button between them flips the two.
3. **Choose how to compare.** Toggle between:
    - **merge-base**: compares head to the point where it branched off base, showing only the changes
      head introduces. This matches what a GitHub pull request shows.
    - **direct**: compares the base and head tips directly, so commits added to base after head
      branched off also show up.
4. **Choose the layout.** Toggle between **split** (side by side) and **unified** (single column).
   Under **View > Diff Layout** you can switch the whole review area between the single-file view
   and an **All Files** list that stacks every changed file's diff in one scroll, GitHub style.
5. **Browse the changes.** The sidebar lists every changed file as a tree. Click a file to open its
   diff, or search and filter the tree (by name, or by filetype, mutation type, or marker) to focus
   on what matters. Mark a file or a whole folder as viewed to track what you have read, and step
   through changes with the previous and next buttons in the diff header, which cross into the
   adjacent file at each end. Click the filename in the diff header to open the file in an editor
   (choose which under **View > Open Files In**). Renames, binary files, and images get their own
   previews, and very large files sit behind a click so they never lock up the window.
6. **Review the pull request.** When a pull request exists for the selected branches, a PR view
   becomes available with its description, status, labels, conversation, and CI checks. Inline
   review comments and check annotations show on their lines in the diff. An optional edit mode lets
   you reply to and resolve threads, post and edit your own comments, edit the description, and tick
   task-list boxes.

The diff refreshes on its own when the repository changes on disk. Use **View > Refresh**
(`Cmd/Ctrl+R`) to re-scan manually. Set the appearance under **View > Theme** (System, Light, or
Dark) and the diff coloring under **View > Code Style** (GitHub or VS Code); your choices and the
last branch range are remembered per repository.

## Features

- Two-branch diff for any local Git repository, with `merge-base` (pull-request style) and `direct`
  comparison modes.
- Split and unified layouts, powered by the Monaco editor.
- A choice of diff layout under **View > Diff Layout**: the single-file view, or a GitHub-style
  "all files" list that stacks every changed file's diff in one scroll. The stacked view windows
  its editors so large pull requests stay responsive, marking a file viewed collapses it, and
  clicking a file in the tree jumps to it.
- A virtualized file tree that stays smooth on large change sets, with per-file and per-folder
  "mark viewed" progress.
- Next and previous change navigation that steps through the open file, then crosses into the
  adjacent file (in sidebar order) once a boundary is reached, wrapping around the whole change set.
- Open a changed file from the diff header. The filename is a link (with an external-link icon)
  that opens the working-tree copy, and **View > Open Files In** chooses the OS default app or a
  detected editor (auto-detected per machine and persisted across launches).
- Rename detection, binary-file notices, and inline image previews.
- A large-file gate so oversized files never freeze the UI.
- Recent-repository list and a native folder picker.
- Auto-refresh when the working tree changes, plus a manual refresh.
- System, light, and dark themes, with theme and branch selections persisted per repository.
- A selectable diff color style (GitHub or VS Code) under **View > Code Style**, persisted across launches.
- A status bar reporting line-ending style and how long ago the diff was synced.
- A pull-request viewer for the compared branches: title, status, merge state, labels, description
  and conversation as Markdown, and a Checks tab with the head commit's CI. An edit mode (off by
  default) adds posting, editing, and deleting your own comments, editing the description, and
  ticking task-list checkboxes. Inline review threads and CI check annotations show on their lines
  in the diff, and you can reply to and resolve threads in place. The file tree flags each file that
  carries review threads or annotations.
- A file-tree search box plus a tiered filter menu (next to the changed-files count) that narrows
  the tree by filetype, mutation type, or marker (files carrying an error, warning, or review
  comment). Filters are multi-select and combine, and a reset clears them at once.

## Development

```bash
npm run test:unit     # run the Vitest suite
npm run type-check    # vue-tsc project type check
npm run lint          # oxlint with autofix
npm run format        # oxfmt
```

### Stack

Vue 3, Vite 8, Electron 44, TypeScript, Tailwind CSS v4, shadcn-vue (Reka UI), Pinia, and Monaco
for the diff view.

### UI components

All interactive UI is built on shadcn-vue primitives (Reka UI under the hood), which live in
`src/components/ui/`. Add new primitives with `npx shadcn-vue@latest add <name>`. Do not
hand-write bespoke replacements for something shadcn-vue provides. The primitives are styled with
the project's `--moire-*` design tokens so they match the custom look. See
`documentation/code-conventions.md` for the full rules.

## Known issues

Track bugs and limitations here.

- **The macOS app name shows `Moire` (no accent) in the menu bar, dock, and About panel.** Those
  come from `CFBundleName`, which has to be ASCII because a non-ASCII value crashes the unsigned
  app on Apple Silicon. The accent is used everywhere else (window title, in-app UI, dmg volume
  name and filenames, Finder label). Carrying the accent there too would need a code-signing
  certificate, which this project does not use.
- **Windows and Linux packaged builds are unverified.** The `electron-builder` config targets
  them, but the app has only been built and run on macOS so far.
- **The PR viewer (issue [#3](https://github.com/yanergy/moire/issues/3)) leaves two things out on
  purpose.** A Commits tab (the commit list) is deliberately not built, since an IDE already shows a
  branch's commits well and it would duplicate tooling that is already to hand. And CI check
  annotations are read-only: unlike code scanning alerts, a check-run annotation cannot be dismissed
  through the API (it belongs to a check run and clears when the check re-runs), so there is nothing
  to act on.
- **A task-list tick can be lost if you quit within the debounce window.** Ticking a checkbox
  writes back after a short quiet period (about two seconds), batching a burst into one save.
  Pending ticks are flushed on the usual exits (leaving edit mode, refreshing, switching tab, the
  window losing focus, and switching the branch or PR, which flushes to the old PR before the new
  one loads). They are not flushed when the app quits within that window, so a tick made in the
  last couple of seconds before quitting can still be dropped. Handling that needs the main
  process to hold quitting until the pending write lands, which is not wired up yet.
- **The Git menu's account list refreshes only when the menu is rebuilt** (on launch, when a repo
  opens, and right after switching accounts). Signing in or out with `gh auth login` / `gh auth
  logout` while the app is running is not picked up until one of those happens (or a relaunch).

## Planned features

No features are planned at the moment. Everything on the original roadmap has shipped. New ideas
are tracked as open issues on GitHub.

## Documentation

- `documentation/code-conventions.md`: code conventions and project rules. Read this before making
  changes.
- `documentation/moire-plan.md`: the full project plan.
