<script setup lang="ts">
import { computed } from 'vue';
import { useDashboardStore } from '@/stores/dashboard';
import { NOTIFICATION_TYPES } from '@/lib/dashboard';
import type { DashboardEventKind } from '@/shared/types';
import { Checkbox } from '@/components/ui/checkbox';

// The notification settings, shown beside the list on the notifications page:
// the master switch, whether draft PRs notify (apart from the dashboard's own
// drafts toggle), and one toggle per notification type. The state is the main
// process's (see setNotificationSettings in the dashboard store), so the
// Git > Notifications menu stays in step with it.
const dashboard = useDashboardStore();

const settings = computed(() => dashboard.notificationSettings);
const enabled = computed(() => settings.value?.enabled ?? false);

function setEvent(kind: DashboardEventKind, on: boolean) {
    void dashboard.setNotificationSettings({ events: { [kind]: on } });
}

const ROW = 'flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] text-moire-fg';
const CHECKBOX = 'border-moire-border';
</script>

<template>
    <div v-if="settings" class="py-1">
        <label :class="ROW">
            <Checkbox
                :model-value="settings.enabled"
                :class="CHECKBOX"
                @update:model-value="
                    dashboard.setNotificationSettings({ enabled: $event === true })
                "
            />
            <span class="flex-1">GitHub notifications</span>
        </label>
        <label :class="[ROW, { 'cursor-not-allowed opacity-50': !enabled }]">
            <Checkbox
                :model-value="settings.notifyDrafts"
                :disabled="!enabled"
                :class="CHECKBOX"
                @update:model-value="
                    dashboard.setNotificationSettings({ notifyDrafts: $event === true })
                "
            />
            <span class="flex-1">Notify about draft PRs</span>
        </label>

        <div class="mt-1 border-t border-moire-border px-3 pt-2.5 pb-1">
            <span class="text-[11px] font-medium tracking-wider text-moire-faint uppercase">
                Notify me when
            </span>
        </div>
        <label
            v-for="type in NOTIFICATION_TYPES"
            :key="type.kind"
            :class="[ROW, { 'cursor-not-allowed opacity-50': !enabled }]"
        >
            <Checkbox
                :model-value="settings.events[type.kind]"
                :disabled="!enabled"
                :class="CHECKBOX"
                @update:model-value="setEvent(type.kind, $event === true)"
            />
            <span class="size-2 shrink-0 rounded-full" :class="type.dotClass" />
            <span class="flex-1">{{ type.label }}</span>
        </label>
    </div>
    <p v-else class="px-3 py-4 text-[13px] text-moire-muted">Loading the notification settings…</p>
</template>
