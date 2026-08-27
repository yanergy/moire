import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolbarHeader from '@/components/headers/ToolbarHeader.vue';
import { useComparisonStore } from '@/stores/comparison';

// The toolbar composes controls (RepoPicker, RefSelector, SegmentedToggle) that
// reach the electron bridge or teleport their content and carry their own tests.
// Stub them here and exercise the piece ToolbarHeader owns directly: the swap
// button. (The theme toggle moved to the native View menu; see tests/menu.spec.ts.)
const stubs = { RepoPicker: true, RefSelector: true, SegmentedToggle: true };

describe('ToolbarHeader', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    function mountToolbar() {
        return mount(ToolbarHeader, { global: { plugins: [pinia], stubs } });
    }

    it('swaps base and head when the swap button is clicked', async () => {
        const wrapper = mountToolbar();
        const comparison = useComparisonStore();
        const swap = vi.spyOn(comparison, 'swap');

        // With the child controls stubbed, the swap button is the first real
        // button in DOM order (the refresh button follows it).
        await wrapper.get('button').trigger('click');
        expect(swap).toHaveBeenCalledTimes(1);
    });
});
