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
}>();

const emit = defineEmits<{
    'update:changeCount': [count: number];
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

function buildModels() {
    if (!editor) {
        return;
    }

    originalModel?.dispose();
    modifiedModel?.dispose();
    originalModel = monaco.editor.createModel(props.original ?? '', props.language);
    modifiedModel = monaco.editor.createModel(props.modified ?? '', props.language);
    editor.setModel({ original: originalModel, modified: modifiedModel });
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

function goTo(direction: 'next' | 'prev') {
    if (!editor || changes.length === 0) {
        return;
    }

    changeIndex =
        direction === 'next'
            ? (changeIndex + 1) % changes.length
            : (changeIndex - 1 + changes.length) % changes.length;

    const change = changes[changeIndex];
    if (!change) {
        return;
    }

    const line = change.modifiedStartLineNumber || change.originalStartLineNumber || 1;
    const modifiedEditor = editor.getModifiedEditor();
    modifiedEditor.revealLineInCenter(line);
    modifiedEditor.setPosition({ lineNumber: line, column: 1 });
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
    buildModels();

    diffListener = editor.onDidUpdateDiff(() => {
        changes = editor?.getLineChanges() ?? [];
        changeIndex = -1;
        emit('update:changeCount', changes.length);
        applyWordHighlights();
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
});

defineExpose({
    next: () => goTo('next'),
    prev: () => goTo('prev'),
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
</style>
