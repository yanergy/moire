<script setup lang="ts">
import * as monaco from '@/lib/monaco';
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { X } from '@lucide/vue';
import { monacoThemeFor } from '@/lib/monaco-themes';
import { renderMarkdown } from '@/lib/markdown';
import { timeSince } from '@/lib/status-bar';
import type { CheckAnnotation, CodeStyle, PrReviewThread, ViewMode } from '@/shared/types';

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
    // The open file's inline review threads (line-anchored PR comments). Each is
    // marked in the gutter on its line; clicking the marker opens it in a popover.
    reviewThreads?: PrReviewThread[];
    // The open file's CI check annotations (a linter or other check flagging a line),
    // marked with a warning glyph on their line (head side), and shown in the same
    // popover as review comments.
    checkAnnotations?: CheckAnnotation[];
}>();

const emit = defineEmits<{
    'update:changeCount': [count: number];
    edgeConsumed: [];
}>();

const containerRef = useTemplateRef<HTMLDivElement>('container');
const popoverRef = useTemplateRef<HTMLDivElement>('popover');

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

// Inline review-thread markers: a gutter glyph per line that carries thread(s), one
// collection per side, plus a line -> threads lookup so a glyph click can find them.
let originalCommentDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
let modifiedCommentDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
const modifiedThreadsByLine = new Map<number, PrReviewThread[]>();
const originalThreadsByLine = new Map<number, PrReviewThread[]>();

// Check annotations anchor to the head file, so they mark only the modified side.
let modifiedAnnotationDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
const modifiedAnnotationsByLine = new Map<number, CheckAnnotation[]>();

// Listeners for line clicks (open the popover) and scrolling (close it).
let commentListeners: monaco.IDisposable[] = [];

// What the open popover shows for a clicked line (the line's annotations and review
// threads), and where it sits (relative to the editor container). All empty/null
// means no popover.
const activeThreads = ref<PrReviewThread[]>([]);
const activeAnnotations = ref<CheckAnnotation[]>([]);
const popoverPos = ref<{ top: number; left: number } | null>(null);

function relative(iso: string): string {
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? '' : timeSince(ms, Date.now());
}

// Render a review comment's Markdown body; sanitized by renderMarkdown, so it is safe
// to insert with v-html (same policy as the PR view).
function renderThreadComment(body: string): string {
    return renderMarkdown(body);
}

// The gutter glyph's class for a line's threads: tinted resolved when none are still
// open, dimmed when every thread on the line is outdated.
function glyphClassFor(threads: PrReviewThread[]): string {
    let cls = 'moire-comment-glyph';
    if (threads.every((t) => t.isResolved)) {
        cls += ' moire-comment-glyph-resolved';
    }
    if (threads.every((t) => t.isOutdated)) {
        cls += ' moire-comment-glyph-outdated';
    }

    return cls;
}

// The whole-line highlight class for a commented line: an accent left bar plus a
// faint tint so the line, not just the tiny gutter icon, reads as carrying a comment.
function lineClassFor(threads: PrReviewThread[]): string {
    return threads.every((t) => t.isResolved)
        ? 'moire-comment-line moire-comment-line-resolved'
        : 'moire-comment-line';
}

// Rebuild the gutter markers from the current threads. A RIGHT-side thread anchors to
// the head file (the modified editor) at `line`; a LEFT-side one to the base file (the
// original editor) at `originalLine`. Threads whose line is missing or falls outside
// the current model are skipped, so a marker never lands on the wrong line when the
// local branch has drifted from what the PR was reviewed against.
function applyCommentMarkers() {
    if (!editor || !originalCommentDecorations || !modifiedCommentDecorations) {
        return;
    }

    modifiedThreadsByLine.clear();
    originalThreadsByLine.clear();

    const modifiedLines = editor.getModifiedEditor().getModel()?.getLineCount() ?? 0;
    const originalLines = editor.getOriginalEditor().getModel()?.getLineCount() ?? 0;

    for (const thread of props.reviewThreads ?? []) {
        const onRight = thread.side === 'RIGHT';
        const line = onRight ? thread.line : (thread.originalLine ?? thread.line);
        const max = onRight ? modifiedLines : originalLines;
        if (!line || line < 1 || line > max) {
            continue;
        }

        const map = onRight ? modifiedThreadsByLine : originalThreadsByLine;
        const existing = map.get(line);
        if (existing) {
            existing.push(thread);
        } else {
            map.set(line, [thread]);
        }
    }

    modifiedCommentDecorations.set(decorationsFor(modifiedThreadsByLine));
    originalCommentDecorations.set(decorationsFor(originalThreadsByLine));
}

