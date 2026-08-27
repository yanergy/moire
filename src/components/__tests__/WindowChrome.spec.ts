import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Moon, Sun } from '@lucide/vue';
import WindowChrome from '@/components/WindowChrome.vue';
import { useUiStore } from '@/stores/ui';

describe('WindowChrome', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
        document.documentElement.classList.remove('dark');
    });

    it('shows the repo name and the sun icon while dark', () => {
        const wrapper = mount(WindowChrome, { global: { plugins: [pinia] } });
        expect(wrapper.text()).toContain('diff-viewer');
        expect(wrapper.findComponent(Sun).exists()).toBe(true);
        expect(wrapper.findComponent(Moon).exists()).toBe(false);
    });

    it('toggles the theme when the button is clicked', async () => {
        const wrapper = mount(WindowChrome, { global: { plugins: [pinia] } });
        const ui = useUiStore();

        await wrapper.find('button').trigger('click');
        expect(ui.theme).toBe('light');
        expect(wrapper.findComponent(Moon).exists()).toBe(true);
    });
});
