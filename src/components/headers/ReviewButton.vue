<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { LoaderCircle, MessageSquarePlus, MessageSquareText, Trash2 } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import type { ReviewEvent } from '@/shared/types';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// The PR view's review control, at the top right of its header. Without a pending
// review it starts one (an explicit write, like edit mode next to it), after which
// the diff offers a comment button on each line. With one pending it shows how many
// comments the review holds and opens the dialog that submits or discards it.
// The pending review lives on GitHub, so one started on github.com shows here too.
const comparison = useComparisonStore();
const ui = useUiStore();

const starting = ref(false);
const startError = ref('');

async function start() {
    if (starting.value) {
        return;
    }

    starting.value = true;
    startError.value = '';
    const result = await comparison.startReview();
    starting.value = false;
    if (result.ok) {
        // Line comments go in the diff, so go there to write them.
        ui.setMainView('diff');
    } else {
        startError.value = result.message ?? 'Could not start the review.';
    }
}

// --- The submit dialog ---

const dialogOpen = ref(false);
const summary = ref('');
const event = ref<ReviewEvent>('COMMENT');
const submitting = ref(false);
const confirmingDiscard = ref(false);
const discarding = ref(false);
const dialogError = ref('');

// GitHub lets a PR's author only comment on it, so their dialog offers Comment alone.
const EVENTS: { value: ReviewEvent; label: string; hint: string }[] = [
    {
        value: 'COMMENT',
        label: 'Comment',
        hint: 'General feedback, without approving or requesting changes.',
    },
    { value: 'APPROVE', label: 'Approve', hint: 'Approve these changes for merging.' },
    {
        value: 'REQUEST_CHANGES',
        label: 'Request changes',
        hint: 'Feedback that has to be addressed before merging.',
    },
];
const events = computed(() =>
    comparison.reviewState.viewerIsAuthor ? EVENTS.filter((e) => e.value === 'COMMENT') : EVENTS
);

const count = computed(() => comparison.pendingCommentCount);
const countLabel = computed(
    () => `${count.value} pending ${count.value === 1 ? 'comment' : 'comments'}`
);

function openDialog() {
    event.value = 'COMMENT';
    confirmingDiscard.value = false;
    dialogError.value = '';
    dialogOpen.value = true;
}

const busy = computed(() => submitting.value || discarding.value);

async function submit() {
    if (busy.value) {
        return;
    }

    submitting.value = true;
    dialogError.value = '';
    const result = await comparison.submitReview(event.value, summary.value.trim());
    submitting.value = false;
    if (result.ok) {
        summary.value = '';
        dialogOpen.value = false;
    } else {
        dialogError.value = result.message ?? 'Could not submit the review.';
    }
}

async function discard() {
    if (busy.value) {
        return;
    }

    discarding.value = true;
    dialogError.value = '';
    const result = await comparison.discardReview();
    discarding.value = false;
    if (result.ok) {
        summary.value = '';
        confirmingDiscard.value = false;
        dialogOpen.value = false;
    } else {
        dialogError.value = result.message ?? 'Could not discard the review.';
    }
}

// A different PR (the range moved) drops what was typed for the previous one.
watch(
    () => comparison.pullRequest?.number,
    () => {
        summary.value = '';
        startError.value = '';
        dialogOpen.value = false;
    }
);
</script>

