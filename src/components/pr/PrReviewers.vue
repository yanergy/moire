<script setup lang="ts">
// The PR view's Reviewers tab: a progress summary, then one row per reviewer (a
// requested user or team, or someone who reviewed) with where they stand. A
// reviewer who left reviews or line comments can be unfolded to a short line per
// item, each a button that jumps to it in the conversation.
import { computed, ref, type Component } from 'vue';
import {
    ArrowUpRight,
    ChevronDown,
    ChevronRight,
    CircleCheck,
    CircleDot,
    FileDiff,
    LoaderCircle,
    MessageSquare,
    MessageSquareCode,
    RefreshCw,
    Users,
} from '@lucide/vue';
import type { PrReviewer, PrReviewerState } from '@/shared/types';
import { reviewProgress, reviewSummary } from '@/lib/review-progress';
import type { ReviewActivity, ReviewActivityTarget } from '@/lib/review-activity';
import { timeSince } from '@/lib/status-bar';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/pr/UserAvatar.vue';

const props = withDefaults(
    defineProps<{
        reviewers: PrReviewer[];
        // Each reviewer's reviews and line comments, by login (see lib/review-activity).
        activity?: Map<string, ReviewActivity[]>;
        // Whether the viewer may request reviewers, which offers the re-request button
        // on each reviewer who requested changes.
        canRequest?: boolean;
        // The login whose re-request is running, and the last refusal to show on its row.
        requesting?: string | null;
        requestError?: { login: string; message: string } | null;
    }>(),
    { activity: () => new Map(), canRequest: false, requesting: null, requestError: null }
);

const emit = defineEmits<{ jump: [target: ReviewActivityTarget]; request: [login: string] }>();

const progress = computed(() => reviewProgress(props.reviewers));
const summary = computed(() => reviewSummary(progress.value));

// The ring chart before the summary, as GitHub draws one for checks: one arc per
// state, sized by its share of the reviewers, in the order and colors of the
// states (approved, requested changes, awaiting review, commented). Each arc is a
// dash along a circle whose circumference is 100, so lengths are percentages.
const RING_RADIUS = 100 / (2 * Math.PI);
const ringSegments = computed(() => {
    const { approved, changesRequested, pending, commented, total } = progress.value;
    const parts = [
        { state: 'APPROVED', count: approved, cls: 'text-moire-status-a' },
        { state: 'CHANGES_REQUESTED', count: changesRequested, cls: 'text-moire-status-d' },
        { state: 'PENDING', count: pending, cls: 'text-moire-changes-fg' },
        { state: 'COMMENTED', count: commented, cls: 'text-moire-faint' },
    ].filter((part) => part.count > 0);

    let offset = 0;
    return parts.map((part) => {
        const length = (part.count / total) * 100;
        const segment = { ...part, length, offset };
        offset += length;
        return segment;
    });
});

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

