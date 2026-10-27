import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import NotificationRow from '@/components/headers/NotificationRow.vue';
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

describe('NotificationRow', () => {
    it('shows what happened, the PR and how long ago', () => {
        const wrapper = mount(NotificationRow, { props: { entry, now: NOW } });

        expect(wrapper.text()).toContain('ann requested changes');
        expect(wrapper.text()).toContain('#12 Fix login');
        expect(wrapper.text()).toContain('2h ago');
        expect(wrapper.find('.bg-moire-changes-fg').exists()).toBe(true);
    });

    it('emits open with the entry when clicked', async () => {
        const wrapper = mount(NotificationRow, { props: { entry, now: NOW } });

        await wrapper.findAll('button')[0]!.trigger('click');
        expect(wrapper.emitted('open')).toEqual([[entry]]);
    });

    it('offers Mark as read and Delete, emitting the entry', async () => {
        const wrapper = mount(NotificationRow, { props: { entry, now: NOW } });

        await wrapper.get('[aria-label="Mark as read"]').trigger('click');
        await wrapper.get('[aria-label="Delete notification"]').trigger('click');

        expect(wrapper.emitted('markRead')).toEqual([[entry]]);
        expect(wrapper.emitted('delete')).toEqual([[entry]]);
        expect(wrapper.emitted('open')).toBeUndefined();
    });

    it('fades a read notification and drops Mark as read', () => {
        const wrapper = mount(NotificationRow, {
            props: { entry: { ...entry, read: true }, now: NOW },
        });

        expect(wrapper.find('[aria-label="Mark as read"]').exists()).toBe(false);
        expect(wrapper.find('.opacity-40').exists()).toBe(true);
        expect(wrapper.text()).toContain('ann requested changes');
        expect(wrapper.find('span.text-moire-muted').text()).toBe('ann requested changes');
    });

    it('always shows Open in browser at the end of the row', async () => {
        const wrapper = mount(NotificationRow, { props: { entry, now: NOW } });
        const button = wrapper.get('[aria-label="Open in browser"]');

        expect(button.element.parentElement).toBe(wrapper.element);
        expect(wrapper.element.lastElementChild).toBe(button.element);

        await button.trigger('click');
        expect(wrapper.emitted('openInBrowser')).toEqual([[entry]]);
        expect(wrapper.emitted('open')).toBeUndefined();
    });

    it('colors the Delete icon red', () => {
        const wrapper = mount(NotificationRow, { props: { entry, now: NOW } });
        const classes = wrapper.get('[aria-label="Delete notification"]').classes();

        expect(classes).toContain('text-moire-status-d');
        expect(classes).not.toContain('text-moire-muted');
    });
});
