import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import { editor } from './monaco-stub';
import type { StubDiffEditor } from './monaco-stub';
import type { CheckAnnotation, CodeStyle, PrReviewThread, ViewMode } from '@/shared/types';
import { stubTooltips } from './fixtures';

stubTooltips();

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
    id: 'RT_1',
    path: 'src/a.ts',
    line: 12,
    originalLine: null,
    side: 'RIGHT',
    isResolved: false,
    isOutdated: false,
    isPending: false,
    comments: [
        {
            id: 'C_bob',
            author: 'bob',
            body: 'this can race',
            createdAt: '',
            isPending: false,
            viewerDidAuthor: false,
        },
    ],
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

// A write action that always succeeds, and props that inject it so the popover offers
// its reply box and resolve control. `dialogButton` finds the popover button by label.
const okAction = () => Promise.resolve({ ok: true as const });
const writeProps = (over: Record<string, unknown> = {}) => ({
    ...baseProps,
    reviewThreads: [thread()],
    replyToThread: okAction,
    setThreadResolved: okAction,
    ...over,
});
const dialogButton = (w: ReturnType<typeof mount>, label: string) =>
    w.findAll('[role="dialog"] button').find((b) => b.text() === label);

// The "+" collection is the fifth created on the modified editor (after the
// word, active-change, comment and annotation ones).
function addButtonDecorations(diff: StubDiffEditor) {
    const set = diff.getModifiedEditor().createDecorationsCollection.mock.results[4]!.value.set;
    const calls = set.mock.calls;
    return (calls[calls.length - 1]?.[0] ?? []) as {
        range: { startLineNumber: number };
        options: { linesDecorationsClassName?: string };
    }[];
}

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

    it('shows a reply box and resolve control only when write actions are injected', async () => {
        const wrapper = mount(DiffViewer, { props: writeProps() });
        const diff = lastEditor();
        diff.fireDiffUpdate();
        diff.getModifiedEditor().fireMouseDown(glyphClick(12));
        await flushPromises();

        expect(wrapper.find('[role="dialog"] textarea').exists()).toBe(true);
        expect(dialogButton(wrapper, 'Resolve')).toBeTruthy();
        expect(dialogButton(wrapper, 'Reply')).toBeTruthy();
    });

    it('stays read-only when no write actions are injected', async () => {
        const wrapper = mount(DiffViewer, { props: { ...baseProps, reviewThreads: [thread()] } });
        const diff = lastEditor();
        diff.fireDiffUpdate();
        diff.getModifiedEditor().fireMouseDown(glyphClick(12));
        await flushPromises();

        expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
        expect(wrapper.find('[role="dialog"] textarea').exists()).toBe(false);
    });

    it('submits a reply through the injected action', async () => {
        const replyToThread =
            vi.fn<(threadId: string, body: string) => Promise<{ ok: true }>>(okAction);
        const wrapper = mount(DiffViewer, { props: writeProps({ replyToThread }) });
        const diff = lastEditor();
        diff.fireDiffUpdate();
        diff.getModifiedEditor().fireMouseDown(glyphClick(12));
        await flushPromises();

        await wrapper.find('[role="dialog"] textarea').setValue('looks fixed');
        await dialogButton(wrapper, 'Reply')!.trigger('click');
        await flushPromises();

        expect(replyToThread).toHaveBeenCalledWith('RT_1', 'looks fixed');
    });

    it('requests resolve for an unresolved thread through the injected action', async () => {
        const setThreadResolved =
            vi.fn<(threadId: string, resolved: boolean) => Promise<{ ok: true }>>(okAction);
        const wrapper = mount(DiffViewer, { props: writeProps({ setThreadResolved }) });
        const diff = lastEditor();
        diff.fireDiffUpdate();
        diff.getModifiedEditor().fireMouseDown(glyphClick(12));
        await flushPromises();

        await dialogButton(wrapper, 'Resolve')!.trigger('click');
        await flushPromises();

        expect(setThreadResolved).toHaveBeenCalledWith('RT_1', true);
    });

    it('shows an inline error when a reply fails', async () => {
        const replyToThread = vi.fn<
            (threadId: string, body: string) => Promise<{ ok: false; message: string }>
        >(() => Promise.resolve({ ok: false, message: 'HTTP 403: Forbidden' }));
        const wrapper = mount(DiffViewer, { props: writeProps({ replyToThread }) });
        const diff = lastEditor();
        diff.fireDiffUpdate();
        diff.getModifiedEditor().fireMouseDown(glyphClick(12));
        await flushPromises();

        await wrapper.find('[role="dialog"] textarea').setValue('nope');
        await dialogButton(wrapper, 'Reply')!.trigger('click');
        await flushPromises();

        expect(wrapper.find('[role="dialog"]').text()).toContain('HTTP 403');
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

    describe('review comments', () => {
        // A mouse event on the line decorations gutter (type 4), where the "+" sits.
        const plusClick = (lineNumber: number) => lineMouseDown(lineNumber, 4);

        function mountReviewing(over: Record<string, unknown> = {}) {
            const addComment = vi
                .fn<(comment: unknown) => Promise<{ ok: boolean; message?: string }>>()
                .mockResolvedValue({ ok: true });
            const wrapper = mount(DiffViewer, {
                props: { ...baseProps, canComment: true, addComment, ...over },
                attachTo: document.body,
            });
            const diff = lastEditor();
            diff.setLineChanges(TWO_CHANGES);
            diff.fireDiffUpdate();
            return { wrapper, diff, addComment };
        }

        it("shows the + on a hovered line of the PR's diff, not on lines outside it", () => {
            const { diff, wrapper } = mountReviewing();
            const modified = diff.getModifiedEditor();

            modified.fireMouseMove({ target: { position: { lineNumber: 7 } } });
            expect(addButtonDecorations(diff)[0]!.range.startLineNumber).toBe(7);
            expect(addButtonDecorations(diff)[0]!.options.linesDecorationsClassName).toBe(
                'moire-add-comment'
            );

            // Line 12 is outside both hunks (5 +/- 3, 20..21 +/- 3).
            modified.fireMouseMove({ target: { position: { lineNumber: 12 } } });
            expect(addButtonDecorations(diff)).toEqual([]);
            wrapper.unmount();
        });

        it('offers no + without a pending review', () => {
            const { diff, wrapper } = mountReviewing({ canComment: false });

            diff.getModifiedEditor().fireMouseMove({ target: { position: { lineNumber: 5 } } });
            expect(addButtonDecorations(diff)).toEqual([]);
            wrapper.unmount();
        });

        it('adds a comment on the clicked line to the review', async () => {
            const { diff, wrapper, addComment } = mountReviewing();

            diff.getModifiedEditor().fireMouseDown(plusClick(20));
            await flushPromises();
            expect(wrapper.text()).toContain('Line 20');

            await wrapper.get('[aria-label="New review comment"]').setValue('Off by one?');
            await dialogButton(wrapper, 'Add review comment')!.trigger('click');
            await flushPromises();

            expect(addComment).toHaveBeenCalledWith({
                line: 20,
                side: 'RIGHT',
                startLine: undefined,
                body: 'Off by one?',
            });
            expect(wrapper.find('[data-slot="review-composer"]').exists()).toBe(false);
            wrapper.unmount();
        });

        it('comments on the selected lines, with a suggested change', async () => {
            const { diff, wrapper, addComment } = mountReviewing();
            const modified = diff.getModifiedEditor();
            modified.setSelection({
                startLineNumber: 19,
                startColumn: 1,
                endLineNumber: 21,
                endColumn: 4,
            });

            modified.fireMouseDown(plusClick(20));
            await flushPromises();
            expect(wrapper.text()).toContain('Lines 19 to 21');

            await dialogButton(wrapper, 'Suggest change')!.trigger('click');
            const textarea = wrapper.get<HTMLTextAreaElement>('[aria-label="New review comment"]');
            expect(textarea.element.value).toBe('```suggestion\nline 19\nline 20\nline 21\n```\n');

            await dialogButton(wrapper, 'Add review comment')!.trigger('click');
            await flushPromises();
            expect(addComment).toHaveBeenCalledWith(
                expect.objectContaining({ line: 21, startLine: 19, side: 'RIGHT' })
            );
            wrapper.unmount();
        });

        it('keeps the draft and shows the error when GitHub refuses the comment', async () => {
            const { diff, wrapper, addComment } = mountReviewing();
            addComment.mockResolvedValue({ ok: false, message: 'Line could not be resolved' });

            diff.getOriginalEditor().fireMouseDown(plusClick(5));
            await flushPromises();
            expect(wrapper.text()).toContain('Line 5 (base)');
            // A suggestion replaces head lines, so the base side offers none.
            expect(dialogButton(wrapper, 'Suggest change')).toBeUndefined();

            await wrapper.get('[aria-label="New review comment"]').setValue('Why?');
            await dialogButton(wrapper, 'Add review comment')!.trigger('click');
            await flushPromises();

            expect(wrapper.text()).toContain('Line could not be resolved');
            expect(
                wrapper.get<HTMLTextAreaElement>('[aria-label="New review comment"]').element.value
            ).toBe('Why?');
            wrapper.unmount();
        });

        it('shows a submitted thread in the PR, but not a pending one', async () => {
            const showInPr = vi.fn<(threadId: string) => void>();
            const wrapper = mount(DiffViewer, {
                props: writeProps({
                    reviewThreads: [thread(), thread({ id: 'RT_p', line: 14, isPending: true })],
                    showInPr,
                }),
                attachTo: document.body,
            });
            const diff = lastEditor();
            diff.fireDiffUpdate();

            diff.getModifiedEditor().fireMouseDown(glyphClick(12));
            await flushPromises();
            // The link sits in the popover's header, and each comment has its avatar.
            expect(
                wrapper.find('[role="dialog"] > div:first-child [data-slot="show-in-pr"]').exists()
            ).toBe(true);
            expect(wrapper.find('[data-slot="popover-comment"] img').exists()).toBe(true);
            await dialogButton(wrapper, 'Show in PR')!.trigger('click');
            expect(showInPr).toHaveBeenCalledWith('RT_1');

            diff.getModifiedEditor().fireMouseDown(glyphClick(14));
            await flushPromises();
            expect(dialogButton(wrapper, 'Show in PR')).toBeUndefined();
            wrapper.unmount();
        });

        it('marks pending comments and lets their author edit and delete them', async () => {
            const editPendingComment = vi
                .fn<(id: string, body: string) => Promise<{ ok: boolean }>>()
                .mockResolvedValue({ ok: true });
            const deletePendingComment = vi
                .fn<(id: string) => Promise<{ ok: boolean }>>()
                .mockResolvedValue({ ok: true });
            const pending = thread({
                isPending: true,
                comments: [
                    {
                        id: 'RC_1',
                        author: 'me',
                        body: 'rename',
                        createdAt: '',
                        isPending: true,
                        viewerDidAuthor: true,
                    },
                ],
            });
            const wrapper = mount(DiffViewer, {
                props: {
                    ...writeProps({ reviewThreads: [pending] }),
                    editPendingComment,
                    deletePendingComment,
                },
                attachTo: document.body,
            });
            const diff = lastEditor();
            diff.fireDiffUpdate();
            expect(commentDecorations(diff, 'modified')[0]!.options.glyphMarginClassName).toContain(
                'moire-comment-glyph-pending'
            );

            diff.getModifiedEditor().fireMouseDown(glyphClick(12));
            await flushPromises();
            expect(wrapper.find('[data-slot="pending-badge"]').text()).toBe('Pending');

            await dialogButton(wrapper, 'Edit')!.trigger('click');
            await wrapper.get('[aria-label="Edit comment"]').setValue('rename it');
            await dialogButton(wrapper, 'Save')!.trigger('click');
            await flushPromises();
            expect(editPendingComment).toHaveBeenCalledWith('RC_1', 'rename it');

            await dialogButton(wrapper, 'Delete')!.trigger('click');
            await dialogButton(wrapper, 'Delete')!.trigger('click');
            await flushPromises();
            expect(deletePendingComment).toHaveBeenCalledWith('RC_1');
            wrapper.unmount();
        });
    });
});
