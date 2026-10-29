import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import NotificationSettingsMenu from '@/components/notifications/NotificationSettingsMenu.vue';
import { useDashboardStore } from '@/stores/dashboard';
import { dashboardState, notificationSettings } from './fixtures';
import type { NotificationSettings as Settings } from '@/shared/types';

// The menu's checkbox items, which teleport to the body.
function items() {
    return [...document.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-checkbox-item"]')];
}

function item(label: string) {
    return items().find((el) => el.textContent?.trim() === label)!;
}

describe('NotificationSettingsMenu', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    // Attached so the menu, which teleports to the body, can open.
    async function openMenu(settings: Settings | null) {
        const dashboard = useDashboardStore();
        dashboard.applyState(dashboardState());
        dashboard.notificationSettings = settings;
        const set = vi.spyOn(dashboard, 'setNotificationSettings').mockResolvedValue(undefined);
        const wrapper = mount(NotificationSettingsMenu, {
            global: { plugins: [pinia] },
            attachTo: document.body,
        });
        await wrapper.get('[aria-label="Notification settings"]').trigger('click');
        await flushPromises();
        await nextTick();
        return { wrapper, set };
    }

    it('lists the master switch, the drafts toggle and every notification type', async () => {
        const { wrapper } = await openMenu(notificationSettings());

        expect(items().map((el) => el.textContent?.trim())).toEqual([
            'Enable notifications',
            'Notify about draft PRs',
            'Review requested',
            'Changes requested',
            'Closed without merge',
            'Checks failed',
            'Approved',
            'Merge conflict',
            'Ready to merge',
            'Merged by someone else',
            'New comments',
        ]);
        expect(document.body.textContent).toContain('Notify me when');
        expect(item('Approved').getAttribute('data-state')).toBe('checked');
        expect(item('Ready to merge').getAttribute('data-state')).toBe('unchecked');
        wrapper.unmount();
    });

    it('sends each toggle as its own change and stays open', async () => {
        const { wrapper, set } = await openMenu(notificationSettings());

        item('Ready to merge').click();
        await flushPromises();
        expect(set).toHaveBeenLastCalledWith({ events: { 'ready-to-merge': true } });
        expect(items()).toHaveLength(11);

        item('Notify about draft PRs').click();
        await flushPromises();
        expect(set).toHaveBeenLastCalledWith({ notifyDrafts: false });

        item('Enable notifications').click();
        await flushPromises();
        expect(set).toHaveBeenLastCalledWith({ enabled: false });
        wrapper.unmount();
    });

    it('disables everything but the master switch while notifications are off', async () => {
        const { wrapper } = await openMenu(notificationSettings({ enabled: false }));

        expect(item('Enable notifications').hasAttribute('data-disabled')).toBe(false);
        expect(item('Notify about draft PRs').hasAttribute('data-disabled')).toBe(true);
        expect(item('Approved').hasAttribute('data-disabled')).toBe(true);
        wrapper.unmount();
    });

    it('says it is loading before the settings arrive', async () => {
        const { wrapper } = await openMenu(null);
        expect(items()).toHaveLength(0);
        expect(document.body.textContent).toContain('Loading the notification settings…');
        wrapper.unmount();
    });
});
