<script setup lang="ts">
import { Check, ExternalLink, Trash2 } from '@lucide/vue';
import type { ActivityEntry } from '@/shared/types';
import {
    activityDotClass,
    activityLabel,
    ROW_ACTION_CLASS,
    ROW_ACTIONS_CLASS,
    ROW_CLASS,
    ROW_MARKER_CLASS,
} from '@/lib/dashboard';
import { timeSince } from '@/lib/status-bar';
import { Button } from '@/components/ui/button';

// One sent notification in the dashboard's list: a dot colored by kind, what
// happened, the PR it was about, and how long ago. Clicking it opens the PR in
// Moiré; the always visible Open in browser button at its end opens it on GitHub.
// On hover (or keyboard focus) Mark as read (while unread) and Delete appear over
// the age. A
// read notification fades its dot and text. `now` (epoch ms) is the view's shared
// ticking clock.
defineProps<{ entry: ActivityEntry; now: number }>();
defineEmits<{
    open: [entry: ActivityEntry];
    openInBrowser: [entry: ActivityEntry];
    markRead: [entry: ActivityEntry];
    delete: [entry: ActivityEntry];
}>();
</script>

<template>
    <div :class="[ROW_CLASS, 'gap-3 pr-3']">
        <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left"
            @click="$emit('open', entry)"
        >
            <span
                class="size-2 shrink-0 rounded-full"
                :class="[activityDotClass(entry), { 'opacity-40': entry.read }]"
            />
            <span class="min-w-0 flex-1 truncate text-[13px]">
                <span :class="entry.read ? 'text-moire-muted' : 'font-medium text-moire-fg'">
                    {{ activityLabel(entry) }}
                </span>
                <span :class="entry.read ? 'text-moire-faint' : 'text-moire-muted'">
                    · #{{ entry.number }} {{ entry.title }}
                </span>
            </span>
        </button>
        <!-- The age, with Mark as read and Delete laid over it on hover. -->
        <span class="relative flex shrink-0 items-center self-stretch">
            <span class="text-[12px] text-moire-faint" :class="ROW_MARKER_CLASS">
                {{ timeSince(Date.parse(entry.at), now) }}
            </span>
            <span :class="ROW_ACTIONS_CLASS">
                <Button
                    v-if="!entry.read"
                    variant="outline"
                    size="icon-sm"
                    :class="ROW_ACTION_CLASS"
                    aria-label="Mark as read"
                    title="Mark as read"
                    @click="$emit('markRead', entry)"
                >
                    <Check :size="16" />
                </Button>
                <!-- Red, in the failure tone the Checks tab uses, as it is destructive. -->
                <Button
                    variant="outline"
                    size="icon-sm"
                    :class="[ROW_ACTION_CLASS, 'text-moire-status-d hover:text-moire-status-d']"
                    aria-label="Delete notification"
                    title="Delete notification"
                    @click="$emit('delete', entry)"
                >
                    <Trash2 :size="16" />
                </Button>
            </span>
        </span>
        <!-- Sets Open in browser apart from the row actions, and shows with them.
             The ring tone, since it only shows on the hover fill, which matches the
             regular border tone. It keeps its space while hidden, so nothing shifts
             on hover. -->
        <span
            class="h-5 w-px shrink-0 bg-moire-ring opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
            aria-hidden="true"
        />
        <Button
            variant="outline"
            size="icon-sm"
            :class="ROW_ACTION_CLASS"
            aria-label="Open in browser"
            title="Open in browser"
            @click="$emit('openInBrowser', entry)"
        >
            <ExternalLink :size="16" />
        </Button>
    </div>
</template>
