import { afterEach, describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MarkdownPreview from '@/components/diff/MarkdownPreview.vue';

describe('MarkdownPreview', () => {
    afterEach(() => {
        delete window.api;
    });

    it('renders the old and new versions side by side', () => {
        const wrapper = mount(MarkdownPreview, {
            props: { oldSource: '# Before', newSource: '# After' },
        });

        expect(wrapper.find('[data-side="old"]').html()).toContain('<h1>Before</h1>');
        expect(wrapper.find('[data-side="new"]').html()).toContain('<h1>After</h1>');
    });

    it('shows only the existing side for an added file', () => {
        const wrapper = mount(MarkdownPreview, { props: { oldSource: null, newSource: 'new' } });

        expect(wrapper.find('[data-side="old"]').exists()).toBe(false);
        expect(wrapper.find('[data-side="new"]').text()).toBe('new');
    });

    it('shows only the existing side for a deleted file', () => {
        const wrapper = mount(MarkdownPreview, { props: { oldSource: 'old', newSource: null } });

        expect(wrapper.find('[data-side="old"]').text()).toBe('old');
        expect(wrapper.find('[data-side="new"]').exists()).toBe(false);
    });

    it('opens a web link in the browser', async () => {
        const openExternal = vi.fn<(url: string) => Promise<void>>();
        window.api = { openExternal } as unknown as Window['api'];
        const wrapper = mount(MarkdownPreview, {
            props: { oldSource: null, newSource: '[site](https://example.com)' },
        });

        await wrapper.find('a').trigger('click');
        expect(openExternal).toHaveBeenCalledWith('https://example.com');
    });

    it('ignores a relative link into the repository', async () => {
        const openExternal = vi.fn<(url: string) => Promise<void>>();
        window.api = { openExternal } as unknown as Window['api'];
        const wrapper = mount(MarkdownPreview, {
            props: { oldSource: null, newSource: '[docs](./docs/setup.md)' },
        });

        await wrapper.find('a').trigger('click');
        expect(openExternal).not.toHaveBeenCalled();
    });

    it('sanitizes the rendered file', () => {
        const wrapper = mount(MarkdownPreview, {
            props: {
                oldSource: null,
                newSource: '<script>alert(1)</script><img src=x onerror=alert(1)>',
            },
        });

        expect(wrapper.html()).not.toContain('<script');
        expect(wrapper.html()).not.toContain('onerror');
    });
});
