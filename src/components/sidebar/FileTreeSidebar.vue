<script setup lang="ts">
import { Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import type { FileNode } from '@/stores/comparison';
import type { FileStatus } from '@/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const comparison = useComparisonStore();

// The folder tooltip is a slow, deliberate reveal (not the snappy default), shown
// on every folder row so the full path is always reachable on hover.
const FOLDER_TOOLTIP_DELAY = 1500;

// The --moire-status-* tokens carry separate light/dark values tuned for contrast
// on each background, so full strength stays legible in both themes.
const STATUS_CLASS: Record<FileStatus, string> = {
    A: 'text-moire-status-a',
    M: 'text-moire-status-m',
    D: 'text-moire-status-d',
    R: 'text-moire-status-r',
};

function indent(depth: number): string {
    return `${8 + depth * 15}px`;
}

// Reviewed files keep the green "viewed" treatment; selection gets a neutral
// highlight. What changed is conveyed by the status-colored filename instead.
function rowClasses(node: FileNode): string {
    if (node.viewed) {
        return node.selected
            ? 'bg-moire-viewed-sel hover:bg-moire-viewed-hover'
            : 'bg-moire-viewed hover:bg-moire-viewed-hover';
    }

    return node.selected ? 'bg-moire-sel-row hover:bg-moire-hover' : 'hover:bg-moire-hover';
}

function rowStyle(node: FileNode): Record<string, string> {
    const style: Record<string, string> = { paddingLeft: indent(node.depth) };
    if (node.selected) {
        const color = node.viewed ? 'var(--moire-viewed-edge)' : 'var(--moire-accent)';
        style.boxShadow = `inset 2px 0 0 0 ${color}`;
    }

    return style;
}

function nameClass(node: FileNode): string {
    // Reviewed files stay green; otherwise the filename takes the status color
    // (green added, red deleted, blue modified, purple renamed).
    return node.viewed ? 'text-moire-viewed-fg' : STATUS_CLASS[node.status];
}

function checkboxClass(node: FileNode): string {
    const checked =
        'data-[state=checked]:border-moire-viewed-edge data-[state=checked]:bg-moire-viewed-edge data-[state=checked]:text-moire-check-fg';

    // On a selected row the background matches --moire-border, so lift the empty
    // checkbox to --moire-ring to keep it visible (hover does the same).
    if (node.selected) {
        return `border-moire-ring ${checked}`;
    }

    return `border-moire-border group-hover:border-moire-ring ${checked}`;
}
</script>

<template>
    <TooltipProvider :delay-duration="300">
        <div class="flex w-[312px] flex-none flex-col border-r border-moire-border bg-moire-chrome">
            <div class="flex items-center gap-2 px-3 pt-3 pb-2">
                <span class="text-xs font-semibold text-moire-fg">Changed files</span>
                <Badge
                    variant="outline"
                    class="border-moire-border px-[7px] text-[11px] font-medium text-moire-muted"
                >
                    {{ comparison.fileCount }}
                </Badge>
                <div class="flex-1" />
                <Tooltip>
                    <TooltipTrigger as-child>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            :aria-label="comparison.allCollapsed ? 'Expand all' : 'Collapse all'"
                            class="text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                            @click="comparison.toggleAll()"
                        >
                            <ChevronsUpDown v-if="comparison.allCollapsed" :size="16" />
                            <ChevronsDownUp v-else :size="16" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {{ comparison.allCollapsed ? 'Expand all' : 'Collapse all' }}
                    </TooltipContent>
                </Tooltip>
                <span class="flex items-center gap-1.5 text-[11px] text-moire-muted">
                    <span class="size-2 rounded-sm bg-moire-viewed-edge" />
                    {{ comparison.viewedCount }} viewed
                </span>
            </div>

            <div class="px-3 pb-2.5">
                <Input
                    v-model="comparison.treeFilter"
                    placeholder="Filter files…"
                    class="h-8 border-moire-border bg-transparent font-mono text-moire-fg focus-visible:border-moire-ring focus-visible:ring-0"
                />
            </div>

            <ScrollArea class="min-h-0 flex-1">
                <div class="px-2 pb-3">
                    <template v-for="node in comparison.treeNodes" :key="node.key">
                        <Tooltip v-if="node.kind === 'dir'" :delay-duration="FOLDER_TOOLTIP_DELAY">
                            <TooltipTrigger as-child>
                                <Button
                                    variant="ghost"
                                    class="h-auto w-full justify-start gap-1.5 rounded-md py-[5px] pr-2 font-normal text-moire-muted hover:bg-moire-hover hover:text-moire-muted dark:hover:bg-moire-hover"
                                    :style="{ paddingLeft: indent(node.depth) }"
                                    @click="comparison.toggleDir(node.path)"
                                >
                                    <ChevronDown
                                        v-if="node.open"
                                        class="size-4 shrink-0 text-moire-faint"
                                    />
                                    <ChevronRight v-else class="size-4 shrink-0 text-moire-faint" />
                                    <span
                                        class="flex-1 truncate text-left font-mono text-xs text-moire-muted"
                                    >
                                        {{ node.name }}
                                    </span>
                                    <span
                                        class="font-mono text-[10px]"
                                        :class="
                                            node.allSeen
                                                ? 'text-moire-viewed-fg'
                                                : 'text-moire-faint'
                                        "
                                    >
                                        {{ node.seen }}/{{ node.total }}
                                    </span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" class="font-mono">
                                {{ node.path }}
                            </TooltipContent>
                        </Tooltip>

                        <!-- A file row stays a div, not a Button: it holds an interactive
                             Checkbox (a button-in-button is invalid), and shadcn has no
                             list-row primitive. Click selects; double-click marks viewed. -->
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
                            <span
                                class="flex-1 truncate font-mono text-xs"
                                :class="nameClass(node)"
                            >
                                {{ node.name }}
                            </span>
                            <span class="font-mono text-[11px] text-moire-add-fg">
                                {{ node.additions ? '+' + node.additions : '' }}
                            </span>
                            <span class="font-mono text-[11px] text-moire-del-fg">
                                {{ node.deletions ? '−' + node.deletions : '' }}
                            </span>
                            <span @click.stop>
                                <Checkbox
                                    :model-value="node.viewed"
                                    :aria-label="node.viewed ? 'Marked viewed' : 'Mark as viewed'"
                                    class="size-[15px] rounded-sm shadow-none"
                                    :class="checkboxClass(node)"
                                    @update:model-value="comparison.toggleViewed(node.path)"
                                >
                                    <Check :size="11" />
                                </Checkbox>
                            </span>
                        </div>
                    </template>
                </div>
            </ScrollArea>
        </div>
    </TooltipProvider>
</template>
