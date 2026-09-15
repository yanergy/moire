import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import { editor } from './monaco-stub';
import type { StubDiffEditor } from './monaco-stub';
import type { CheckAnnotation, CodeStyle, PrReviewThread, ViewMode } from '@/shared/types';

const baseProps = {
    original: 'const a = 1;',
    modified: 'const a = 2;',
    language: 'typescript',
    viewMode: 'split' as ViewMode,
    isDark: true,
    codeStyle: 'github' as CodeStyle,
};

// The most recently created diff editor, which the just-mounted viewer drives.
function lastEditor(): StubDiffEditor {
    const results = editor.createDiffEditor.mock.results;
    return results[results.length - 1]!.value;
}

const TWO_CHANGES = [
    {
        originalStartLineNumber: 5,
        originalEndLineNumber: 5,
        modifiedStartLineNumber: 5,
        modifiedEndLineNumber: 5,
    },
    {
        originalStartLineNumber: 18,
        originalEndLineNumber: 18,
        modifiedStartLineNumber: 20,
        modifiedEndLineNumber: 21,
    },
];

const ONE_CHANGE = [
    {
        originalStartLineNumber: 5,
        originalEndLineNumber: 5,
        modifiedStartLineNumber: 5,
        modifiedEndLineNumber: 5,
    },
];

interface StubDecoration {
    range: { startLineNumber: number; endLineNumber: number };
    options: { marginClassName?: string };
}

// The active-change highlight lives in the second decoration collection created on
// each inner editor (the first holds the word-level highlights). Returns the
// decorations passed to its most recent set() call.
function lastActiveModified(diff: StubDiffEditor): StubDecoration[] {
    const set = diff.getModifiedEditor().createDecorationsCollection.mock.results[1]!.value.set;
    const calls = set.mock.calls;
    return calls[calls.length - 1]![0] as StubDecoration[];
}

// A RIGHT-side review thread on line 12 of the open file.
const thread = (over: Partial<PrReviewThread> = {}): PrReviewThread => ({
    path: 'src/a.ts',
    line: 12,
    originalLine: null,
    side: 'RIGHT',
    isResolved: false,
    isOutdated: false,
    comments: [{ author: 'bob', body: 'this can race', createdAt: '' }],
    ...over,
});

// The comment-marker collection is the third created on each inner editor (after the
// word-level and active-change ones). Returns its most recent set() payload.
function commentDecorations(diff: StubDiffEditor, side: 'modified' | 'original') {
    const inner = side === 'modified' ? diff.getModifiedEditor() : diff.getOriginalEditor();
    const set = inner.createDecorationsCollection.mock.results[2]!.value.set;
    const calls = set.mock.calls;
    return (calls[calls.length - 1]?.[0] ?? []) as {
        range: { startLineNumber: number };
        options: { glyphMarginClassName?: string; className?: string; isWholeLine?: boolean };
    }[];
}

// A check annotation on line 8 of the head file.
const annotation = (over: Partial<CheckAnnotation> = {}): CheckAnnotation => ({
    path: 'src/a.ts',
    line: 8,
    level: 'warning',
    title: 'quality-gates',
    message: 'The property should be above methods.',
    url: 'https://github.com/o/r/runs/101',
    ...over,
});

// The annotation-marker collection is the fourth created on the modified editor (after
// the word, active-change, and comment ones); annotations mark only the head side.
// Returns its most recent set() payload.
function annotationDecorations(diff: StubDiffEditor) {
    const set = diff.getModifiedEditor().createDecorationsCollection.mock.results[3]!.value.set;
    const calls = set.mock.calls;
    return (calls[calls.length - 1]?.[0] ?? []) as {
        range: { startLineNumber: number };
        options: { glyphMarginClassName?: string; className?: string; isWholeLine?: boolean };
    }[];
}

// A mouse-down on a line, as Monaco reports it. `type` 2 is the glyph margin, 6 the
// code content; the viewer opens the popover for either as long as the line matches.
const lineMouseDown = (lineNumber: number, type = 2) => ({
    target: { type, position: { lineNumber } },
    event: { browserEvent: { clientX: 20, clientY: 100 } },
});
const glyphClick = (lineNumber: number) => lineMouseDown(lineNumber, 2);
const contentClick = (lineNumber: number) => lineMouseDown(lineNumber, 6);

