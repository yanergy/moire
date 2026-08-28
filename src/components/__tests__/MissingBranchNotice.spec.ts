import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MissingBranchNotice from '@/components/headers/MissingBranchNotice.vue';
import { useComparisonStore } from '@/stores/comparison';

describe('MissingBranchNotice', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('renders nothing while no branch has disappeared', () => {
        const wrapper = mount(MissingBranchNotice);
        expect(wrapper.find('div').exists()).toBe(false);
    });

    it('names a single disappeared branch', async () => {
        const store = useComparisonStore();
        store.disappearedBranches = ['feature/x'];
        const wrapper = mount(MissingBranchNotice);
        await nextTick();

        expect(wrapper.text()).toContain('Branch “feature/x” has disappeared since last time.');
    });

    it('names several disappeared branches', async () => {
        const store = useComparisonStore();
        store.disappearedBranches = ['old-base', 'old-head'];
        const wrapper = mount(MissingBranchNotice);
        await nextTick();

        expect(wrapper.text()).toContain(
            'Branches “old-base” and “old-head” have disappeared since last time.'
        );
    });

    it('dismisses the notice on the close button', async () => {
        const store = useComparisonStore();
        store.disappearedBranches = ['feature/x'];
        const wrapper = mount(MissingBranchNotice);
        await nextTick();

        await wrapper.find('button[aria-label="Dismiss"]').trigger('click');
        expect(store.disappearedBranches).toEqual([]);
        await nextTick();
        expect(wrapper.find('div').exists()).toBe(false);
    });
});
