<script setup lang="ts">
import { MessageSquareOff } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';

// While a review is pending but the diff on screen is not the pull request's (other
// branches, the direct comparison, or a head that is not at the PR's latest
// commit), its lines do not map onto the PR, so the diff offers no comment buttons.
// This bar says why, so the missing "+" does not read as a bug.
const comparison = useComparisonStore();
</script>

<template>
    <div
        v-if="comparison.hasPendingReview && comparison.lineCommentBlocker"
        data-slot="review-lines-notice"
        class="flex h-8 flex-none items-center gap-2 border-b border-moire-border bg-moire-app px-3 text-xs text-moire-muted"
    >
        <MessageSquareOff :size="14" class="shrink-0 text-moire-changes-fg" />
        <span class="flex-1 truncate">
            Line comments are off. {{ comparison.lineCommentBlocker }}
        </span>
    </div>
</template>
