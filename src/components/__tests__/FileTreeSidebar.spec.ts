import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import FileTreeSidebar from '@/components/sidebar/FileTreeSidebar.vue';
import { useComparisonStore } from '@/stores/comparison';
import { CHANGED_FILES } from '@/components/__tests__/fixtures';

describe('FileTreeSidebar', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    // Tooltip content teleports to document.body; clear it between tests.
    afterEach(() => {
        document.body.innerHTML = '';
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

    it('indents a file one level in from its parent folder', async () => {
        const wrapper = mountTree();
        await flushPromises();
        const fileRow = wrapper.find('div[title="electron/git/parsers.ts"]');

        expect(fileRow.exists()).toBe(true);
        // depth 2 → 16 + 2 * 15 = 46px
        expect(fileRow.attributes('style')).toContain('padding-left: 46px');
    });

    it('reveals a folded folder full path in a tooltip on hover', async () => {
        const store = useComparisonStore();
        store.files = [
            { path: 'root/one.txt', status: 'M', additions: 1, deletions: 0, binary: false },
            { path: 'root/a/b/c/file.txt', status: 'M', additions: 1, deletions: 0, binary: false },
        ];
        const wrapper = mount(FileTreeSidebar, {
            attachTo: document.body,
            global: { plugins: [pinia] },
        });
        await flushPromises();

        // The row shows the folded label a/b/c; the tooltip carries the full
        // path, which appears as visible text only once the tooltip opens.
        const trigger = wrapper
            .findAll('[data-slot="tooltip-trigger"]')
            .find((el) => el.text().includes('a/b/c'));
        expect(document.body.textContent).not.toContain('root/a/b/c');

        await trigger?.trigger('focus');
        await flushPromises();

        expect(document.body.textContent).toContain('root/a/b/c');
    });

    it('shows the rename as old → new in a file row title', async () => {
        const store = useComparisonStore();
        store.files = [
            {
                path: 'src/new.ts',
                oldPath: 'src/old.ts',
                status: 'R',
                additions: 2,
                deletions: 1,
                binary: false,
            },
        ];
        const wrapper = mount(FileTreeSidebar, { global: { plugins: [pinia] } });
        await flushPromises();

        expect(wrapper.find('div[title="src/old.ts → src/new.ts"]').exists()).toBe(true);
    });

    it('selects a file when its row is clicked', async () => {
        const wrapper = mountTree();
        await flushPromises();
        const store = useComparisonStore();

        await wrapper.find('div[title="shared/types.ts"]').trigger('click');
        expect(store.selectedPath).toBe('shared/types.ts');
    });

    it('toggles viewed via the row checkbox without selecting the row', async () => {
        const wrapper = mountTree();
        await flushPromises();
        const store = useComparisonStore();
        const target = 'electron/git/GitService.ts';

        expect(store.isViewed(target)).toBe(false);
        await wrapper.find(`div[title="${target}"]`).find('button').trigger('click');

        expect(store.isViewed(target)).toBe(true);
        expect(store.selectedPath).toBe('electron/git/parsers.ts');
    });

    it('marks a whole folder viewed from its row checkbox', async () => {
        const wrapper = mountTree();
        await flushPromises();
        const store = useComparisonStore();

        expect(store.isViewed('electron/git/parsers.ts')).toBe(false);
        expect(store.isViewed('electron/git/GitService.ts')).toBe(false);

        const folderRow = wrapper
            .findAll('[data-slot="tooltip-trigger"]')
            .find((el) => el.text().includes('git'));
        await folderRow?.find('button').trigger('click');

        expect(store.isViewed('electron/git/parsers.ts')).toBe(true);
        expect(store.isViewed('electron/git/GitService.ts')).toBe(true);
    });

    it('shows folder checkboxes as checked, indeterminate, or empty by tally', async () => {
        const wrapper = mountTree();
        await flushPromises();

        const stateOf = (label: string) =>
            wrapper
                .findAll('[data-slot="tooltip-trigger"]')
                .find((el) => el.text().includes(label))
                ?.find('[data-slot="checkbox"]')
                .attributes('data-state');

        // shared: its one file is viewed. src: 1 of 4 viewed. electron: none viewed.
        expect(stateOf('shared')).toBe('checked');
        expect(stateOf('src')).toBe('indeterminate');
        expect(stateOf('electron')).toBe('unchecked');
    });

    it('toggles all folders from the single header control', async () => {
        const wrapper = mountTree();
        await flushPromises();

        // Starts expanded, so the control collapses and its label flips.
        await wrapper.find('[aria-label="Collapse all"]').trigger('click');
        await flushPromises();
        expect(wrapper.find('div[title="electron/git/parsers.ts"]').exists()).toBe(false);

        // Now fully collapsed, so the same control expands.
        await wrapper.find('[aria-label="Expand all"]').trigger('click');
        await flushPromises();
        expect(wrapper.find('div[title="electron/git/parsers.ts"]').exists()).toBe(true);
    });
});