// Only a user who requested changes can be re-requested: a team's verdict is not tracked.
function canRerequest(reviewer: PrReviewer): boolean {
    return props.canRequest && reviewer.kind === 'user' && reviewer.state === 'CHANGES_REQUESTED';
}

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
        <div class="flex items-center gap-2 pb-3">
            <!-- Rotated so the first arc starts at the top, as a clock does. A
                 small gap between arcs only when there is more than one. -->
            <svg
                data-slot="review-ring"
                viewBox="0 0 36 36"
                class="size-5 shrink-0 -rotate-90"
                aria-hidden="true"
            >
                <circle
                    v-for="segment in ringSegments"
                    :key="segment.state"
                    :data-state="segment.state"
                    cx="18"
                    cy="18"
                    :r="RING_RADIUS"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="5"
                    pathLength="100"
                    :class="segment.cls"
                    :stroke-dasharray="`${ringSegments.length > 1 ? Math.max(segment.length - 2, 1) : 100} 100`"
                    :stroke-dashoffset="-segment.offset"
                />
            </svg>
            <p data-slot="review-summary" class="text-[12.5px] text-moire-muted">
                {{ summary }}
            </p>
        </div>
        <div
            v-for="reviewer in reviewers"
            :key="keyOf(reviewer)"
            data-slot="reviewer"
            :data-state="reviewer.state"
            class="border-b border-moire-border"
        >
            <!-- The row: the fold toggle fills it, then the re-request button and the
                 reviewer's state. They are siblings (a button cannot hold a button), so the hover
                 tint is on this wrapper to keep it one row visually. -->
            <div
                class="group/row flex items-center gap-2 rounded pr-1"
                :class="itemsFor(reviewer).length ? 'hover:bg-moire-hover' : ''"
            >
                <component
                    :is="itemsFor(reviewer).length ? 'button' : 'div'"
                    :type="itemsFor(reviewer).length ? 'button' : undefined"
                    data-slot="reviewer-row"
                    class="flex min-w-0 flex-1 items-center gap-2.5 py-[11px] text-left"
                    :class="itemsFor(reviewer).length ? 'cursor-pointer' : ''"
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
                    <user-avatar
                        v-if="reviewer.kind === 'user'"
                        :login="reviewer.login"
                        :size="20"
                    />
                    <span
                        v-else
                        class="flex size-5 shrink-0 items-center justify-center rounded-full bg-moire-hover text-moire-muted"
                    >
                        <Users :size="12" />
                    </span>
                    <span class="min-w-0 flex-1 truncate text-[12.5px] text-moire-fg">
                        {{ reviewer.login }}
                        <span v-if="reviewer.kind === 'team'" class="pl-1 text-moire-faint"
                            >team</span
                        >
                        <span
                            v-if="itemsFor(reviewer).length"
                            data-slot="activity-count"
                            class="pl-1 text-moire-faint"
                        >
                            {{ itemsFor(reviewer).length }}
                            {{ itemsFor(reviewer).length === 1 ? 'comment' : 'comments' }}
                        </span>
                    </span>
                </component>
                <Button
                    v-if="canRerequest(reviewer)"
                    variant="outline"
                    size="sm"
                    data-slot="rerequest-review"
                    class="h-7 shrink-0 gap-1.5 border-input bg-transparent px-2.5 text-moire-muted shadow-xs hover:bg-moire-hover hover:text-moire-fg dark:border-input dark:bg-transparent dark:hover:bg-moire-hover"
                    :aria-label="`Re-request review from ${reviewer.login}`"
                    :disabled="requesting !== null"
                    @click="emit('request', reviewer.login)"
                >
                    <LoaderCircle
                        v-if="requesting === reviewer.login"
                        :size="16"
                        class="animate-spin"
                    />
                    <RefreshCw v-else :size="16" />
                    {{ requesting === reviewer.login ? 'Re-requesting...' : 'Re-request review' }}
                </Button>
                <!-- Outside the fold toggle so the re-request button can sit before it;
                     clicking it still folds the row, like the rest of the row. -->
                <span
                    data-slot="reviewer-state"
                    class="flex shrink-0 items-center gap-1.5 py-[11px] pr-1 text-[12px]"
                    :class="[
                        STATE[reviewer.state].cls,
                        itemsFor(reviewer).length ? 'cursor-pointer' : '',
                    ]"
                    @click="itemsFor(reviewer).length && toggle(reviewer)"
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
            </div>
            <p
                v-if="requestError?.login === reviewer.login"
                data-slot="request-error"
                class="pb-2 pl-[48px] text-[12px] text-moire-status-d"
            >
                {{ requestError.message }}
            </p>

            <!-- The reviewer's items, one short line each: what it is (a verdict or
                 the file), a one-line preview, its age, and a jump to it. -->
            <div v-if="expanded.has(keyOf(reviewer))" class="flex flex-col pb-2 pl-[48px]">
                <!-- The whole line is the jump, so it is an easy target; the
                     arrow at its end marks it as a link. -->
                <button
                    v-for="item in itemsFor(reviewer)"
                    :key="item.key"
                    type="button"
                    data-slot="reviewer-activity"
                    :title="item.preview"
                    class="group flex h-8 w-full cursor-pointer items-center gap-2 rounded pr-1 pl-1.5 text-left text-[12px] transition-colors hover:bg-moire-hover"
                    @click="emit('jump', item.target)"
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
                    <ArrowUpRight
                        :size="14"
                        class="shrink-0 text-moire-faint transition-colors group-hover:text-moire-fg"
                    />
                </button>
            </div>
        </div>
    </div>
    <div v-else class="py-8 text-center text-[13px] text-moire-faint">
        No reviewers requested yet.
    </div>
</template>
