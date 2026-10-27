<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { Bell, CheckCheck, FlaskConical } from '@lucide/vue';
import { useDashboardStore } from '@/stores/dashboard';
import { activityId } from '@/lib/dashboard';
import type { ActivityEntry } from '@/shared/types';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import NotificationRow from '@/components/headers/NotificationRow.vue';

// The bell at the right of the toolbar: its count is the number of unread
// notifications, and it opens the list of every notification sent for the open
// repository (newest first), with mark read, delete and mark all read. The data
// is the dashboard store's, which mirrors the notifier in the main process.
const dashboard = useDashboardStore();

// Debug only: the test notifications button shows in dev builds.
const isDev = import.meta.env.DEV;

const open = ref(false);

// One clock for every "3h ago", ticking only while the menu is open.
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

watch(open, (isOpen) => {
    clearInterval(clock);
    if (isOpen) {
        now.value = Date.now();
        clock = setInterval(() => {
            now.value = Date.now();
        }, 30_000);
    }
});

onBeforeUnmount(() => clearInterval(clock));

// Opening a notification leaves the menu, for the PR view or the browser.
function openEntry(entry: ActivityEntry) {
    open.value = false;
    dashboard.openActivity(entry);
}
</script>

<template>
    <Popover v-model:open="open">
        <PopoverTrigger as-child>
            <Button
                variant="outline"
                size="icon-sm"
                class="relative size-7 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg data-[state=open]:bg-moire-hover data-[state=open]:text-moire-fg"
                aria-label="Notifications"
                :title="
                    dashboard.unreadCount
                        ? `${dashboard.unreadCount} unread ${dashboard.unreadCount === 1 ? 'notification' : 'notifications'}`
                        : 'Notifications'
                "
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

        <PopoverContent
            align="end"
            :side-offset="6"
            class="w-[560px] overflow-hidden border-moire-border bg-moire-pop p-0"
            :style="{ boxShadow: 'var(--moire-pop-shadow)' }"
        >
            <div class="flex items-center gap-2 border-b border-moire-border py-2 pr-2 pl-3">
                <h2 class="text-[13px] font-semibold text-moire-fg">Notifications</h2>
                <div class="flex-1" />
                <!-- Debug only, dev builds: hardcoded notifications to check the
                     menu and the card dots (see lib/test-notifications.ts). -->
                <Button
                    v-if="isDev"
                    variant="ghost"
                    size="sm"
                    class="h-7 gap-1.5 px-2 text-moire-warn hover:bg-moire-hover"
                    @click="dashboard.toggleTestNotifications()"
                >
                    <FlaskConical :size="16" />
                    {{ dashboard.testMode ? 'Remove test' : 'Add test' }}
                </Button>
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
            </div>
            <div
                v-if="dashboard.activity.length"
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
</template>
