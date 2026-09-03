// Runtime stub for `monaco-editor`, aliased in vitest.config.ts. Monaco pulls
// in browser workers and heavy assets that jsdom can't run, so components under
// test talk to these fakes instead.
import { vi } from 'vitest';

function makeInnerEditor() {
    return {
        revealLineInCenter: vi.fn<(line: number) => void>(),
        revealLine: vi.fn<(line: number) => void>(),
        setPosition: vi.fn<(position: { lineNumber: number; column: number }) => void>(),
        createDecorationsCollection: vi.fn<() => { set: (d: unknown) => void; clear: () => void }>(
            () => ({ set: vi.fn<(decorations: unknown) => void>(), clear: vi.fn<() => void>() })
        ),
    };
}

function makeDiffEditor() {
    const modifiedEditor = makeInnerEditor();
    const originalEditor = makeInnerEditor();
    return {
        setModel: vi.fn<(model: unknown) => void>(),
        updateOptions: vi.fn<(options: unknown) => void>(),
        onDidUpdateDiff: vi.fn<() => { dispose: () => void }>(() => ({
            dispose: vi.fn<() => void>(),
        })),
        getLineChanges: vi.fn<() => unknown[]>(() => []),
        getModifiedEditor: vi.fn<() => ReturnType<typeof makeInnerEditor>>(() => modifiedEditor),
        getOriginalEditor: vi.fn<() => ReturnType<typeof makeInnerEditor>>(() => originalEditor),
        layout: vi.fn<() => void>(),
        dispose: vi.fn<() => void>(),
    };
}

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
