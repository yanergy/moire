<script setup lang="ts">
import { computed } from 'vue';
import type { DashboardPr } from '@/shared/types';
import { ciVisual, prDotClass } from '@/lib/dashboard';
import { timeSince } from '@/lib/status-bar';
import UserAvatar from '@/components/pr/UserAvatar.vue';

// One PR on the dashboard: status dot, author avatar, title, a meta line (author,
// branches, age), the diff size and the CI state. The whole row is the click
// target that opens the PR. `now` (epoch ms) is passed in so every row ages
// against the same ticking clock.
const props = defineProps<{ pr: DashboardPr; now: number }>();
defineEmits<{ open: [pr: DashboardPr] }>();

const ci = computed(() => ciVisual(props.pr));

const age = computed(() => {
    const { pr, now } = props;
    if (pr.state === 'OPEN') {
        return `opened ${timeSince(Date.parse(pr.createdAt), now)}`;
    }
    const verb = pr.state === 'MERGED' ? 'merged' : 'closed';
    return `${verb} ${timeSince(Date.parse(pr.closedAt), now)}`;
});
</script>

<template>
    <button
        type="button"
        class="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-moire-hover"
        @click="$emit('open', pr)"
    >
        <span class="size-2.5 shrink-0 rounded-full" :class="prDotClass(pr)" />
        <user-avatar :login="pr.author" :size="20" />
        <div class="min-w-0 flex-1">
            <div class="truncate text-[13px] text-moire-fg">
                <span class="font-medium">{{ pr.title }}</span>
                <span class="text-moire-faint"> #{{ pr.number }}</span>
            </div>
            <div class="flex min-w-0 items-center gap-1.5 pt-0.5 text-[12px] text-moire-muted">
                <span class="shrink-0">{{ pr.author }}</span>
                <span class="text-moire-faint">·</span>
                <span class="truncate font-mono text-[11px]"
                    >{{ pr.headRefName }} → {{ pr.baseRefName }}</span
                >
                <span class="text-moire-faint">·</span>
                <span class="shrink-0">{{ age }}</span>
            </div>
        </div>
        <span class="shrink-0 font-mono text-[11px]">
            <span class="text-moire-add-fg">+{{ pr.additions }}</span>
            <span class="text-moire-del-fg"> −{{ pr.deletions }}</span>
        </span>
        <span class="flex w-4 shrink-0 justify-center">
            <component
                :is="ci.icon"
                v-if="ci"
                :size="16"
                :class="ci.cls"
                :aria-label="ci.label"
                :title="ci.label"
            />
        </span>
    </button>
</template>
