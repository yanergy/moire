<script setup lang="ts">
// The PR view's offer to turn the PR's chain of open, unstacked PRs into a GitHub stack, or
// to add it to the top of the stack just below, like GitHub's own banner. Nothing is written
// until the chain has been previewed in a dialog, bottom to top from the trunk.
import { computed, ref } from 'vue';
import { Layers, LoaderCircle } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from '@/components/ui/dialog';
import { useComparisonStore } from '@/stores/comparison';
import { useDashboardStore } from '@/stores/dashboard';

const comparison = useComparisonStore();
const dashboard = useDashboardStore();

const action = computed(() => comparison.prStackAction);
const count = computed(() => action.value?.entries.length ?? 0);
const currentNumber = computed(() => comparison.pullRequest?.number);

const summary = computed(() => {
    const current = action.value;
    if (!current) {
        return '';
    }

    if (current.kind === 'add') {
        return `This PR can join the stack after #${current.top.number}.`;
    }

    return `${count.value} open PRs build on each other and are not a stack yet.`;
});

const open = ref(false);
const submitting = ref(false);
const error = ref('');

function setOpen(value: boolean) {
    if (!value && submitting.value) {
        return;
    }

    open.value = value;
    error.value = '';
}

async function confirm() {
    if (!action.value || submitting.value) {
        return;
    }

    submitting.value = true;
    error.value = '';
    try {
        const result = await comparison.applyStackAction(action.value);
        if (!result.ok) {
            error.value = result.message || 'GitHub did not create the stack.';
            return;
        }

        open.value = false;
        void dashboard.refresh();
    } catch {
        error.value = 'The stack could not be written.';
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <div
        v-if="action"
        data-slot="stack-action"
        class="flex flex-none items-center gap-3 border-b border-moire-border bg-moire-app px-4 py-2.5 text-[12.5px]"
    >
        <Layers :size="16" class="shrink-0 text-moire-accent" />
        <span class="min-w-0 flex-1 text-moire-muted">{{ summary }}</span>
        <Button
            size="sm"
            data-slot="stack-action-open"
            class="h-7 gap-1.5 bg-moire-submit text-white hover:bg-moire-submit-hover"
            @click="setOpen(true)"
        >
            {{ action.kind === 'create' ? 'Create stack' : 'Add to stack' }}
        </Button>

        <Dialog :open="open" @update:open="setOpen">
            <DialogContent
                :show-close-button="false"
                class="gap-0 border-moire-border bg-moire-pop p-0 text-moire-fg sm:max-w-lg"
                :style="{ boxShadow: 'var(--moire-pop-shadow)' }"
            >
                <div v-if="action" class="flex flex-col gap-3 p-5">
                    <DialogTitle class="text-[15px] font-semibold text-moire-fg">
                        {{ action.kind === 'create' ? 'Create stack' : 'Add to stack' }}
                    </DialogTitle>
                    <DialogDescription class="text-[13px] leading-[1.5] text-moire-muted">
                        <template v-if="action.kind === 'create'">
                            GitHub will stack these {{ count }} pull requests, each based on the one
                            below it, on top of
                            <span class="font-mono text-moire-fg">{{ action.trunk }}</span
                            >.
                        </template>
                        <template v-else>
                            GitHub will append these {{ count }} pull requests to the top of stack
                            #{{ action.stackNumber }}.
                        </template>
                    </DialogDescription>

                    <ol
                        data-slot="stack-action-preview"
                        class="flex flex-col gap-1.5 text-[12.5px]"
                    >
                        <li
                            v-if="action.kind === 'create'"
                            class="flex items-center gap-2 text-moire-faint"
                        >
                            <span class="font-mono">trunk</span>
                            <span class="font-mono text-moire-muted">{{ action.trunk }}</span>
                        </li>
                        <li v-else class="flex items-center gap-2 text-moire-faint">
                            <span class="font-mono">top</span>
                            <span class="min-w-0 truncate text-moire-muted">
                                #{{ action.top.number }} {{ action.top.title }}
                            </span>
                        </li>
                        <li
                            v-for="(entry, index) in action.entries"
                            :key="entry.number"
                            data-slot="stack-action-entry"
                            class="flex min-w-0 items-center gap-2 rounded-md border border-moire-border bg-moire-app px-3 py-2"
                        >
                            <span class="font-mono text-moire-faint">{{ index + 1 }}</span>
                            <span class="min-w-0 flex-1 truncate text-moire-fg">
                                <span class="text-moire-faint">#{{ entry.number }}</span>
                                {{ entry.title }}
                            </span>
                            <span class="shrink-0 font-mono text-[11.5px] text-moire-faint">
                                {{ entry.headRefName }}
                            </span>
                            <span
                                v-if="entry.number === currentNumber"
                                class="shrink-0 text-[11px] font-medium text-moire-accent"
                            >
                                This PR
                            </span>
                            <span v-else-if="entry.isDraft" class="shrink-0 text-moire-faint">
                                Draft
                            </span>
                        </li>
                    </ol>

                    <span
                        v-if="error"
                        data-slot="stack-action-error"
                        class="text-[12px] text-moire-status-d"
                    >
                        {{ error }}
                    </span>
                </div>
                <DialogFooter class="gap-2 border-t border-moire-border px-5 py-3.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        class="h-8 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                        :disabled="submitting"
                        @click="setOpen(false)"
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        data-slot="stack-action-confirm"
                        class="h-8 gap-1.5 bg-moire-submit text-white hover:bg-moire-submit-hover"
                        :disabled="submitting"
                        @click="confirm"
                    >
                        <LoaderCircle v-if="submitting" :size="14" class="animate-spin" />
                        {{ action?.kind === 'create' ? 'Create stack' : 'Add to stack' }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
