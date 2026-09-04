import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MoirePage from '@/components/pages/MoirePage.vue';
import ToolbarHeader from '@/components/headers/ToolbarHeader.vue';
import MissingBranchNotice from '@/components/headers/MissingBranchNotice.vue';
import FileTreeSidebar from '@/components/sidebar/FileTreeSidebar.vue';
import DiffPane from '@/components/diff/DiffPane.vue';
import PrView from '@/components/pr/PrView.vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { PullRequest } from '@/shared/types';

// The page is a pure layout shell; the children carry their own tests, so stub
// them and assert only that the shell composes the regions and swaps the main pane.
const stubs = {
    ToolbarHeader: true,
    MissingBranchNotice: true,
    FileTreeSidebar: true,
    DiffPane: true,
    PrView: true,
};

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

describe('MoirePage', () => {
    let pinia: ReturnType<typeof createPinia>;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    it('composes the toolbar, notice, sidebar, and diff pane', () => {
        const wrapper = mount(MoirePage, { global: { plugins: [pinia], stubs } });

        expect(wrapper.findComponent(ToolbarHeader).exists()).toBe(true);
        expect(wrapper.findComponent(MissingBranchNotice).exists()).toBe(true);
        expect(wrapper.findComponent(FileTreeSidebar).exists()).toBe(true);
        expect(wrapper.findComponent(DiffPane).exists()).toBe(true);
        expect(wrapper.findComponent(PrView).exists()).toBe(false);
    });

    it('shows the PR view instead of the diff when the PR view is active and a PR exists', () => {
        const comparison = useComparisonStore();
        comparison.prStatus = 'ok';
        comparison.pullRequest = PR;
        useUiStore().setMainView('pr');

        const wrapper = mount(MoirePage, { global: { plugins: [pinia], stubs } });

        expect(wrapper.findComponent(PrView).exists()).toBe(true);
        expect(wrapper.findComponent(DiffPane).exists()).toBe(false);
    });

    it('falls back to the diff and resets the toggle when the PR disappears', async () => {
        const comparison = useComparisonStore();
        comparison.prStatus = 'ok';
        comparison.pullRequest = PR;
        const ui = useUiStore();
        ui.setMainView('pr');

        const wrapper = mount(MoirePage, { global: { plugins: [pinia], stubs } });
        expect(wrapper.findComponent(PrView).exists()).toBe(true);

        // The range moves to a branch with no PR.
        comparison.prStatus = 'no-pr';
        comparison.pullRequest = null;
        await flushPromises();
        await nextTick();

        expect(ui.mainView).toBe('diff');
        expect(wrapper.findComponent(DiffPane).exists()).toBe(true);
        expect(wrapper.findComponent(PrView).exists()).toBe(false);
    });
});
