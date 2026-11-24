<script setup lang="ts">
// The PR view's Reviewers tab: a progress summary, then one row per reviewer (a
// requested user or team, or someone who reviewed) with where they stand.
import { computed, type Component } from 'vue';
import { CircleCheck, CircleDot, FileDiff, MessageSquare, Users } from '@lucide/vue';
import type { PrReviewer, PrReviewerState } from '@/shared/types';
import { reviewProgress, reviewSummary } from '@/lib/review-progress';
import UserAvatar from '@/components/pr/UserAvatar.vue';

const props = defineProps<{
    reviewers: PrReviewer[];
}>();

const summary = computed(() => reviewSummary(reviewProgress(props.reviewers)));

// Each state's glyph, label and color, matching the conversation's review verbs:
// green for an approval, red for a change request, faint for the rest.
const STATE: Record<PrReviewerState, { icon: Component; text: string; cls: string }> = {
    APPROVED: { icon: CircleCheck, text: 'Approved', cls: 'text-moire-status-a' },
    CHANGES_REQUESTED: { icon: FileDiff, text: 'Requested changes', cls: 'text-moire-status-d' },
    COMMENTED: { icon: MessageSquare, text: 'Commented', cls: 'text-moire-faint' },
    PENDING: { icon: CircleDot, text: 'Awaiting review', cls: 'text-moire-faint' },
};
</script>

<template>
    <div v-if="reviewers.length">
        <p data-slot="review-summary" class="pb-1 text-[12.5px] text-moire-muted">
            {{ summary }}
        </p>
        <div
            v-for="reviewer in reviewers"
            :key="reviewer.kind + ':' + reviewer.login"
            data-slot="reviewer"
            :data-state="reviewer.state"
            class="flex items-center gap-2.5 border-b border-moire-border py-[11px]"
        >
            <user-avatar v-if="reviewer.kind === 'user'" :login="reviewer.login" :size="20" />
            <span
                v-else
                class="flex size-5 shrink-0 items-center justify-center rounded-full bg-moire-hover text-moire-muted"
            >
                <Users :size="12" />
            </span>
            <span class="min-w-0 flex-1 truncate text-[12.5px] text-moire-fg">
                {{ reviewer.login }}
                <span v-if="reviewer.kind === 'team'" class="pl-1 text-moire-faint">team</span>
            </span>
            <span
                class="flex shrink-0 items-center gap-1.5 text-[12px]"
                :class="STATE[reviewer.state].cls"
            >
                <component :is="STATE[reviewer.state].icon" :size="14" />
                {{ STATE[reviewer.state].text }}
            </span>
        </div>
    </div>
    <div v-else class="py-8 text-center text-[13px] text-moire-faint">
        No reviewers requested yet.
    </div>
</template>