// Resolve a design token to its computed color, so the overview-ruler mark (drawn on
// canvas, where a CSS var cannot reach) still follows the theme. Empty if unavailable.
function tokenColor(name: string): string {
    return containerRef.value
        ? getComputedStyle(containerRef.value).getPropertyValue(name).trim()
        : '';
}

function decorationsFor(
    byLine: Map<number, PrReviewThread[]>
): monaco.editor.IModelDeltaDecoration[] {
    const accent = tokenColor('--moire-accent');
    const resolvedColor = tokenColor('--moire-status-a');
    const out: monaco.editor.IModelDeltaDecoration[] = [];
    for (const [line, threads] of byLine) {
        const rulerColor = threads.every((t) => t.isResolved) ? resolvedColor : accent;
        out.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
                glyphMarginClassName: glyphClassFor(threads),
                glyphMarginHoverMessage: { value: 'Show review comment' },
                // Highlight the whole line, not just the gutter, so a comment is
                // obvious at a glance.
                isWholeLine: true,
                className: lineClassFor(threads),
                // A mark in the scrollbar's overview ruler, so commented lines are
                // findable across the whole file without scrolling to hunt for them.
                overviewRuler: rulerColor
                    ? { color: rulerColor, position: monaco.editor.OverviewRulerLane.Right }
                    : undefined,
            },
        });
    }

    return out;
}

// Rebuild the check-annotation markers (head side only). An annotation on a line that
// falls outside the current model is skipped, the same guard the comment markers use.
function applyAnnotationMarkers() {
    if (!editor || !modifiedAnnotationDecorations) {
        return;
    }

    modifiedAnnotationsByLine.clear();
    const modifiedLines = editor.getModifiedEditor().getModel()?.getLineCount() ?? 0;
    for (const annotation of props.checkAnnotations ?? []) {
        const line = annotation.line;
        if (!line || line < 1 || line > modifiedLines) {
            continue;
        }

        const existing = modifiedAnnotationsByLine.get(line);
        if (existing) {
            existing.push(annotation);
        } else {
            modifiedAnnotationsByLine.set(line, [annotation]);
        }
    }

    modifiedAnnotationDecorations.set(annotationDecorations(modifiedAnnotationsByLine));
}

// An annotation line reads as an error (red) when any annotation on it is level
// "failure", else as a warning (amber) for a warning or a notice.
const lineHasError = (annotations: CheckAnnotation[]) =>
    annotations.some((a) => a.level === 'failure');

function annotationDecorations(
    byLine: Map<number, CheckAnnotation[]>
): monaco.editor.IModelDeltaDecoration[] {
    const warn = tokenColor('--moire-annotation-warn');
    const danger = tokenColor('--moire-annotation-error');
    const out: monaco.editor.IModelDeltaDecoration[] = [];
    for (const [line, annotations] of byLine) {
        const error = lineHasError(annotations);
        const rulerColor = error ? danger : warn;
        out.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
                glyphMarginClassName: error
                    ? 'moire-alert-glyph moire-alert-glyph-error'
                    : 'moire-alert-glyph',
                glyphMarginHoverMessage: { value: 'Show check annotation' },
                isWholeLine: true,
                className: error ? 'moire-alert-line moire-alert-line-error' : 'moire-alert-line',
                overviewRuler: rulerColor
                    ? { color: rulerColor, position: monaco.editor.OverviewRulerLane.Right }
                    : undefined,
            },
        });
    }

    return out;
}

// Open a GitHub URL (a check run) in the browser via the preload bridge.
function openAnnotationUrl(url: string) {
    if (url) {
        void window.api?.openExternal(url);
    }
}

// Open the popover for a clicked line, showing its annotations and review threads,
// positioned at the click.
function openPopover(
    threads: PrReviewThread[],
    annotations: CheckAnnotation[],
    clientX: number,
    clientY: number
) {
    const rect = containerRef.value?.getBoundingClientRect();
    if (!rect) {
        return;
    }

    const width = 360;
    const left = Math.max(8, Math.min(clientX - rect.left + 8, rect.width - width - 8));
    activeThreads.value = threads;
    activeAnnotations.value = annotations;
    popoverPos.value = { top: Math.max(8, clientY - rect.top + 8), left: Math.max(8, left) };
}

