<script setup lang="ts">
import { ExternalLink, Mail, MailOpen, Trash2 } from '@lucide/vue';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// One sent notification on the notifications page: a dot colored by kind,
// what happened, the PR it was about, and how long ago. Clicking it opens
// the PR in Moiré; the always visible Open in browser button at its end opens it
// on GitHub. On hover (or keyboard focus) Mark as read (or, once read, Mark as
// unread) and Delete appear over the age. A read notification fades its dot and text. `now` (epoch
// ms) is the page's shared ticking clock. The icon buttons carry tooltips, so
// the row must render inside a TooltipProvider (MoirePage provides one).
defineProps<{ entry: ActivityEntry; now: number }>();
defineEmits<{
    open: [entry: ActivityEntry];
    openInBrowser: [entry: ActivityEntry];
    markRead: [entry: ActivityEntry];
    markUnread: [entry: ActivityEntry];
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
            <!-- The title's color sits on the truncating span, since the ellipsis
                 takes that span's color, and a cut off title is what it ends. -->
            <span
                class="min-w-0 flex-1 truncate text-[13px]"
                :class="entry.read ? 'text-moire-faint' : 'text-moire-muted'"
            >
                <span :class="entry.read ? 'text-moire-muted' : 'font-medium text-moire-fg'">
                    {{ activityLabel(entry) }}
                </span>
                · #{{ entry.number }} {{ entry.title }}
            </span>
        </button>
        <!-- The age, with Mark as read (or unread) and Delete laid over it on hover.
             The envelope shows the state a click leads to: open for read, closed
             for unread. -->
        <span class="relative flex shrink-0 items-center self-stretch">
            <span class="text-[12px] text-moire-faint" :class="ROW_MARKER_CLASS">
                {{ timeSince(Date.parse(entry.at), now) }}
            </span>
            <span :class="ROW_ACTIONS_CLASS">
                <Tooltip v-if="!entry.read">
                    <TooltipTrigger as-child>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            :class="ROW_ACTION_CLASS"
                            aria-label="Mark as read"
                            @click="$emit('markRead', entry)"
                        >
                            <MailOpen :size="16" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Mark as read</TooltipContent>
                </Tooltip>
                <Tooltip v-else>
                    <TooltipTrigger as-child>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            :class="ROW_ACTION_CLASS"
                            aria-label="Mark as unread"
                            @click="$emit('markUnread', entry)"
                        >
                            <Mail :size="16" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Mark as unread</TooltipContent>
                </Tooltip>
                <!-- Red, in the failure tone the Checks tab uses, as it is destructive. -->
                <Tooltip>
                    <TooltipTrigger as-child>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            :class="[
                                ROW_ACTION_CLASS,
                                'text-moire-status-d hover:text-moire-status-d',
                            ]"
                            aria-label="Delete notification"
                            @click="$emit('delete', entry)"
                        >
                            <Trash2 :size="16" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete notification</TooltipContent>
                </Tooltip>
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
        <Tooltip>
            <TooltipTrigger as-child>
                <Button
                    variant="outline"
                    size="icon-sm"
                    :class="ROW_ACTION_CLASS"
                    aria-label="Open in browser"
                    @click="$emit('openInBrowser', entry)"
                >
                    <ExternalLink :size="16" />
                </Button>
            </TooltipTrigger>
            <TooltipContent>Open in browser</TooltipContent>
        </Tooltip>
    </div>
</template>
