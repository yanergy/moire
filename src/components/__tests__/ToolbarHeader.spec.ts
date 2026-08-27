import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Moon, Sun } from '@lucide/vue';
import ToolbarHeader from '@/components/headers/ToolbarHeader.vue';
import { useUiStore } from '@/stores/ui';

// The toolbar composes controls (RepoPicker, RefSelector, SegmentedToggle) that
// reach the electron bridge or teleport their content and carry their own
// tests. Stub them here and exercise the piece ToolbarHeader owns directly:
// the theme toggle that used to live in the removed title bar.
const stubs = { RepoPicker: true, RefSelector: true, SegmentedToggle: true };

describe('ToolbarHeader', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
        document.documentElement.classList.remove('dark');
    });

    function mountToolbar() {
        return mount(ToolbarHeader, { global: { plugins: [pinia], stubs } });
    }

    it('shows the sun icon while the dark theme is active', () => {
        const wrapper = mountToolbar();
        expect(wrapper.findComponent(Sun).exists()).toBe(true);
        expect(wrapper.findComponent(Moon).exists()).toBe(false);
    });

    it('toggles the theme when the theme button is clicked', async () => {
        const wrapper = mountToolbar();
        const ui = useUiStore();

        await wrapper.get('button[aria-label="Toggle theme"]').trigger('click');
        expect(ui.theme).toBe('light');
        expect(wrapper.findComponent(Moon).exists()).toBe(true);
    });
});
