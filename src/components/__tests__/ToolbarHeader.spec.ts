import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolbarHeader from '@/components/headers/ToolbarHeader.vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { PullRequest } from '@/shared/types';

const PR: PullRequest = {
    number: 7,
    title: 'Add PR viewer',
    body: '',
    state: 'OPEN',
    isDraft: false,
    author: 'yanergy',
    url: 'https://github.com/o/r/pull/7',
    baseRefName: 'main',
    headRefName: 'feature',
    createdAt: '',
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    commitCount: 0,
    comments: [],
    labels: [],
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: '',
    checks: [],
};

// The toolbar composes controls (RepoPicker, RefSelector, SegmentedToggle) that
// reach the electron bridge or teleport their content and carry their own tests.
// Stub them here and exercise the piece ToolbarHeader owns directly: the swap
// button. (The theme toggle moved to the native View menu; see tests/menu.spec.ts.)
const stubs = { RepoPicker: true, RefSelector: true, SegmentedToggle: true };

describe('ToolbarHeader', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    function mountToolbar() {
        return mount(ToolbarHeader, { global: { plugins: [pinia], stubs } });
    }

    it('swaps base and head when the swap button is clicked', async () => {
        const wrapper = mountToolbar();
        const comparison = useComparisonStore();
        const swap = vi.spyOn(comparison, 'swap');

        // With the child controls stubbed, the swap button is the only real
        // button the toolbar owns.
        await wrapper.get('button').trigger('click');
        expect(swap).toHaveBeenCalledTimes(1);
    });

    it('hides the PR button when no pull request is detected', () => {
        const wrapper = mountToolbar();
        expect(wrapper.text()).not.toContain('PR #');
    });

    it('shows the PR button once a PR is detected and toggles the main view', async () => {
        const comparison = useComparisonStore();
        comparison.prStatus = 'ok';
        comparison.pullRequest = PR;
        const ui = useUiStore();

        const wrapper = mountToolbar();
        expect(wrapper.text()).toContain('PR #7');

        const prButton = wrapper.findAll('button').find((b) => b.text().includes('PR #'))!;
        await prButton.trigger('click');
        expect(ui.mainView).toBe('pr');
        await prButton.trigger('click');
        expect(ui.mainView).toBe('diff');
    });

    it('uses the draft icon and a dashed border for a draft PR', () => {
        const comparison = useComparisonStore();
        comparison.prStatus = 'ok';
        comparison.pullRequest = { ...PR, isDraft: true };

        const wrapper = mountToolbar();
        expect(wrapper.find('.lucide-git-pull-request-draft').exists()).toBe(true);
        expect(wrapper.find('.lucide-git-pull-request').exists()).toBe(false);

        const prButton = wrapper.findAll('button').find((b) => b.text().includes('PR #'))!;
        expect(prButton.classes()).toContain('border-dashed');
    });

    it('keeps a solid border for a non-draft PR', () => {
        const comparison = useComparisonStore();
        comparison.prStatus = 'ok';
        comparison.pullRequest = { ...PR, isDraft: false };

        const wrapper = mountToolbar();
        const prButton = wrapper.findAll('button').find((b) => b.text().includes('PR #'))!;
        expect(prButton.classes()).not.toContain('border-dashed');
    });

    it('colors the status dot by the PR state', () => {
        const comparison = useComparisonStore();
        comparison.prStatus = 'ok';
        const dotClass = () => {
            const btn = mountToolbar()
                .findAll('button')
                .find((b) => b.text().includes('PR #'))!;
            return btn.find('span.rounded-full').classes();
        };

        comparison.pullRequest = { ...PR, state: 'OPEN', isDraft: false };
        expect(dotClass()).toContain('bg-moire-pr-open');

        comparison.pullRequest = { ...PR, state: 'CLOSED', isDraft: false };
        expect(dotClass()).toContain('bg-moire-pr-closed');

        comparison.pullRequest = { ...PR, state: 'MERGED', isDraft: false };
        expect(dotClass()).toContain('bg-moire-pr-merged');

        comparison.pullRequest = { ...PR, state: 'OPEN', isDraft: true };
        expect(dotClass()).toContain('bg-moire-pr-draft');

        // An open PR with changes requested turns the dot yellow.
        comparison.pullRequest = {
            ...PR,
            state: 'OPEN',
            isDraft: false,
            reviewDecision: 'CHANGES_REQUESTED',
        };
        expect(dotClass()).toContain('bg-moire-changes-fg');
    });

    it('gives a draft with changes requested the yellow dot but keeps the dashed border', () => {
        const comparison = useComparisonStore();
        comparison.prStatus = 'ok';
        comparison.pullRequest = { ...PR, isDraft: true, reviewDecision: 'CHANGES_REQUESTED' };

        const wrapper = mountToolbar();
        const prButton = wrapper.findAll('button').find((b) => b.text().includes('PR #'))!;
        // Changes requested overrides the gray draft dot...
        expect(prButton.find('span.rounded-full').classes()).toContain('bg-moire-changes-fg');
        // ...but the dashed border still marks it as a draft.
        expect(prButton.classes()).toContain('border-dashed');
    });

    it('shows a spinner in the PR slot while a range-change lookup runs, hiding stale status', () => {
        const comparison = useComparisonStore();
        // A leftover PR from the previous branch must not show through while the new
        // branch's lookup is in flight.
        comparison.prStatus = 'ok';
        comparison.pullRequest = PR;
        comparison.prLoading = true;

        const wrapper = mountToolbar();
        expect(wrapper.find('.lucide-loader-circle').exists()).toBe(true);
        expect(wrapper.text()).not.toContain('PR #');
    });

    it('shows a warning triangle in place of the PR button when the gh lookup fails', () => {
        const comparison = useComparisonStore();
        comparison.prStatus = 'not-installed';

        const wrapper = mountToolbar();
        expect(wrapper.find('.lucide-triangle-alert').exists()).toBe(true);
        expect(wrapper.text()).not.toContain('PR #');
    });

    it('shows no warning for a normal absent PR', () => {
        const comparison = useComparisonStore();
        comparison.prStatus = 'no-pr';

        const wrapper = mountToolbar();
        expect(wrapper.find('.lucide-triangle-alert').exists()).toBe(false);
    });
});
