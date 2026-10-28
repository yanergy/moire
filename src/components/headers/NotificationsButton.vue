<script setup lang="ts">
import { computed } from 'vue';
import { Bell } from '@lucide/vue';
import { useDashboardStore } from '@/stores/dashboard';
import { useUiStore } from '@/stores/ui';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// The bell at the right of the toolbar: its count is the number of unread
// notifications, and it toggles the notifications page, as the Dashboard button
// toggles the dashboard. The count is the dashboard store's, which mirrors the
// notifier in the main process. Renders inside the toolbar's TooltipProvider.
const dashboard = useDashboardStore();
const ui = useUiStore();

const isOpen = computed(() => ui.mainView === 'notifications');

const label = computed(() => {
    if (isOpen.value) {
        return 'Back to the diff';
    }
    return dashboard.unreadCount
        ? `${dashboard.unreadCount} unread ${dashboard.unreadCount === 1 ? 'notification' : 'notifications'}`
        : 'Notifications';
});

function setOpen(on: boolean) {
    ui.setMainView(on ? 'notifications' : 'diff');
}
</script>

<template>
    <Tooltip>
        <TooltipTrigger as-child>
            <!-- Wrapped in a span for the same data-state reason as the toolbar's
                 PR and Dashboard toggles. -->
            <span class="inline-flex">
                <Toggle
                    variant="outline"
                    size="sm"
                    :model-value="isOpen"
                    class="relative size-7 min-w-7 border-moire-border p-0 text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                    aria-label="Notifications"
                    @update:model-value="setOpen"
                >
                    <Bell :size="16" />
                    <span
                        v-if="dashboard.unreadCount"
                        class="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-moire-pr-open px-1 text-center text-[10px] leading-4 font-semibold text-moire-check-fg"
                    >
                        {{ dashboard.unreadCount }}
                    </span>
                </Toggle>
            </span>
        </TooltipTrigger>
        <TooltipContent>{{ label }}</TooltipContent>
    </Tooltip>
</template>
