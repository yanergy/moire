import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import { editor } from './monaco-stub';
import type { StubDiffEditor } from './monaco-stub';
import type { CodeStyle, ViewMode } from '@/shared/types';

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
