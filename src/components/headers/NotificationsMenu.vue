<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ArrowLeft, Bell, CheckCheck, Settings } from '@lucide/vue';
import { useDashboardStore } from '@/stores/dashboard';
import { activityId } from '@/lib/dashboard';
import type { ActivityEntry } from '@/shared/types';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import NotificationRow from '@/components/headers/NotificationRow.vue';
import NotificationSettings from '@/components/headers/NotificationSettings.vue';

// The bell at the right of the toolbar: its count is the number of unread
// notifications, and it opens the list of every notification sent for the open
// repository (newest first), with mark read, delete and mark all read. Its gear
// swaps the list for the notification settings. The data is the dashboard
// store's, which mirrors the notifier in the main process.
const dashboard = useDashboardStore();

const open = ref(false);
const showSettings = ref(false);

// The settings come with the dashboard state, which nothing may have loaded yet
// (notifications off, dashboard never opened), so load it when they are asked for.
function openSettings() {
    showSettings.value = true;
    if (!dashboard.notificationSettings) {
        void dashboard.load();
    }
}

const bellLabel = computed(() =>
    dashboard.unreadCount
        ? `${dashboard.unreadCount} unread ${dashboard.unreadCount === 1 ? 'notification' : 'notifications'}`
        : 'Notifications'
);

// One clock for every "3h ago", ticking only while the menu is open.
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

watch(open, (isOpen) => {
    clearInterval(clock);
    if (isOpen) {
        // Every open starts on the list.
        showSettings.value = false;
        now.value = Date.now();
        clock = setInterval(() => {
            now.value = Date.now();
        }, 30_000);
    }
});

onBeforeUnmount(() => clearInterval(clock));

// Focus the menu itself on open rather than its first focusable element: that
// is in the first row, which would then show its actions as if it were selected.
// Focus stays inside the menu, so Tab moves into the list and Escape closes it.
function focusMenu(event: Event) {
    event.preventDefault();
    (event.target as HTMLElement)
        .querySelector<HTMLElement>('[data-slot="popover-content"]')
        ?.focus();
}

// Opening a notification leaves the menu, for the PR view or the browser.
function openEntry(entry: ActivityEntry) {
    open.value = false;
    dashboard.openActivity(entry);
}
</script>

<template>
    <TooltipProvider :delay-duration="300" ignore-non-keyboard-focus>
        <Popover v-model:open="open">
            <!-- The popover's own anchor, outside the tooltip: nested in the tooltip,
                 PopoverTrigger would register the button as the tooltip's anchor and
                 leave the popover unpositioned (both build on Reka's Popper). -->
            <PopoverAnchor as-child>
                <span class="inline-flex">
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <PopoverTrigger as-child>
                                <Button
                                    variant="outline"
                                    size="icon-sm"
                                    class="relative size-7 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg data-[state=open]:bg-moire-hover data-[state=open]:text-moire-fg"
                                    aria-label="Notifications"
                                >
                                    <Bell :size="16" />
                                    <span
                                        v-if="dashboard.unreadCount"
                                        class="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-moire-pr-open px-1 text-center text-[10px] leading-4 font-semibold text-moire-check-fg"
                                    >
                                        {{ dashboard.unreadCount }}
                                    </span>
                                </Button>
                            </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent>{{ bellLabel }}</TooltipContent>
                    </Tooltip>
                </span>
            </PopoverAnchor>

            <PopoverContent
                align="end"
                :side-offset="6"
                class="w-[560px] overflow-hidden border-moire-border bg-moire-pop p-0"
                :style="{ boxShadow: 'var(--moire-pop-shadow)' }"
                @open-auto-focus="focusMenu"
            >
                <div class="flex items-center gap-2 border-b border-moire-border py-2 pr-2 pl-3">
                    <template v-if="showSettings">
                        <Tooltip>
                            <TooltipTrigger as-child>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    class="-ml-1.5 size-7 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                                    aria-label="Back to notifications"
                                    @click="showSettings = false"
                                >
                                    <ArrowLeft :size="16" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Back to notifications</TooltipContent>
                        </Tooltip>
                        <h2 class="text-[13px] font-semibold text-moire-fg">
                            Notification settings
                        </h2>
                    </template>
                    <template v-else>
                        <h2 class="text-[13px] font-semibold text-moire-fg">Notifications</h2>
                        <div class="flex-1" />
                        <Button
                            v-if="dashboard.unreadCount"
                            variant="ghost"
                            size="sm"
                            class="h-7 gap-1.5 px-2 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                            @click="dashboard.markAllRead()"
                        >
                            <CheckCheck :size="16" />
                            Mark all as read
                        </Button>
                        <Tooltip>
                            <TooltipTrigger as-child>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    class="size-7 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                                    aria-label="Notification settings"
                                    @click="openSettings"
                                >
                                    <Settings :size="16" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Notification settings</TooltipContent>
                        </Tooltip>
                    </template>
                </div>
                <notification-settings v-if="showSettings" />
                <div
                    v-else-if="dashboard.activity.length"
                    class="max-h-[560px] divide-y divide-moire-border overflow-y-auto"
                >
                    <notification-row
                        v-for="entry in dashboard.activity"
                        :key="activityId(entry)"
                        :entry="entry"
                        :now="now"
                        @open="openEntry"
                        @open-in-browser="dashboard.openActivityInBrowser"
                        @mark-read="dashboard.markRead"
                        @delete="dashboard.deleteNotification"
                    />
                </div>
                <p v-else class="px-3 py-4 text-[13px] text-moire-muted">
                    No notifications for this repository yet.
                </p>
            </PopoverContent>
        </Popover>
    </TooltipProvider>
</template>
