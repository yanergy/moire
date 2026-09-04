import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PrView from '@/components/pr/PrView.vue';
import { useComparisonStore } from '@/stores/comparison';
import type { PrStatus, PullRequest } from '@/shared/types';

const PR: PullRequest = {
    number: 42,
    title: 'Cross-file navigation',
    body: '## Summary\nDoes things.',
    state: 'OPEN',
    isDraft: false,
    author: 's.trivedi',
    url: 'https://github.com/o/r/pull/42',
    baseRefName: 'main',
    headRefName: 'feature',
    createdAt: '',
};

// The reka-ui scroll area needs layout machinery jsdom lacks; a passthrough keeps
// the content assertions readable without it.
const stubs = { ScrollArea: { template: '<div><slot /></div>' } };

function mountWith(pr: PullRequest | null, status: PrStatus = 'ok') {
    const store = useComparisonStore();
    store.pullRequest = pr;
    store.prStatus = status;
    return mount(PrView, { global: { stubs } });
}

describe('PrView', () => {
    beforeEach(() => setActivePinia(createPinia()));
    afterEach(() => {
        delete window.api;
    });

    it('renders the PR header, refs, and description', () => {
        const text = mountWith(PR).text();
        expect(text).toContain('Cross-file navigation');
        expect(text).toContain('#42');
        expect(text).toContain('Open');
        expect(text).toContain('s.trivedi');
        expect(text).toContain('main');
        expect(text).toContain('feature');
        expect(text).toContain('Does things.');
    });

    it('shows up to two author initials in the avatar', () => {
        expect(mountWith(PR).text()).toContain('ST'); // s.trivedi -> ST
    });

    it('labels a draft and a merged PR', () => {
        expect(mountWith({ ...PR, isDraft: true }).text()).toContain('Draft');
        expect(mountWith({ ...PR, state: 'MERGED' }).text()).toContain('Merged');
    });

    it('notes when the PR has no description', () => {
        expect(mountWith({ ...PR, body: '   ' }).text()).toContain('No description provided');
    });

    it('opens the PR on GitHub through the bridge', async () => {
        const openExternal = vi.fn<(url: string) => Promise<void>>();
        window.api = { openExternal } as unknown as Window['api'];

        const wrapper = mountWith(PR);
        const ghButton = wrapper.findAll('button').find((b) => b.text().includes('GitHub'))!;
        await ghButton.trigger('click');

        expect(openExternal).toHaveBeenCalledWith('https://github.com/o/r/pull/42');
    });

    it('renders nothing when there is no PR', () => {
        expect(mountWith(null, 'no-pr').text()).toBe('');
    });
});
