import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import FileTreeSidebar from '@/components/sidebar/FileTreeSidebar.vue';
import { useComparisonStore } from '@/stores/comparison';
import { CHANGED_FILES } from '@/components/__tests__/fixtures';

describe('FileTreeSidebar', () => {
    let pinia: Pinia;
    let wrapper: VueWrapper | null = null;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    // Unmount first so no pending scroller/tooltip re-render patches into a wiped
    // DOM, then clear the teleported tooltip content and the persisted width so one
    // test can't leak into the next.
    afterEach(() => {
        wrapper?.unmount();
        wrapper = null;
        document.body.innerHTML = '';
        try {
            localStorage.clear();
        } catch {
            // ignore
        }
    });

    // The store starts empty (no repo open), so seed the change set and a couple
    // of viewed files the way a repo open would before mounting the tree.
    function mountTree() {
        const store = useComparisonStore();
        store.files = CHANGED_FILES;
        store.selectFile('electron/git/parsers.ts');
        store.toggleViewed('shared/types.ts');
        store.toggleViewed('src/stores/comparison.ts');
        wrapper = mount(FileTreeSidebar, { global: { plugins: [pinia] } });
        return wrapper;
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
        const fileRow = wrapper.find('[data-path="electron/git/parsers.ts"]');

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
        wrapper = mount(FileTreeSidebar, {
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

    it('reveals a rename as old → new in the file row tooltip on hover', async () => {
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
        wrapper = mount(FileTreeSidebar, {
            attachTo: document.body,
            global: { plugins: [pinia] },
        });
        await flushPromises();

        // The row shows only the new basename; the full old → new path is in the
        // tooltip, which becomes visible text only once it opens.
        expect(document.body.textContent).not.toContain('src/old.ts → src/new.ts');

        await wrapper.find('[data-path="src/new.ts"]').trigger('focus');
        await flushPromises();

        expect(document.body.textContent).toContain('src/old.ts → src/new.ts');
    });

    it('selects a file when its row is clicked', async () => {
        const wrapper = mountTree();
        await flushPromises();
        const store = useComparisonStore();

        await wrapper.find('[data-path="shared/types.ts"]').trigger('click');
        expect(store.selectedPath).toBe('shared/types.ts');
    });

    it('selects a file when its row receives Enter (keyboard)', async () => {
        const wrapper = mountTree();
        await flushPromises();
        const store = useComparisonStore();

        await wrapper.find('[data-path="shared/types.ts"]').trigger('keydown', { key: 'Enter' });
        expect(store.selectedPath).toBe('shared/types.ts');
    });

    it('collapses a folder when its row receives Space (keyboard)', async () => {
        const wrapper = mountTree();
        await flushPromises();
        expect(wrapper.find('[data-path="electron/git/parsers.ts"]').exists()).toBe(true);

        const folderRow = wrapper
            .findAll('[data-slot="tooltip-trigger"]')
            .find((el) => el.text().includes('git'));
        await folderRow?.trigger('keydown', { key: ' ' });
        await flushPromises();

        expect(wrapper.find('[data-path="electron/git/parsers.ts"]').exists()).toBe(false);
    });

    it('resizes the sidebar when its border handle is dragged, clamping to the max', async () => {
        const wrapper = mountTree();
        await flushPromises();

        const handle = wrapper.find('[aria-label="Resize sidebar"]');
        const sidebar = handle.element.parentElement as HTMLElement;
        expect(sidebar.style.width).toBe('312px'); // default

        // clientX is read-only on the event, so dispatch through the constructor
        // rather than test-utils' trigger, which assigns props onto the event.
        handle.element.dispatchEvent(
            new MouseEvent('pointerdown', { clientX: 312, bubbles: true, cancelable: true })
        );
        window.dispatchEvent(new MouseEvent('pointermove', { clientX: 412 }));
        await nextTick();
        expect(sidebar.style.width).toBe('412px');

        // Dragging past the maximum clamps rather than growing without bound.
        window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1200 }));
        await nextTick();
        expect(sidebar.style.width).toBe('640px');

        window.dispatchEvent(new MouseEvent('pointerup'));
    });

    it('ignores key events that bubble up from the row checkbox', async () => {
        const wrapper = mountTree();
        await flushPromises();
        const store = useComparisonStore();

        // A key on a row's checkbox must not also fire the row's select action.
        const checkbox = wrapper.find('[data-path="shared/types.ts"]').find('button');
        await checkbox.trigger('keydown', { key: 'Enter' });

        expect(store.selectedPath).toBe('electron/git/parsers.ts'); // unchanged
    });

    it('toggles viewed via the row checkbox without selecting the row', async () => {
        const wrapper = mountTree();
        await flushPromises();
        const store = useComparisonStore();
        const target = 'electron/git/GitService.ts';

        expect(store.isViewed(target)).toBe(false);
        await wrapper.find(`[data-path="${target}"]`).find('button').trigger('click');

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
        expect(wrapper.find('[data-path="electron/git/parsers.ts"]').exists()).toBe(false);

        // Now fully collapsed, so the same control expands.
        await wrapper.find('[aria-label="Expand all"]').trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-path="electron/git/parsers.ts"]').exists()).toBe(true);
    });
});
