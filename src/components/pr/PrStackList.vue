<script setup lang="ts">
// The PR view's Stack tab: the PRs stacked with this one as a plain numbered list,
// in stack order from the trunk up (1 is the PR on the trunk), with the current PR
// highlighted. Each row shows the PR's state and any action the stack needs (a
// rebase onto its parent, or retargeting after its base PR merged). Clicking
// another PR compares its own base and head, so its diff is against its parent
// rather than the trunk.
import { computed, ref } from 'vue';
import { CircleAlert, GitMerge, GitPullRequest } from '@lucide/vue';
import type { PrStack, PrStackEntry } from '@/shared/types';
import { useComparisonStore } from '@/stores/comparison';

const props = defineProps<{
    stack: PrStack;
}>();

const comparison = useComparisonStore();

// The entries come in stack order (trunk side first, dependents depth first), so a
// branching stack still reads as one sequence.
const rows = computed(() => props.stack.entries);

// Only another open PR can be opened from here.
const canOpen = (entry: PrStackEntry) => !entry.isCurrent && entry.state === 'OPEN';
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
    if (!canOpen(entry)) {
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
        <p class="pb-3 text-[12.5px] text-moire-muted">
            Stacked on
            <span class="font-mono text-moire-fg">{{ stack.trunk }}</span>
        </p>
        <p
            v-if="error"
            data-slot="stack-error"
            class="mb-3 rounded-md border border-moire-danger-edge bg-moire-danger px-3 py-2 text-[12px] text-moire-status-d"
        >
            {{ error }}
        </p>
        <!-- A timeline like the conversation's: a numbered dot per PR, centered on
             its card, with a line joining it to the next dot through the gap. -->
        <ol class="flex flex-col gap-3">
            <li v-for="(entry, index) in rows" :key="entry.number" class="flex gap-3">
                <div class="relative flex w-6 shrink-0 items-center justify-center">
                    <span
                        v-if="index > 0"
                        class="absolute top-0 bottom-1/2 left-1/2 w-px -translate-x-1/2 bg-moire-border"
                    />
                    <span
                        v-if="index < rows.length - 1"
                        data-slot="stack-connector"
                        class="absolute top-1/2 -bottom-3 left-1/2 w-px -translate-x-1/2 bg-moire-border"
                    />
                    <span
                        data-slot="stack-position"
                        class="relative flex size-6 items-center justify-center rounded-full border bg-moire-app font-mono text-[11px]"
                        :class="
                            entry.isCurrent
                                ? 'border-moire-accent text-moire-accent'
                                : 'border-moire-border text-moire-muted'
                        "
                    >
                        {{ index + 1 }}
                    </span>
                </div>
                <div class="min-w-0 flex-1">
                    <component
                        :is="canOpen(entry) ? 'button' : 'div'"
                        :type="canOpen(entry) ? 'button' : undefined"
                        data-slot="stack-entry"
                        :data-current="entry.isCurrent || undefined"
                        :aria-current="entry.isCurrent ? 'true' : undefined"
                        class="flex w-full items-start gap-2.5 rounded-lg border bg-moire-app px-3.5 py-2.5 text-left transition-colors"
                        :class="[
                            entry.isCurrent ? 'border-moire-accent' : 'border-moire-border',
                            canOpen(entry) ? 'cursor-pointer hover:bg-moire-hover' : '',
                        ]"
                        @click="open(entry)"
                    >
                        <component
                            :is="entry.state === 'MERGED' ? GitMerge : GitPullRequest"
                            :size="14"
                            class="mt-0.5 shrink-0"
                            :class="
                                entry.state === 'MERGED'
                                    ? 'text-moire-faint'
                                    : 'text-moire-status-a'
                            "
                        />
                        <span class="flex min-w-0 flex-1 flex-col gap-1">
                            <span class="flex min-w-0 items-center gap-2 text-[12.5px]">
                                <span class="min-w-0 truncate text-moire-fg">
                                    <span class="text-moire-faint">#{{ entry.number }}</span>
                                    {{ entry.title }}
                                </span>
                                <span
                                    v-if="entry.isCurrent"
                                    class="shrink-0 text-[11px] font-medium text-moire-accent"
                                >
                                    This PR
                                </span>
                            </span>
                            <span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                                <span class="font-mono text-moire-faint">
                                    {{ entry.headRefName }}
                                </span>
                                <span v-if="entry.state === 'MERGED'" class="text-moire-faint">
                                    Merged
                                </span>
                                <span v-else-if="entry.isDraft" class="text-moire-faint">
                                    Draft
                                </span>
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
                            </span>
                        </span>
                    </component>
                </div>
            </li>
        </ol>
    </div>
</template>
