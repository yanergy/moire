import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FileTreeSidebar from '@/components/sidebar/FileTreeSidebar.vue';
import { useComparisonStore } from '@/stores/comparison';
import { CHANGED_FILES } from '@/components/__tests__/fixtures';

describe('FileTreeSidebar', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    // The store starts empty (no repo open), so seed the change set and a couple
    // of viewed files the way a repo open would before mounting the tree.
    function mountTree() {
        const store = useComparisonStore();
        store.files = CHANGED_FILES;
        store.selectFile('electron/git/parsers.ts');
        store.toggleViewed('shared/types.ts');
        store.toggleViewed('src/stores/comparison.ts');
        return mount(FileTreeSidebar, { global: { plugins: [pinia] } });
    }

    it('renders the header with count and viewed tally', () => {
        const wrapper = mountTree();
        expect(wrapper.text()).toContain('Changed files');
        expect(wrapper.text()).toContain('10');
        expect(wrapper.text()).toContain('2 viewed');
    });

    it('indents a file one level in from its parent folder', () => {
        const wrapper = mountTree();
        const fileRow = wrapper.find('div[title="electron/git/parsers.ts"]');

        expect(fileRow.exists()).toBe(true);
        // depth 2 → 8 + 2 * 15 = 38px
        expect(fileRow.attributes('style')).toContain('padding-left: 38px');
    });

    it('selects a file when its row is clicked', async () => {
        const wrapper = mountTree();
        const store = useComparisonStore();

        await wrapper.find('div[title="shared/types.ts"]').trigger('click');
        expect(store.selectedPath).toBe('shared/types.ts');
    });

    it('toggles viewed via the row checkbox without selecting the row', async () => {
        const wrapper = mountTree();
        const store = useComparisonStore();
        const target = 'electron/git/GitService.ts';

        expect(store.isViewed(target)).toBe(false);
        await wrapper.find(`div[title="${target}"]`).find('button').trigger('click');

        expect(store.isViewed(target)).toBe(true);
        expect(store.selectedPath).toBe('electron/git/parsers.ts');
    });

    it('toggles all folders from the single header control', async () => {
        const wrapper = mountTree();

        // Starts expanded, so the control collapses and its label flips.
        await wrapper.find('[aria-label="Collapse all"]').trigger('click');
        expect(wrapper.find('div[title="electron/git/parsers.ts"]').exists()).toBe(false);

        // Now fully collapsed, so the same control expands.
        await wrapper.find('[aria-label="Expand all"]').trigger('click');
        expect(wrapper.find('div[title="electron/git/parsers.ts"]').exists()).toBe(true);
    });
});
