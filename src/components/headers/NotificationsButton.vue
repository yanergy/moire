<script setup lang="ts">
import { computed } from 'vue';
import { Bell } from '@lucide/vue';
import { useDashboardStore } from '@/stores/dashboard';
import { useUiStore } from '@/stores/ui';
import { Toggle } from '@/components/ui/toggle';

// The Notifications toggle beside the toolbar's Dashboard toggle, and styled
// like it: it toggles the notifications page. A badge on its corner counts the
// unread notifications, laid over the button so its width never changes. The
// count is the dashboard store's, which mirrors the notifier in the main process.
const dashboard = useDashboardStore();
const ui = useUiStore();

const isOpen = computed(() => ui.mainView === 'notifications');

const unreadLabel = computed(
    () =>
        `${dashboard.unreadCount} unread ${dashboard.unreadCount === 1 ? 'notification' : 'notifications'}`
);

function setOpen(on: boolean) {
    ui.setMainView(on ? 'notifications' : 'diff');
}
</script>

<template>
    <Toggle
        variant="outline"
        size="sm"
        :model-value="isOpen"
        class="relative h-8 gap-2 px-3.5 text-[13px] font-medium text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
        @update:model-value="setOpen"
    >
        <Bell :size="18" />
        Notifications
        <span
            v-if="dashboard.unreadCount"
            class="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-moire-pr-open px-1 text-center text-[10px] leading-4 font-semibold text-moire-check-fg"
            :aria-label="unreadLabel"
        >
            {{ dashboard.unreadCount }}
        </span>
    </Toggle>
</template>
