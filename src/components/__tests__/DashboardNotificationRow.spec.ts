import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DashboardNotificationRow from '@/components/dashboard/DashboardNotificationRow.vue';
import type { ActivityEntry } from '@/shared/types';

const NOW = Date.parse('2026-10-26T12:00:00Z');

const entry: ActivityEntry = {
    kind: 'changes-requested',
    actor: 'ann',
    at: '2026-10-26T10:00:00Z',
    number: 12,
    title: 'Fix login',
    url: 'https://github.com/o/r/pull/12',
};

describe('DashboardNotificationRow', () => {
    it('shows what happened, the PR and how long ago', () => {
        const wrapper = mount(DashboardNotificationRow, { props: { entry, now: NOW } });

        expect(wrapper.text()).toContain('ann requested changes');
        expect(wrapper.text()).toContain('#12 Fix login');
        expect(wrapper.text()).toContain('2h ago');
        expect(wrapper.find('.bg-moire-changes-fg').exists()).toBe(true);
    });

    it('emits open with the entry when clicked', async () => {
        const wrapper = mount(DashboardNotificationRow, { props: { entry, now: NOW } });

        await wrapper.get('button').trigger('click');
        expect(wrapper.emitted('open')).toEqual([[entry]]);
    });
});
