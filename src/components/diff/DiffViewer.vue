<script setup lang="ts">
import * as monaco from '@/lib/monaco';
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { monacoThemeFor } from '@/lib/monaco-themes';
import type { CodeStyle, ViewMode } from '@/shared/types';

const props = defineProps<{
    original: string | null;
    modified: string | null;
    language: string;
    viewMode: ViewMode;
    isDark: boolean;
    codeStyle: CodeStyle;
    // Set by the parent when change navigation crosses into this file: which change
    // to land on once the diff is computed. Consumed on the next diff update, after
    // which the parent clears it via edgeConsumed.
    pendingEdge?: 'first' | 'last' | null;
}>();

const emit = defineEmits<{
    'update:changeCount': [count: number];
    edgeConsumed: [];
}>();

const containerRef = useTemplateRef<HTMLDivElement>('container');

let editor: monaco.editor.IStandaloneDiffEditor | null = null;
let originalModel: monaco.editor.ITextModel | null = null;
let modifiedModel: monaco.editor.ITextModel | null = null;
let diffListener: monaco.IDisposable | null = null;
let changes: readonly monaco.editor.ILineChange[] = [];
let changeIndex = -1;
let originalWordDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
let modifiedWordDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
let activeOriginalDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
let activeModifiedDecorations: monaco.editor.IEditorDecorationsCollection | null = null;

function buildModels() {
    if (!editor) {
        return;
    }

    originalModel?.dispose();
    modifiedModel?.dispose();
    originalModel = monaco.editor.createModel(props.original ?? '', props.language);
    modifiedModel = monaco.editor.createModel(props.modified ?? '', props.language);
    editor.setModel({ original: originalModel, modified: modifiedModel });
    // Clear the selected change once per real content change (a new file, a range
    // change, a refresh). onDidUpdateDiff deliberately does not, since it fires
    // repeatedly for the same content and would otherwise drop the selection.
    changeIndex = -1;
}

// GitHub highlights only the changed words inside a modified line, never whole
// added or removed lines. Monaco's own inserted/removed-text background instead
// paints the full width of every changed line, so the GitHub theme leaves that
// transparent (see monaco-themes/github.ts) and we draw our own word-level
// decorations from the char-level diff. `charChanges` exist only for modified
// lines; pure inserts and deletes have none, so they keep the plain line color,
// exactly as on github.com. The VS Code style keeps Monaco's native highlight.
function applyWordHighlights() {
    if (!originalWordDecorations || !modifiedWordDecorations) {
        return;
    }

    if (props.codeStyle !== 'github') {
        originalWordDecorations.clear();
        modifiedWordDecorations.clear();
        return;
    }

    const original: monaco.editor.IModelDeltaDecoration[] = [];
    const modified: monaco.editor.IModelDeltaDecoration[] = [];
    for (const change of changes) {
        for (const cc of change.charChanges ?? []) {
            if (
                cc.modifiedEndLineNumber > cc.modifiedStartLineNumber ||
                cc.modifiedEndColumn > cc.modifiedStartColumn
            ) {
                modified.push({
                    range: new monaco.Range(
                        cc.modifiedStartLineNumber,
                        cc.modifiedStartColumn,
                        cc.modifiedEndLineNumber,
                        cc.modifiedEndColumn
                    ),
                    // `className` (not inlineClassName) renders the highlight in the
                    // overlay layer, below the selection, so a selection over a
                    // changed word shows above it rather than behind.
                    options: { className: 'moire-word-insert' },
                });
            }

            if (
                cc.originalEndLineNumber > cc.originalStartLineNumber ||
                cc.originalEndColumn > cc.originalStartColumn
            ) {
                original.push({
                    range: new monaco.Range(
                        cc.originalStartLineNumber,
                        cc.originalStartColumn,
                        cc.originalEndLineNumber,
                        cc.originalEndColumn
                    ),
                    options: { className: 'moire-word-delete' },
                });
            }
        }
    }

    originalWordDecorations.set(original);
    modifiedWordDecorations.set(modified);
}

