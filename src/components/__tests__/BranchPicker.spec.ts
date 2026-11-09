import { afterEach, describe, it, expect } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import BranchPicker from '@/components/controls/BranchPicker.vue';
import type { BranchInfo } from '@/shared/types';

const BRANCHES: BranchInfo[] = [
    { name: 'main', kind: 'local', isCurrent: true },
    { name: 'origin/main', kind: 'remote' },
    { name: 'origin/develop', kind: 'remote' },
];

function mountPicker(props: { value: string | null; allowNone?: boolean }) {
    return mount(BranchPicker, {
        props: { branches: BRANCHES, label: 'Development branch', ...props },
        attachTo: document.body,
    });
}

async function open(wrapper: ReturnType<typeof mountPicker>) {
    await wrapper.get('[aria-label="Development branch"]').trigger('click');
    await flushPromises();
}

function itemTexts(): string[] {
    return [...document.querySelectorAll('[data-slot="command-item"]')].map(
        (el) => el.textContent?.trim() ?? ''
    );
}

function item(text: string): HTMLElement {
    return [...document.querySelectorAll<HTMLElement>('[data-slot="command-item"]')].find(
        (el) => el.textContent?.trim() === text
    )!;
}

describe('BranchPicker', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('shows the picked branch, or None', () => {
        expect(mountPicker({ value: 'origin/develop' }).text()).toContain('origin/develop');
        expect(mountPicker({ value: null }).text()).toContain('None');
    });

    it('lists the local branches, then the remote ones, and emits the pick', async () => {
        const wrapper = mountPicker({ value: 'origin/develop' });
        await open(wrapper);

        expect(itemTexts()).toEqual(['main', 'origin/main', 'origin/develop']);
        item('origin/main').click();
        await flushPromises();
        expect(wrapper.emitted('select')).toEqual([['origin/main']]);
    });

    it('offers None first when allowed, emitting null', async () => {
        const wrapper = mountPicker({ value: 'origin/develop', allowNone: true });
        await open(wrapper);

        expect(itemTexts()[0]).toBe('None');
        item('None').click();
        await flushPromises();
        expect(wrapper.emitted('select')).toEqual([[null]]);
    });
});
