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
const headings = () =>
    [...document.querySelectorAll('[data-slot="ref-group-label"]')].map((el) =>
        el.textContent?.trim()
    );

const groupHeader = (label: string) =>
    [...document.querySelectorAll('[data-slot="ref-group-label"]')]
        .find((el) => el.textContent?.trim() === label)
        ?.closest('[data-slot="ref-group-header"]') as HTMLElement | undefined;

const commandItem = (fullName: string) =>
    document.querySelector(`span[title="${fullName}"]`)?.closest('[data-slot="command-item"]');

const toggleAllButton = () =>
    document.querySelector('[aria-label$="all groups"]') as HTMLElement | null;

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

    it('shows the current ref and groups branches by prefix on open', async () => {
        const wrapper = mountSide('base');
        expect(wrapper.text()).toContain('main');
        expect(commandInput()).toBeNull();

        await open(wrapper);
        expect(commandInput()).not.toBeNull();
        // Flat branches stay under "Local branches"; prefixed ones get a heading
        // per prefix, with remotes under their remote name.
        expect(headings()).toEqual(
            expect.arrayContaining(['Local branches', 'feat', 'fix', 'release', 'origin'])
        );
        // A grouped branch is displayed as its leaf under the prefix heading.
        const label = document.querySelector(
            '[data-slot="command-item"] span[title="feat/monaco-spike"]'
        );
        expect(label?.textContent).toBe('monaco-spike');
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

    it('filters the ref list by the search query, matching the full path', async () => {
        const wrapper = mountSide('base');
        await open(wrapper);

        const input = commandInput() as HTMLInputElement;
        input.value = 'feat';
        input.dispatchEvent(new Event('input'));
        await flushPromises();

        // The query matches the full ref (feat/monaco-spike), shown as its leaf.
        expect(listText()).toContain('monaco-spike');
        expect(listText()).not.toContain('develop');
    });

    it('picks a grouped ref by its full name and closes the popover', async () => {
        const wrapper = mountSide('base');
        const store = useComparisonStore();
        await open(wrapper);

        const items = [...document.querySelectorAll('[data-slot="command-item"]')] as HTMLElement[];
        const monaco = items.find((el) => el.textContent?.includes('monaco-spike'));
        monaco?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushPromises();

        expect(store.base).toBe('feat/monaco-spike');
        expect(commandInput()).toBeNull();
    });

    it('collapses and expands a group when its header is clicked', async () => {
        const wrapper = mountSide('base');
        await open(wrapper);
        expect(commandItem('feat/monaco-spike')?.classList.contains('hidden')).toBe(false);

        groupHeader('feat')?.click();
        await flushPromises();
        expect(commandItem('feat/monaco-spike')?.classList.contains('hidden')).toBe(true);

        groupHeader('feat')?.click();
        await flushPromises();
        expect(commandItem('feat/monaco-spike')?.classList.contains('hidden')).toBe(false);
    });

    it('keeps a collapsed group searchable, revealing matches on query', async () => {
        const wrapper = mountSide('base');
        await open(wrapper);

        groupHeader('feat')?.click();
        await flushPromises();
        expect(commandItem('feat/monaco-spike')?.classList.contains('hidden')).toBe(true);

        const input = commandInput() as HTMLInputElement;
        input.value = 'monaco';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await flushPromises();

        expect(commandItem('feat/monaco-spike')?.classList.contains('hidden')).toBe(false);
    });

    it('collapses and expands every group with the toggle-all button', async () => {
        const wrapper = mountSide('base');
        await open(wrapper);

        expect(commandItem('main')?.classList.contains('hidden')).toBe(false);
        expect(commandItem('feat/monaco-spike')?.classList.contains('hidden')).toBe(false);

        toggleAllButton()?.click();
        await flushPromises();
        expect(commandItem('main')?.classList.contains('hidden')).toBe(true);
        expect(commandItem('feat/monaco-spike')?.classList.contains('hidden')).toBe(true);

        toggleAllButton()?.click();
        await flushPromises();
        expect(commandItem('main')?.classList.contains('hidden')).toBe(false);
        expect(commandItem('feat/monaco-spike')?.classList.contains('hidden')).toBe(false);
    });
});
