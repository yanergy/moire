# diff-viewer

A desktop app for viewing the diff between two branches of a local Git repository.

Stack: Vue 3, Vite 8, Electron 44, TypeScript, Tailwind CSS v4, Pinia, and Monaco for the diff view.

## UI components

All interactive UI is built on shadcn-vue primitives (Reka UI under the hood), which live in
`src/components/ui/`. Add new primitives with `npx shadcn-vue@latest add <name>`. Do not
hand-write bespoke replacements for something shadcn-vue provides. The primitives are styled
with the project's `--dv-*` design tokens so they match the custom look. See
`code-conventions.md` for the full rules.
