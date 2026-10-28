<script setup lang="ts">
import { computed } from 'vue';
import { Bell } from '@lucide/vue';
import { useDashboardStore } from '@/stores/dashboard';
import { useUiStore } from '@/stores/ui';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// The Notifications toggle beside the toolbar's Dashboard toggle, and styled
// like it: it toggles the notifications page, and counts the unread
// notifications. The count is the dashboard store's, which mirrors the notifier
// in the main process. Renders inside the toolbar's TooltipProvider.
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
    <Tooltip>
        <TooltipTrigger as-child>
            <!-- Wrapped in a span for the same data-state reason as the toolbar's
                 PR and Dashboard toggles. -->
            <span class="inline-flex">
                <Toggle
                    variant="outline"
                    size="sm"
                    :model-value="isOpen"
                    class="h-8 gap-2 px-3.5 text-[13px] font-medium text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                    @update:model-value="setOpen"
                >
                    <Bell :size="18" />
                    Notifications
                    <span
                        v-if="dashboard.unreadCount"
                        class="min-w-4 rounded-full bg-moire-pr-open px-1.5 text-center text-[11px] leading-4 font-semibold text-moire-check-fg"
                        :aria-label="unreadLabel"
                    >
                        {{ dashboard.unreadCount }}
                    </span>
                </Toggle>
            </span>
        </TooltipTrigger>
        <TooltipContent>
            <template v-if="isOpen">Back to the diff</template>
            <template v-else-if="dashboard.unreadCount">{{ unreadLabel }}</template>
            <template v-else>Open the notifications</template>
        </TooltipContent>
    </Tooltip>
</template>
