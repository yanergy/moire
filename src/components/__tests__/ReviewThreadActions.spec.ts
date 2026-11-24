import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ReviewThreadActions from '@/components/pr/ReviewThreadActions.vue';
import { useComparisonStore } from '@/stores/comparison';
import type { CommentMutationResult, PrReviewThread } from '@/shared/types';

const thread = (over: Partial<PrReviewThread> = {}): PrReviewThread => ({
    id: 'RT_1',
    path: 'README.md',
    line: 3,
    originalLine: null,
    side: 'RIGHT',
    isResolved: false,
    isOutdated: false,
    isPending: false,
    reviewId: 'PRR_1',
    diffHunk: '',
    comments: [],
    ...over,
});

type Reply = (threadId: string, body: string) => Promise<CommentMutationResult>;
type Resolve = (threadId: string, resolved: boolean) => Promise<CommentMutationResult>;

function setup(over: Partial<PrReviewThread> = {}) {
    const store = useComparisonStore();
    const reply = vi.fn<Reply>().mockResolvedValue({ ok: true });
    const resolve = vi.fn<Resolve>().mockResolvedValue({ ok: true });
    store.replyToReviewThread = reply;
    store.setReviewThreadResolved = resolve;
    const wrapper = mount(ReviewThreadActions, { props: { thread: thread(over) } });
    return { wrapper, reply, resolve };
}

describe('ReviewThreadActions', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('opens the reply box and posts the reply to the thread', async () => {
        const { wrapper, reply } = setup();
        expect(wrapper.find('textarea').exists()).toBe(false);

        await wrapper.get('[data-slot="thread-reply-open"]').trigger('click');
        await wrapper.get('textarea').setValue('  Fixed in the next commit  ');
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Reply')!
            .trigger('click');
        await flushPromises();

        expect(reply).toHaveBeenCalledWith('RT_1', 'Fixed in the next commit');
        // Posted: the box folds back to the field-like button.
        expect(wrapper.find('textarea').exists()).toBe(false);
    });

    it('posts with Cmd+Enter and cancels with Escape', async () => {
        const { wrapper, reply } = setup();
        await wrapper.get('[data-slot="thread-reply-open"]').trigger('click');
        await wrapper.get('textarea').setValue('ok');
        await wrapper.get('textarea').trigger('keydown', { key: 'Enter', metaKey: true });
        await flushPromises();
        expect(reply).toHaveBeenCalledWith('RT_1', 'ok');

        await wrapper.get('[data-slot="thread-reply-open"]').trigger('click');
        await wrapper.get('textarea').setValue('draft');
        await wrapper.get('textarea').trigger('keydown', { key: 'Escape' });
        expect(wrapper.find('textarea').exists()).toBe(false);
    });

    it('keeps the draft and shows the error inline when posting fails', async () => {
        const { wrapper, reply } = setup();
        reply.mockResolvedValue({ ok: false, message: 'You do not have write access.' });

        await wrapper.get('[data-slot="thread-reply-open"]').trigger('click');
        await wrapper.get('textarea').setValue('hello');
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Reply')!
            .trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-slot="thread-error"]').text()).toBe(
            'You do not have write access.'
        );
        expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('hello');
    });

    it('resolves an open thread and reports the new state', async () => {
        const { wrapper, resolve } = setup();
        const button = wrapper.get('[data-slot="thread-resolve"]');
        expect(button.text()).toBe('Resolve conversation');

        await button.trigger('click');
        await flushPromises();

        expect(resolve).toHaveBeenCalledWith('RT_1', true);
        expect(wrapper.emitted('resolvedChange')).toEqual([[true]]);
    });

    it('unresolves a resolved thread', async () => {
        const { wrapper, resolve } = setup({ isResolved: true });
        const button = wrapper.get('[data-slot="thread-resolve"]');
        expect(button.text()).toBe('Unresolve conversation');

        await button.trigger('click');
        await flushPromises();

        expect(resolve).toHaveBeenCalledWith('RT_1', false);
        expect(wrapper.emitted('resolvedChange')).toEqual([[false]]);
    });

    it('shows a failed resolve inline and reports no change', async () => {
        const { wrapper, resolve } = setup();
        resolve.mockResolvedValue({ ok: false, message: 'Network error' });

        await wrapper.get('[data-slot="thread-resolve"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-slot="thread-error"]').text()).toBe('Network error');
        expect(wrapper.emitted('resolvedChange')).toBeUndefined();
    });
});
