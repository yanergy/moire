import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import DiffPlaceholder from '@/components/diff/DiffPlaceholder.vue';

const StubIcon = defineComponent({
    setup() {
        return () => h('svg', { class: 'stub-icon' });
    },
});

describe('DiffPlaceholder', () => {
    it('renders the icon, title, subtitle, and slot content', () => {
        const wrapper = mount(DiffPlaceholder, {
            props: { icon: StubIcon, title: 'Big file', subtitle: 'Slow to render' },
            slots: { default: '<button>Do it</button>' },
        });

        expect(wrapper.find('.stub-icon').exists()).toBe(true);
        expect(wrapper.text()).toContain('Big file');
        expect(wrapper.text()).toContain('Slow to render');
        expect(wrapper.find('button').text()).toBe('Do it');
    });

    it('omits the subtitle line when none is given', () => {
        const wrapper = mount(DiffPlaceholder, {
            props: { icon: StubIcon, title: 'Just a title' },
        });

        expect(wrapper.text()).toContain('Just a title');
        expect(wrapper.findAll('p')).toHaveLength(1);
    });
});