// Mark the change at changeIndex with a slim gutter bar so the reader can see, at
// a glance, which change prev/next landed on. The marker lives in the line margin
// only, never touching the red/green line backgrounds. Each side is decorated only
// when it actually has lines in the change (a pure insertion has no original lines,
// a pure deletion no modified ones), so the bar sits on the real edit.
function highlightActiveChange() {
    if (!activeOriginalDecorations || !activeModifiedDecorations) {
        return;
    }

    const change = changes[changeIndex];
    const original: monaco.editor.IModelDeltaDecoration[] = [];
    const modified: monaco.editor.IModelDeltaDecoration[] = [];
    const options: monaco.editor.IModelDecorationOptions = {
        marginClassName: 'moire-active-change-margin',
    };

    // A side with modifiedEndLineNumber (or originalEndLineNumber) of 0 is the empty
    // side of a pure insertion/deletion; the end sitting at or past the start is the
    // test for real lines there, and guards against an inverted range.
    if (
        change &&
        change.modifiedStartLineNumber >= 1 &&
        change.modifiedEndLineNumber >= change.modifiedStartLineNumber
    ) {
        modified.push({
            range: new monaco.Range(
                change.modifiedStartLineNumber,
                1,
                change.modifiedEndLineNumber,
                1
            ),
            options,
        });
    }

    if (
        change &&
        change.originalStartLineNumber >= 1 &&
        change.originalEndLineNumber >= change.originalStartLineNumber
    ) {
        original.push({
            range: new monaco.Range(
                change.originalStartLineNumber,
                1,
                change.originalEndLineNumber,
                1
            ),
            options,
        });
    }

    activeOriginalDecorations.set(original);
    activeModifiedDecorations.set(modified);
}

function revealChange() {
    if (!editor) {
        return;
    }

    const change = changes[changeIndex];
    if (!change) {
        return;
    }

    const line = change.modifiedStartLineNumber || change.originalStartLineNumber || 1;
    const modifiedEditor = editor.getModifiedEditor();
    modifiedEditor.revealLineInCenter(line);
    modifiedEditor.setPosition({ lineNumber: line, column: 1 });
    highlightActiveChange();
}

// Step to the next change within this file. Returns false at the last change (or
// when the file has none), which is the parent's signal to cross into the next
// file rather than wrapping back to the top. With no change selected yet (a
// freshly opened file), the first press selects the first change instead of moving
// past it, so a plainly opened file only gains a highlight once the reader asks.
function next(): boolean {
    if (changeIndex >= changes.length - 1) {
        return false;
    }

    changeIndex++;
    revealChange();
    return true;
}

// Mirror of next. From no selection, the first press also selects the first change
// (rather than crossing straight to the previous file), matching next; once a
// change is selected, prev walks back and reports the start boundary at the first.
function prev(): boolean {
    if (changeIndex === -1) {
        return next();
    }

    if (changeIndex <= 0) {
        return false;
    }

    changeIndex--;
    revealChange();
    return true;
}

// Jump to the first or last change of the current file. Used when navigation
// arrives from an adjacent file, so it lands on the near edge of the new file.
function goToEdge(edge: 'first' | 'last') {
    if (changes.length === 0) {
        return;
    }

    changeIndex = edge === 'first' ? 0 : changes.length - 1;
    revealChange();
}

