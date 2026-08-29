# Moiré

Desktop app for viewing the diff between two branches of a local Git repository. Vue 3 renderer
with an Electron main process. See `README.md` for the status and the roadmap of remaining work.

## Before writing code

Read `documentation/code-conventions.md`. It is the source of truth for this project: code
style, the strict Electron process separation and preload bridge rules, the shadcn-vue
component standard, the `--moire-*` design tokens, testing rules, and component naming. Follow it
for every change.

## Tracking status

The five-phase plan is complete, so the README no longer carries a per-task checklist. When you
hit a bug or a limitation, record it in the README's "Known issues" section in the same change,
and remove the entry once it is fixed.

## Other documentation

- `documentation/moire-plan.md`: the full project plan.
