import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import RefSelector from '@/components/controls/RefSelector.vue';
import { useComparisonStore } from '@/stores/comparison';

// The ref picker is a shadcn-vue Popover + Command. Its list is teleported to
// document.body, so assertions query the document rather than the wrapper.
async function open(wrapper: VueWrapper) {
    await wrapper.find('button').trigger('click');
    await flushPromises();
}

const commandInput = () => document.querySelector('[data-slot="command-input"]');
const listText = () => document.body.textContent ?? '';

describe('RefSelector', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    function mountSide(side: 'base' | 'head') {
        return mount(RefSelector, {
            props: { side },
            attachTo: document.body,
            global: { plugins: [pinia] },
        });
    }

    it('shows the current ref and opens the popover on click', async () => {
        const wrapper = mountSide('base');
        expect(wrapper.text()).toContain('main');
        expect(commandInput()).toBeNull();

        await open(wrapper);
        expect(commandInput()).not.toBeNull();
        expect(listText()).toContain('Local branches');
        expect(listText()).toContain('Remotes');
    });

    it('offers the working tree entry only on the head side', async () => {
        const head = mountSide('head');
        await open(head);
        expect(listText()).toContain('Uncommitted');
        expect(listText()).toContain('WORKING TREE');
        head.unmount();
        document.body.innerHTML = '';

        const base = mountSide('base');
        await open(base);
        expect(listText()).not.toContain('Uncommitted');
    });

    it('filters the ref list by the search query', async () => {
        const wrapper = mountSide('base');
        await open(wrapper);

        const input = commandInput() as HTMLInputElement;
        input.value = 'feat';
        input.dispatchEvent(new Event('input'));
        await flushPromises();

        expect(listText()).toContain('feat/monaco-spike');
        expect(listText()).not.toContain('develop');
    });

    it('picks a ref, updates the store, and closes the popover', async () => {
        const wrapper = mountSide('base');
        const store = useComparisonStore();
        await open(wrapper);

        const items = [...document.querySelectorAll('[data-slot="command-item"]')] as HTMLElement[];
        const develop = items.find(
            (el) => el.textContent?.includes('develop') && !el.textContent.includes('origin')
        );
        develop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(store.base).toBe('develop');
        expect(commandInput()).toBeNull();
    });
});
