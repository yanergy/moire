<script setup lang="ts">
import { computed } from 'vue';
import { ExternalLink } from '@lucide/vue';
import type { DashboardPr } from '@/shared/types';
import { ciVisual, prDotClass, ROW_ACTION_CLASS } from '@/lib/dashboard';
import { timeSince } from '@/lib/status-bar';
import { labelStyle } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import UserAvatar from '@/components/pr/UserAvatar.vue';

// One PR on the dashboard: status dot, the author's avatar (only when the
// dashboard shows several authors, see showAvatar), title, a meta line (author,
// branches, age), the diff size and the CI state. Clicking the row opens the PR in
// Moiré; the always visible "Open in browser" button at its right end opens it on
// GitHub instead. `now` (epoch ms) is passed in so every row ages against the same
// ticking clock.
// inStack: the row sits in a stack group, where its base branch is the head of the
// row above, so only its own branch is shown (the full pair stays in the tooltip).
const props = defineProps<{
    pr: DashboardPr;
    now: number;
    showAvatar?: boolean;
    inStack?: boolean;
}>();
defineEmits<{ open: [pr: DashboardPr]; openInBrowser: [pr: DashboardPr] }>();

const ci = computed(() => ciVisual(props.pr));

// A few labels fit beside the title; the rest collapse into a "+N" so the row
// stays one line high.
const MAX_LABELS = 3;
const labels = computed(() => (props.pr.labels ?? []).slice(0, MAX_LABELS));
const hiddenLabels = computed(() => (props.pr.labels ?? []).slice(MAX_LABELS));

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
    <div class="group flex items-center gap-3 pr-3.5 hover:bg-moire-hover">
        <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 py-4 pl-3.5 text-left"
            @click="$emit('open', pr)"
        >
            <span class="size-2.5 shrink-0 rounded-full" :class="prDotClass(pr)" />
            <user-avatar v-if="showAvatar" :login="pr.author" :size="20" />
            <div class="min-w-0 flex-1">
                <div class="flex min-w-0 items-center gap-1.5 text-[13px] text-moire-fg">
                    <span class="truncate">
                        <span class="font-medium">{{ pr.title }}</span>
                        <span class="text-moire-faint"> #{{ pr.number }}</span>
                    </span>
                    <span
                        v-for="label in labels"
                        :key="label.name"
                        data-slot="pr-label"
                        :title="label.description || undefined"
                        class="max-w-32 shrink-0 truncate rounded-full border px-2 text-[11px] leading-4 font-medium whitespace-nowrap"
                        :style="labelStyle(label.color)"
                    >
                        {{ label.name }}
                    </span>
                    <span
                        v-if="hiddenLabels.length"
                        data-slot="pr-label-more"
                        class="shrink-0 text-[11px] text-moire-faint"
                        :title="hiddenLabels.map((l) => l.name).join(', ')"
                    >
                        +{{ hiddenLabels.length }}
                    </span>
                </div>
                <div class="flex min-w-0 items-center gap-1.5 text-[12px] text-moire-faint">
                    <span class="shrink-0">{{ pr.author }}</span>
                    <span class="text-moire-faint">·</span>
                    <span
                        data-slot="pr-branches"
                        class="truncate font-mono text-[11px]"
                        :title="`${pr.headRefName} → ${pr.baseRefName}`"
                        >{{ pr.headRefName
                        }}<template v-if="!inStack"> → {{ pr.baseRefName }}</template></span
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
        <Tooltip>
            <TooltipTrigger as-child>
                <Button
                    variant="outline"
                    size="icon-sm"
                    :class="ROW_ACTION_CLASS"
                    aria-label="Open in browser"
                    @click="$emit('openInBrowser', pr)"
                >
                    <ExternalLink :size="16" />
                </Button>
            </TooltipTrigger>
            <TooltipContent>Open in browser</TooltipContent>
        </Tooltip>
    </div>
</template>
