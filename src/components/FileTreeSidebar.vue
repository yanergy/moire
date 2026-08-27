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
    const checked =
        'data-[state=checked]:border-dv-viewed-edge data-[state=checked]:bg-dv-viewed-edge data-[state=checked]:text-dv-check-fg';

    // On a selected row the background matches --dv-border, so lift the empty
    // checkbox to --dv-ring to keep it visible (hover does the same).
    if (node.selected) {
        return `border-dv-ring ${checked}`;
    }

    return `border-dv-border group-hover:border-dv-ring ${checked}`;
}
</script>

<template>
    <TooltipProvider :delay-duration="300">
        <div class="flex w-[312px] flex-none flex-col border-r border-dv-border bg-dv-chrome">
            <div class="flex items-center gap-2 px-3 pt-3 pb-2">
                <span class="text-xs font-semibold text-dv-fg">Changed files</span>
                <Badge
                    variant="outline"
                    class="border-dv-border px-[7px] text-[11px] font-medium text-dv-muted"
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
                            class="text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
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
                <span class="flex items-center gap-1.5 text-[11px] text-dv-muted">
                    <span class="size-2 rounded-sm bg-dv-viewed-edge" />
                    {{ comparison.viewedCount }} viewed
                </span>
            </div>

            <div class="px-3 pb-2.5">
                <Input
                    v-model="comparison.treeFilter"
                    placeholder="Filter files…"
                    class="h-8 border-dv-border bg-transparent font-mono text-xs text-dv-fg focus-visible:border-dv-ring focus-visible:ring-0"
                />
            </div>

            <ScrollArea class="min-h-0 flex-1">
                <div class="px-2 pb-3">
                    <template v-for="node in comparison.treeNodes" :key="node.key">
                        <Button
                            v-if="node.kind === 'dir'"
                            variant="ghost"
                            class="h-auto w-full justify-start gap-1.5 rounded-md py-[5px] pr-2 font-normal text-dv-muted hover:bg-dv-hover hover:text-dv-muted dark:hover:bg-dv-hover"
                            :style="{ paddingLeft: indent(node.depth) }"
                            @click="comparison.toggleDir(node.path)"
                        >
                            <ChevronDown v-if="node.open" class="size-4 shrink-0 text-dv-faint" />
                            <ChevronRight v-else class="size-4 shrink-0 text-dv-faint" />
                            <span class="flex-1 truncate text-left font-mono text-xs text-dv-muted">
                                {{ node.name }}
                            </span>
                            <span
                                class="font-mono text-[10px]"
                                :class="node.allSeen ? 'text-dv-viewed-fg' : 'text-dv-faint'"
                            >
                                {{ node.seen }}/{{ node.total }}
                            </span>
                        </Button>

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
                            <span class="font-mono text-[11px] text-dv-add-fg">
                                {{ node.additions ? '+' + node.additions : '' }}
                            </span>
                            <span class="font-mono text-[11px] text-dv-del-fg">
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
