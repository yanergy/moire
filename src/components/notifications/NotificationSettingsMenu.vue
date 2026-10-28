<script setup lang="ts">
import { computed } from 'vue';
import { SlidersHorizontal } from '@lucide/vue';
import { useDashboardStore } from '@/stores/dashboard';
import { NOTIFICATION_TYPES } from '@/lib/dashboard';
import type { DashboardEventKind } from '@/shared/types';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// The notifications page's settings menu, built like the dashboard's: the master
// switch, whether draft PRs notify (apart from the dashboard's own drafts
// toggle), and one toggle per notification type. The state is the main
// process's (see setNotificationSettings in the dashboard store), so the
// Git > Notifications menu stays in step with it.
const dashboard = useDashboardStore();

const settings = computed(() => dashboard.notificationSettings);
const enabled = computed(() => settings.value?.enabled ?? false);

function setEvent(kind: DashboardEventKind, on: boolean) {
    void dashboard.setNotificationSettings({ events: { [kind]: on } });
}

// Keep the menu open when a checkbox is toggled, so several can be set in one go.
function keepOpen(event: Event) {
    event.preventDefault();
}

// The dashboard settings menu's surface and row styling.
const menuSurface = 'min-w-[220px] border-moire-border bg-moire-pop text-moire-fg';
const menuSurfaceStyle = { boxShadow: 'var(--moire-pop-shadow)' };
const menuRow = 'text-xs text-moire-file-fg focus:bg-moire-hover focus:text-moire-fg';
</script>

<template>
    <DropdownMenu>
        <DropdownMenuTrigger as-child>
            <Button
                variant="outline"
                size="sm"
                class="h-7 shrink-0 gap-1.5 border-moire-border px-2.5 text-moire-muted hover:bg-moire-hover hover:text-moire-fg data-[state=open]:bg-moire-hover data-[state=open]:text-moire-fg"
                aria-label="Notification settings"
            >
                <SlidersHorizontal :size="16" />
                Notification settings
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
            align="end"
            :side-offset="6"
            :class="menuSurface"
            :style="menuSurfaceStyle"
        >
            <template v-if="settings">
                <DropdownMenuCheckboxItem
                    :model-value="settings.enabled"
                    :class="menuRow"
                    @select="keepOpen"
                    @update:model-value="dashboard.setNotificationSettings({ enabled: $event })"
                >
                    GitHub notifications
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                    :model-value="settings.notifyDrafts"
                    :disabled="!enabled"
                    :class="menuRow"
                    @select="keepOpen"
                    @update:model-value="
                        dashboard.setNotificationSettings({ notifyDrafts: $event })
                    "
                >
                    Notify about draft PRs
                </DropdownMenuCheckboxItem>
                <!-- Padding, not margin, around the rule: the unlayered
                     `* { margin: 0 }` reset in base.css zeroes margin utilities. -->
                <div class="py-1.5">
                    <DropdownMenuSeparator class="bg-moire-border" />
                </div>
                <DropdownMenuLabel
                    class="text-[11px] font-medium tracking-wider text-moire-faint uppercase"
                >
                    Notify me when
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                    v-for="type in NOTIFICATION_TYPES"
                    :key="type.kind"
                    :model-value="settings.events[type.kind]"
                    :disabled="!enabled"
                    :class="menuRow"
                    @select="keepOpen"
                    @update:model-value="setEvent(type.kind, $event)"
                >
                    <span class="size-2 shrink-0 rounded-full" :class="type.dotClass" />
                    {{ type.label }}
                </DropdownMenuCheckboxItem>
            </template>
            <DropdownMenuItem v-else disabled :class="menuRow">
                Loading the notification settings…
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
</template>
