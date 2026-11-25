import { afterEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import MarkdownPreview from '@/components/diff/MarkdownPreview.vue';

describe('MarkdownPreview', () => {
    afterEach(() => {
        delete window.api;
    });

    it('renders the old and new versions side by side', () => {
        const wrapper = mount(MarkdownPreview, {
            props: { oldSource: '# Before', newSource: '# After' },
        });

        expect(wrapper.get('[data-side="old"] h1').text()).toBe('Before');
        expect(wrapper.get('[data-side="new"] h1').text()).toBe('After');
    });

    it('tints the blocks that changed between the two versions', () => {
        const wrapper = mount(MarkdownPreview, {
            props: { oldSource: 'Same.\n\nBefore.', newSource: 'Same.\n\nAfter.' },
        });

        expect(wrapper.get('[data-side="old"] .pr-md-removed').text()).toBe('Before.');
        expect(wrapper.get('[data-side="new"] .pr-md-added').text()).toBe('After.');
    });

    it('tints nothing for an added file', () => {
        const wrapper = mount(MarkdownPreview, { props: { oldSource: null, newSource: 'New.' } });
        expect(wrapper.find('.pr-md-added').exists()).toBe(false);
    });

    describe('change navigation', () => {
        const props = {
            oldSource: 'One.\n\nTwo.\n\nThree.\n\nFour.',
            newSource: 'One.\n\nTWO.\n\nThree.\n\nFOUR.',
        };
        const current = (wrapper: ReturnType<typeof mount>) =>
            wrapper.findAll('.pr-md-current').map((el) => el.text());

        it('reports the number of changes', async () => {
            const wrapper = mount(MarkdownPreview, { props });
            await flushPromises();
            expect(wrapper.emitted('update:changeCount')![0]).toEqual([2]);
            expect(current(wrapper)).toEqual([]);
        });

        it('steps through the changes, marking both sides, and stops at the ends', async () => {
            const wrapper = mount(MarkdownPreview, { props });
            await flushPromises();
            const vm = wrapper.vm as unknown as { next(): boolean; prev(): boolean };

            expect(vm.next()).toBe(true);
            expect(current(wrapper)).toEqual(['Two.', 'TWO.']);
            expect(vm.next()).toBe(true);
            expect(current(wrapper)).toEqual(['Four.', 'FOUR.']);
            expect(vm.next()).toBe(false);

            expect(vm.prev()).toBe(true);
            expect(current(wrapper)).toEqual(['Two.', 'TWO.']);
            expect(vm.prev()).toBe(false);
        });

        it('lands on a pending edge from a cross-file step', async () => {
            const wrapper = mount(MarkdownPreview, { props: { ...props, pendingEdge: 'last' } });
            await flushPromises();
            expect(current(wrapper)).toEqual(['Four.', 'FOUR.']);
            expect(wrapper.emitted('edgeConsumed')).toHaveLength(1);
        });
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
