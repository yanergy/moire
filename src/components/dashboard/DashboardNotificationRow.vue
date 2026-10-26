<script setup lang="ts">
import type { ActivityEntry } from '@/shared/types';
import { activityDotClass, activityLabel } from '@/lib/dashboard';
import { timeSince } from '@/lib/status-bar';

// One sent notification in the dashboard's list: a dot colored by kind, what
// happened, the PR it was about, and how long ago. The row opens that PR. `now`
// (epoch ms) is the view's shared ticking clock.
defineProps<{ entry: ActivityEntry; now: number }>();
defineEmits<{ open: [entry: ActivityEntry] }>();
</script>

<template>
    <button
        type="button"
        class="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-moire-hover"
        @click="$emit('open', entry)"
    >
        <span class="size-2 shrink-0 rounded-full" :class="activityDotClass(entry)" />
        <span class="min-w-0 flex-1 truncate text-[13px]">
            <span class="font-medium text-moire-fg">{{ activityLabel(entry) }}</span>
            <span class="text-moire-muted"> · #{{ entry.number }} {{ entry.title }}</span>
        </span>
        <span class="shrink-0 text-[12px] text-moire-faint">
            {{ timeSince(Date.parse(entry.at), now) }}
        </span>
    </button>
</template>
