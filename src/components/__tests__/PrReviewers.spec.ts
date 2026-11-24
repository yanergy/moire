import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrReviewers from '@/components/pr/PrReviewers.vue';
import type { PrReviewer } from '@/shared/types';

const reviewers: PrReviewer[] = [
    { login: 'ann', kind: 'user', state: 'APPROVED', rerequested: false },
    { login: 'bob', kind: 'user', state: 'CHANGES_REQUESTED', rerequested: false },
    { login: 'core', kind: 'team', state: 'PENDING', rerequested: false },
];

describe('PrReviewers', () => {
    it('adds "re-requested" after a re-requested reviewer\'s verdict', () => {
        const wrapper = mount(PrReviewers, {
            props: {
                reviewers: [{ login: 'ann', kind: 'user', state: 'APPROVED', rerequested: true }],
            },
        });

        const row = wrapper.get('[data-slot="reviewer"]');
        expect(row.text()).toContain('Approved');
        expect(row.get('[data-slot="rerequested"]').text()).toBe('· re-requested');
        expect(wrapper.get('[data-slot="review-summary"]').text()).toBe('1/1 approved · 1 pending');
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

    it('shows an empty state without reviewers', () => {
        const wrapper = mount(PrReviewers, { props: { reviewers: [] } });
        expect(wrapper.text()).toContain('No reviewers requested yet.');
    });
});