onMounted(() => {
    if (!containerRef.value) {
        return;
    }

    editor = monaco.editor.createDiffEditor(containerRef.value, {
        readOnly: true,
        originalEditable: false,
        automaticLayout: true,
        renderSideBySide: props.viewMode === 'split',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'none',
        renderMarginRevertIcon: false,
        renderOverviewRuler: true,
        overviewRulerLanes: 2,
        fixedOverflowWidgets: true,
        guides: { indentation: false },
        fontFamily: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
        fontSize: 13,
        lineHeight: 21,
        scrollbar: {
            verticalScrollbarSize: 12,
            horizontalScrollbarSize: 12,
            useShadows: false,
        },
        hideUnchangedRegions: {
            enabled: true,
            revealLineCount: 20,
            minimumLineCount: 3,
            contextLineCount: 3,
        },
    });

    // Theme is a global Monaco setting rather than a per-editor option.
    monaco.editor.setTheme(monacoThemeFor(props.isDark, props.codeStyle));
    originalWordDecorations = editor.getOriginalEditor().createDecorationsCollection();
    modifiedWordDecorations = editor.getModifiedEditor().createDecorationsCollection();
    activeOriginalDecorations = editor.getOriginalEditor().createDecorationsCollection();
    activeModifiedDecorations = editor.getModifiedEditor().createDecorationsCollection();
    buildModels();

    diffListener = editor.onDidUpdateDiff(() => {
        changes = editor?.getLineChanges() ?? [];
        emit('update:changeCount', changes.length);
        applyWordHighlights();

        // The selected change is reset (to -1) in buildModels, once per real content
        // change, NOT here: Monaco fires this event several times per file (layout,
        // hidden-region folding), and resetting on each would wipe the selection the
        // reader (or a cross-file landing) just made.

        // A file crossed into with the arrows lands on (and highlights) its near
        // edge, so the selection carries across files. Wait for a fire that actually
        // carries the diff: Monaco's first pass after a model swap often reports no
        // line changes yet, and consuming the flag then would drop the request with
        // nothing to land on. Once landed, report back so the parent clears the flag.
        if (props.pendingEdge && changes.length > 0) {
            goToEdge(props.pendingEdge);
            emit('edgeConsumed');
            return;
        }

        // No landing to apply (a plain load, a manual pick, or a pending edge whose
        // diff has not arrived yet): reflect the current selection, which clears the
        // marker while nothing is selected. A file opened without the arrows starts
        // unselected, so its first arrow press is what selects the first change.
        highlightActiveChange();
    });
});

watch(
    () => [props.original, props.modified, props.language],
    () => buildModels()
);

watch(
    () => props.viewMode,
    (mode) => editor?.updateOptions({ renderSideBySide: mode === 'split' })
);

watch(
    () => [props.isDark, props.codeStyle] as const,
    ([dark, style]) => {
        monaco.editor.setTheme(monacoThemeFor(dark, style));
        // Word highlights are GitHub-only, so re-run when the style toggles.
        applyWordHighlights();
    }
);

onBeforeUnmount(() => {
    diffListener?.dispose();
    originalModel?.dispose();
    modifiedModel?.dispose();
    editor?.dispose();
    editor = null;
    // The collections belong to the now-disposed inner editors; drop the refs.
    originalWordDecorations = null;
    modifiedWordDecorations = null;
    activeOriginalDecorations = null;
    activeModifiedDecorations = null;
});

defineExpose({
    next,
    prev,
    goToEdge,
});
</script>

<template>
    <div ref="container" class="size-full" :class="`code-style-${codeStyle}`" />
</template>

<style scoped>
/* Monaco draws the text selection and the diff line backgrounds as siblings in the
   same overlay layer, so an opaque added/removed line background paints over the
   selection and hides it on changed lines. Isolate the overlay into its own
   stacking context, then lift the selection within it, above the line backgrounds
   but still below the text (which lives in a separate layer). */
:deep(.view-overlays) {
    isolation: isolate;
}

:deep(.view-overlays .selected-text) {
    z-index: 1;
}

/* GitHub renders the counterpart side of an added/removed block as a flat fill,
   not Monaco's diagonal hatch (the GitHub theme turns the hatch off via
   diffEditor.diagonalFill). Monaco's internal .diagonal-fill has no Tailwind hook,
   so color it directly with the theme token. Scoped to the GitHub code style; the
   VS Code style keeps Monaco's default hatch. */
.code-style-github :deep(.diagonal-fill) {
    background-color: var(--moire-diff-filler);
}

/* Word-level highlights for the changed words on a modified line, applied as
   decorations (see applyWordHighlights). GitHub-only; the classes exist only when
   that style adds the decorations. */
.code-style-github :deep(.moire-word-insert) {
    background-color: var(--moire-word-insert);
}

.code-style-github :deep(.moire-word-delete) {
    background-color: var(--moire-word-delete);
}

/* The change prev/next landed on (see highlightActiveChange). Rendered in the line
   margin (the full gutter, left of the code), so it marks the change without tinting
   the red/green diff line backgrounds: a solid accent bar down the gutter's left
   edge, plus a soft tint behind the change's line numbers. Applies in both code
   styles. */
:deep(.moire-active-change-margin) {
    background-color: var(--moire-active-change-bg);
    box-shadow: inset 2px 0 0 var(--moire-active-change);
}
</style>