describe('DiffViewer', () => {
    it('mounts and creates a diff editor in its container', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps } });

        expect(wrapper.find('.size-full').exists()).toBe(true);
        expect(editor.createDiffEditor).toHaveBeenCalled();
    });

    it('selects the first change on the first press, then steps to the boundaries', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps } });
        const diff = lastEditor();
        diff.setLineChanges(TWO_CHANGES);
        diff.fireDiffUpdate();
        const modified = diff.getModifiedEditor();

        // A plainly loaded file starts unselected, so the first press selects the
        // first change rather than moving past it.
        expect(wrapper.vm.next()).toBe(true);
        expect(modified.revealLineInCenter).toHaveBeenLastCalledWith(5);
        // Then the second change.
        expect(wrapper.vm.next()).toBe(true);
        expect(modified.revealLineInCenter).toHaveBeenLastCalledWith(20);
        // At the last change, next reports the boundary without moving.
        expect(wrapper.vm.next()).toBe(false);

        // prev walks back to the first change, then reports the start boundary.
        expect(wrapper.vm.prev()).toBe(true);
        expect(modified.revealLineInCenter).toHaveBeenLastCalledWith(5);
        expect(wrapper.vm.prev()).toBe(false);
    });

    it('selects the first change when prev is the first press', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps } });
        const diff = lastEditor();
        diff.setLineChanges(TWO_CHANGES);
        diff.fireDiffUpdate();

        // From no selection, prev selects the first change too (it does not cross
        // straight to the previous file).
        expect(wrapper.vm.prev()).toBe(true);
        expect(diff.getModifiedEditor().revealLineInCenter).toHaveBeenLastCalledWith(5);
    });

    it('selects then crosses for a plainly opened single-change file', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps } });
        const diff = lastEditor();
        diff.setLineChanges(ONE_CHANGE);
        diff.fireDiffUpdate();

        // First press selects the sole change; only the next press crosses files.
        expect(wrapper.vm.next()).toBe(true);
        expect(wrapper.vm.next()).toBe(false);
    });

    it('crosses on the first press for a single-change file arrowed into', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps, pendingEdge: 'first' } });
        const diff = lastEditor();
        diff.setLineChanges(ONE_CHANGE);
        diff.fireDiffUpdate();

        // Arriving via the arrows lands on the sole change already, so the next press
        // crosses straight on (no re-selecting a change the reader was just taken to).
        expect(wrapper.vm.next()).toBe(false);
    });

    it('marks no change on a plain load, then marks the change navigation lands on', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps } });
        const diff = lastEditor();
        diff.setLineChanges(TWO_CHANGES);
        diff.fireDiffUpdate();

        // A plainly loaded file has no active-change marker until the reader navigates.
        expect(lastActiveModified(diff)).toHaveLength(0);

        // The first press selects and marks the first change (lines 5..5).
        wrapper.vm.next();
        const onFirst = lastActiveModified(diff);
        expect(onFirst[0]!.range.startLineNumber).toBe(5);
        expect(onFirst[0]!.options.marginClassName).toBe('moire-active-change-margin');

        // Moving to the second change re-targets the bar to its lines (20..21).
        wrapper.vm.next();
        const onSecond = lastActiveModified(diff);
        expect(onSecond[0]!.range.startLineNumber).toBe(20);
        expect(onSecond[0]!.range.endLineNumber).toBe(21);
    });

    it('keeps the selected change when Monaco re-fires the diff for the same content', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps } });
        const diff = lastEditor();
        diff.setLineChanges(TWO_CHANGES);
        diff.fireDiffUpdate();

        wrapper.vm.next(); // first change
        wrapper.vm.next(); // second change (last)

        // Monaco fires onDidUpdateDiff again for the same file (layout, folding). The
        // selection must survive it rather than resetting to unselected.
        diff.fireDiffUpdate();

        expect(wrapper.vm.next()).toBe(false); // still at the last change
        expect(lastActiveModified(diff)[0]!.range.startLineNumber).toBe(20);
    });

    it('waits for a non-empty diff before consuming a pending edge', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps, pendingEdge: 'first' } });
        const diff = lastEditor();

        // Monaco's first pass after a model swap reports no line changes yet: the
        // pending edge must NOT be consumed then, or the real diff arrives too late.
        diff.fireDiffUpdate();
        expect(wrapper.emitted('edgeConsumed')).toBeUndefined();

        // The fire that carries the diff lands on the edge and reports consumed.
        diff.setLineChanges(TWO_CHANGES);
        diff.fireDiffUpdate();
        expect(wrapper.emitted('edgeConsumed')).toHaveLength(1);
        expect(diff.getModifiedEditor().revealLineInCenter).toHaveBeenLastCalledWith(5);
    });

    it('keeps the landed change after a cross-file arrival when Monaco re-fires', async () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps, pendingEdge: 'first' } });
        const diff = lastEditor();
        diff.setLineChanges(TWO_CHANGES);
        diff.fireDiffUpdate(); // consumes pendingEdge, lands on the first change
        expect(wrapper.emitted('edgeConsumed')).toHaveLength(1);

        // The parent clears the flag once consumed; then Monaco re-fires the event.
        await wrapper.setProps({ pendingEdge: null });
        diff.fireDiffUpdate();

        // Still on the first change, so one press advances to the second rather than
        // re-selecting the first (the two-click regression this guards against).
        expect(wrapper.vm.next()).toBe(true);
        expect(diff.getModifiedEditor().revealLineInCenter).toHaveBeenLastCalledWith(20);
    });

    it('reports the boundary immediately for a file with no changes', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps } });
        lastEditor().fireDiffUpdate(); // no line changes set

        expect(wrapper.vm.next()).toBe(false);
        expect(wrapper.vm.prev()).toBe(false);
    });

    it('lands on the first change and reports consumed when arriving with pendingEdge "first"', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps, pendingEdge: 'first' } });
        const diff = lastEditor();
        diff.setLineChanges(TWO_CHANGES);
        diff.fireDiffUpdate();

        expect(diff.getModifiedEditor().revealLineInCenter).toHaveBeenLastCalledWith(5);
        expect(wrapper.emitted('edgeConsumed')).toHaveLength(1);
    });

    it('lands on the last change with pendingEdge "last"', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps, pendingEdge: 'last' } });
        const diff = lastEditor();
        diff.setLineChanges(TWO_CHANGES);
        diff.fireDiffUpdate();

        expect(diff.getModifiedEditor().revealLineInCenter).toHaveBeenLastCalledWith(20);
        expect(wrapper.emitted('edgeConsumed')).toHaveLength(1);
    });

    it('marks a review thread in the gutter on its line', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps, reviewThreads: [thread()] } });
        const diff = lastEditor();
        diff.fireDiffUpdate();

        const decos = commentDecorations(diff, 'modified');
        expect(decos).toHaveLength(1);
        expect(decos[0]!.range.startLineNumber).toBe(12);
        expect(decos[0]!.options.glyphMarginClassName).toContain('moire-comment-glyph');
        // The whole line is highlighted, not just the gutter, so it is obvious.
        expect(decos[0]!.options.isWholeLine).toBe(true);
        expect(decos[0]!.options.className).toContain('moire-comment-line');
        // A different file's threads never touch this file.
        expect(wrapper.props('reviewThreads')).toHaveLength(1);
    });

    it('tints a fully resolved thread differently', () => {
        const wrapper = mount(DiffViewer, {
            props: { ...baseProps, reviewThreads: [thread({ isResolved: true })] },
        });
        lastEditor().fireDiffUpdate();

        expect(
            commentDecorations(lastEditor(), 'modified')[0]!.options.glyphMarginClassName
        ).toContain('moire-comment-glyph-resolved');
        wrapper.unmount();
    });

    it('opens a popover with the thread when its gutter marker is clicked', async () => {
        const wrapper = mount(DiffViewer, {
            props: { ...baseProps, reviewThreads: [thread()] },
        });
        const diff = lastEditor();
        diff.fireDiffUpdate();

        // No popover until a marker is clicked.
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

        diff.getModifiedEditor().fireMouseDown(glyphClick(12));
        await flushPromises();

        const popover = wrapper.find('[role="dialog"]');
        expect(popover.exists()).toBe(true);
        expect(popover.text()).toContain('bob');
        expect(popover.text()).toContain('this can race');
    });

    it('ignores a gutter click on a line with no thread', async () => {
        const wrapper = mount(DiffViewer, {
            props: { ...baseProps, reviewThreads: [thread()] },
        });
        const diff = lastEditor();
        diff.fireDiffUpdate();

        diff.getModifiedEditor().fireMouseDown(glyphClick(3));
        await flushPromises();
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    });

    it('opens the popover when the highlighted line itself is clicked, not only the glyph', async () => {
        const wrapper = mount(DiffViewer, {
            props: { ...baseProps, reviewThreads: [thread()] },
        });
        const diff = lastEditor();
        diff.fireDiffUpdate();

        // A click on the code content of the commented line (not the gutter glyph).
        diff.getModifiedEditor().fireMouseDown(contentClick(12));
        await flushPromises();
        expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    });

    it('closes the popover when a non-commented line is clicked', async () => {
        const wrapper = mount(DiffViewer, {
            props: { ...baseProps, reviewThreads: [thread()] },
        });
        const diff = lastEditor();
        diff.fireDiffUpdate();
        diff.getModifiedEditor().fireMouseDown(glyphClick(12));
        await flushPromises();
        expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

        diff.getModifiedEditor().fireMouseDown(contentClick(7));
        await flushPromises();
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    });

    it('closes the popover on a click outside the editor and popover', async () => {
        const wrapper = mount(DiffViewer, {
            attachTo: document.body,
            props: { ...baseProps, reviewThreads: [thread()] },
        });
        const diff = lastEditor();
        diff.fireDiffUpdate();
        diff.getModifiedEditor().fireMouseDown(glyphClick(12));
        await flushPromises();
        expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

        // A mouse-down elsewhere in the document dismisses it.
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await flushPromises();
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it('closes the popover when the editor scrolls', async () => {
        const wrapper = mount(DiffViewer, {
            props: { ...baseProps, reviewThreads: [thread()] },
        });
        const diff = lastEditor();
        diff.fireDiffUpdate();
        diff.getModifiedEditor().fireMouseDown(glyphClick(12));
        await flushPromises();
        expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

        diff.getModifiedEditor().fireScroll();
        await flushPromises();
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    });

    it('marks a check annotation in the gutter on its head-file line', () => {
        mount(DiffViewer, { props: { ...baseProps, checkAnnotations: [annotation()] } });
        const diff = lastEditor();
        diff.fireDiffUpdate();

        const decos = annotationDecorations(diff);
        expect(decos).toHaveLength(1);
        expect(decos[0]!.range.startLineNumber).toBe(8);
        expect(decos[0]!.options.glyphMarginClassName).toContain('moire-alert-glyph');
        expect(decos[0]!.options.isWholeLine).toBe(true);
        expect(decos[0]!.options.className).toContain('moire-alert-line');
    });

    it('tints a failure-level annotation as an error, not a warning', () => {
        mount(DiffViewer, {
            props: { ...baseProps, checkAnnotations: [annotation({ level: 'failure' })] },
        });
        const diff = lastEditor();
        diff.fireDiffUpdate();

        const options = annotationDecorations(diff)[0]!.options;
        expect(options.glyphMarginClassName).toContain('moire-alert-glyph-error');
        expect(options.className).toContain('moire-alert-line-error');
    });

    it('opens a popover with the annotation when its line is clicked', async () => {
        const wrapper = mount(DiffViewer, {
            props: { ...baseProps, checkAnnotations: [annotation()] },
        });
        const diff = lastEditor();
        diff.fireDiffUpdate();

        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

        diff.getModifiedEditor().fireMouseDown(glyphClick(8));
        await flushPromises();

        const popover = wrapper.find('[role="dialog"]');
        expect(popover.exists()).toBe(true);
        expect(popover.text()).toContain('Warning');
        expect(popover.text()).toContain('quality-gates');
        expect(popover.text()).toContain('The property should be above methods.');
    });

    it('shows an annotation and a comment together when both sit on the same line', async () => {
        const wrapper = mount(DiffViewer, {
            props: {
                ...baseProps,
                reviewThreads: [thread({ line: 8 })],
                checkAnnotations: [annotation()],
            },
        });
        const diff = lastEditor();
        diff.fireDiffUpdate();

        diff.getModifiedEditor().fireMouseDown(contentClick(8));
        await flushPromises();

        const popover = wrapper.find('[role="dialog"]');
        expect(popover.text()).toContain('The property should be above methods.');
        expect(popover.text()).toContain('this can race');
    });

    it('jumps to a requested edge on demand via goToEdge', () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps } });
        const diff = lastEditor();
        diff.setLineChanges(TWO_CHANGES);
        diff.fireDiffUpdate();
        const modified = diff.getModifiedEditor();

        wrapper.vm.goToEdge('last');
        expect(modified.revealLineInCenter).toHaveBeenLastCalledWith(20);
        wrapper.vm.goToEdge('first');
        expect(modified.revealLineInCenter).toHaveBeenLastCalledWith(5);
    });
});
