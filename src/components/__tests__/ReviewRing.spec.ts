import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ReviewRing from '@/components/pr/ReviewRing.vue';
import type { PrReviewer } from '@/shared/types';

const reviewers: PrReviewer[] = [
    { login: 'ann', kind: 'user', state: 'APPROVED', previousState: null },
    { login: 'bob', kind: 'user', state: 'CHANGES_REQUESTED', previousState: null },
    { login: 'core', kind: 'team', state: 'PENDING', previousState: null },
];

describe('ReviewRing', () => {
    it('draws one arc per state, sized by its share', () => {
        const wrapper = mount(ReviewRing, { props: { reviewers } });

        const arcs = wrapper.findAll('[data-slot="review-ring"] circle');
        expect(arcs.map((a) => a.attributes('data-state'))).toEqual([
            'APPROVED',
            'CHANGES_REQUESTED',
            'PENDING',
        ]);
        // Each a third, laid end to end, with a small gap after each.
        const offsets = arcs.map((a) => Number(a.attributes('stroke-dashoffset')));
        expect(offsets[0]).toBe(0);
        expect(offsets[1]).toBeCloseTo(-100 / 3);
        expect(offsets[2]).toBeCloseTo(-200 / 3);
        expect(Number(arcs[0]!.attributes('stroke-dasharray')!.split(' ')[0])).toBeCloseTo(
            100 / 3 - 2
        );
    });

    it('sizes the ring from the size prop and hides it from assistive tech', () => {
        const wrapper = mount(ReviewRing, { props: { reviewers, size: 13 } });

        const svg = wrapper.get('[data-slot="review-ring"]');
        expect(svg.attributes('aria-hidden')).toBe('true');
        expect(svg.attributes('style')).toContain('width: 13px');
        expect(svg.attributes('style')).toContain('height: 13px');
    });

    it('draws a single full arc when every reviewer is in the same state', () => {
        const wrapper = mount(ReviewRing, {
            props: {
                reviewers: [{ login: 'ann', kind: 'user', state: 'APPROVED', previousState: null }],
            },
        });

        const arcs = wrapper.findAll('[data-slot="review-ring"] circle');
        expect(arcs).toHaveLength(1);
        expect(arcs[0]!.attributes('stroke-dasharray')).toBe('100 100');
    });
});
