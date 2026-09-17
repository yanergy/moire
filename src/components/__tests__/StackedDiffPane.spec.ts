import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import StackedDiffPane from '@/components/diff/StackedDiffPane.vue';
import { useComparisonStore } from '@/stores/comparison';
import { CHANGED_FILES } from '@/components/__tests__/fixtures';

// jsdom does no layout and the IntersectionObserver is a no-op stub, so no card
// ever becomes "active" and no editor mounts. That is fine: the pane's job under
// test is the file-to-card mapping and the filter, both from store state, and each
// card's header carries a data-path even off-window.
function cardPaths(wrapper: VueWrapper): (string | undefined)[] {
    return wrapper.findAll('[data-path]').map((el) => el.attributes('data-path'));
}

describe('StackedDiffPane', () => {
    beforeEach(() => setActivePinia(createPinia()));
    afterEach(() => {
        delete window.api;
    });

    it('renders one card per shown file, in display order', () => {
        const store = useComparisonStore();
        store.files = CHANGED_FILES;

        const wrapper = mount(StackedDiffPane);
        expect(cardPaths(wrapper)).toEqual(store.orderedShownFiles.map((f) => f.path));
        expect(cardPaths(wrapper).length).toBe(CHANGED_FILES.length);
    });

    it('narrows the cards to the active filter', () => {
        const store = useComparisonStore();
        store.files = CHANGED_FILES;
        store.setTreeFilter('comparison');

        const wrapper = mount(StackedDiffPane);
        const paths = cardPaths(wrapper);
        expect(paths.length).toBeGreaterThan(0);
        expect(paths.length).toBeLessThan(CHANGED_FILES.length);
        expect(paths.every((p) => p!.includes('comparison'))).toBe(true);
    });

    it('shows an empty hint when the filter matches nothing', () => {
        const store = useComparisonStore();
        store.files = CHANGED_FILES;
        store.setTreeFilter('no-such-file-anywhere');

        const wrapper = mount(StackedDiffPane);
        expect(cardPaths(wrapper)).toEqual([]);
        expect(wrapper.text()).toContain('No files match');
    });
});