function closeThreadPopover() {
    if (activeThreads.value.length > 0 || activeAnnotations.value.length > 0) {
        activeThreads.value = [];
        activeAnnotations.value = [];
        popoverPos.value = null;
    }
}

// The popover header, naming whichever of annotations and comments it holds.
const popoverTitle = computed(() => {
    const annotations = activeAnnotations.value.length;
    const threads = activeThreads.value.length;
    if (annotations && threads) {
        return 'Annotations & comments';
    }
    if (annotations) {
        return annotations > 1 ? 'Check annotations' : 'Check annotation';
    }

    return threads > 1 ? 'Review comments' : 'Review comment';
});

// GitHub's annotation level (notice/warning/failure) as a capitalized label.
function levelLabel(level: string): string {
    return level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Annotation';
}

// A mouse-down anywhere on a commented line (its glyph, gutter, or the highlighted
// code itself) opens that line's popover, so a comment is a click away. A click on
// any other line in the editor closes an open popover, so clicking off it dismisses
// it. Clicks outside the editor are handled by onDocMouseDown.
function onEditorMouseDown(e: monaco.editor.IEditorMouseEvent, side: 'LEFT' | 'RIGHT') {
    const line = e.target.position?.lineNumber;
    const threads = line
        ? (side === 'RIGHT' ? modifiedThreadsByLine : originalThreadsByLine).get(line)
        : undefined;
    // Annotations anchor to the head file, so they exist only on the modified (RIGHT)
    // side.
    const annotations = line && side === 'RIGHT' ? modifiedAnnotationsByLine.get(line) : undefined;
    if ((threads && threads.length > 0) || (annotations && annotations.length > 0)) {
        const browser = e.event.browserEvent;
        openPopover(threads ?? [], annotations ?? [], browser.clientX, browser.clientY);
    } else {
        closeThreadPopover();
    }
}

// Close the popover when a click lands outside both it and the editor. In-editor
// clicks are left to onEditorMouseDown (which opens on a commented line, closes
// elsewhere), so this only handles clicks in the rest of the app.
function onDocMouseDown(e: MouseEvent) {
    if (activeThreads.value.length === 0 && activeAnnotations.value.length === 0) {
        return;
    }

    const target = e.target as Node | null;
    if (
        containerRef.value?.contains(target ?? null) ||
        popoverRef.value?.contains(target ?? null)
    ) {
        return;
    }

    closeThreadPopover();
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        closeThreadPopover();
    }
}

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
        // Reserve the gutter for inline review-comment markers.
        glyphMargin: true,
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
    // Created after the four above so their collection indices are unchanged.
    originalCommentDecorations = editor.getOriginalEditor().createDecorationsCollection();
    modifiedCommentDecorations = editor.getModifiedEditor().createDecorationsCollection();
    // Annotations mark the head side only.
    modifiedAnnotationDecorations = editor.getModifiedEditor().createDecorationsCollection();

    // Clicking a commented line opens its popover; scrolling either side closes it,
    // since it is pinned to a pixel position that scrolling would strand.
    const modifiedEditor = editor.getModifiedEditor();
    const originalEditor = editor.getOriginalEditor();
    commentListeners = [
        modifiedEditor.onMouseDown((e) => onEditorMouseDown(e, 'RIGHT')),
        originalEditor.onMouseDown((e) => onEditorMouseDown(e, 'LEFT')),
        modifiedEditor.onDidScrollChange(() => closeThreadPopover()),
        originalEditor.onDidScrollChange(() => closeThreadPopover()),
    ];
    window.addEventListener('keydown', onKeydown);
    // Dismiss the popover on a click anywhere outside it and the editor.
    document.addEventListener('mousedown', onDocMouseDown);
    buildModels();

    diffListener = editor.onDidUpdateDiff(() => {
        changes = editor?.getLineChanges() ?? [];
        emit('update:changeCount', changes.length);
        applyWordHighlights();
        // Re-place the review-comment and check-annotation markers against the
        // (re)computed model.
        applyCommentMarkers();
        applyAnnotationMarkers();

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
    () => {
        // A new file: drop any open popover; markers are re-placed by onDidUpdateDiff.
        closeThreadPopover();
        buildModels();
    }
);

// The open file's threads changed (a PR refresh, or a fetch completing after the file
// was opened): re-mark and drop any popover pinned to the old set.
watch(
    () => props.reviewThreads,
    () => {
        closeThreadPopover();
        applyCommentMarkers();
    }
);

// The same, for check annotations arriving or refreshing.
watch(
    () => props.checkAnnotations,
    () => {
        closeThreadPopover();
        applyAnnotationMarkers();
    }
);

watch(
    () => props.viewMode,
    (mode) => {
        // The unified/split switch re-lays out both sides, so a pinned popover would
        // strand; close it and let the markers ride the relayout.
        closeThreadPopover();
        editor?.updateOptions({ renderSideBySide: mode === 'split' });
    }
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
    for (const listener of commentListeners) {
        listener.dispose();
    }

    commentListeners = [];
    window.removeEventListener('keydown', onKeydown);
    document.removeEventListener('mousedown', onDocMouseDown);
    originalModel?.dispose();
    modifiedModel?.dispose();
    editor?.dispose();
    editor = null;
    // The collections belong to the now-disposed inner editors; drop the refs.
    originalWordDecorations = null;
    modifiedWordDecorations = null;
    activeOriginalDecorations = null;
    activeModifiedDecorations = null;
    originalCommentDecorations = null;
    modifiedCommentDecorations = null;
    modifiedAnnotationDecorations = null;
});

