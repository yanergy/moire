import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RefSelector from '@/components/RefSelector.vue';
import { useComparisonStore } from '@/stores/comparison';

describe('RefSelector', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    function mountSide(side: 'base' | 'head') {
        return mount(RefSelector, { props: { side }, global: { plugins: [pinia] } });
    }

    it('shows the current ref and opens the popover on click', async () => {
        const wrapper = mountSide('base');
        expect(wrapper.text()).toContain('main');
        expect(wrapper.find('input').exists()).toBe(false);

        await wrapper.find('button').trigger('click');
        expect(wrapper.find('input').exists()).toBe(true);
        expect(wrapper.text()).toContain('Local branches');
        expect(wrapper.text()).toContain('Remotes');
    });

    it('offers the working tree entry only on the head side', async () => {
        const head = mountSide('head');
        await head.find('button').trigger('click');
        expect(head.text()).toContain('Uncommitted');
        expect(head.text()).toContain('WORKING TREE');

        const base = mountSide('base');
        await base.find('button').trigger('click');
        expect(base.text()).not.toContain('Uncommitted');
    });

    it('filters the ref list by the search query', async () => {
        const wrapper = mountSide('base');
        await wrapper.find('button').trigger('click');
        await wrapper.find('input').setValue('feat');

        expect(wrapper.text()).toContain('feat/monaco-spike');
        expect(wrapper.text()).not.toContain('develop');
    });

    it('picks a ref, updates the store, and closes the popover', async () => {
        const wrapper = mountSide('base');
        const store = useComparisonStore();
        await wrapper.find('button').trigger('click');

        const option = wrapper.findAll('button').find((b) => b.text().includes('develop'));
        await option!.trigger('click');

        expect(store.base).toBe('develop');
        expect(wrapper.find('input').exists()).toBe(false);
    });
});
