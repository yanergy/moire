import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import DashboardView from '@/components/dashboard/DashboardView.vue';
import DashboardPrRow from '@/components/dashboard/DashboardPrRow.vue';
import DashboardCard from '@/components/dashboard/DashboardCard.vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import { useDashboardStore } from '@/stores/dashboard';
import type { DashboardState } from '@/shared/types';
import { dashboardPr, dashboardSnapshot, dashboardState, stubTooltips } from './fixtures';

stubTooltips();

function stubApi(state: DashboardState) {
    const api = {
        getDashboard: vi.fn<() => Promise<DashboardState>>().mockResolvedValue(state),
        refreshDashboard: vi.fn<() => Promise<DashboardState>>().mockResolvedValue(state),
        setDashboardShowDrafts: vi
            .fn<(show: boolean) => Promise<DashboardState>>()
            .mockResolvedValue({ ...state, showDrafts: false }),
        setDashboardAuthors: vi
            .fn<(authors: unknown) => Promise<DashboardState>>()
            .mockResolvedValue(state),
        openExternal: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
    };
    window.api = api as unknown as Window['api'];
    return api;
}

const at = (position: number, size: number) => ({ number: 1, size, baseRefName: 'main', position });

describe('DashboardView', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
        vi.setSystemTime(new Date('2026-10-26T12:05:00Z'));
    });

    // Unmounted after each test, so a view's window listeners (Cmd+F) do not
    // outlive it.
    const mounted: VueWrapper[] = [];

    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
        delete window.api;
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    async function mountView(state: DashboardState) {
        const api = stubApi(state);
        // Attached so the Users menu, which teleports to the body, can open.
        const wrapper = mount(DashboardView, {
            global: { plugins: [pinia] },
            attachTo: document.body,
        });
        mounted.push(wrapper);
        await flushPromises();
        return { api, wrapper };
    }

    it('loads on mount and shows the overview with the open count and last update', async () => {
        const { api, wrapper } = await mountView(
            dashboardState({
                snapshot: dashboardSnapshot({
                    mine: [dashboardPr({ id: 'A' }), dashboardPr({ id: 'B', number: 2 })],
                }),
            })
        );

        expect(api.getDashboard).toHaveBeenCalledTimes(1);
        expect(wrapper.text()).toContain('Overview');
        expect(wrapper.text()).toContain('2 open by you in o/r');
        expect(wrapper.text()).toContain('Updated 5m ago');
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(9);
    });

    it('leaves the notifications to the header menu', async () => {
        const { wrapper } = await mountView(
            dashboardState({
                activity: [{ kind: 'approved', at: 'T1', number: 1, title: 'a', url: 'u1' }],
            })
        );
        expect(wrapper.text()).not.toContain('Notifications');
    });

    it("lists a card's PRs when it is clicked, and goes back to the overview", async () => {
        const { wrapper } = await mountView(
            dashboardState({
                snapshot: dashboardSnapshot({
                    toReview: [
                        dashboardPr({ id: 'R1', number: 8, author: 'ann' }),
                        dashboardPr({ id: 'R2', number: 9, author: 'ann' }),
                    ],
                }),
            })
        );

        await wrapper.getComponent(DashboardCard).trigger('click');
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(0);
        expect(wrapper.findAllComponents(DashboardPrRow)).toHaveLength(2);
        expect(wrapper.text()).toContain('Needs your review');
        expect(wrapper.text()).toContain('2 · Requested from you');

        await wrapper.get('button').trigger('click'); // Overview
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(9);
    });

    it("groups a stack's PRs under a foldable header, in stack order", async () => {
        const { wrapper } = await mountView(
            dashboardState({
                snapshot: dashboardSnapshot({
                    toReview: [
                        dashboardPr({
                            id: 'T',
                            number: 3,
                            stack: at(3, 3),
                            headRefName: 'c',
                            baseRefName: 'b',
                        }),
                        dashboardPr({ id: 'S', number: 7, headRefName: 's', baseRefName: 'main' }),
                        dashboardPr({
                            id: 'B',
                            number: 1,
                            stack: at(1, 3),
                            title: 'Add the base',
                            headRefName: 'a',
                            baseRefName: 'main',
                        }),
                        dashboardPr({
                            id: 'M',
                            number: 2,
                            stack: at(2, 3),
                            headRefName: 'b',
                            baseRefName: 'a',
                        }),
                    ],
                }),
            })
        );

        await wrapper.getComponent(DashboardCard).trigger('click');
        const group = wrapper.get('[data-slot="stack-group"]');
        expect(group.get('[data-slot="stack-group-header"]').text()).toContain('Stack on main');
        expect(group.get('[data-slot="stack-group-title"]').text()).toBe('Add the base');
        expect(group.text()).toContain('3 PRs');
        // In stack order inside the group; the unstacked PR stays outside it.
        expect(group.findAll('[data-slot="stack-group-position"]').map((b) => b.text())).toEqual([
            '1',
            '2',
            '3',
        ]);
        expect(group.findAll('[data-slot="stack-group-pr"]').map((r) => r.text())).toEqual([
            expect.stringContaining('#1'),
            expect.stringContaining('#2'),
            expect.stringContaining('#3'),
        ]);
        expect(wrapper.findAllComponents(DashboardPrRow)).toHaveLength(4);

        await group.get('[data-slot="stack-group-header"]').trigger('click');
        expect(group.find('[data-slot="stack-group-pr"]').exists()).toBe(false);
        expect(wrapper.findAllComponents(DashboardPrRow)).toHaveLength(1);
    });

    it('shows the whole stack, dimming the PRs the card leaves out', async () => {
        const { wrapper } = await mountView(
            dashboardState({
                snapshot: dashboardSnapshot({
                    // Only the top PR asks for the viewer's review; its base PR is
                    // in the repository's open list only.
                    toReview: [
                        dashboardPr({
                            id: 'T',
                            number: 2,
                            stack: at(2, 2),
                            headRefName: 'b',
                            baseRefName: 'a',
                        }),
                    ],
                    open: [
                        dashboardPr({
                            id: 'B',
                            number: 1,
                            stack: at(1, 2),
                            headRefName: 'a',
                            baseRefName: 'main',
                        }),
                    ],
                }),
            })
        );

        await wrapper.getComponent(DashboardCard).trigger('click');
        const rows = wrapper.findAll('[data-slot="stack-group-pr"]');
        expect(rows.map((r) => r.attributes('data-filtered-out'))).toEqual(['true', undefined]);
        expect(rows[0]!.find('.opacity-45.grayscale').exists()).toBe(true);
        expect(wrapper.get('[data-slot="stack-group-header"]').text()).toContain('2 PRs');

        // Progress over the whole stack: neither PR is approved yet.
        expect(wrapper.get('[data-slot="stack-group-progress"]').text()).toBe('0/2 ready to merge');
        expect(
            wrapper
                .findAll('[data-slot="stack-group-progress"] circle')
                .map((c) => c.attributes('data-part'))
        ).toEqual(['waiting']);
    });

    describe('search', () => {
        const snapshot = () =>
            dashboardSnapshot({
                toReview: [
                    dashboardPr({ id: 'R1', number: 8, title: 'Add billing', author: 'ann' }),
                    dashboardPr({ id: 'R2', number: 9, title: 'Fix login', author: 'bob' }),
                ],
                merged: [
                    dashboardPr({
                        id: 'M1',
                        number: 3,
                        title: 'Old billing page',
                        state: 'MERGED',
                        closedAt: '2026-10-25T12:00:00Z',
                    }),
                ],
            });

        // Opens the search bar from the header's toggle and returns its input.
        async function openSearch(wrapper: VueWrapper) {
            await wrapper.get('[data-slot="dashboard-search-toggle"]').trigger('click');
            await flushPromises();
            return wrapper.get('input[data-slot="dashboard-search"]');
        }

        it("narrows a card's PRs, saying so when none match", async () => {
            const { wrapper } = await mountView(dashboardState({ snapshot: snapshot() }));
            await wrapper.getComponent(DashboardCard).trigger('click');

            const search = await openSearch(wrapper);
            await search.setValue('#9');
            expect(
                wrapper.findAllComponents(DashboardPrRow).map((row) => row.props('pr').id)
            ).toEqual(['R2']);

            await search.setValue('nothing');
            expect(wrapper.findAllComponents(DashboardPrRow)).toHaveLength(0);
            expect(wrapper.text()).toContain('No pull requests match “nothing”.');
        });

        it('lists the matching PRs from every list on the overview, until cleared', async () => {
            const { wrapper } = await mountView(dashboardState({ snapshot: snapshot() }));

            const search = await openSearch(wrapper);
            await search.setValue('billing');
            expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(0);
            expect(
                wrapper.findAllComponents(DashboardPrRow).map((row) => row.props('pr').id)
            ).toEqual(['R1', 'M1']);

            await wrapper.get('[data-slot="dashboard-search-clear"]').trigger('click');
            expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(9);

            // Escape clears the search and closes the bar.
            await search.setValue('ann');
            await search.trigger('keydown', { key: 'Escape' });
            expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(9);
            expect(wrapper.find('[data-slot="dashboard-search"]').exists()).toBe(false);
        });

        it('hides the search bar until the toggle opens it, and clears it on close', async () => {
            const { wrapper } = await mountView(dashboardState({ snapshot: snapshot() }));
            const toggle = wrapper.get('[data-slot="dashboard-search-toggle"]');
            expect(wrapper.find('[data-slot="dashboard-search"]').exists()).toBe(false);
            expect(toggle.attributes('aria-pressed')).toBe('false');

            const search = await openSearch(wrapper);
            expect(toggle.attributes('aria-pressed')).toBe('true');
            expect(document.activeElement).toBe(search.element);
            await search.setValue('billing');
            expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(0);

            await toggle.trigger('click');
            expect(wrapper.find('[data-slot="dashboard-search"]').exists()).toBe(false);
            expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(9);

            // Reopened, it starts empty.
            const reopened = await openSearch(wrapper);
            expect((reopened.element as HTMLInputElement).value).toBe('');
        });

        it('opens and focuses the search bar, selecting its text, on Cmd/Ctrl+F', async () => {
            const { wrapper } = await mountView(dashboardState({ snapshot: snapshot() }));
            const open = new KeyboardEvent('keydown', {
                key: 'f',
                cancelable: true,
                metaKey: true,
            });
            window.dispatchEvent(open);
            await flushPromises();
            expect(open.defaultPrevented).toBe(true);
            const search = wrapper.get('input[data-slot="dashboard-search"]');
            expect(document.activeElement).toBe(search.element);
            await search.setValue('ann');
            const input = search.element as HTMLInputElement;

            for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
                input.blur();
                const event = new KeyboardEvent('keydown', { key: 'f', cancelable: true, ...mod });
                window.dispatchEvent(event);
                await flushPromises();
                expect(event.defaultPrevented).toBe(true);
                expect(document.activeElement).toBe(input);
                expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
            }

            // Not with Shift or Alt, nor a plain F.
            input.blur();
            for (const extra of [{ shiftKey: true }, { altKey: true }, { metaKey: false }]) {
                const event = new KeyboardEvent('keydown', {
                    key: 'f',
                    cancelable: true,
                    metaKey: true,
                    ...extra,
                });
                window.dispatchEvent(event);
                expect(event.defaultPrevented).toBe(false);
            }
            expect(document.activeElement).not.toBe(input);
        });

        it('keeps a matching stack whole, dimming the members that do not match', async () => {
            const { wrapper } = await mountView(
                dashboardState({
                    snapshot: dashboardSnapshot({
                        toReview: [
                            dashboardPr({ id: 'B', number: 1, stack: at(1, 2), headRefName: 'a' }),
                            dashboardPr({
                                id: 'T',
                                number: 2,
                                stack: at(2, 2),
                                title: 'Top of stack',
                                headRefName: 'b',
                                baseRefName: 'a',
                            }),
                        ],
                    }),
                })
            );
            await wrapper.getComponent(DashboardCard).trigger('click');

            await (await openSearch(wrapper)).setValue('top');
            const rows = wrapper.findAll('[data-slot="stack-group-pr"]');
            expect(rows.map((r) => r.attributes('data-filtered-out'))).toEqual(['true', undefined]);
        });
    });

    it.each([
        [['me'], false],
        [['me', 'ann'], true],
        [['ann'], true],
        [['ann', 'bob'], true],
    ] as const)('shows avatars for the listed authors %j: %s', async (authors, shown) => {
        const prs = authors.map((author, i) =>
            dashboardPr({ id: `O${i}`, number: 10 + i, author })
        );
        const { wrapper } = await mountView(
            dashboardState({
                authors: 'all',
                snapshot: dashboardSnapshot({ login: 'me', open: prs }),
            })
        );

        const open = wrapper
            .findAllComponents(DashboardCard)
            .find((card) => card.props('category').key === 'open');
        await open!.trigger('click');
        const rows = wrapper.findAllComponents(DashboardPrRow);
        expect(rows).toHaveLength(authors.length);
        expect(rows.every((row) => row.props('showAvatar') === shown)).toBe(true);
    });

    it('shows the avatar on a review request, even when it is the only row', async () => {
        const { wrapper } = await mountView(
            dashboardState({
                snapshot: dashboardSnapshot({
                    login: 'me',
                    toReview: [dashboardPr({ id: 'R', number: 8, author: 'ann' })],
                }),
            })
        );

        await wrapper.getComponent(DashboardCard).trigger('click');
        expect(wrapper.getComponent(DashboardPrRow).props('showAvatar')).toBe(true);
    });

    it('splits the stack progress ring by where its PRs stand', async () => {
        const ready = { reviewDecision: 'APPROVED', ci: 'passing' } as const;
        const { wrapper } = await mountView(
            dashboardState({
                snapshot: dashboardSnapshot({
                    toReview: [
                        dashboardPr({
                            id: 'A',
                            number: 1,
                            stack: at(1, 3),
                            headRefName: 'a',
                            baseRefName: 'main',
                            ...ready,
                        }),
                        dashboardPr({
                            id: 'B',
                            number: 2,
                            stack: at(2, 3),
                            headRefName: 'b',
                            baseRefName: 'a',
                            ...ready,
                        }),
                        dashboardPr({
                            id: 'C',
                            number: 3,
                            stack: at(3, 3),
                            headRefName: 'c',
                            baseRefName: 'b',
                        }),
                    ],
                }),
            })
        );

        await wrapper.getComponent(DashboardCard).trigger('click');
        expect(wrapper.get('[data-slot="stack-group-progress"]').text()).toBe('2/3 ready to merge');
        const arcs = wrapper.findAll('[data-slot="stack-group-progress"] circle');
        expect(arcs.map((c) => c.attributes('data-part'))).toEqual(['ready', 'waiting']);
        expect(Number(arcs[0]!.attributes('stroke-dasharray')!.split(' ')[0])).toBeCloseTo(200 / 3);
        expect(Number(arcs[1]!.attributes('stroke-dashoffset'))).toBeCloseTo(-200 / 3);
    });

    it('says so when a card has no PRs', async () => {
        const { wrapper } = await mountView(dashboardState());

        await wrapper.getComponent(DashboardCard).trigger('click');
        expect(wrapper.text()).toContain('No pull requests here.');
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
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(9);
    });

    it('says so when every card is hidden', async () => {
        const { wrapper } = await mountView(
            dashboardState({
                hiddenCards: [
                    'review',
                    'changes',
                    'ready',
                    'failing',
                    'conflicts',
                    'open',
                    'stale',
                    'merged',
                    'drafts',
                ],
            })
        );
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(0);
        expect(wrapper.text()).toContain('Every card is hidden.');
    });

    // Opens the header's "..." menu and returns its item with the given data-slot
    // (teleported to the body).
    async function moreItem(wrapper: VueWrapper, slot: string) {
        await wrapper.get('[data-slot="dashboard-more"]').trigger('click');
        await flushPromises();
        return document.querySelector(`[data-slot="${slot}"]`) as HTMLElement;
    }

    it('refreshes through the store from the "..." menu', async () => {
        const { api, wrapper } = await mountView(dashboardState());

        (await moreItem(wrapper, 'dashboard-refresh')).click();
        await flushPromises();
        expect(api.refreshDashboard).toHaveBeenCalledTimes(1);
    });

    it('rests the refresh item right after a fetch', async () => {
        const fresh = dashboardState();
        fresh.snapshot!.fetchedAt = new Date().toISOString();
        const { api, wrapper } = await mountView(fresh);

        const item = await moreItem(wrapper, 'dashboard-refresh');
        expect(item.hasAttribute('data-disabled')).toBe(true);
        expect(item.textContent).toContain('Refreshed just now');
        item.click();
        await flushPromises();
        expect(api.refreshDashboard).not.toHaveBeenCalled();
    });

    it('spins the "..." trigger while the dashboard loads', async () => {
        const { wrapper } = await mountView(dashboardState());
        const trigger = wrapper.get('[data-slot="dashboard-more"]');
        expect(trigger.find('.lucide-ellipsis, .lucide-more-horizontal').exists()).toBe(true);

        useDashboardStore().loading = true;
        await nextTick();
        expect(trigger.find('.animate-spin').exists()).toBe(true);
    });

    it('keeps the Users filter on the page and sends the rest to the Settings page', async () => {
        const { api, wrapper } = await mountView(dashboardState());

        await wrapper.get('[aria-label="Users"]').trigger('click');
        await flushPromises();
        await nextTick();

        const items = [
            ...document.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]'),
        ] as HTMLElement[];
        expect(items.map((el) => el.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
            'All',
            'me (you)',
        ]);
        items[0]!.click();
        await flushPromises();
        expect(api.setDashboardAuthors).toHaveBeenCalledWith('all');

        (await moreItem(wrapper, 'dashboard-settings')).click();
        await flushPromises();
        expect(useUiStore().mainView).toBe('settings');
        expect(useUiStore().settingsSection).toBe('dashboard');
        wrapper.unmount();
    });

    it('opens a PR through the store when a row is clicked', async () => {
        const pr = dashboardPr({ author: 'ann' });
        const { wrapper } = await mountView(
            dashboardState({ snapshot: dashboardSnapshot({ toReview: [pr] }) })
        );
        const openPr = vi.spyOn(useDashboardStore(), 'openPr').mockImplementation(() => {});

        await wrapper.getComponent(DashboardCard).trigger('click');
        wrapper.getComponent(DashboardPrRow).vm.$emit('open', pr);
        expect(openPr).toHaveBeenCalledWith(pr);
    });

    it('opens a PR on GitHub from its Open in browser button', async () => {
        const pr = dashboardPr({ author: 'ann' });
        const { api, wrapper } = await mountView(
            dashboardState({ snapshot: dashboardSnapshot({ toReview: [pr] }) })
        );

        await wrapper.getComponent(DashboardCard).trigger('click');
        await wrapper.get('[aria-label="Open in browser"]').trigger('click');
        expect(api.openExternal).toHaveBeenCalledWith(pr.url);
    });

    // Back to the overview is the page's job (MoirePage resets the navigation).
    it('reloads when another repository opens', async () => {
        const { api } = await mountView(dashboardState());

        useComparisonStore().repoPath = '/repos/other';
        await flushPromises();

        expect(api.getDashboard).toHaveBeenCalledTimes(2);
    });

    it('steps back from a card to the overview through the history', async () => {
        const { wrapper } = await mountView(dashboardState());
        await wrapper.getComponent(DashboardCard).trigger('click');
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(0);

        useUiStore().goBack();
        await flushPromises();
        expect(wrapper.findAllComponents(DashboardCard)).toHaveLength(9);
    });
});