defineExpose({
    next,
    prev,
    goToEdge,
});
</script>

<template>
    <div class="relative size-full">
        <div ref="container" class="size-full" :class="`code-style-${codeStyle}`" />

        <!-- Line popover: the clicked line's check annotations and review threads.
             Opened by clicking the line, pinned to the click; closes on a click
             outside, its X, Escape, scrolling, or a file/layout change. -->
        <div
            v-if="(activeThreads.length || activeAnnotations.length) && popoverPos"
            ref="popover"
            class="absolute z-20 flex max-h-[60%] w-[360px] max-w-[calc(100%-16px)] flex-col overflow-hidden rounded-lg border border-moire-border bg-moire-pop text-moire-fg"
            :style="{
                top: `${popoverPos.top}px`,
                left: `${popoverPos.left}px`,
                boxShadow: 'var(--moire-pop-shadow)',
            }"
            role="dialog"
            aria-label="Review comments and check annotations"
        >
            <div
                class="flex items-center justify-between border-b border-moire-border px-3 py-2 text-[12px] font-medium text-moire-muted"
            >
                <span>{{ popoverTitle }}</span>
                <button
                    type="button"
                    class="inline-flex size-5 cursor-pointer items-center justify-center rounded text-moire-faint transition-colors hover:bg-moire-hover hover:text-moire-fg"
                    aria-label="Close"
                    @click="closeThreadPopover"
                >
                    <X :size="14" />
                </button>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto">
                <!-- Check annotations first (they are warnings), then comments. -->
                <div
                    v-for="(annotation, ai) in activeAnnotations"
                    :key="`annotation-${ai}`"
                    class="flex flex-col gap-1 border-b border-moire-border px-3 py-2.5"
                >
                    <div class="flex flex-wrap items-center gap-1.5 text-[12px]">
                        <span
                            class="font-medium"
                            :class="
                                annotation.level === 'failure'
                                    ? 'text-moire-status-d'
                                    : 'text-moire-warn'
                            "
                        >
                            {{ levelLabel(annotation.level) }}
                        </span>
                        <span v-if="annotation.title" class="text-moire-faint">
                            {{ annotation.title }}
                        </span>
                    </div>
                    <div class="text-[13px] leading-[1.55] text-moire-file-fg">
                        {{ annotation.message }}
                    </div>
                    <button
                        v-if="annotation.url"
                        type="button"
                        class="cursor-pointer self-start text-[12px] text-moire-accent hover:underline"
                        @click="openAnnotationUrl(annotation.url)"
                    >
                        View on GitHub
                    </button>
                </div>

                <div
                    v-for="(thread, ti) in activeThreads"
                    :key="`thread-${ti}`"
                    class="flex flex-col gap-2.5 border-b border-moire-border px-3 py-2.5 last:border-b-0"
                >
                    <div
                        v-if="thread.isResolved || thread.isOutdated"
                        class="flex gap-1.5 text-[10px] font-medium tracking-wide uppercase"
                    >
                        <span v-if="thread.isResolved" class="text-moire-status-a">Resolved</span>
                        <span v-if="thread.isOutdated" class="text-moire-faint">Outdated</span>
                    </div>
                    <div v-for="(c, ci) in thread.comments" :key="ci" class="flex flex-col gap-0.5">
                        <div
                            class="flex flex-wrap items-center gap-1.5 text-[12px] text-moire-faint"
                        >
                            <span class="font-medium text-moire-fg">{{ c.author }}</span>
                            <span>{{ relative(c.createdAt) }}</span>
                        </div>
                        <!-- v-html is safe: renderThreadComment sanitizes via DOMPurify. -->
                        <div
                            class="pr-markdown text-[13px] leading-[1.55] text-moire-file-fg"
                            v-html="renderThreadComment(c.body)"
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
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

