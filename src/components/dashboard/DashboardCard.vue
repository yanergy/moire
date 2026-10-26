<script setup lang="ts">
import type { DashboardCategory } from '@/stores/dashboard';

// One overview card: a status dot and label at the top, the PR count large in the
// bottom left and a short caption saying what is counted in the bottom right. The
// whole card is the click target that opens the category's PR list. Its border
// lifts to the ring tone on hover: on the hover fill the regular border tone would
// vanish.
defineProps<{ category: DashboardCategory }>();
defineEmits<{ open: [] }>();
</script>

<template>
    <button
        type="button"
        class="flex h-[150px] flex-col justify-between rounded-lg border border-moire-border bg-moire-chrome p-4 text-left hover:border-moire-ring hover:bg-moire-hover"
        @click="$emit('open')"
    >
        <span class="flex items-center gap-2 text-[13px] font-medium text-moire-fg">
            <span class="size-2 shrink-0 rounded-full" :class="category.dotClass" />
            {{ category.label }}
        </span>
        <span class="flex items-end justify-between gap-3">
            <span
                class="text-[40px] leading-none font-medium tabular-nums"
                :class="category.prs.length ? 'text-moire-fg' : 'text-moire-faint'"
            >
                {{ category.prs.length }}
            </span>
            <span class="pb-0.5 text-right text-[12px] text-moire-faint">
                {{ category.caption }}
            </span>
        </span>
    </button>
</template>
