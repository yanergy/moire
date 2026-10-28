import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import NotificationSettings from '@/components/headers/NotificationSettings.vue';
import { useDashboardStore } from '@/stores/dashboard';
import { dashboardState, notificationSettings } from './fixtures';
import type { NotificationSettings as Settings } from '@/shared/types';

// The checkbox in the row with the given label.
function checkbox(wrapper: VueWrapper, label: string) {
    const row = wrapper.findAll('label').find((l) => l.text() === label);
    return row!.get('button[role="checkbox"]');
}

describe('NotificationSettings', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    function mountSettings(settings: Settings | null) {
        const dashboard = useDashboardStore();
        dashboard.applyState(dashboardState());
        dashboard.notificationSettings = settings;
        const set = vi.spyOn(dashboard, 'setNotificationSettings').mockResolvedValue(undefined);
        const wrapper = mount(NotificationSettings, { global: { plugins: [pinia] } });
        return { wrapper, set };
    }

    it('lists the master switch, the drafts toggle and every notification type', () => {
        const { wrapper } = mountSettings(notificationSettings());
        const labels = wrapper.findAll('label').map((l) => l.text());

        expect(labels).toEqual([
            'GitHub notifications',
            'Notify about draft PRs',
            'Review requested',
            'Changes requested',
            'Closed without merge',
            'Checks failed',
            'Approved',
            'Merge conflict',
            'Ready to merge',
            'Merged by someone else',
        ]);
        expect(checkbox(wrapper, 'Approved').attributes('data-state')).toBe('checked');
        expect(checkbox(wrapper, 'Ready to merge').attributes('data-state')).toBe('unchecked');
    });

    it('sends each toggle as its own change', async () => {
        const { wrapper, set } = mountSettings(notificationSettings());

        await checkbox(wrapper, 'Ready to merge').trigger('click');
        expect(set).toHaveBeenLastCalledWith({ events: { 'ready-to-merge': true } });

        await checkbox(wrapper, 'Notify about draft PRs').trigger('click');
        expect(set).toHaveBeenLastCalledWith({ notifyDrafts: false });

        await checkbox(wrapper, 'GitHub notifications').trigger('click');
        expect(set).toHaveBeenLastCalledWith({ enabled: false });
    });

    it('disables everything but the master switch while notifications are off', () => {
        const { wrapper } = mountSettings(notificationSettings({ enabled: false }));

        expect(checkbox(wrapper, 'GitHub notifications').attributes('disabled')).toBeUndefined();
        expect(checkbox(wrapper, 'Notify about draft PRs').attributes('disabled')).toBeDefined();
        expect(checkbox(wrapper, 'Approved').attributes('disabled')).toBeDefined();
    });

    it('says it is loading before the settings arrive', () => {
        const { wrapper } = mountSettings(null);
        expect(wrapper.text()).toBe('Loading the notification settings…');
    });
});
