// Runtime stub for `monaco-editor`, aliased in vitest.config.ts. Monaco pulls
// in browser workers and heavy assets that jsdom can't run, so components under
// test talk to these fakes instead.
import { vi } from 'vitest';
import type { Mock } from 'vitest';

// The signature is spelled out (rather than inferred) so the returned set/clear
// stay Mock-typed and a test can inspect the decorations passed to set.
type DecorationsCollection = { set: Mock<(decorations: unknown) => void>; clear: Mock<() => void> };

function makeInnerEditor() {
    return {
        revealLineInCenter: vi.fn<(line: number) => void>(),
        revealLine: vi.fn<(line: number) => void>(),
        setPosition: vi.fn<(position: { lineNumber: number; column: number }) => void>(),
        createDecorationsCollection: vi.fn<() => DecorationsCollection>(() => ({
            set: vi.fn<(decorations: unknown) => void>(),
            clear: vi.fn<() => void>(),
        })),
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
