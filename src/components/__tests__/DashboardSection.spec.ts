import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DashboardSection from '@/components/dashboard/DashboardSection.vue';

describe('DashboardSection', () => {
    it('renders the title, the count and the slotted rows', () => {
        const wrapper = mount(DashboardSection, {
            props: { title: 'To review', count: 2 },
            slots: { default: '<div class="row">a</div><div class="row">b</div>' },
        });

        expect(wrapper.get('h2').text()).toBe('To review 2');
        expect(wrapper.findAll('.row')).toHaveLength(2);
    });
});
