# Diff Viewer — Code Conventions & Project Rules

Desktop diff-viewer app comparing two branches of a local Git repository.
Stack: Vue 3 · Vite 8 · Electron 44 · TypeScript · Tailwind CSS v4 · shadcn-vue · Pinia.

## Architecture rules

- This is an Electron app with strict process separation:
    - `electron/` = main process (Node). All git (`simple-git`), filesystem, and file-watching
      (`chokidar`) work lives here. Nowhere else.
    - `src/` = renderer (Vue). NEVER import `electron` or `node:*` modules in `src/` — a custom
      oxlint rule enforces this. The renderer talks to main only through the preload bridge
      (`window.api`).
    - Types shared across the IPC boundary (`ChangedFile`, `FilePair`, `DiffViewerApi`, ...) go in
      `shared/types.ts`. Never duplicate these definitions on either side.
- `electron/main.cjs` is CommonJS (`require`). Renderer code is TypeScript ESM. Do not "fix"
  the main process to ESM or convert its `require` calls to `import`.
- Adding a new IPC channel means three changes, always together:
    1. handler in `electron/ipc/`
    2. exposure in the preload `contextBridge`
    3. extension of the `DiffViewerApi` type in `shared/types.ts`
- Window security settings (`contextIsolation: true`, no `nodeIntegration`) are non-negotiable.
  Never weaken them to make something "work".

## Tooling

- Lint/format is **oxlint + oxfmt**. Do NOT install or configure eslint, prettier, or biome.
- After making changes, run: `npm run lint`, `npm run format`, `npm run type-check`.
  For behavior changes, also `npm run test:unit`.
- Never run `electron .` directly. Dev = `npm run dev` (vite-plugin-electron launches Electron
  itself). Packaged smoke test = `npm run pack`, then run the binary in `release/linux-unpacked/`.
- Never commit or edit anything in `dist/`, `dist-electron/`, or `release/` — build output only.
- Config files that are the source of truth: `.oxlintrc.json` (linting), `.oxfmtrc.jsonc`
  (formatting), `vite.config.ts` (build). Don't create parallel/duplicate configs.

## Code conventions

- Always prefer `<div />` over `<div></div>`. Note the space before the `/>`. This applies to
  all elements without children: normal HTML tags (`<div />`), void elements (`<img />`,
  `<br />`), SVG elements, and components (`<file-tree />`). The formatter does NOT enforce
  this — you must write it correctly yourself.
- Prefer guard clauses with early returns over nesting. Avoid `else` after a branch that
  returns or throws. Symmetric two-way branches (both sides do real work) may use `else` or
  a ternary.

    ```js
    // CORRECT
    function method(value) {
        if (!value) {
            return;
        }

        value++;
    }

    // INCORRECT
    function method(value) {
        if (value) {
            value++;
        } else {
            return;
        }
    }
    ```

- Always prefer kebab-case for Vue components in templates. For example `<page-base-layout>`
  instead of `<PageBaseLayout>`. This is not lint-enforced — write it correctly yourself.
- Don't add comments that restate what the code does; comment only the "why" (non-obvious
  decisions, workarounds, gotchas).
- 4-space indentation, single quotes. The oxfmt config is the source of truth — match it
  rather than restating rules here.

## Vue conventions

- `<script setup lang="ts">` with the Composition API for all components. No Options API.
- State lives in Pinia stores (`src/stores/`); components stay thin and presentational
  where possible.
- UI primitives come from shadcn-vue and live in `src/components/ui/`. Add new ones via
  `npx shadcn-vue@latest add <name>` — don't hand-write lookalikes. App-level components
  live in `src/components/`, never inside `ui/`.
- Styling is Tailwind utility classes. No `<style scoped>` blocks unless a Tailwind
  equivalent genuinely doesn't exist; if you add one, say why in a comment.
- Theme values (colors, diff status colors) come from the CSS variable tokens — never
  hardcode hex values in components.

## Git & diff domain rules

- Branch comparisons default to merge-base (three-dot `base...head`) semantics — what a
  GitHub PR shows. Direct two-dot comparison is a user-facing toggle, not a default.
- Parse git output with `-z` (NUL-separated) flags; never split on whitespace or newlines
  (paths can contain spaces). Parsers live in `electron/git/parsers.ts` and every parser
  change needs a matching case in `tests/parsers.spec.ts`.
- Treat file content as potentially huge or binary: check the `binary` and `tooLarge`
  flags before rendering; never assume UTF-8 text.

## When unsure

- Prefer the smallest change that solves the problem. Don't refactor adjacent code,
  reorganize files, or add dependencies unless asked.
- If a task seems to require a new dependency or a change to build/tooling config,
  stop and ask first.
