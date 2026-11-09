<script setup lang="ts">
import { computed } from 'vue';
import { Bell } from '@lucide/vue';
import { useDashboardStore } from '@/stores/dashboard';
import { useUiStore } from '@/stores/ui';
import ToolbarNavButton from '@/components/headers/ToolbarNavButton.vue';

// The toolbar's Notifications page tab, beside the Dashboard tab and styled
// like it. A count after its label shows the unread notifications. The count is
// the dashboard store's, which mirrors the notifier in the main process.
defineProps<{
    selected: boolean;
}>();

const dashboard = useDashboardStore();
const ui = useUiStore();

const unreadLabel = computed(
    () =>
        `${dashboard.unreadCount} unread ${dashboard.unreadCount === 1 ? 'notification' : 'notifications'}`
);
</script>

<template>
    <toolbar-nav-button :selected="selected" look="tab" @navigate="ui.setMainView('notifications')">
        <Bell :size="18" />
        Notifications
        <span
            v-if="dashboard.unreadCount"
            class="min-w-4 rounded-full bg-moire-pr-open px-1 text-center text-[10px] leading-4 font-semibold text-moire-check-fg"
            :aria-label="unreadLabel"
        >
            {{ dashboard.unreadCount }}
        </span>
    </toolbar-nav-button>
</template>
