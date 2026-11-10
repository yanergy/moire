import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SettingsView from '@/components/settings/SettingsView.vue';
import BranchPicker from '@/components/controls/BranchPicker.vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { DashboardState, NotificationSettingsChange } from '@/shared/types';
import { dashboardState, notificationSettings, stubTooltips } from './fixtures';

stubTooltips();

function stubApi(state: DashboardState) {
    const api = {
        getDashboardState: vi.fn<() => Promise<DashboardState>>().mockResolvedValue(state),
        setNotificationSettings: vi
            .fn<(change: NotificationSettingsChange) => Promise<DashboardState>>()
            .mockResolvedValue(state),
        setDashboardShowDrafts: vi
            .fn<(show: boolean) => Promise<DashboardState>>()
            .mockResolvedValue(state),
        setDashboardHiddenCards: vi
            .fn<(keys: string[]) => Promise<DashboardState>>()
            .mockResolvedValue(state),
        setRepoBranches: vi
            .fn<(path: string, settings: unknown) => Promise<void>>()
            .mockResolvedValue(undefined),
        setStickyPrHeader: vi.fn<(enabled: boolean) => Promise<void>>().mockResolvedValue(),
    };
    window.api = api as unknown as Window['api'];
    return api;
}

function checkbox(wrapper: ReturnType<typeof mount>, text: string) {
    const row = wrapper.findAll('label').find((label) => label.text().trim() === text);
    return row!.get('[data-slot="checkbox"]');
}

// The comparison store with a repository open on main.
function openRepo() {
    const comparison = useComparisonStore();
    comparison.repoPath = '/repos/moire';
    comparison.repoName = 'moire';
    comparison.branches = [
        { name: 'main', kind: 'local', isCurrent: true },
        { name: 'origin/main', kind: 'remote', isDefault: true },
        { name: 'origin/develop', kind: 'remote' },
    ];
    return comparison;
}

// The header's save status text.
function status(wrapper: ReturnType<typeof mount>) {
    return wrapper.get('[data-slot="save-status"]').text();
}

// The side menu's section buttons.
function navItems(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('[data-slot="settings-nav-item"]');
}

