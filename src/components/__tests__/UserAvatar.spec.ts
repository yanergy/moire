import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UserAvatar from '@/components/pr/UserAvatar.vue';

describe('UserAvatar', () => {
    it("loads the login's GitHub avatar image", () => {
        const img = mount(UserAvatar, { props: { login: 's.trivedi' } }).find('img');
        expect(img.exists()).toBe(true);
        expect(img.attributes('src')).toContain('github.com/s.trivedi.png');
    });

    it('falls back to the initials when the image fails', async () => {
        const wrapper = mount(UserAvatar, { props: { login: 's.trivedi' } });
        await wrapper.find('img').trigger('error');
        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.text()).toBe('ST');
    });

    it('gives each user a stable color, the same across mounts', () => {
        const first = mount(UserAvatar, { props: { login: 'alice' } }).attributes('style');
        const again = mount(UserAvatar, { props: { login: 'alice' } }).attributes('style');
        expect(first).toBe(again);
        expect(first).toMatch(/background-color/);
    });

    it('shows a placeholder and no image for an empty login', () => {
        const wrapper = mount(UserAvatar, { props: { login: '' } });
        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.text()).toBe('?');
    });
});
