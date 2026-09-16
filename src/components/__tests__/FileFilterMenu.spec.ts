import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import FileFilterMenu from '@/components/sidebar/FileFilterMenu.vue';
import { useComparisonStore } from '@/stores/comparison';
import { CHANGED_FILES } from '@/components/__tests__/fixtures';

// The menu content teleports to the body; the top level holds a sub-trigger per
// filter category (its options live in a hover submenu, not tested through jsdom).
const subTriggers = () =>
    [...document.querySelectorAll('[data-slot="dropdown-menu-sub-trigger"]')] as HTMLElement[];
const categoryTrigger = (label: string) =>
    subTriggers().find((el) => el.textContent?.includes(label));

// A check annotation makes the Markers category appear (it is hidden when the change
// set carries no errors, warnings, or comments).
const withAnnotation = () => [
    {
        path: 'electron/git/parsers.ts',
        line: 5,
        level: 'failure' as const,
        title: 'quality-gates',
        message: 'boom',
        url: '',
    },
];

async function openMenu(): Promise<VueWrapper> {
    const wrapper = mount(FileFilterMenu, { attachTo: document.body });
    await wrapper.get('button[aria-label="Filter files"]').trigger('click');
    await flushPromises();
    await nextTick();
    return wrapper;
}

describe('FileFilterMenu', () => {
    beforeEach(() => setActivePinia(createPinia()));
    // The menu teleports content to the body; clear it between tests.
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('opens a tiered menu with a category per available facet', async () => {
        const store = useComparisonStore();
        store.files = CHANGED_FILES;
        store.checkAnnotations = withAnnotation();
        await openMenu();

        expect(categoryTrigger('Filetype')).toBeTruthy();
        expect(categoryTrigger('Mutation type')).toBeTruthy();
        expect(categoryTrigger('Markers')).toBeTruthy();
    });

    it('omits a category whose facet has no options', async () => {
        const store = useComparisonStore();
        store.files = CHANGED_FILES; // no annotations or threads, so no markers
        await openMenu();

        expect(categoryTrigger('Filetype')).toBeTruthy();
        expect(categoryTrigger('Markers')).toBeUndefined();
    });

    it('badges a category with its active-filter count', async () => {
        const store = useComparisonStore();
        store.files = CHANGED_FILES;
        store.toggleExtensionFilter('ts');
        await openMenu();

        // The Filetype category shows a "1" (its one active value); Mutation type,
        // with nothing selected, shows no count.
        expect(categoryTrigger('Filetype')?.textContent).toContain('1');
        expect(
            categoryTrigger('Mutation type')?.textContent?.replace('Mutation type', '')
        ).not.toMatch(/\d/);
    });

    it('accents the trigger (border and text) while filters are active', async () => {
        const store = useComparisonStore();
        store.files = CHANGED_FILES;
        const wrapper = mount(FileFilterMenu, { attachTo: document.body });
        const trigger = () => wrapper.get('button[aria-label="Filter files"]');

        expect(trigger().classes()).not.toContain('border-moire-accent');
        store.toggleStatusFilter('M');
        await nextTick();
        expect(trigger().classes()).toContain('border-moire-accent');
        expect(trigger().classes()).toContain('text-moire-accent');
        wrapper.unmount();
    });

    it('offers a reset cross only while active, and it clears every filter', async () => {
        const store = useComparisonStore();
        store.files = CHANGED_FILES;
        const wrapper = mount(FileFilterMenu, { attachTo: document.body });

        // No cross until a filter is applied.
        expect(wrapper.find('[aria-label="Clear filters"]').exists()).toBe(false);

        store.toggleStatusFilter('M');
        store.toggleExtensionFilter('ts');
        await nextTick();

        const reset = wrapper.find('[aria-label="Clear filters"]');
        expect(reset.exists()).toBe(true);
        await reset.trigger('click');
        expect(store.activeFilterCount).toBe(0);
        wrapper.unmount();
    });

    it('shows an empty note when there is nothing to filter', async () => {
        const store = useComparisonStore();
        store.files = [];
        await openMenu();

        expect(document.body.textContent).toContain('No files to filter.');
        expect(subTriggers()).toHaveLength(0);
    });
});
