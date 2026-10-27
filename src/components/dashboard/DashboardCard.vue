<script setup lang="ts">
import type { DashboardCategory } from '@/stores/dashboard';

// One overview card: a status dot and label at the top, the PR count large in the
// bottom left and a short caption saying what is counted in the bottom right. The
// whole card is the click target that opens the category's PR list. Its border
// lifts to the ring tone on hover: on the hover fill the regular border tone would
// vanish. A green "N new" pill in the top right corner, the bell's unread tone,
// counts unread notifications about the card's PRs; a pill rather than a dot so it
// does not read as a second status dot.
defineProps<{ category: DashboardCategory }>();
defineEmits<{ open: [] }>();
</script>

<template>
    <button
        type="button"
        class="flex h-[180px] flex-col justify-between rounded-lg border border-moire-border bg-moire-chrome p-5 text-left hover:border-moire-ring hover:bg-moire-hover"
        @click="$emit('open')"
    >
        <span class="flex items-center gap-2 text-[14px] font-medium text-moire-fg">
            <span class="size-2 shrink-0 rounded-full" :class="category.dotClass" />
            {{ category.label }}
            <span class="flex-1" />
            <span
                v-if="category.unread"
                class="shrink-0 rounded-full bg-moire-pr-open px-1.5 text-[11px] leading-4 font-semibold text-moire-check-fg"
                :title="`${category.unread} unread ${category.unread === 1 ? 'notification' : 'notifications'}`"
            >
                {{ category.unread }} new
            </span>
        </span>
        <span class="flex items-end justify-between gap-3">
            <span
                class="text-[48px] leading-none font-medium tabular-nums"
                :class="category.prs.length ? 'text-moire-fg' : 'text-moire-faint'"
            >
                {{ category.prs.length }}
            </span>
            <span class="pb-1 text-right text-[13px] text-moire-faint">
                {{ category.caption }}
            </span>
        </span>
    </button>
</template>
