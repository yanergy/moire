<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { CheckCheck } from '@lucide/vue';
import { useDashboardStore } from '@/stores/dashboard';
import { activityId } from '@/lib/dashboard';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import NotificationRow from '@/components/notifications/NotificationRow.vue';
import NotificationSettings from '@/components/notifications/NotificationSettings.vue';

// The notifications page, opened by the toolbar's bell: every notification sent
// for the open repository (newest first), with mark read, delete and mark all
// read, and the notification settings beside them. The data is the dashboard
// store's, which mirrors the notifier in the main process.
const dashboard = useDashboardStore();

const subtitle = computed(() => {
    const total = dashboard.activity.length;
    if (!total) {
        return '';
    }
    return dashboard.unreadCount ? `${dashboard.unreadCount} unread of ${total}` : `${total}`;
});

// One clock for every "3h ago", ticking while the page is open.
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
    // The settings come with the dashboard state, which nothing may have loaded
    // yet (notifications off, dashboard never opened).
    if (!dashboard.notificationSettings) {
        void dashboard.load();
    }
    clock = setInterval(() => {
        now.value = Date.now();
    }, 30_000);
});

onBeforeUnmount(() => clearInterval(clock));
</script>

<template>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-moire-app">
        <ScrollArea class="notifications-scroll-area min-h-0 flex-1">
            <div class="w-full max-w-[1200px] px-6 pt-8 pb-8">
                <div class="flex min-h-8 items-center gap-3">
                    <span class="text-[18px] font-bold text-moire-fg">Notifications</span>
                    <span class="truncate text-[13px] text-moire-muted">{{ subtitle }}</span>
                    <div class="flex-1" />
                    <Button
                        v-if="dashboard.unreadCount"
                        variant="outline"
                        size="sm"
                        class="h-7 shrink-0 gap-1.5 border-moire-border px-2.5 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                        @click="dashboard.markAllRead()"
                    >
                        <CheckCheck :size="16" />
                        Mark all as read
                    </Button>
                </div>

                <!-- The list, with the settings in a column at its side. -->
                <div class="flex items-start gap-6 pt-6">
                    <div class="min-w-0 flex-1">
                        <div
                            v-if="dashboard.activity.length"
                            class="divide-y divide-moire-border overflow-hidden rounded-lg border border-moire-border"
                        >
                            <notification-row
                                v-for="entry in dashboard.activity"
                                :key="activityId(entry)"
                                :entry="entry"
                                :now="now"
                                @open="dashboard.openActivity"
                                @open-in-browser="dashboard.openActivityInBrowser"
                                @mark-read="dashboard.markRead"
                                @delete="dashboard.deleteNotification"
                            />
                        </div>
                        <p v-else class="py-10 text-[13px] text-moire-muted">
                            No notifications for this repository yet.
                        </p>
                    </div>

                    <section
                        class="w-[280px] shrink-0 overflow-hidden rounded-lg border border-moire-border bg-moire-chrome"
                    >
                        <h2
                            class="border-b border-moire-border px-3 py-2.5 text-[13px] font-semibold text-moire-fg"
                        >
                            Settings
                        </h2>
                        <notification-settings />
                    </section>
                </div>
            </div>
        </ScrollArea>
    </div>
</template>

<!-- Unscoped, as the dashboard's (see DashboardView.vue): an opaque viewport, and
     its width-less slot wrapper forced full width to center the content column. -->
<style>
.notifications-scroll-area [data-reka-scroll-area-viewport] {
    background-color: var(--moire-app);
}

.notifications-scroll-area [data-reka-scroll-area-viewport] > div {
    display: flex;
    width: 100%;
    justify-content: center;
}
</style>
