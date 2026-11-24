<script setup lang="ts">
// The PR view's Stack tab: the PRs stacked with this one, top of the stack first
// and the trunk at the bottom, as a chain. Each row shows the PR's state and any
// action the stack needs (a rebase onto its parent, or retargeting after its base
// PR merged). Clicking another PR compares its own base and head, so its diff is
// against its parent rather than the trunk.
import { computed, ref } from 'vue';
import { CircleAlert, GitMerge, GitPullRequest } from '@lucide/vue';
import type { PrStack, PrStackEntry } from '@/shared/types';
import { useComparisonStore } from '@/stores/comparison';

const props = defineProps<{
    stack: PrStack;
}>();

const comparison = useComparisonStore();

const rows = computed(() => [...props.stack.entries].reverse());
const error = ref('');

function reviewLabel(entry: PrStackEntry): { text: string; cls: string } | null {
    switch (entry.reviewDecision) {
        case 'APPROVED':
            return { text: 'Approved', cls: 'text-moire-status-a' };
        case 'CHANGES_REQUESTED':
            return { text: 'Changes requested', cls: 'text-moire-status-d' };
        case 'REVIEW_REQUIRED':
            return { text: 'Review required', cls: 'text-moire-faint' };
        default:
            return null;
    }
}

function open(entry: PrStackEntry) {
    if (entry.isCurrent || entry.state !== 'OPEN') {
        return;
    }

    error.value = '';
    if (!comparison.selectPullRequestRange(entry.baseRefName, entry.headRefName)) {
        error.value = `Fetch ${entry.baseRefName} and ${entry.headRefName} to open #${entry.number}.`;
    }
}
</script>

<template>
    <div>
        <p
            v-if="error"
            data-slot="stack-error"
            class="mb-3 rounded-md border border-moire-danger-edge bg-moire-danger px-3 py-2 text-[12px] text-moire-status-d"
        >
            {{ error }}
        </p>
        <div
            v-for="entry in rows"
            :key="entry.number"
            data-slot="stack-entry"
            :data-current="entry.isCurrent || undefined"
            class="flex gap-3 border-b border-moire-border px-2 py-2.5"
            :class="entry.isCurrent ? 'rounded-md bg-moire-hover' : ''"
            :style="{ paddingLeft: `${8 + entry.depth * 14}px` }"
        >
            <component
                :is="entry.state === 'MERGED' ? GitMerge : GitPullRequest"
                :size="14"
                class="mt-0.5 shrink-0"
                :class="entry.state === 'MERGED' ? 'text-moire-faint' : 'text-moire-status-a'"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-1">
                <div class="flex min-w-0 items-center gap-2 text-[12.5px]">
                    <button
                        type="button"
                        class="min-w-0 truncate text-left text-moire-fg"
                        :class="
                            entry.isCurrent || entry.state !== 'OPEN'
                                ? 'cursor-default'
                                : 'cursor-pointer hover:text-moire-accent hover:underline'
                        "
                        @click="open(entry)"
                    >
                        <span class="text-moire-faint">#{{ entry.number }}</span>
                        {{ entry.title }}
                    </button>
                    <span v-if="entry.isCurrent" class="shrink-0 text-[11px] text-moire-faint">
                        This PR
                    </span>
                </div>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                    <span class="font-mono text-moire-faint">{{ entry.headRefName }}</span>
                    <span v-if="entry.state === 'MERGED'" class="text-moire-faint">Merged</span>
                    <span v-else-if="entry.isDraft" class="text-moire-faint">Draft</span>
                    <span v-if="reviewLabel(entry)" :class="reviewLabel(entry)!.cls">
                        {{ reviewLabel(entry)!.text }}
                    </span>
                    <span
                        v-if="entry.needsRetarget"
                        data-slot="stack-retarget"
                        class="flex items-center gap-1 text-moire-status-d"
                    >
                        <CircleAlert :size="12" />
                        Base PR merged: retarget onto {{ stack.trunk }}
                    </span>
                    <span
                        v-else-if="entry.needsRebase"
                        data-slot="stack-rebase"
                        class="flex items-center gap-1 text-moire-status-d"
                    >
                        <CircleAlert :size="12" />
                        Needs a rebase onto {{ entry.baseRefName }}
                    </span>
                </div>
            </div>
        </div>
        <p class="px-2 pt-2.5 font-mono text-[11.5px] text-moire-faint">
            {{ stack.trunk }}
        </p>
    </div>
</template>
