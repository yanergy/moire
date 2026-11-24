<script setup lang="ts">
// The footer under a review thread in the PR conversation, as on GitHub: a reply
// box and a "Resolve conversation" toggle. Both go through the comparison store,
// which re-reads the review threads afterwards, so the thread updates in place
// without reloading the PR. A failure shows inline under the thread.
import { nextTick, ref } from 'vue';
import { LoaderCircle } from '@lucide/vue';
import type { PrReviewThread } from '@/shared/types';
import { useComparisonStore } from '@/stores/comparison';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const props = defineProps<{
    thread: PrReviewThread;
}>();

const emit = defineEmits<{
    // The thread's new resolved state after a successful toggle, so the
    // conversation can fold a resolved thread and unfold an unresolved one.
    resolvedChange: [resolved: boolean];
}>();

const comparison = useComparisonStore();

const replying = ref(false);
const draft = ref('');
const error = ref('');
const busy = ref<'reply' | 'resolve' | null>(null);
const textarea = ref<InstanceType<typeof Textarea> | null>(null);

async function openReply() {
    replying.value = true;
    await nextTick();
    (textarea.value?.$el as HTMLTextAreaElement | undefined)?.focus();
}

function cancelReply() {
    replying.value = false;
    draft.value = '';
    error.value = '';
}

async function submitReply() {
    const body = draft.value.trim();
    if (!body || busy.value) {
        return;
    }

    busy.value = 'reply';
    error.value = '';
    const result = await comparison.replyToReviewThread(props.thread.id, body);
    busy.value = null;
    if (!result.ok) {
        error.value = result.message ?? 'Could not post the reply.';
        return;
    }

    draft.value = '';
    replying.value = false;
}

async function toggleResolved() {
    if (busy.value) {
        return;
    }

    const resolved = !props.thread.isResolved;
    busy.value = 'resolve';
    error.value = '';
    const result = await comparison.setReviewThreadResolved(props.thread.id, resolved);
    busy.value = null;
    if (!result.ok) {
        error.value = result.message ?? 'Could not update the conversation.';
        return;
    }

    emit('resolvedChange', resolved);
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
        cancelReply();
        return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void submitReply();
    }
}
</script>

<template>
    <div
        data-slot="thread-actions"
        class="flex flex-col gap-2.5 border-t border-moire-border bg-moire-chrome px-4 py-3"
    >
        <div v-if="replying" class="flex flex-col gap-2">
            <Textarea
                ref="textarea"
                v-model="draft"
                placeholder="Reply…"
                aria-label="Reply to this conversation"
                class="min-h-20 border-moire-border bg-moire-app text-[14px] leading-[1.6] text-moire-file-fg focus-visible:border-moire-ring focus-visible:ring-0"
                :disabled="busy === 'reply'"
                @keydown="onKeydown"
            />
            <div class="flex justify-end gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                    :disabled="busy === 'reply'"
                    @click="cancelReply"
                >
                    Cancel
                </Button>
                <Button
                    size="sm"
                    class="h-7 gap-1.5 bg-moire-submit text-white hover:bg-moire-submit-hover"
                    :disabled="!draft.trim() || busy !== null"
                    @click="submitReply"
                >
                    <LoaderCircle v-if="busy === 'reply'" :size="14" class="animate-spin" />
                    Reply
                </Button>
            </div>
        </div>
        <!-- Collapsed, the reply box is a field-like button, as GitHub's "Reply..."
             input; clicking it opens the real textarea. -->
        <Button
            v-else
            variant="outline"
            data-slot="thread-reply-open"
            class="h-8 justify-start border-moire-border bg-moire-app px-3 font-normal text-moire-faint hover:bg-moire-app hover:text-moire-muted"
            @click="openReply"
        >
            Reply…
        </Button>

        <p v-if="error" data-slot="thread-error" class="text-[12px] text-moire-status-d">
            {{ error }}
        </p>

        <div>
            <Button
                variant="outline"
                size="sm"
                data-slot="thread-resolve"
                class="h-7 gap-1.5 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                :disabled="busy !== null"
                @click="toggleResolved"
            >
                <LoaderCircle v-if="busy === 'resolve'" :size="14" class="animate-spin" />
                {{ thread.isResolved ? 'Unresolve conversation' : 'Resolve conversation' }}
            </Button>
        </div>
    </div>
</template>
