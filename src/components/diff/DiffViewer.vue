<script setup lang="ts">
import * as monaco from 'monaco-editor';
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { monacoThemeFor } from '@/lib/monaco-theme';
import type { ViewMode } from '@/shared/types';

const props = defineProps<{
    original: string | null;
    modified: string | null;
    language: string;
    viewMode: ViewMode;
    isDark: boolean;
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
    monaco.editor.setTheme(monacoThemeFor(props.isDark));
    buildModels();

    diffListener = editor.onDidUpdateDiff(() => {
        changes = editor?.getLineChanges() ?? [];
        changeIndex = -1;
        emit('update:changeCount', changes.length);
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
    () => props.isDark,
    (dark) => monaco.editor.setTheme(monacoThemeFor(dark))
);

onBeforeUnmount(() => {
    diffListener?.dispose();
    originalModel?.dispose();
    modifiedModel?.dispose();
    editor?.dispose();
    editor = null;
});

defineExpose({
    next: () => goTo('next'),
    prev: () => goTo('prev'),
});
</script>

<template>
    <div ref="container" class="size-full" />
</template>
