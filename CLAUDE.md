# Moiré

Desktop app for viewing the diff between two branches of a local Git repository. Vue 3 renderer
with an Electron main process. See `README.md` for the status and the roadmap of remaining work.

## Before writing code

Read `documentation/code-conventions.md`. It is the source of truth for this project: code
style, the strict Electron process separation and preload bridge rules, the shadcn-vue
component standard, the `--moire-*` design tokens, testing rules, and component naming. Follow it
for every change.

## Keeping the checklist current

The README has a Checklist section that is the single source of truth for project status. Every
time a feature or task is finished, mark it off there in the same change (switch its `[ ]` or
`[~]` to `[x]`). Add a new item when you start work the checklist does not yet cover.

## Other documentation

- `documentation/moire-plan.md`: the full project plan.
