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
    additions: 12,
    deletions: 4,
    changedFiles: 3,
    commitCount: 2,
    comments: [],
    labels: [],
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: '',
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

    it('renders the header, refs, and the description as the first entry', () => {
        const text = mountWith(PR).text();
        expect(text).toContain('Cross-file navigation');
        expect(text).toContain('#42');
        expect(text).toContain('s.trivedi');
        expect(text).toContain('opened the description');
        expect(text).toContain('main');
        expect(text).toContain('feature');
        expect(text).toContain('Does things.');
    });

    it('shows up to two author initials in the avatar', () => {
        expect(mountWith(PR).text()).toContain('ST'); // s.trivedi -> ST
    });

    it('shows the change stats and commit count', () => {
        const text = mountWith(PR).text();
        expect(text).toContain('+12');
        expect(text).toContain('3 files');
        expect(text).toContain('wants to merge 2 commits into');
    });

    it('shows the opened date ahead of the change stats', () => {
        const text = mountWith({ ...PR, createdAt: '2026-08-28T12:00:00Z' }).text();
        expect(text).toMatch(/Opened \w+ \d+/);
        // The date reads before the additions.
        expect(text.indexOf('Opened')).toBeLessThan(text.indexOf('+12'));
    });

    it('omits the opened date when the timestamp is missing', () => {
        expect(mountWith({ ...PR, createdAt: '' }).text()).not.toMatch(/Opened \w+ \d+/);
    });

    it('renders the conversation with comments and review verdicts', () => {
        const now = new Date().toISOString();
        const wrapper = mountWith({
            ...PR,
            comments: [
                { author: 'bob', body: 'Nice **work**.', createdAt: now, kind: 'comment' },
                { author: 'ann', body: '', createdAt: now, kind: 'review', state: 'APPROVED' },
            ],
        });
        const text = wrapper.text();
        expect(text).toContain('bob');
        expect(text).toContain('commented');
        expect(text).toContain('ann');
        expect(text).toContain('approved these changes');
        // The comment body renders as Markdown.
        expect(wrapper.find('.pr-markdown strong').exists()).toBe(true);
    });

    it('still shows the description when there are no comments', () => {
        expect(mountWith({ ...PR, comments: [] }).text()).toContain('opened the description');
    });

    it('renders labels as colored pills', () => {
        const wrapper = mountWith({
            ...PR,
            labels: [{ name: 'enhancement', color: 'a2eeef', description: 'New feature' }],
        });
        const pill = wrapper.findAll('span').find((s) => s.text() === 'enhancement');
        expect(pill).toBeTruthy();
        expect(pill!.attributes('style')).toMatch(/background-color/);
    });

    it('shows a merge-status box reflecting mergeability', () => {
        expect(mountWith(PR).text()).toContain('no conflicts with the base branch');
        expect(mountWith({ ...PR, mergeable: 'CONFLICTING' }).text()).toContain(
            'conflicts that must be resolved'
        );
        expect(mountWith({ ...PR, isDraft: true }).text()).toContain('still a draft');
        expect(mountWith({ ...PR, state: 'MERGED' }).text()).toContain('Merged');
        // Unknown mergeability shows no box.
        expect(mountWith({ ...PR, mergeable: 'UNKNOWN' }).text()).not.toContain('no conflicts');
    });

    it('shows a changes-requested box, even when otherwise mergeable', () => {
        const text = mountWith({ ...PR, reviewDecision: 'CHANGES_REQUESTED' }).text();
        expect(text).toContain('Changes requested');
        // It wins over the plain "no conflicts" box.
        expect(text).not.toContain('no conflicts with the base branch');
        // A hard conflict still takes precedence.
        expect(
            mountWith({
                ...PR,
                reviewDecision: 'CHANGES_REQUESTED',
                mergeable: 'CONFLICTING',
            }).text()
        ).toContain('conflicts that must be resolved');
    });

    it('lets changes-requested override the draft box but keeps the dashed outline', () => {
        const wrapper = mountWith({
            ...PR,
            isDraft: true,
            reviewDecision: 'CHANGES_REQUESTED',
        });
        const text = wrapper.text();
        // The yellow changes-requested box replaces the "still a draft" box.
        expect(text).toContain('Changes requested');
        expect(text).not.toContain('still a draft');
        // The status box keeps the dashed outline that always marks a draft.
        const box = wrapper.find('.border.rounded-lg');
        expect(box.classes()).toContain('border-dashed');
        expect(box.classes()).toContain('bg-moire-changes');
    });

    it('keeps the plain draft box when no changes are requested', () => {
        const text = mountWith({ ...PR, isDraft: true, reviewDecision: '' }).text();
        expect(text).toContain('still a draft');
        expect(text).not.toContain('Changes requested');
    });

    it('renders the description as Markdown', () => {
        const wrapper = mountWith({
            ...PR,
            body: '## Heading\n\nA **para** with [a link](https://x.dev).',
        });
        expect(wrapper.find('.pr-markdown h2').exists()).toBe(true);
        expect(wrapper.find('.pr-markdown strong').text()).toBe('para');
        expect(wrapper.find('.pr-markdown a').attributes('href')).toBe('https://x.dev');
    });

    it('opens a description link in the browser instead of navigating', async () => {
        const openExternal = vi.fn<(url: string) => Promise<void>>();
        window.api = { openExternal } as unknown as Window['api'];

        const wrapper = mountWith({ ...PR, body: '[a link](https://x.dev)' });
        await wrapper.find('.pr-markdown a').trigger('click');

        expect(openExternal).toHaveBeenCalledWith('https://x.dev');
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
