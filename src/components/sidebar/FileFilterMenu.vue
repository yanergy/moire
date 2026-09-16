<script setup lang="ts">
import { computed } from 'vue';
import { ListFilter, X } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const comparison = useComparisonStore();

// Whether any facet has something to offer: an empty change set (no repo, or a range
// with no changes) leaves every facet empty, so the menu shows an empty note.
const hasAnyOption = computed(
    () =>
        comparison.availableExtensions.length > 0 ||
        comparison.availableStatuses.length > 0 ||
        comparison.availableMarkers.length > 0
);

// Keep the menu open when a checkbox is toggled (filters are multi-select), rather
// than the menu's default close-on-select.
function keepOpen(event: Event) {
    event.preventDefault();
}

// Clearing keeps the menu open too, so the now-empty facets stay in view.
function clearAll(event: Event) {
    event.preventDefault();
    comparison.clearFilters();
}

// Shared moire styling for the popover surfaces and their rows, layered over the
// primitive's neutral defaults (as the repository picker does for its popover).
const surface = 'min-w-[196px] border-moire-border bg-moire-pop text-moire-fg';
const surfaceStyle = { boxShadow: 'var(--moire-pop-shadow)' };
const row = 'text-xs text-moire-file-fg focus:bg-moire-hover focus:text-moire-fg';
</script>

<template>
    <DropdownMenu>
        <DropdownMenuTrigger as-child>
            <Button
                variant="outline"
                size="xs"
                aria-label="Filter files"
                class="h-auto gap-1 rounded-full px-[7px] py-0.5 text-[11px] font-normal data-[state=open]:bg-moire-hover"
                :class="
                    comparison.hasActiveFilters
                        ? 'border-moire-accent dark:border-moire-accent text-moire-accent hover:bg-moire-hover hover:text-moire-accent'
                        : 'border-moire-border dark:border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg'
                "
            >
                <ListFilter />
                <span>Filter</span>
                <!-- With filters active, a reset cross clears them without opening the
                     menu. It stops the trigger's own open on pointerdown/click. -->
                <span
                    v-if="comparison.hasActiveFilters"
                    role="button"
                    tabindex="0"
                    aria-label="Clear filters"
                    title="Clear filters"
                    class="-mr-0.5 flex size-3.5 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/15"
                    @pointerdown.stop
                    @click.stop="comparison.clearFilters()"
                    @keydown.enter.stop.prevent="comparison.clearFilters()"
                >
                    <X />
                </span>
            </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" :side-offset="6" :class="surface" :style="surfaceStyle">
            <p v-if="!hasAnyOption" class="px-2 py-3 text-center text-xs text-moire-faint">
                No files to filter.
            </p>

            <template v-else>
                <!-- Filetype: every extension present in the change set. -->
                <DropdownMenuSub v-if="comparison.availableExtensions.length > 0">
                    <DropdownMenuSubTrigger :class="row">
                        <span class="flex-1">Filetype</span>
                        <span
                            v-if="comparison.filterExtensions.size > 0"
                            class="text-xs font-semibold text-moire-accent"
                        >
                            {{ comparison.filterExtensions.size }}
                        </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                        :align-offset="-5"
                        :side-offset="5"
                        :class="surface"
                        :style="surfaceStyle"
                    >
                        <DropdownMenuCheckboxItem
                            v-for="opt in comparison.availableExtensions"
                            :key="opt.value"
                            :model-value="comparison.filterExtensions.has(opt.value)"
                            :class="row"
                            @select="keepOpen"
                            @update:model-value="comparison.toggleExtensionFilter(opt.value)"
                        >
                            <span class="flex-1 truncate font-mono">{{ opt.label }}</span>
                            <span class="text-xs text-moire-faint">{{ opt.count }}</span>
                        </DropdownMenuCheckboxItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                <!-- Mutation type: the file statuses present, by mutation. -->
                <DropdownMenuSub v-if="comparison.availableStatuses.length > 0">
                    <DropdownMenuSubTrigger :class="row">
                        <span class="flex-1">Mutation type</span>
                        <span
                            v-if="comparison.filterStatuses.size > 0"
                            class="text-xs font-semibold text-moire-accent"
                        >
                            {{ comparison.filterStatuses.size }}
                        </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                        :align-offset="-5"
                        :side-offset="5"
                        :class="surface"
                        :style="surfaceStyle"
                    >
                        <DropdownMenuCheckboxItem
                            v-for="opt in comparison.availableStatuses"
                            :key="opt.value"
                            :model-value="comparison.filterStatuses.has(opt.value)"
                            :class="row"
                            @select="keepOpen"
                            @update:model-value="comparison.toggleStatusFilter(opt.value)"
                        >
                            <span class="flex-1 truncate">{{ opt.label }}</span>
                            <span class="text-xs text-moire-faint">{{ opt.count }}</span>
                        </DropdownMenuCheckboxItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                <!-- Markers: files carrying a CI error/warning or a review comment. -->
                <DropdownMenuSub v-if="comparison.availableMarkers.length > 0">
                    <DropdownMenuSubTrigger :class="row">
                        <span class="flex-1">Markers</span>
                        <span
                            v-if="comparison.filterMarkers.size > 0"
                            class="text-xs font-semibold text-moire-accent"
                        >
                            {{ comparison.filterMarkers.size }}
                        </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                        :align-offset="-5"
                        :side-offset="5"
                        :class="surface"
                        :style="surfaceStyle"
                    >
                        <DropdownMenuCheckboxItem
                            v-for="opt in comparison.availableMarkers"
                            :key="opt.value"
                            :model-value="comparison.filterMarkers.has(opt.value)"
                            :class="row"
                            @select="keepOpen"
                            @update:model-value="comparison.toggleMarkerFilter(opt.value)"
                        >
                            <span class="flex-1 truncate">{{ opt.label }}</span>
                            <span class="text-xs text-moire-faint">{{ opt.count }}</span>
                        </DropdownMenuCheckboxItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                <template v-if="comparison.hasActiveFilters">
                    <DropdownMenuSeparator class="bg-moire-border" />
                    <DropdownMenuItem
                        :class="[row, 'justify-center text-moire-muted']"
                        @select="clearAll"
                    >
                        Clear all
                    </DropdownMenuItem>
                </template>
            </template>
        </DropdownMenuContent>
    </DropdownMenu>
</template>
