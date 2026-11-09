import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ReviewButton from '@/components/headers/ReviewButton.vue';
import ReviewLinesNotice from '@/components/headers/ReviewLinesNotice.vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { PrReviewThread, PullRequest } from '@/shared/types';
import { stubTooltips } from './fixtures';

stubTooltips();

const PR = {
    id: 'PR_7',
    number: 7,
    baseRefName: 'main',
    headRefName: 'feature',
} as PullRequest;

const pendingThread = (comments: number): PrReviewThread => ({
    id: 'RT_p',
    path: 'src/a.ts',
    line: 3,
    originalLine: null,
    side: 'RIGHT',
    isResolved: false,
    isOutdated: false,
    isPending: true,
    comments: Array.from({ length: comments }, (_, i) => ({
        id: `RC_${i}`,
        author: 'me',
        body: 'hm',
        createdAt: '',
        isPending: true,
        viewerDidAuthor: true,
    })),
});

// The dialog teleports to the body, so its buttons are found there.
function bodyButton(label: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === label
    );
}

describe('ReviewButton', () => {
    let pinia: Pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    // A store on PR #7, its range main...feature, with or without a pending review.
    // The range is set first and let settle, since changing it re-runs the PR lookup
    // (which, with no bridge, clears the PR).
    async function prStore(pending: string | null, viewerIsAuthor = false) {
        const store = useComparisonStore();
        store.base = 'main';
        store.head = 'feature';
        await flushPromises();
        store.prStatus = 'ok';
        store.pullRequest = PR;
        store.reviewState = { pendingReviewId: pending, viewerIsAuthor };
        return store;
    }

    function mountButton() {
        return mount(ReviewButton, { global: { plugins: [pinia] }, attachTo: document.body });
    }

    it('shows nothing without a pull request', () => {
        expect(mountButton().text()).toBe('');
    });

    it('starts a review and goes to the diff to comment', async () => {
        const store = await prStore(null);
        const startReview = vi.spyOn(store, 'startReview').mockResolvedValue({ ok: true });
        const wrapper = mountButton();

        const ui = useUiStore();
        ui.setMainView('pr');

        await wrapper.get('[data-slot="start-review"]').trigger('click');
        await flushPromises();
        expect(startReview).toHaveBeenCalledTimes(1);
        expect(ui.mainView).toBe('diff');
    });

    it('stays on the page when the review could not start', async () => {
        const store = await prStore(null);
        vi.spyOn(store, 'startReview').mockResolvedValue({ ok: false, message: 'Forbidden' });
        const ui = useUiStore();
        ui.setMainView('pr');
        const wrapper = mountButton();

        await wrapper.get('[data-slot="start-review"]').trigger('click');
        await flushPromises();
        expect(ui.mainView).toBe('pr');
    });

    it('counts the pending comments and submits the review with its verdict', async () => {
        const store = await prStore('PRR_1');
        store.reviewThreads = [pendingThread(2)];
        const submitReview = vi.spyOn(store, 'submitReview').mockResolvedValue({ ok: true });
        const wrapper = mountButton();

        const finish = wrapper.get('[data-slot="finish-review"]');
        expect(finish.text()).toContain('2');
        await finish.trigger('click');
        await flushPromises();

        const summary = document.querySelector<HTMLTextAreaElement>(
            '[aria-label="Review summary"]'
        )!;
        summary.value = 'Nice work';
        summary.dispatchEvent(new Event('input'));
        const approve = document.querySelector<HTMLInputElement>('input[value="APPROVE"]')!;
        approve.click();
        bodyButton('Submit review')!.click();
        await flushPromises();

        expect(submitReview).toHaveBeenCalledWith('APPROVE', 'Nice work');
    });

    it('offers only Comment on your own pull request', async () => {
        await prStore('PRR_1', true);
        const wrapper = mountButton();

        await wrapper.get('[data-slot="finish-review"]').trigger('click');
        await flushPromises();

        expect(document.querySelectorAll('input[name="review-event"]')).toHaveLength(1);
        expect(document.body.textContent).toContain('only lets you comment');
    });

    it('discards the review after confirming', async () => {
        const store = await prStore('PRR_1');
        const discardReview = vi.spyOn(store, 'discardReview').mockResolvedValue({ ok: true });
        const wrapper = mountButton();

        await wrapper.get('[data-slot="finish-review"]').trigger('click');
        await flushPromises();
        bodyButton('Discard review')!.click();
        await flushPromises();
        expect(discardReview).not.toHaveBeenCalled();

        bodyButton('Discard')!.click();
        await flushPromises();
        expect(discardReview).toHaveBeenCalledTimes(1);
    });
});

describe('ReviewLinesNotice', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("explains why a pending review can't take line comments here", async () => {
        const store = useComparisonStore();
        store.base = 'main';
        store.head = 'feature';
        await flushPromises();
        store.prStatus = 'ok';
        store.pullRequest = PR;
        store.compareMode = 'direct';
        store.reviewState = { pendingReviewId: 'PRR_1', viewerIsAuthor: false };

        const wrapper = mount(ReviewLinesNotice);
        expect(wrapper.text()).toContain('Line comments are off.');
        expect(wrapper.text()).toContain('merge-base');

        store.compareMode = 'merge-base';
        await flushPromises();
        expect(wrapper.find('[data-slot="review-lines-notice"]').exists()).toBe(false);
    });
});
