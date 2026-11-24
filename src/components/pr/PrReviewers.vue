<script setup lang="ts">
// The PR view's Reviewers tab: a progress summary, then one row per reviewer (a
// requested user or team, or someone who reviewed) with where they stand. A
// reviewer who left reviews or line comments can be unfolded to a short line per
// item, each with a button that jumps to it in the conversation.
import { computed, ref, type Component } from 'vue';
import {
    ArrowUpRight,
    ChevronDown,
    ChevronRight,
    CircleCheck,
    CircleDot,
    FileDiff,
    MessageSquare,
    MessageSquareCode,
    Users,
} from '@lucide/vue';
import type { PrReviewer, PrReviewerState } from '@/shared/types';
import { reviewProgress, reviewSummary } from '@/lib/review-progress';
import type { ReviewActivity, ReviewActivityTarget } from '@/lib/review-activity';
import { timeSince } from '@/lib/status-bar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import UserAvatar from '@/components/pr/UserAvatar.vue';

const props = withDefaults(
    defineProps<{
        reviewers: PrReviewer[];
        // Each reviewer's reviews and line comments, by login (see lib/review-activity).
        activity?: Map<string, ReviewActivity[]>;
    }>(),
    { activity: () => new Map() }
);

const emit = defineEmits<{ jump: [target: ReviewActivityTarget] }>();

const summary = computed(() => reviewSummary(reviewProgress(props.reviewers)));

// Each state's glyph, label and color, matching the conversation's review verbs:
// green for an approval, red for a change request, faint for the rest.
const STATE: Record<PrReviewerState, { icon: Component; text: string; cls: string }> = {
    APPROVED: { icon: CircleCheck, text: 'Approved', cls: 'text-moire-status-a' },
    CHANGES_REQUESTED: { icon: FileDiff, text: 'Requested changes', cls: 'text-moire-status-d' },
    COMMENTED: { icon: MessageSquare, text: 'Commented', cls: 'text-moire-faint' },
    PENDING: { icon: CircleDot, text: 'Awaiting review', cls: 'text-moire-faint' },
};

// A re-requested reviewer's earlier verdict, after "Awaiting review".
const PREVIOUS: Record<Exclude<PrReviewerState, 'PENDING'>, string> = {
    APPROVED: 'approved',
    CHANGES_REQUESTED: 'requested changes',
    COMMENTED: 'commented',
};

// A team has no activity of its own (its members review as users).
function itemsFor(reviewer: PrReviewer): ReviewActivity[] {
    return reviewer.kind === 'user' ? (props.activity.get(reviewer.login) ?? []) : [];
}

// Reviewers start folded; a click on the row toggles its items.
const expanded = ref<Set<string>>(new Set());
const keyOf = (reviewer: PrReviewer) => `${reviewer.kind}:${reviewer.login}`;
function toggle(reviewer: PrReviewer) {
    const next = new Set(expanded.value);
    const key = keyOf(reviewer);
    if (next.has(key)) {
        next.delete(key);
    } else {
        next.add(key);
    }
    expanded.value = next;
}

// A review item reads as its verdict, a line comment as its file.
function itemVisual(item: ReviewActivity): { icon: Component; label: string; cls: string } {
    if (item.kind === 'line') {
        return {
            icon: MessageSquareCode,
            label: item.path ?? '',
            cls: 'font-mono text-moire-accent',
        };
    }

    const state =
        item.state === 'APPROVED' || item.state === 'CHANGES_REQUESTED' ? item.state : 'COMMENTED';
    return {
        icon: STATE[state].icon,
        label: state === 'COMMENTED' ? 'Reviewed' : STATE[state].text,
        cls: STATE[state].cls,
    };
}

function relative(iso: string): string {
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? '' : timeSince(ms, Date.now());
}
</script>

<template>
    <div v-if="reviewers.length">
        <p data-slot="review-summary" class="pb-1 text-[12.5px] text-moire-muted">
            {{ summary }}
        </p>
        <div
            v-for="reviewer in reviewers"
            :key="keyOf(reviewer)"
            data-slot="reviewer"
            :data-state="reviewer.state"
            class="border-b border-moire-border"
        >
            <component
                :is="itemsFor(reviewer).length ? 'button' : 'div'"
                :type="itemsFor(reviewer).length ? 'button' : undefined"
                data-slot="reviewer-row"
                class="flex w-full items-center gap-2.5 py-[11px] text-left"
                :class="
                    itemsFor(reviewer).length ? 'cursor-pointer rounded hover:bg-moire-hover' : ''
                "
                :aria-expanded="
                    itemsFor(reviewer).length ? expanded.has(keyOf(reviewer)) : undefined
                "
                @click="itemsFor(reviewer).length && toggle(reviewer)"
            >
                <!-- The fold chevron, or a spacer so every row's avatar lines up. -->
                <span class="flex size-4 shrink-0 items-center justify-center text-moire-faint">
                    <template v-if="itemsFor(reviewer).length">
                        <ChevronDown v-if="expanded.has(keyOf(reviewer))" :size="14" />
                        <ChevronRight v-else :size="14" />
                    </template>
                </span>
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
                    <span
                        v-if="itemsFor(reviewer).length"
                        data-slot="activity-count"
                        class="pl-1 text-moire-faint"
                    >
                        {{ itemsFor(reviewer).length }}
                        {{ itemsFor(reviewer).length === 1 ? 'comment' : 'comments' }}
                    </span>
                </span>
                <span
                    class="flex shrink-0 items-center gap-1.5 pr-1 text-[12px]"
                    :class="STATE[reviewer.state].cls"
                >
                    <component :is="STATE[reviewer.state].icon" :size="14" />
                    {{ STATE[reviewer.state].text }}
                    <span
                        v-if="reviewer.previousState"
                        data-slot="previous-state"
                        class="text-moire-faint"
                    >
                        · previously {{ PREVIOUS[reviewer.previousState] }}
                    </span>
                </span>
            </component>

            <!-- The reviewer's items, one short line each: what it is (a verdict or
                 the file), a one-line preview, its age, and a jump to it. -->
            <div v-if="expanded.has(keyOf(reviewer))" class="flex flex-col pb-2 pl-[54px]">
                <div
                    v-for="item in itemsFor(reviewer)"
                    :key="item.key"
                    data-slot="reviewer-activity"
                    class="flex h-8 items-center gap-2 text-[12px]"
                >
                    <component
                        :is="itemVisual(item).icon"
                        :size="13"
                        class="shrink-0"
                        :class="item.kind === 'line' ? 'text-moire-faint' : itemVisual(item).cls"
                    />
                    <span class="max-w-[40%] shrink-0 truncate" :class="itemVisual(item).cls">
                        {{ itemVisual(item).label }}
                    </span>
                    <span class="min-w-0 flex-1 truncate text-moire-muted">
                        {{ item.preview }}
                    </span>
                    <span class="shrink-0 text-moire-faint">{{ relative(item.createdAt) }}</span>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <button
                                type="button"
                                data-slot="activity-jump"
                                aria-label="Go to comment"
                                class="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-moire-faint transition-colors hover:bg-moire-hover hover:text-moire-fg"
                                @click="emit('jump', item.target)"
                            >
                                <ArrowUpRight :size="14" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>Go to comment</TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </div>
    </div>
    <div v-else class="py-8 text-center text-[13px] text-moire-faint">
        No reviewers requested yet.
    </div>
</template>
