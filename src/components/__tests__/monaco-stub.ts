// Runtime stub for `monaco-editor`, aliased in vitest.config.ts. Monaco pulls
// in browser workers and heavy assets that jsdom can't run, so components under
// test talk to these fakes instead.
import { vi } from 'vitest';
import type { Mock } from 'vitest';

// The signature is spelled out (rather than inferred) so the returned set/clear
// stay Mock-typed and a test can inspect the decorations passed to set.
type DecorationsCollection = { set: Mock<(decorations: unknown) => void>; clear: Mock<() => void> };

function makeInnerEditor() {
    // Review-comment glyph clicks and scroll-to-close go through onMouseDown /
    // onDidScrollChange; tests drive them via fireMouseDown / fireScroll below.
    let mouseDownCb: ((e: unknown) => void) | null = null;
    let scrollCb: (() => void) | null = null;
    return {
        revealLineInCenter: vi.fn<(line: number) => void>(),
        revealLine: vi.fn<(line: number) => void>(),
        setPosition: vi.fn<(position: { lineNumber: number; column: number }) => void>(),
        createDecorationsCollection: vi.fn<() => DecorationsCollection>(() => ({
            set: vi.fn<(decorations: unknown) => void>(),
            clear: vi.fn<() => void>(),
        })),
        // The diff viewer validates thread lines against the model's line count; a
        // large stand-in keeps every fixture line in range.
        getModel: vi.fn<() => { getLineCount: () => number }>(() => ({
            getLineCount: () => Number.MAX_SAFE_INTEGER,
        })),
        onMouseDown: vi.fn<(cb: (e: unknown) => void) => { dispose: () => void }>((cb) => {
            mouseDownCb = cb;
            return { dispose: vi.fn<() => void>() };
        }),
        onDidScrollChange: vi.fn<(cb: () => void) => { dispose: () => void }>((cb) => {
            scrollCb = cb;
            return { dispose: vi.fn<() => void>() };
        }),
        // Test drivers (not part of Monaco).
        fireMouseDown: (e: unknown) => mouseDownCb?.(e),
        fireScroll: () => scrollCb?.(),
    };
}

// Shape of a line change the diff viewer reads; only the fields it touches. The
// end fields drive the active-change highlight (0 marks the empty side of a pure
// insertion or deletion, matching Monaco's ILineChange).
export interface StubLineChange {
    originalStartLineNumber: number;
    originalEndLineNumber: number;
    modifiedStartLineNumber: number;
    modifiedEndLineNumber: number;
}

function makeDiffEditor() {
    const modifiedEditor = makeInnerEditor();
    const originalEditor = makeInnerEditor();
    // The real editor recomputes the diff and fires onDidUpdateDiff after setModel;
    // the stub can't, so tests drive it with __setLineChanges + __fireDiff.
    let lineChanges: StubLineChange[] = [];
    let diffCallback: (() => void) | null = null;
    return {
        setModel: vi.fn<(model: unknown) => void>(),
        updateOptions: vi.fn<(options: unknown) => void>(),
        onDidUpdateDiff: vi.fn<(cb: () => void) => { dispose: () => void }>((cb) => {
            diffCallback = cb;
            return { dispose: vi.fn<() => void>() };
        }),
        getLineChanges: vi.fn<() => StubLineChange[]>(() => lineChanges),
        getModifiedEditor: vi.fn<() => ReturnType<typeof makeInnerEditor>>(() => modifiedEditor),
        getOriginalEditor: vi.fn<() => ReturnType<typeof makeInnerEditor>>(() => originalEditor),
        layout: vi.fn<() => void>(),
        dispose: vi.fn<() => void>(),
        // Test drivers (not part of Monaco): stage the changes getLineChanges
        // returns, then fire the diff-updated event the viewer listens on.
        setLineChanges: (changes: StubLineChange[]) => {
            lineChanges = changes;
        },
        fireDiffUpdate: () => diffCallback?.(),
    };
}

export type StubDiffEditor = ReturnType<typeof makeDiffEditor>;

export const editor = {
    createDiffEditor: vi.fn<
        (container: unknown, options?: unknown) => ReturnType<typeof makeDiffEditor>
    >(() => makeDiffEditor()),
    createModel: vi.fn<(value: string, language?: string) => { dispose: () => void }>(() => ({
        dispose: vi.fn<() => void>(),
    })),
    defineTheme: vi.fn<(name: string, theme: unknown) => void>(),
    setTheme: vi.fn<(name: string) => void>(),
    create: vi.fn<(container: unknown, options?: unknown) => void>(),
    // Only the member the diff viewer compares a glyph click against.
    MouseTargetType: { GUTTER_GLYPH_MARGIN: 2 },
    // Lanes the comment-marker overview-ruler decoration references.
    OverviewRulerLane: { Left: 1, Center: 2, Right: 4, Full: 7 },
};

export const languages = {
    register: vi.fn<(language: unknown) => void>(),
};

export const Uri = {
    parse: vi.fn<(value: string) => unknown>(),
};

// Minimal Range stand-in; DiffViewer builds these for word-level decorations.
export class Range {
    constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number
    ) {}
}
