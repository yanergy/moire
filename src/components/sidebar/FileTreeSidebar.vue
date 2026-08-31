<script setup lang="ts">
import {
    Check,
    ChevronDown,
    ChevronRight,
    ChevronsDownUp,
    ChevronsUpDown,
    Minus,
} from '@lucide/vue';
import { RecycleScroller } from 'vue-virtual-scroller';
import { useComparisonStore } from '@/stores/comparison';
import type { DirNode, FileNode } from '@/stores/comparison';
import type { FileStatus } from '@/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const comparison = useComparisonStore();

// The folder tooltip is a slow, deliberate reveal (not the snappy default), shown
// on every folder row so the full path is always reachable on hover.
const FOLDER_TOOLTIP_DELAY = 1500;

// The tree is virtualized (vue-virtual-scroller), so every row is one fixed height
// the scroller uses to place items. Dir and file rows both hold a single 16px line
// with 5px above and below, so 26px is their real rendered height; the rows set it
// explicitly (below) so the value the scroller trusts can never drift from the CSS.
const ROW_HEIGHT = 26;

// The --moire-status-* tokens carry separate light/dark values tuned for contrast
// on each background, so full strength stays legible in both themes.
const STATUS_CLASS: Record<FileStatus, string> = {
    A: 'text-moire-status-a',
    M: 'text-moire-status-m',
    D: 'text-moire-status-d',
    R: 'text-moire-status-r',
};

// The base inset (16px) matches what the old scrolled list carried as container
// padding; the scroller places rows edge to edge, so each row owns that inset now.
function indent(depth: number): string {
    return `${16 + depth * 15}px`;
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
    const style: Record<string, string> = {
        paddingLeft: indent(node.depth),
        height: `${ROW_HEIGHT}px`,
    };
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

// Checked is a solid green fill with a light glyph. Indeterminate keeps the green
// edge but fills with a subdued tint and a green glyph, so a partly-viewed folder
// reads as distinct (and more muted) than a fully-viewed one. Files only ever go
// checked/unchecked; a folder is indeterminate when some, but not all, of its files
// are viewed.
const VIEWED_CHECK_CLASS =
    'data-[state=checked]:border-moire-viewed-edge data-[state=checked]:bg-moire-viewed-edge data-[state=checked]:text-moire-check-fg data-[state=indeterminate]:border-moire-viewed-edge data-[state=indeterminate]:bg-moire-viewed-partial data-[state=indeterminate]:text-moire-viewed-fg';

// The resting/hover border, used by folder checkboxes always and by file
// checkboxes on unselected rows.
const RESTING_CHECKBOX_CLASS = `border-moire-border group-hover:border-moire-ring ${VIEWED_CHECK_CLASS}`;

function checkboxClass(node: FileNode): string {
    // On a selected row the background matches --moire-border, so lift the empty
    // checkbox to --moire-ring to keep it visible (hover does the same).
    if (node.selected) {
        return `border-moire-ring ${VIEWED_CHECK_CLASS}`;
    }

    return RESTING_CHECKBOX_CLASS;
}

// A folder's checkbox is checked when every file under it is viewed, empty when
// none are, and indeterminate in between.
function dirCheckState(node: DirNode): boolean | 'indeterminate' {
    if (node.allSeen) {
        return true;
    }

    return node.seen > 0 ? 'indeterminate' : false;
}

// Keyboard activation for the tree rows. The rows wrap an interactive Checkbox,
// so they can't be <button>s (button-in-button is invalid); instead they are
// focusable divs with role="button" and Enter/Space activation. The guard skips
// key events that bubbled up from the checkbox, so toggling "viewed" with the
// keyboard doesn't also fire the row's own action.
function isActivation(event: KeyboardEvent): boolean {
    return event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ');
}

function onDirKey(event: KeyboardEvent, node: DirNode): void {
    if (isActivation(event)) {
        event.preventDefault(); // Space would otherwise scroll the list
        comparison.toggleDir(node.path);
    }
}

function onFileKey(event: KeyboardEvent, node: FileNode): void {
    if (isActivation(event)) {
        event.preventDefault();
        comparison.selectFile(node.path);
    }
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

            <!-- Only the rows in view are in the DOM. treeNodes is already the flat,
                 folded, expand-aware row list, so it feeds the scroller directly and
                 each row keeps its own height (ROW_HEIGHT) for placement. -->
            <recycle-scroller
                v-slot="{ item: node }"
                class="min-h-0 flex-1 pb-3"
                :items="comparison.treeNodes"
                :item-size="ROW_HEIGHT"
                key-field="key"
            >
                <!-- Rows are divs, not Buttons: each holds an interactive Checkbox (a
                     button-in-button is invalid) and shadcn has no list-row primitive.
                     A div also has no transition, so the scroller repositioning a row on
                     recycle can't animate the paddingLeft change into a sideways slide. -->
                <Tooltip v-if="node.kind === 'dir'" :delay-duration="FOLDER_TOOLTIP_DELAY">
                    <TooltipTrigger as-child>
                        <!-- Click toggles the folder open; the checkbox marks every file
                             under it viewed. -->
                        <div
                            class="group flex w-full cursor-pointer items-center gap-1.5 rounded-md pr-4 hover:bg-moire-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moire-ring focus-visible:outline-none"
                            :style="{ paddingLeft: indent(node.depth), height: `${ROW_HEIGHT}px` }"
                            role="button"
                            tabindex="0"
                            :aria-expanded="node.open"
                            @click="comparison.toggleDir(node.path)"
                            @keydown="onDirKey($event, node)"
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
                                :class="node.allSeen ? 'text-moire-viewed-fg' : 'text-moire-faint'"
                            >
                                {{ node.seen }}/{{ node.total }}
                            </span>
                            <span @click.stop>
                                <Checkbox
                                    :model-value="dirCheckState(node)"
                                    :aria-label="
                                        node.allSeen
                                            ? 'Mark folder as not viewed'
                                            : 'Mark folder as viewed'
                                    "
                                    class="size-[15px] rounded-sm shadow-none"
                                    :class="RESTING_CHECKBOX_CLASS"
                                    @update:model-value="comparison.toggleDirViewed(node.path)"
                                >
                                    <Minus v-if="!node.allSeen" :size="11" />
                                    <Check v-else :size="11" />
                                </Checkbox>
                            </span>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" class="font-mono">
                        {{ node.path }}
                    </TooltipContent>
                </Tooltip>

                <!-- Click selects; double-click marks viewed. -->
                <div
                    v-else
                    class="group flex w-full cursor-pointer items-center gap-2 rounded-md pr-4 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moire-ring focus-visible:outline-none"
                    :class="rowClasses(node)"
                    :style="rowStyle(node)"
                    :title="node.oldPath ? `${node.oldPath} → ${node.path}` : node.path"
                    role="button"
                    tabindex="0"
                    :aria-current="node.selected ? 'true' : undefined"
                    @click="comparison.selectFile(node.path)"
                    @dblclick="comparison.toggleViewed(node.path)"
                    @keydown="onFileKey($event, node)"
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
            </recycle-scroller>
        </div>
    </TooltipProvider>
</template>