/* Inline review-thread marker in the glyph margin: a speech bubble drawn with a mask
   so a theme token drives its color. Enlarged to fill the gutter cell so it reads at
   a glance. Accent by default (an open thread), green once resolved, dimmed when
   outdated. Clickable (opens the popover). */
:deep(.moire-comment-glyph) {
    cursor: pointer;
    background-color: var(--moire-accent);
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/%3E%3C/svg%3E");
    -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/%3E%3C/svg%3E");
    mask-repeat: no-repeat;
    -webkit-mask-repeat: no-repeat;
    mask-position: center;
    -webkit-mask-position: center;
    mask-size: 17px 17px;
    -webkit-mask-size: 17px 17px;
}

:deep(.moire-comment-glyph-resolved) {
    background-color: var(--moire-status-a);
}

:deep(.moire-comment-glyph-outdated) {
    opacity: 0.55;
}

/* Whole-line highlight for a commented line: a solid accent bar down its left edge
   plus a faint wash, so the line itself signals a comment. Green variant once every
   thread on the line is resolved. It is a decoration in the view-overlays layer, the
   same layer that paints the added/removed diff line backgrounds, and those would
   otherwise cover it. The overlay layer is isolated into its own stacking context
   (see .view-overlays above), so a z-index lifts this highlight above the green/red
   diff backgrounds (z 0) and the selection (z 1) while still sitting under the text,
   which lives in a separate layer on top. Any future per-line color effect must do
   the same, so it reads over the change indicator rather than under it. */
:deep(.view-overlays .moire-comment-line) {
    z-index: 2;
    background-color: color-mix(in srgb, var(--moire-accent) 28%, transparent);
    box-shadow: inset 4px 0 0 var(--moire-accent);
}

:deep(.view-overlays .moire-comment-line-resolved) {
    background-color: color-mix(in srgb, var(--moire-status-a) 28%, transparent);
    box-shadow: inset 4px 0 0 var(--moire-status-a);
}

/* Check-annotation marker in the glyph margin: a warning triangle drawn with a mask so
   a theme token drives its color. Amber (a warning or notice) by default, red when any
   annotation on the line is level "failure". Clickable (opens the popover). */
:deep(.moire-alert-glyph) {
    cursor: pointer;
    background-color: var(--moire-annotation-warn);
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/%3E%3Cline x1='12' y1='9' x2='12' y2='13' stroke='black' stroke-width='2'/%3E%3Cline x1='12' y1='17' x2='12.01' y2='17' stroke='black' stroke-width='2'/%3E%3C/svg%3E");
    -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/%3E%3Cline x1='12' y1='9' x2='12' y2='13' stroke='black' stroke-width='2'/%3E%3Cline x1='12' y1='17' x2='12.01' y2='17' stroke='black' stroke-width='2'/%3E%3C/svg%3E");
    mask-repeat: no-repeat;
    -webkit-mask-repeat: no-repeat;
    mask-position: center;
    -webkit-mask-position: center;
    mask-size: 17px 17px;
    -webkit-mask-size: 17px 17px;
}

:deep(.moire-alert-glyph-error) {
    background-color: var(--moire-annotation-error);
}

/* Whole-line highlight for an annotated line: a bar down its left edge plus a wash. The
   error red is the diff's own deletion red (see --moire-annotation-error), applied more
   opaquely so a failing line reads as a solid, bold version of it; the warning amber
   matches. Same overlay-layer z-index rule as the comment line, so it reads over the
   red/green change indicator rather than under it. */
:deep(.view-overlays .moire-alert-line) {
    z-index: 2;
    background-color: color-mix(in srgb, var(--moire-annotation-warn) 88%, transparent);
    box-shadow: inset 5px 0 0 var(--moire-annotation-warn);
}

:deep(.view-overlays .moire-alert-line-error) {
    background-color: color-mix(in srgb, var(--moire-annotation-error) 88%, transparent);
    box-shadow: inset 5px 0 0 var(--moire-annotation-error);
}
</style>
