import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Moon, Sun } from '@lucide/vue';
import TitleBarHeader from '@/components/headers/TitleBarHeader.vue';
import { useUiStore } from '@/stores/ui';
import { MOCK_REPO_NAME } from '@/lib/mock';

describe('TitleBarHeader', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
        document.documentElement.classList.remove('dark');
    });

    it('shows the repo name and the sun icon while dark', () => {
        const wrapper = mount(TitleBarHeader, { global: { plugins: [pinia] } });
        expect(wrapper.text()).toContain(MOCK_REPO_NAME);
        expect(wrapper.findComponent(Sun).exists()).toBe(true);
        expect(wrapper.findComponent(Moon).exists()).toBe(false);
    });

    it('toggles the theme when the button is clicked', async () => {
        const wrapper = mount(TitleBarHeader, { global: { plugins: [pinia] } });
        const ui = useUiStore();

        await wrapper.find('button').trigger('click');
        expect(ui.theme).toBe('light');
        expect(wrapper.findComponent(Moon).exists()).toBe(true);
    });
});
