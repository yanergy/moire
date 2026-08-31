import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MoirePage from '@/components/pages/MoirePage.vue';
import ToolbarHeader from '@/components/headers/ToolbarHeader.vue';
import MissingBranchNotice from '@/components/headers/MissingBranchNotice.vue';
import FileTreeSidebar from '@/components/sidebar/FileTreeSidebar.vue';
import DiffPane from '@/components/diff/DiffPane.vue';

// The page is a pure layout shell; the children carry their own tests, so stub
// them and assert only that the shell composes the four regions.
const stubs = {
    ToolbarHeader: true,
    MissingBranchNotice: true,
    FileTreeSidebar: true,
    DiffPane: true,
};

describe('MoirePage', () => {
    let pinia: ReturnType<typeof createPinia>;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    it('composes the toolbar, notice, sidebar, and diff pane', () => {
        const wrapper = mount(MoirePage, { global: { plugins: [pinia], stubs } });

        expect(wrapper.findComponent(ToolbarHeader).exists()).toBe(true);
        expect(wrapper.findComponent(MissingBranchNotice).exists()).toBe(true);
        expect(wrapper.findComponent(FileTreeSidebar).exists()).toBe(true);
        expect(wrapper.findComponent(DiffPane).exists()).toBe(true);
    });
});
