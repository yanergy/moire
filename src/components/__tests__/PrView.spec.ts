import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrView from '@/components/pr/PrView.vue';
import { useComparisonStore } from '@/stores/comparison';
import type { PrComment, PrStatus, PullRequest } from '@/shared/types';

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
    checks: [],
};

// The reka-ui scroll area needs layout machinery jsdom lacks; a passthrough keeps
// the content assertions readable without it.
const stubs = { ScrollArea: { template: '<div><slot /></div>' } };

// `attach` mounts into document.body so the Popover menus (Refresh/GitHub and the
// per-comment Edit/Delete), which teleport their content there, can be opened and
// their items queried, as in RepoPicker's tests.
function mountWith(pr: PullRequest | null, status: PrStatus = 'ok', attach = false) {
    const store = useComparisonStore();
    store.pullRequest = pr;
    store.prStatus = status;
    return mount(PrView, { attachTo: attach ? document.body : undefined, global: { stubs } });
}

// The menu items are teleported to document.body, so they are found there, not in
// the wrapper. Match on the visible label (or the item's aria-label).
const menuItems = () =>
    [...document.querySelectorAll('[data-slot="command-item"]')] as HTMLElement[];
function clickMenuItem(label: string) {
    menuItems()
        .find((el) => el.getAttribute('aria-label') === label || el.textContent?.trim() === label)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// A minimal check fixture in the given state.
type CheckState = 'success' | 'failure' | 'pending';
const check = (state: CheckState) => ({ name: state, state, detail: '', url: '' });

// A conversation entry with the required id/canEdit defaults filled in; override
// any field (e.g. canEdit/id for the edit-mode tests) via the partial.
const comment = (over: Partial<PrComment> = {}): PrComment => ({
    author: 'bob',
    body: 'Nice work.',
    createdAt: new Date().toISOString(),
    kind: 'comment',
    id: '',
    canEdit: false,
    ...over,
});

describe('PrView', () => {
    beforeEach(() => setActivePinia(createPinia()));
    afterEach(() => {
        delete window.api;
        // Clear any menu content teleported to the body between tests.
        document.body.innerHTML = '';
    });

    it('renders the header, refs, and the description as the first entry', () => {
        const text = mountWith(PR).text();
        expect(text).toContain('Cross-file navigation');
        expect(text).toContain('#42');
        expect(text).toContain('s.trivedi');
        expect(text).toContain('opened this pull request');
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
                comment({ author: 'bob', body: 'Nice **work**.', createdAt: now }),
                comment({
                    author: 'ann',
                    body: '',
                    createdAt: now,
                    kind: 'review',
                    state: 'APPROVED',
                }),
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
        expect(mountWith({ ...PR, comments: [] }).text()).toContain('opened this pull request');
    });

    it('collapses the description to its header when its toggle is clicked', async () => {
        const wrapper = mountWith(PR);

        // The body shows to begin with; the toggle reads as expanded.
        expect(wrapper.text()).toContain('Does things.');
        const toggle = wrapper.get('button[aria-label="Collapse description"]');
        expect(toggle.attributes('aria-expanded')).toBe('true');

        await toggle.trigger('click');

        // Folded: the body is gone and the toggle now offers to expand.
        const expand = wrapper.get('button[aria-label="Expand description"]');
        expect(expand.attributes('aria-expanded')).toBe('false');
        expect(wrapper.text()).not.toContain('Does things.');
    });

    it('offers no description toggle when there is no description', () => {
        const wrapper = mountWith({ ...PR, body: '' });
        expect(wrapper.find('button[aria-label="Collapse description"]').exists()).toBe(false);
        expect(wrapper.text()).toContain('No description provided');
    });

    it('collapses a comment to its header when its toggle is clicked', async () => {
        const now = new Date().toISOString();
        const wrapper = mountWith({
            ...PR,
            comments: [comment({ author: 'bob', body: 'Nice **work**.', createdAt: now })],
        });

        // The body shows to begin with; the toggle reads as expanded.
        expect(wrapper.find('.pr-markdown strong').exists()).toBe(true);
        const toggle = wrapper.get('button[aria-label="Collapse comment"]');
        expect(toggle.attributes('aria-expanded')).toBe('true');

        await toggle.trigger('click');

        // Folded: the body is gone and the toggle now offers to expand.
        const expand = wrapper.get('button[aria-label="Expand comment"]');
        expect(expand.attributes('aria-expanded')).toBe('false');
        expect(wrapper.find('.pr-markdown strong').exists()).toBe(false);
    });

    it('offers no collapse toggle for a comment with no body', () => {
        const now = new Date().toISOString();
        const wrapper = mountWith({
            ...PR,
            comments: [
                comment({
                    author: 'ann',
                    body: '',
                    createdAt: now,
                    kind: 'review',
                    state: 'APPROVED',
                }),
            ],
        });

        expect(wrapper.find('button[aria-label="Collapse comment"]').exists()).toBe(false);
    });

    it('collapses and expands the whole conversation with the tab-bar toggle', async () => {
        const now = new Date().toISOString();
        const wrapper = mountWith({
            ...PR,
            comments: [
                comment({ author: 'bob', body: 'First **point**.', createdAt: now }),
                comment({ author: 'cat', body: 'Second _point_.', createdAt: now }),
            ],
        });

        // The description and both comment bodies render (3 Markdown blocks).
        expect(wrapper.findAll('.pr-markdown').length).toBe(3);

        await wrapper.get('button[aria-label="Collapse all"]').trigger('click');

        // The description folds together with the comments: no bodies remain.
        expect(wrapper.findAll('.pr-markdown').length).toBe(0);
        expect(wrapper.findAll('button[aria-label="Expand comment"]').length).toBe(2);
        expect(wrapper.find('button[aria-label="Expand description"]').exists()).toBe(true);

        // The control flips to expand-all and restores every body.
        await wrapper.get('button[aria-label="Expand all"]').trigger('click');
        expect(wrapper.findAll('.pr-markdown').length).toBe(3);
    });

    it('hides the collapse-all control when nothing can fold', () => {
        const now = new Date().toISOString();
        // No description body and only a body-less review: nothing to fold.
        const wrapper = mountWith({
            ...PR,
            body: '',
            comments: [
                comment({
                    author: 'ann',
                    body: '',
                    createdAt: now,
                    kind: 'review',
                    state: 'APPROVED',
                }),
            ],
        });

        expect(wrapper.find('button[aria-label="Collapse all"]').exists()).toBe(false);
    });

    it('folds the description via collapse-all even with no comments', async () => {
        const wrapper = mountWith({ ...PR, comments: [] }); // PR carries a body
        expect(wrapper.text()).toContain('Does things.');

        await wrapper.get('button[aria-label="Collapse all"]').trigger('click');
        expect(wrapper.text()).not.toContain('Does things.');
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
        const box = wrapper.find('.bg-moire-changes');
        expect(box.exists()).toBe(true);
        expect(box.classes()).toContain('border-dashed');
    });

    it('keeps the plain draft box when no changes are requested', () => {
        const text = mountWith({ ...PR, isDraft: true, reviewDecision: '' }).text();
        expect(text).toContain('still a draft');
        expect(text).not.toContain('Changes requested');
    });

    it('opens on the Conversation tab and switches to Checks', async () => {
        const wrapper = mountWith({
            ...PR,
            checks: [
                { name: 'lint', state: 'success', detail: '32s', url: 'https://x/1' },
                {
                    name: 'e2e / macos',
                    state: 'failure',
                    detail: 'Failed in 4m 06s',
                    url: 'https://x/2',
                },
            ],
        });
        // Conversation is the default; the checks are not shown yet.
        expect(wrapper.text()).toContain('opened this pull request');
        expect(wrapper.text()).not.toContain('lint');

        const checksTab = wrapper.findAll('button').find((b) => b.text().startsWith('Checks'))!;
        await checksTab.trigger('click');

        const text = wrapper.text();
        expect(text).toContain('lint');
        expect(text).toContain('32s');
        expect(text).toContain('e2e / macos');
        expect(text).toContain('Failed in 4m 06s');
        // The conversation is swapped out, not stacked below.
        expect(text).not.toContain('opened this pull request');
    });

    it('shows the passed/total summary on the Checks tab label', () => {
        const wrapper = mountWith({
            ...PR,
            checks: [
                { name: 'a', state: 'success', detail: '', url: '' },
                { name: 'b', state: 'failure', detail: '', url: '' },
                { name: 'c', state: 'success', detail: '', url: '' },
            ],
        });
        const checksTab = wrapper.findAll('button').find((b) => b.text().startsWith('Checks'))!;
        expect(checksTab.text()).toContain('2/3');
    });

    it('shows an empty state on the Checks tab when nothing has run', async () => {
        const wrapper = mountWith({ ...PR, checks: [] });
        const checksTab = wrapper.findAll('button').find((b) => b.text().startsWith('Checks'))!;
        await checksTab.trigger('click');
        expect(wrapper.text()).toContain('No checks have run');
    });

    it('gives each tab its own status box: PR state on Conversation, CI state on Checks', async () => {
        const wrapper = mountWith({
            ...PR,
            checks: [
                { name: 'lint', state: 'success', detail: '32s', url: '' },
                { name: 'e2e', state: 'failure', detail: 'Failed', url: '' },
            ],
        });
        // Conversation shows the PR's merge state, not the checks summary.
        expect(wrapper.text()).toContain('no conflicts with the base branch');
        expect(wrapper.text()).not.toContain('failed');

        const checksTab = wrapper.findAll('button').find((b) => b.text().startsWith('Checks'))!;
        await checksTab.trigger('click');
        const text = wrapper.text();
        // Checks shows the CI summary, not the PR merge box.
        expect(text).toContain('1 check has failed');
        expect(text).not.toContain('no conflicts with the base branch');
    });

    it('marks the Checks tab with a roll-up icon of the checks state', () => {
        const checksTab = (pr: PullRequest) =>
            mountWith(pr)
                .findAll('button')
                .find((b) => b.text().startsWith('Checks'))!;

        // A failure shows the red cross on the tab, even while it is not active.
        const failing = checksTab({
            ...PR,
            checks: [
                { name: 'a', state: 'success', detail: '', url: '' },
                { name: 'b', state: 'failure', detail: '', url: '' },
            ],
        });
        expect(failing.find('svg.lucide-circle-x').exists()).toBe(true);

        // All passing shows the green check.
        const passing = checksTab({
            ...PR,
            checks: [{ name: 'a', state: 'success', detail: '', url: '' }],
        });
        expect(passing.find('svg.lucide-circle-check').exists()).toBe(true);

        // No checks: no icon on the tab.
        expect(
            checksTab({ ...PR, checks: [] })
                .find('svg')
                .exists()
        ).toBe(false);
    });

    it('summarises the checks state: all passed, failing, or still running', async () => {
        const summary = async (states: CheckState[]) => {
            const wrapper = mountWith({ ...PR, checks: states.map(check) });
            await wrapper
                .findAll('button')
                .find((b) => b.text().startsWith('Checks'))!
                .trigger('click');
            return wrapper.text();
        };
        expect(await summary(['success', 'success'])).toContain('All checks have passed');
        expect(await summary(['success', 'failure'])).toContain('1 check has failed');
        expect(await summary(['success', 'pending'])).toContain('1 check is still running');
        // A failure outranks a still-running check.
        expect(await summary(['failure', 'pending'])).toContain('1 check has failed');
    });

    it('opens a check run on GitHub from its Details button', async () => {
        const openExternal = vi.fn<(url: string) => Promise<void>>();
        window.api = { openExternal } as unknown as Window['api'];

        const wrapper = mountWith({
            ...PR,
            checks: [
                { name: 'e2e', state: 'failure', detail: 'Failed', url: 'https://gh/runs/9' },
                { name: 'local', state: 'success', detail: '', url: '' },
            ],
        });
        await wrapper
            .findAll('button')
            .find((b) => b.text().startsWith('Checks'))!
            .trigger('click');

        const detailButtons = wrapper.findAll('button').filter((b) => b.text().includes('Details'));
        // Only the check that has a run URL gets a Details button.
        expect(detailButtons).toHaveLength(1);

        await detailButtons[0]!.trigger('click');
        expect(openExternal).toHaveBeenCalledWith('https://gh/runs/9');
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

    it('opens the PR on GitHub from the overflow menu', async () => {
        const openExternal = vi.fn<(url: string) => Promise<void>>();
        window.api = { openExternal } as unknown as Window['api'];

        const wrapper = mountWith(PR, 'ok', true);
        await wrapper.get('button[aria-label="More actions"]').trigger('click');
        await flushPromises();
        clickMenuItem('Open on GitHub');
        await flushPromises();

        expect(openExternal).toHaveBeenCalledWith('https://github.com/o/r/pull/42');
    });

    it('re-fetches the PR from the overflow menu', async () => {
        const wrapper = mountWith(PR, 'ok', true);
        const store = useComparisonStore();
        const load = vi.spyOn(store, 'loadPullRequest').mockResolvedValue();

        await wrapper.get('button[aria-label="More actions"]').trigger('click');
        await flushPromises();
        clickMenuItem('Refresh');
        await flushPromises();

        // Called with no argument, so the toolbar's PR button keeps its status
        // rather than flashing to a spinner (the range did not change).
        expect(load).toHaveBeenCalledTimes(1);
        expect(load).toHaveBeenCalledWith();
    });

    it('renders nothing when there is no PR', () => {
        expect(mountWith(null, 'no-pr').text()).toBe('');
    });

    describe('edit mode', () => {
        // Turn on edit mode via the header toggle, returning the mounted wrapper.
        // Attaches to the body so the per-comment "..." menu can be opened.
        async function enableEditing(pr: PullRequest) {
            const wrapper = mountWith(pr, 'ok', true);
            await wrapper.get('button[aria-label="Toggle edit mode"]').trigger('click');
            return wrapper;
        }

        it('is read-only by default: no composer, no comment actions', () => {
            const wrapper = mountWith({
                ...PR,
                comments: [comment({ author: 'me', body: 'Mine.', id: 'IC_1', canEdit: true })],
            });

            expect(wrapper.find('textarea').exists()).toBe(false);
            expect(wrapper.find('button[aria-label="Comment actions"]').exists()).toBe(false);
        });

        it('reveals the composer once edit mode is on', async () => {
            const wrapper = await enableEditing({ ...PR, comments: [] });
            expect(wrapper.find('textarea[aria-label="Add a comment"]').exists()).toBe(true);
        });

        it('posts a new comment through the store', async () => {
            const store = useComparisonStore();
            const post = vi.spyOn(store, 'postComment').mockResolvedValue({ ok: true });

            const wrapper = mountWith({ ...PR, comments: [] });
            await wrapper.get('button[aria-label="Toggle edit mode"]').trigger('click');
            await wrapper.get('textarea[aria-label="Add a comment"]').setValue('Looks good');
            const commentBtn = wrapper.findAll('button').find((b) => b.text() === 'Comment')!;
            await commentBtn.trigger('click');
            await flushPromises();

            expect(post).toHaveBeenCalledWith('Looks good');
        });

        it('shows the actions menu only on the viewer’s own comments', async () => {
            const wrapper = await enableEditing({
                ...PR,
                comments: [
                    comment({ author: 'me', body: 'Mine.', id: 'IC_1', canEdit: true }),
                    comment({ author: 'other', body: 'Theirs.', id: 'IC_2', canEdit: false }),
                ],
            });

            expect(wrapper.findAll('button[aria-label="Comment actions"]').length).toBe(1);
        });

        it('edits an own comment through the store', async () => {
            const store = useComparisonStore();
            const edit = vi.spyOn(store, 'editComment').mockResolvedValue({ ok: true });

            const wrapper = await enableEditing({
                ...PR,
                comments: [comment({ author: 'me', body: 'Original.', id: 'IC_1', canEdit: true })],
            });

            await wrapper.get('button[aria-label="Comment actions"]').trigger('click');
            await flushPromises();
            clickMenuItem('Edit comment');
            await flushPromises();

            const editBox = wrapper.get('textarea[aria-label="Edit comment body"]');
            // The editor is seeded with the current body.
            expect((editBox.element as HTMLTextAreaElement).value).toBe('Original.');

            await editBox.setValue('Edited.');
            const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Save')!;
            await saveBtn.trigger('click');
            await flushPromises();

            expect(edit).toHaveBeenCalledWith('IC_1', 'Edited.');
        });

        it('deletes an own comment through the store, after confirming', async () => {
            const store = useComparisonStore();
            const del = vi.spyOn(store, 'deleteComment').mockResolvedValue({ ok: true });

            const wrapper = await enableEditing({
                ...PR,
                comments: [comment({ author: 'me', body: 'Mine.', id: 'IC_1', canEdit: true })],
            });

            await wrapper.get('button[aria-label="Comment actions"]').trigger('click');
            await flushPromises();
            clickMenuItem('Delete comment');
            await flushPromises();

            // The menu click only opens the confirmation modal (teleported to the
            // body, outside the comment); nothing is deleted until it is confirmed.
            expect(document.body.textContent).toContain('This permanently deletes');
            expect(del).not.toHaveBeenCalled();

            const confirmBtn = [...document.querySelectorAll('button')].find(
                (b) => b.textContent?.trim() === 'Delete comment'
            );
            confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flushPromises();

            expect(del).toHaveBeenCalledWith('IC_1');
        });

        it('has no description edit action until edit mode is on', () => {
            const wrapper = mountWith(PR);
            expect(wrapper.find('button[aria-label="Edit description"]').exists()).toBe(false);
        });

        it('edits the description through the store', async () => {
            const store = useComparisonStore();
            const edit = vi.spyOn(store, 'editDescription').mockResolvedValue({ ok: true });

            const wrapper = await enableEditing({ ...PR, body: 'Original body.' });

            await wrapper.get('button[aria-label="Edit description"]').trigger('click');
            const editBox = wrapper.get('textarea[aria-label="Edit description body"]');
            // The editor is seeded with the current body.
            expect((editBox.element as HTMLTextAreaElement).value).toBe('Original body.');

            await editBox.setValue('Rewritten body.');
            const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Save')!;
            await saveBtn.trigger('click');
            await flushPromises();

            expect(edit).toHaveBeenCalledWith('Rewritten body.');
        });
    });
});
