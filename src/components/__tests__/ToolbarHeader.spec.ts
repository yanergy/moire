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
