import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import DashboardView from '@/components/dashboard/DashboardView.vue';
import DashboardPrRow from '@/components/dashboard/DashboardPrRow.vue';
import { useComparisonStore } from '@/stores/comparison';
import type { DashboardState } from '@/shared/types';
import { dashboardPr, dashboardSnapshot, dashboardState } from './fixtures';

function stubApi(state: DashboardState) {
    const api = {
        getDashboard: vi.fn<() => Promise<DashboardState>>().mockResolvedValue(state),
        refreshDashboard: vi.fn<() => Promise<DashboardState>>().mockResolvedValue(state),
        setDashboardShowDrafts: vi
            .fn<(show: boolean) => Promise<DashboardState>>()
            .mockResolvedValue({ ...state, showDrafts: false }),
        openExternal: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
    };
    window.api = api as unknown as Window['api'];
    return api;
}

describe('DashboardView', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
        vi.setSystemTime(new Date('2026-10-26T12:05:00Z'));
    });

    afterEach(() => {
        delete window.api;
        vi.useRealTimers();
    });

    async function mountView(state: DashboardState) {
        const api = stubApi(state);
        const wrapper = mount(DashboardView, { global: { plugins: [pinia] } });
        await flushPromises();
        return { api, wrapper };
    }

    it('loads on mount and shows the repo, summary and last update', async () => {
        const { api, wrapper } = await mountView(
            dashboardState({
                snapshot: dashboardSnapshot({ toReview: [dashboardPr({ author: 'ann' })] }),
            })
        );

        expect(api.getDashboard).toHaveBeenCalledTimes(1);
        expect(wrapper.text()).toContain('o/r');
        expect(wrapper.text()).toContain('1 PR to review');
        expect(wrapper.text()).toContain('Updated 5m ago');
    });

    it('renders the sections that have content, with group headers for open PRs', async () => {
        const { wrapper } = await mountView(
            dashboardState({
                snapshot: dashboardSnapshot({
                    toReview: [dashboardPr({ id: 'R', number: 9, author: 'ann' })],
                    mine: [
                        dashboardPr({ id: 'A', number: 1, ci: 'failing' }),
                        dashboardPr({ id: 'B', number: 2, isDraft: true }),
                        dashboardPr({
                            id: 'C',
                            number: 3,
                            state: 'CLOSED',
                            closedAt: '2026-10-25T00:00:00Z',
                        }),
                    ],
                }),
                activity: [
                    {
                        kind: 'review-requested',
                        at: '2026-10-26T12:00:00Z',
                        number: 9,
                        title: 'Fix login',
                        url: 'https://github.com/o/r/pull/9',
                    },
                ],
            })
        );

        const headings = wrapper.findAll('h2').map((h) => h.text());
        expect(headings).toEqual([
            'To review 1',
            'Your open PRs 2',
            'Recently closed without merge 1',
            'Recent activity 1',
        ]);
        expect(wrapper.text()).toContain('Checks failing');
        expect(wrapper.text()).toContain('Drafts');
        expect(wrapper.text()).toContain('Review requested');
        expect(wrapper.findAllComponents(DashboardPrRow)).toHaveLength(4);
    });

    it('says when nothing needs attention', async () => {
        const { wrapper } = await mountView(dashboardState());
        expect(wrapper.text()).toContain('Nothing needs your attention right now.');
        expect(wrapper.findAll('h2')).toHaveLength(0);
    });

    it('explains a failed load, keeping stale data on screen', async () => {
        const { wrapper } = await mountView(
            dashboardState({
                status: 'not-authenticated',
                snapshot: dashboardSnapshot({ toReview: [dashboardPr({ author: 'ann' })] }),
            })
        );

        expect(wrapper.text()).toContain('gh is not signed in to GitHub');
        expect(wrapper.text()).toContain('Showing data from 5m ago');
        expect(wrapper.findAllComponents(DashboardPrRow)).toHaveLength(1);
    });

    it('refreshes and toggles drafts through the store', async () => {
        const { api, wrapper } = await mountView(dashboardState());

        await wrapper.get('[aria-label="Refresh"]').trigger('click');
        expect(api.refreshDashboard).toHaveBeenCalledTimes(1);

        await wrapper.get('[aria-label="Show drafts"]').trigger('click');
        expect(api.setDashboardShowDrafts).toHaveBeenCalledWith(false);
    });

    it('opens a PR on GitHub when a row is clicked', async () => {
        const pr = dashboardPr({ author: 'ann' });
        const { api, wrapper } = await mountView(
            dashboardState({ snapshot: dashboardSnapshot({ toReview: [pr] }) })
        );

        wrapper.getComponent(DashboardPrRow).vm.$emit('open', pr);
        expect(api.openExternal).toHaveBeenCalledWith(pr.url);
    });

    it('reloads when another repository opens', async () => {
        const { api } = await mountView(dashboardState());

        useComparisonStore().repoPath = '/repos/other';
        await flushPromises();

        expect(api.getDashboard).toHaveBeenCalledTimes(2);
    });
});