<template>
    <template v-if="comparison.hasPullRequest">
        <Tooltip v-if="!comparison.hasPendingReview">
            <TooltipTrigger as-child>
                <Button
                    variant="outline"
                    size="sm"
                    data-slot="start-review"
                    class="h-7 gap-1.5 border-input bg-transparent px-2.5 text-moire-muted shadow-xs hover:bg-moire-hover hover:text-moire-fg dark:border-input dark:bg-transparent dark:hover:bg-moire-hover"
                    :class="startError ? 'text-moire-status-d' : ''"
                    :disabled="starting"
                    @click="start"
                >
                    <LoaderCircle v-if="starting" :size="16" class="animate-spin" />
                    <MessageSquarePlus v-else :size="16" />
                    Review
                </Button>
            </TooltipTrigger>
            <TooltipContent class="max-w-xs">
                {{
                    startError ||
                    'Start a review: comment on lines in the diff, then submit the comments together.'
                }}
            </TooltipContent>
        </Tooltip>

        <Button
            v-else
            variant="outline"
            size="sm"
            data-slot="finish-review"
            class="h-7 gap-1.5 border-moire-accent bg-transparent px-2.5 text-moire-fg shadow-xs hover:bg-moire-hover dark:border-moire-accent dark:bg-transparent dark:hover:bg-moire-hover"
            @click="openDialog"
        >
            <MessageSquareText :size="16" class="text-moire-accent" />
            Finish review
            <span
                class="min-w-4 rounded-full bg-moire-accent px-1 text-center text-[10px] leading-4 font-semibold text-moire-check-fg"
                :aria-label="countLabel"
            >
                {{ count }}
            </span>
        </Button>

        <Dialog v-model:open="dialogOpen">
            <DialogContent
                :show-close-button="false"
                class="gap-0 border-moire-border bg-moire-pop p-0 text-moire-fg sm:max-w-lg"
                :style="{ boxShadow: 'var(--moire-pop-shadow)' }"
            >
                <div class="flex flex-col gap-3 p-5">
                    <DialogTitle class="text-[15px] font-semibold text-moire-fg">
                        Finish your review
                    </DialogTitle>
                    <DialogDescription class="text-[13px] leading-[1.5] text-moire-muted">
                        Submitting posts your {{ countLabel }} on
                        <span class="font-medium text-moire-fg">
                            #{{ comparison.pullRequest?.number }}
                        </span>
                        together with this summary.
                    </DialogDescription>

                    <!-- @keydown.stop keeps typing away from the app's shortcuts. -->
                    <textarea
                        v-model="summary"
                        rows="4"
                        placeholder="Leave a comment"
                        aria-label="Review summary"
                        class="w-full resize-y rounded-md border border-moire-border bg-transparent px-2.5 py-2 text-[13px] text-moire-fg placeholder:text-moire-faint focus-visible:border-moire-ring focus-visible:outline-none"
                        :disabled="busy"
                        @keydown.stop
                    />

                    <fieldset class="flex flex-col gap-1" :disabled="busy">
                        <legend class="sr-only">Review type</legend>
                        <label
                            v-for="option in events"
                            :key="option.value"
                            class="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-moire-hover"
                        >
                            <input
                                v-model="event"
                                type="radio"
                                name="review-event"
                                :value="option.value"
                                class="mt-0.5 accent-[var(--moire-accent)]"
                            />
                            <span class="flex flex-col">
                                <span class="text-[13px] font-medium text-moire-fg">
                                    {{ option.label }}
                                </span>
                                <span class="text-[12px] text-moire-muted">{{ option.hint }}</span>
                            </span>
                        </label>
                    </fieldset>
                    <p
                        v-if="comparison.reviewState.viewerIsAuthor"
                        class="text-[12px] text-moire-faint"
                    >
                        You opened this pull request, so GitHub only lets you comment on it.
                    </p>

                    <p v-if="dialogError" class="text-[12px] text-moire-status-d">
                        {{ dialogError }}
                    </p>
                </div>

                <DialogFooter
                    class="items-center gap-2 border-t border-moire-border px-5 py-3.5 sm:justify-between"
                >
                    <!-- Discarding asks first, in place, since it deletes the comments. -->
                    <div v-if="confirmingDiscard" class="flex items-center gap-2">
                        <span class="text-[12px] text-moire-muted">
                            Delete the review and its comments?
                        </span>
                        <Button
                            size="sm"
                            class="h-7 gap-1.5 bg-moire-status-d text-white hover:bg-moire-status-d/90"
                            :disabled="busy"
                            @click="discard"
                        >
                            <LoaderCircle v-if="discarding" :size="14" class="animate-spin" />
                            Discard
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-7 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                            :disabled="busy"
                            @click="confirmingDiscard = false"
                        >
                            Keep
                        </Button>
                    </div>
                    <Button
                        v-else
                        variant="ghost"
                        size="sm"
                        class="h-8 gap-1.5 text-moire-status-d hover:bg-moire-hover hover:text-moire-status-d"
                        :disabled="busy"
                        @click="confirmingDiscard = true"
                    >
                        <Trash2 :size="14" />
                        Discard review
                    </Button>

                    <div class="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                            :disabled="busy"
                            @click="dialogOpen = false"
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            class="h-8 gap-1.5 bg-moire-submit text-white hover:bg-moire-submit-hover"
                            :disabled="busy"
                            @click="submit"
                        >
                            <LoaderCircle v-if="submitting" :size="14" class="animate-spin" />
                            Submit review
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </template>
</template>
