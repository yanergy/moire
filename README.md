# Moiré

A desktop app for viewing the diff between two branches of a local Git repository, with a look
and feel modeled on GitHub's pull request diff view and PhpStorm's diff tool.

The name comes from the moiré pattern: overlay two nearly identical grids and the mismatches
surface as a shimmer you cannot miss. That is what a diff does, difference made visible by
superimposition.

## Status

All five phases of the plan (`documentation/moire-plan.md`) are complete. The renderer runs
entirely on the real git backend in the Electron main process (branches, changed files, and file pairs
over IPC): the ref selectors, file tree, and diff pane all read live data, with a virtualized
tree, per-folder "mark viewed", a large-file gate, binary and image previews, rename display,
theme and range persistence, and auto-refresh on repository changes. `npm run pack` builds a
self-contained desktop app for the host platform. Remaining work is polish and, for
distribution beyond the local machine, code signing (macOS Developer ID, Windows Authenticode).

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

## Known issues

Track bugs and limitations here.

- **The macOS app name shows `Moire` (no accent) in the menu bar, dock, and About panel.** Those
  come from `CFBundleName`, which has to be ASCII because a non-ASCII value crashes the unsigned
  app on Apple Silicon. The accent is used everywhere else (window title, in-app UI, dmg volume
  name and filenames, Finder label). Carrying the accent there too would need a code-signing
  certificate, which this project does not use.
- **Windows and Linux packaged builds are unverified.** The `electron-builder` config targets
  them, but the app has only been built and run on macOS so far.

## Documentation

- `documentation/code-conventions.md`: code conventions and project rules. Read this before
  making changes.
- `documentation/moire-plan.md`: the full project plan.
