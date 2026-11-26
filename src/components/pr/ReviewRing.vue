<script setup lang="ts">
// The review status as a ring chart, as GitHub draws one for checks: one arc per
// state, sized by its share of the reviewers, in the order and colors of the
// states (approved, requested changes, awaiting review, commented). Each arc is a
// dash along a circle whose circumference is 100, so lengths are percentages.
import { computed } from 'vue';
import type { PrReviewer } from '@/shared/types';
import { reviewProgress } from '@/lib/review-progress';

const props = withDefaults(defineProps<{ reviewers: PrReviewer[]; size?: number }>(), {
    size: 20,
});

const RING_RADIUS = 100 / (2 * Math.PI);
const ringSegments = computed(() => {
    const { approved, changesRequested, pending, commented, total } = reviewProgress(
        props.reviewers
    );
    const parts = [
        { state: 'APPROVED', count: approved, cls: 'text-moire-status-a' },
        { state: 'CHANGES_REQUESTED', count: changesRequested, cls: 'text-moire-status-d' },
        { state: 'PENDING', count: pending, cls: 'text-moire-changes-fg' },
        { state: 'COMMENTED', count: commented, cls: 'text-moire-faint' },
    ].filter((part) => part.count > 0);

    let offset = 0;
    return parts.map((part) => {
        const length = (part.count / total) * 100;
        const segment = { ...part, length, offset };
        offset += length;
        return segment;
    });
});
</script>

<template>
    <!-- Rotated so the first arc starts at the top, as a clock does. A small gap
         between arcs only when there is more than one. -->
    <svg
        data-slot="review-ring"
        viewBox="0 0 36 36"
        class="shrink-0 -rotate-90"
        :style="{ width: `${size}px`, height: `${size}px` }"
        aria-hidden="true"
    >
        <circle
            v-for="segment in ringSegments"
            :key="segment.state"
            :data-state="segment.state"
            cx="18"
            cy="18"
            :r="RING_RADIUS"
            fill="none"
            stroke="currentColor"
            stroke-width="5"
            pathLength="100"
            :class="segment.cls"
            :stroke-dasharray="`${ringSegments.length > 1 ? Math.max(segment.length - 2, 1) : 100} 100`"
            :stroke-dashoffset="-segment.offset"
        />
    </svg>
</template>
