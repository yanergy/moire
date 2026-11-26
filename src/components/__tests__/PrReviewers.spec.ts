import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import type { ReviewActivity } from '@/lib/review-activity';
import { stubTooltips } from './fixtures';

stubTooltips();
import PrReviewers from '@/components/pr/PrReviewers.vue';
import type { PrReviewer } from '@/shared/types';

const reviewers: PrReviewer[] = [
    { login: 'ann', kind: 'user', state: 'APPROVED', previousState: null },
    { login: 'bob', kind: 'user', state: 'CHANGES_REQUESTED', previousState: null },
    { login: 'core', kind: 'team', state: 'PENDING', previousState: null },
];

describe('PrReviewers', () => {
    it('unfolds a reviewer to their comments, each with a jump to it', async () => {
        const items: ReviewActivity[] = [
            {
                key: 'entry:2',
                kind: 'review',
                state: 'APPROVED',
                preview: 'Ship it',
                createdAt: '',
                target: { entry: 2 },
            },
            {
                key: 'comment:RC_1',
                kind: 'line',
                path: 'src/a.ts',
                preview: 'this can race',
                createdAt: '',
                target: { thread: 'RT_1' },
            },
        ];
        const wrapper = mount(PrReviewers, {
            props: { reviewers, activity: new Map([['ann', items]]) },
        });

        const rows = wrapper.findAll('[data-slot="reviewer-row"]');
        // Only a reviewer with activity folds; it starts folded.
        expect(rows[0]!.element.tagName).toBe('BUTTON');
        expect(rows[0]!.attributes('aria-expanded')).toBe('false');
        expect(rows[0]!.text()).toContain('2 comments');
        expect(rows[1]!.element.tagName).toBe('DIV');
        expect(wrapper.find('[data-slot="reviewer-activity"]').exists()).toBe(false);

        await rows[0]!.trigger('click');
        const shown = wrapper.findAll('[data-slot="reviewer-activity"]');
        expect(shown.map((r) => r.text())).toEqual([
            expect.stringContaining('Approved'),
            expect.stringContaining('src/a.ts'),
        ]);
        expect(shown[1]!.text()).toContain('this can race');

        await shown[1]!.trigger('click');
        expect(wrapper.emitted('jump')).toEqual([[{ thread: 'RT_1' }]]);
    });

    it('shows a re-requested reviewer as awaiting review, with their earlier verdict after it', () => {
        const wrapper = mount(PrReviewers, {
            props: {
                reviewers: [
                    {
                        login: 'ann',
                        kind: 'user',
                        state: 'PENDING',
                        previousState: 'CHANGES_REQUESTED',
                    },
                ],
            },
        });

        const row = wrapper.get('[data-slot="reviewer"]');
        expect(row.text()).toContain('Awaiting review');
        expect(row.get('[data-slot="previous-state"]').text()).toBe(
            '· previously requested changes'
        );
        // It counts as pending only, not as an open change request.
        expect(wrapper.get('[data-slot="review-summary"]').text()).toBe('0/1 approved · 1 pending');
    });

    it('shows the progress summary and one row per reviewer with its state', () => {
        const wrapper = mount(PrReviewers, { props: { reviewers } });

        expect(wrapper.get('[data-slot="review-summary"]').text()).toBe(
            '1/3 approved · 1 requested changes · 1 pending'
        );
        const rows = wrapper.findAll('[data-slot="reviewer"]');
        expect(rows.map((r) => r.attributes('data-state'))).toEqual([
            'APPROVED',
            'CHANGES_REQUESTED',
            'PENDING',
        ]);
        expect(rows[0]!.text()).toContain('ann');
        expect(rows[0]!.text()).toContain('Approved');
        expect(rows[1]!.text()).toContain('Requested changes');
        expect(rows[2]!.text()).toContain('core');
        expect(rows[2]!.text()).toContain('team');
        expect(rows[2]!.text()).toContain('Awaiting review');
    });

    it('offers a re-request button only on a user who requested changes, when allowed', async () => {
        const wrapper = mount(PrReviewers, { props: { reviewers, canRequest: true } });

        const buttons = wrapper.findAll('[data-slot="rerequest-review"]');
        expect(buttons).toHaveLength(1);
        expect(buttons[0]!.attributes('aria-label')).toBe('Re-request review from bob');

        await buttons[0]!.trigger('click');
        expect(wrapper.emitted('request')).toEqual([['bob']]);
    });

    it('hides the re-request button when the viewer cannot request reviewers', () => {
        const wrapper = mount(PrReviewers, { props: { reviewers, canRequest: false } });

        expect(wrapper.find('[data-slot="rerequest-review"]').exists()).toBe(false);
    });

    it('hides the button once the request is pending again', () => {
        const wrapper = mount(PrReviewers, {
            props: {
                reviewers: [
                    {
                        login: 'bob',
                        kind: 'user',
                        state: 'PENDING',
                        previousState: 'CHANGES_REQUESTED',
                    },
                ],
                canRequest: true,
            },
        });

        expect(wrapper.find('[data-slot="rerequest-review"]').exists()).toBe(false);
    });

    it('shows a pending state on the button and blocks a second request while one runs', () => {
        const wrapper = mount(PrReviewers, {
            props: { reviewers, canRequest: true, requesting: 'bob' },
        });

        const button = wrapper.get('[data-slot="rerequest-review"]');
        expect(button.attributes('disabled')).toBeDefined();
        expect(button.find('.animate-spin').exists()).toBe(true);
    });

    it('shows GitHub refusing the request on the reviewer row', () => {
        const wrapper = mount(PrReviewers, {
            props: {
                reviewers,
                canRequest: true,
                requestError: { login: 'bob', message: 'Could not request review.' },
            },
        });

        const error = wrapper.get('[data-slot="request-error"]');
        expect(error.text()).toBe('Could not request review.');
        expect(wrapper.findAll('[data-slot="reviewer"]')[1]!.text()).toContain(
            'Could not request review.'
        );
    });

    it('shows an empty state without reviewers', () => {
        const wrapper = mount(PrReviewers, { props: { reviewers: [] } });
        expect(wrapper.text()).toContain('No reviewers requested yet.');
    });
});
