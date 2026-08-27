<script setup lang="ts">
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import type { FileNode } from '@/stores/comparison';
import type { FileStatus } from '@/shared/types';

const comparison = useComparisonStore();

// The --dv-status-* tokens carry separate light/dark values tuned for contrast
// on each background, so full strength stays legible in both themes.
const STATUS_CLASS: Record<FileStatus, string> = {
    A: 'text-dv-status-a',
    M: 'text-dv-status-m',
    D: 'text-dv-status-d',
    R: 'text-dv-status-r',
};

function indent(depth: number): string {
    return `${8 + depth * 15}px`;
}

// Reviewed files keep the green "viewed" treatment; selection gets a neutral
// highlight. What changed is conveyed by the status-colored filename instead.
function rowClasses(node: FileNode): string {
    if (node.viewed) {
        return node.selected
            ? 'bg-dv-viewed-sel hover:bg-dv-viewed-hover'
            : 'bg-dv-viewed hover:bg-dv-viewed-hover';
    }

    return node.selected ? 'bg-dv-sel-row hover:bg-dv-hover' : 'hover:bg-dv-hover';
}

function rowStyle(node: FileNode): Record<string, string> {
    const style: Record<string, string> = { paddingLeft: indent(node.depth) };
    if (node.selected) {
        const color = node.viewed ? 'var(--dv-viewed-edge)' : 'var(--dv-accent)';
        style.boxShadow = `inset 2px 0 0 0 ${color}`;
    }

    return style;
}

function nameClass(node: FileNode): string {
    // Reviewed files stay green; otherwise the filename takes the status color
    // (green added, red deleted, blue modified, purple renamed).
    return node.viewed ? 'text-dv-viewed-fg' : STATUS_CLASS[node.status];
}

function checkboxClass(node: FileNode): string {
    if (node.viewed) {
        return 'border-dv-viewed-edge bg-dv-viewed-edge text-dv-check-fg';
    }

    // On a selected row the background matches --dv-border, so lift the empty
    // checkbox to --dv-ring to keep it visible (hover does the same).
    if (node.selected) {
        return 'border-dv-ring text-transparent';
    }

    return 'border-dv-border text-transparent group-hover:border-dv-ring';
}
</script>

<template>
    <div class="flex w-[312px] flex-none flex-col border-r border-dv-border bg-dv-chrome">
        <div class="flex items-center gap-2 px-3 pt-3 pb-2">
            <span class="text-xs font-semibold text-dv-fg">Changed files</span>
            <span
                class="rounded-full border border-dv-border px-[7px] text-[11px] font-medium text-dv-muted"
            >
                {{ comparison.fileCount }}
            </span>
            <div class="flex-1" />
            <button
                type="button"
                :title="comparison.allCollapsed ? 'Expand all' : 'Collapse all'"
                class="flex size-6 items-center justify-center rounded-md text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
                @click="comparison.toggleAll()"
            >
                <chevrons-up-down v-if="comparison.allCollapsed" :size="14" />
                <chevrons-down-up v-else :size="14" />
            </button>
            <span class="flex items-center gap-1.5 text-[11px] text-dv-muted">
                <span class="size-2 rounded-sm bg-dv-viewed-edge" />
                {{ comparison.viewedCount }} viewed
            </span>
        </div>

        <div class="px-3 pb-2.5">
            <input
                v-model="comparison.treeFilter"
                placeholder="Filter files…"
                class="h-8 w-full rounded-md border border-dv-border bg-transparent px-2.5 font-mono text-xs text-dv-fg outline-none focus:border-dv-ring"
            />
        </div>

        <div class="flex-1 overflow-y-auto px-2 pb-3">
            <template v-for="node in comparison.treeNodes" :key="node.key">
                <button
                    v-if="node.kind === 'dir'"
                    type="button"
                    class="flex w-full items-center gap-1.5 rounded-md py-[5px] pr-2 hover:bg-dv-hover"
                    :style="{ paddingLeft: indent(node.depth) }"
                    @click="comparison.toggleDir(node.path)"
                >
                    <chevron-down v-if="node.open" :size="13" class="shrink-0 text-dv-faint" />
                    <chevron-right v-else :size="13" class="shrink-0 text-dv-faint" />
                    <span class="flex-1 truncate text-left font-mono text-xs text-dv-muted">
                        {{ node.name }}
                    </span>
                    <span
                        class="font-mono text-[10px]"
                        :class="node.allSeen ? 'text-dv-viewed-fg' : 'text-dv-faint'"
                    >
                        {{ node.seen }}/{{ node.total }}
                    </span>
                </button>

                <div
                    v-else
                    class="group flex w-full cursor-pointer items-center gap-2 rounded-md py-[5px] pr-2"
                    :class="rowClasses(node)"
                    :style="rowStyle(node)"
                    :title="node.path"
                    @click="comparison.selectFile(node.path)"
                    @dblclick="comparison.toggleViewed(node.path)"
                >
                    <span
                        class="w-[13px] shrink-0 text-center font-mono text-[11px] font-bold"
                        :class="STATUS_CLASS[node.status]"
                    >
                        {{ node.status }}
                    </span>
                    <span class="flex-1 truncate font-mono text-xs" :class="nameClass(node)">
                        {{ node.name }}
                    </span>
                    <span class="font-mono text-[11px] text-dv-add-fg">
                        {{ node.additions ? '+' + node.additions : '' }}
                    </span>
                    <span class="font-mono text-[11px] text-dv-del-fg">
                        {{ node.deletions ? '−' + node.deletions : '' }}
                    </span>
                    <button
                        type="button"
                        :title="node.viewed ? 'Marked viewed — click to unmark' : 'Mark as viewed'"
                        class="flex size-[15px] shrink-0 items-center justify-center rounded-sm border text-[9px] leading-none"
                        :class="checkboxClass(node)"
                        @click.stop="comparison.toggleViewed(node.path)"
                    >
                        {{ node.viewed ? '✓' : '' }}
                    </button>
                </div>
            </template>
        </div>
    </div>
</template>
