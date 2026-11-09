import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
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

// A page button, found by its label.
function pageButton(wrapper: VueWrapper, label: string) {
    return wrapper.findAll('button').find((b) => b.text().startsWith(label))!;
}

// The labels of the page buttons, in toolbar order.
function pageLabels(wrapper: VueWrapper) {
    return wrapper
        .get('nav[aria-label="Pages"]')
        .findAll('button')
        .map((b) => b.text());
}

// The labels of the page buttons shown as selected.
function selectedPages(wrapper: VueWrapper) {
    return wrapper.findAll('[aria-current="page"]').map((b) => b.text());
}

// The PR tab, found by its slot (it keeps its place in every state).
function prTab(wrapper: VueWrapper) {
    return wrapper.get('[data-slot="pr-tab"]');
}

// Opens a repository, so the PR tab shows.
function openRepo() {
    const comparison = useComparisonStore();
    comparison.repoPath = '/repos/moire';
    return comparison;
}

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

    describe('PR tab', () => {
        it('is absent without an open repo', () => {
            const wrapper = mountToolbar();
            expect(wrapper.find('[data-slot="pr-tab"]').exists()).toBe(false);
        });

        it('sits right after Diff and goes to the PR page once a PR is detected', async () => {
            const comparison = openRepo();
            comparison.prStatus = 'ok';
            comparison.pullRequest = PR;
            const ui = useUiStore();

            const wrapper = mountToolbar();
            expect(pageLabels(wrapper)).toEqual([
                'Diff',
                'PR #7',
                'Dashboard',
                'Notifications',
                'Settings',
            ]);

            await prTab(wrapper).trigger('click');
            expect(ui.mainView).toBe('pr');
            expect(selectedPages(wrapper)).toEqual(['PR #7']);

            // Clicking the current page's tab stays on it.
            await prTab(wrapper).trigger('click');
            expect(ui.mainView).toBe('pr');
        });

        it('uses the draft icon for a draft PR', () => {
            const comparison = openRepo();
            comparison.prStatus = 'ok';
            comparison.pullRequest = { ...PR, isDraft: true };

            const tab = prTab(mountToolbar());
            expect(tab.find('.lucide-git-pull-request-draft').exists()).toBe(true);
            expect(tab.find('.lucide-git-pull-request').exists()).toBe(false);
        });

        it('colors the status dot by the PR state', () => {
            const comparison = openRepo();
            comparison.prStatus = 'ok';
            const dotClass = () => prTab(mountToolbar()).get('span.rounded-full').classes();

            comparison.pullRequest = { ...PR, state: 'OPEN', isDraft: false };
            expect(dotClass()).toContain('bg-moire-pr-open');

            comparison.pullRequest = { ...PR, state: 'CLOSED', isDraft: false };
            expect(dotClass()).toContain('bg-moire-pr-closed');

            comparison.pullRequest = { ...PR, state: 'MERGED', isDraft: false };
            expect(dotClass()).toContain('bg-moire-pr-merged');

            comparison.pullRequest = { ...PR, state: 'OPEN', isDraft: true };
            expect(dotClass()).toContain('bg-moire-pr-draft');

            // Changes requested turns the dot yellow, also on a draft (whose icon
            // still marks it as one).
            comparison.pullRequest = { ...PR, isDraft: false, reviewDecision: 'CHANGES_REQUESTED' };
            expect(dotClass()).toContain('bg-moire-changes-fg');
            comparison.pullRequest = { ...PR, isDraft: true, reviewDecision: 'CHANGES_REQUESTED' };
            expect(dotClass()).toContain('bg-moire-changes-fg');
        });

        it('shows a disabled spinner tab while a lookup runs, hiding stale status', async () => {
            const comparison = openRepo();
            // A leftover PR from the previous branch must not show through while the
            // new branch's lookup is in flight.
            comparison.prStatus = 'ok';
            comparison.pullRequest = PR;
            comparison.prLoading = true;
            const ui = useUiStore();

            const wrapper = mountToolbar();
            const tab = prTab(wrapper);
            expect(tab.attributes('data-state')).toBe('loading');
            expect(tab.attributes('aria-disabled')).toBe('true');
            expect(tab.find('.lucide-loader-circle').exists()).toBe(true);
            expect(wrapper.text()).not.toContain('PR #');

            await tab.trigger('click');
            expect(ui.mainView).toBe('diff');
        });

        it('shows a disabled warning tab when the gh lookup fails', () => {
            const comparison = openRepo();
            comparison.prStatus = 'not-installed';

            const tab = prTab(mountToolbar());
            expect(tab.attributes('data-state')).toBe('warning');
            expect(tab.find('.lucide-triangle-alert').exists()).toBe(true);
        });

        it('is disabled without a warning when the branches have no PR', async () => {
            const comparison = openRepo();
            comparison.prStatus = 'no-pr';
            const ui = useUiStore();

            const wrapper = mountToolbar();
            const tab = prTab(wrapper);
            expect(tab.text()).toBe('PR');
            expect(tab.attributes('data-state')).toBe('none');
            expect(tab.attributes('aria-disabled')).toBe('true');
            expect(tab.find('.lucide-triangle-alert').exists()).toBe(false);

            await tab.trigger('click');
            expect(ui.mainView).toBe('diff');
            expect(selectedPages(wrapper)).toEqual(['Diff']);
        });
    });

    describe('page buttons', () => {
        it('shows Diff and Settings without an open repo, Diff selected', () => {
            const wrapper = mountToolbar();

            expect(pageLabels(wrapper)).toEqual(['Diff', 'Settings']);
            expect(selectedPages(wrapper)).toEqual(['Diff']);
        });

        it('adds PR, Dashboard and Notifications while a repo is open', () => {
            useComparisonStore().repoPath = '/repos/moire';
            const wrapper = mountToolbar();

            expect(pageLabels(wrapper)).toEqual([
                'Diff',
                'PR',
                'Dashboard',
                'Notifications',
                'Settings',
            ]);
        });

        it('goes to each page, selecting exactly its button', async () => {
            useComparisonStore().repoPath = '/repos/moire';
            const ui = useUiStore();
            const wrapper = mountToolbar();

            const goTo = async (label: string, view: string) => {
                await pageButton(wrapper, label).trigger('click');
                expect(ui.mainView).toBe(view);
                expect(selectedPages(wrapper)).toEqual([label]);
            };

            await goTo('Dashboard', 'dashboard');
            await goTo('Notifications', 'notifications');
            await goTo('Settings', 'settings');
            await goTo('Diff', 'diff');
        });

        it("does nothing on the current page's button, adding no history", async () => {
            useComparisonStore().repoPath = '/repos/moire';
            const ui = useUiStore();
            const wrapper = mountToolbar();

            await pageButton(wrapper, 'Dashboard').trigger('click');
            await pageButton(wrapper, 'Dashboard').trigger('click');
            expect(ui.mainView).toBe('dashboard');

            // One step back reaches the diff, and there is nothing before it.
            ui.goBack();
            expect(ui.mainView).toBe('diff');
            ui.goBack();
            expect(ui.mainView).toBe('diff');
        });

        it('selects Diff while the PR page is set but no PR is detected', () => {
            useUiStore().mainView = 'pr';
            const wrapper = mountToolbar();

            expect(selectedPages(wrapper)).toEqual(['Diff']);
        });
    });
});