describe('SettingsView', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    afterEach(() => {
        delete window.api;
    });

    async function mountView() {
        const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
        await flushPromises();
        return wrapper;
    }

    it('asks for a repository when none is open', async () => {
        const wrapper = await mountView();

        expect(wrapper.text()).toContain('Open a repository to change its settings.');
        expect(wrapper.findComponent(BranchPicker).exists()).toBe(false);
    });

    it('says the settings apply to the open repository only, and loads them', async () => {
        const api = stubApi(dashboardState());
        openRepo();
        const wrapper = await mountView();

        expect(wrapper.text()).toContain(
            'Unless a section says otherwise, these settings apply to moire only'
        );
        expect(api.getDashboardState).toHaveBeenCalledTimes(1);
    });

    it('prefills the detected branches and saves a pick for the repository', async () => {
        const api = stubApi(dashboardState());
        const comparison = openRepo();
        const wrapper = await mountView();

        const [main, development] = wrapper.findAllComponents(BranchPicker);
        expect(main!.props('value')).toBe('origin/main');
        expect(development!.props('value')).toBe('origin/develop');
        expect(wrapper.text()).toContain('detected');

        development!.vm.$emit('select', null);
        expect(comparison.branchRoles.development).toBeUndefined();
        expect(api.setRepoBranches).toHaveBeenCalledWith('/repos/moire', { development: null });

        main!.vm.$emit('select', 'main');
        expect(api.setRepoBranches).toHaveBeenLastCalledWith('/repos/moire', {
            development: null,
            main: 'main',
        });
    });

    it('changes the notification settings, the dock badge included', async () => {
        const api = stubApi(dashboardState());
        openRepo();
        const wrapper = await mountView();

        await checkbox(wrapper, 'Show the unread count on the dock icon').trigger('click');
        expect(api.setNotificationSettings).toHaveBeenCalledWith({ dockBadge: false });

        await checkbox(wrapper, 'Enable notifications').trigger('click');
        expect(api.setNotificationSettings).toHaveBeenLastCalledWith({ enabled: false });
    });

    it('disables the per event toggles while notifications are off', async () => {
        stubApi(dashboardState({ notifications: notificationSettings({ enabled: false }) }));
        openRepo();
        const wrapper = await mountView();

        expect(checkbox(wrapper, 'Enable notifications').attributes('disabled')).toBeUndefined();
        expect(checkbox(wrapper, 'Approved').attributes('disabled')).toBeDefined();
    });

    it('changes the dashboard drafts and cards', async () => {
        const api = stubApi(dashboardState());
        openRepo();
        const wrapper = await mountView();

        await checkbox(wrapper, 'Include draft PRs').trigger('click');
        expect(api.setDashboardShowDrafts).toHaveBeenCalledWith(false);

        await checkbox(wrapper, 'Stale').trigger('click');
        expect(api.setDashboardHiddenCards).toHaveBeenCalledWith(['stale']);
    });

    it('turns the sticky PR header off and on again, sticky by default', async () => {
        const api = stubApi(dashboardState());
        openRepo();
        const ui = useUiStore();
        const wrapper = await mountView();

        const box = wrapper.get('[data-slot="sticky-pr-header"]');
        expect(box.attributes('data-state')).toBe('checked');

        await box.trigger('click');
        expect(ui.stickyPrHeader).toBe(false);
        expect(api.setStickyPrHeader).toHaveBeenLastCalledWith(false);

        await box.trigger('click');
        expect(ui.stickyPrHeader).toBe(true);
        expect(api.setStickyPrHeader).toHaveBeenLastCalledWith(true);
    });

    describe('side menu', () => {
        beforeEach(() => {
            Element.prototype.scrollIntoView =
                vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
            vi.useFakeTimers();
        });
        afterEach(() => vi.useRealTimers());

        it('lists the sections, Branches active first', async () => {
            stubApi(dashboardState());
            openRepo();
            const wrapper = await mountView();

            expect(navItems(wrapper).map((item) => item.text())).toEqual([
                'Branches',
                'Notifications',
                'Dashboard',
                'PR view',
            ]);
            expect(navItems(wrapper)[0]!.attributes('aria-current')).toBe('true');
        });

        it('scrolls to a clicked section and outlines it for a moment', async () => {
            stubApi(dashboardState());
            openRepo();
            const wrapper = await mountView();
            const section = wrapper.findAll('section')[1]!;

            await navItems(wrapper)[1]!.trigger('click');
            expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
                block: 'start',
                behavior: 'smooth',
            });
            expect(navItems(wrapper)[1]!.attributes('aria-current')).toBe('true');
            expect(navItems(wrapper)[0]!.attributes('aria-current')).toBeUndefined();
            expect(section.classes()).toContain('ring-2');

            await vi.advanceTimersByTimeAsync(1200);
            expect(section.classes()).not.toContain('ring-2');
        });

        it('has no side menu without a repository', async () => {
            const wrapper = await mountView();

            expect(navItems(wrapper)).toHaveLength(0);
        });
    });

    describe('save status', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        it('shows Saving… while a change is written, then All changes saved', async () => {
            stubApi(dashboardState());
            openRepo();
            const wrapper = await mountView();
            expect(status(wrapper)).toBe('');

            await checkbox(wrapper, 'Include draft PRs').trigger('click');
            expect(status(wrapper)).toBe('Saving…');

            await vi.advanceTimersByTimeAsync(400);
            expect(status(wrapper)).toBe('All changes saved');
        });

        it('says so when a change could not be saved', async () => {
            const api = stubApi(dashboardState());
            api.setDashboardShowDrafts.mockRejectedValue(new Error('disk full'));
            openRepo();
            const wrapper = await mountView();

            await checkbox(wrapper, 'Include draft PRs').trigger('click');
            await vi.advanceTimersByTimeAsync(400);
            expect(status(wrapper)).toBe("Couldn't save the last change");
        });
    });
});
