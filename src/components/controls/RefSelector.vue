<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import type { BranchInfo } from '@/shared/types';
import { WORKING_TREE } from '@/shared/types';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';

const props = defineProps<{
    side: 'base' | 'head';
}>();

const comparison = useComparisonStore();

const open = ref(false);

// The live search text, mirrored from Command's input (whose input events bubble
// up to the <Command> root). Used so a collapsed group still reveals its matches
// while the user is searching.
const search = ref('');
const searching = computed(() => search.value.trim().length > 0);
const collapsed = ref<Record<string, boolean>>({});

// Reset the transient search when the popover closes, so a stale query does not
// keep groups force-expanded the next time it opens.
watch(open, (isOpen) => {
    if (!isOpen) {
        search.value = '';
    }
});

function onSearch(event: Event) {
    search.value = (event.target as HTMLInputElement).value;
}

function toggleGroup(label: string) {
    collapsed.value = { ...collapsed.value, [label]: !collapsed.value[label] };
}

// A collapsed group hides its items, except while searching, when every match
// must stay reachable regardless of the collapse state.
function isCollapsed(label: string): boolean {
    return collapsed.value[label] === true && !searching.value;
}

const current = computed(() => (props.side === 'base' ? comparison.base : comparison.head));

interface RefItem {
    name: string; // full ref, used as the value, the check, and the store update
    label: string; // the leaf shown in the list (the segment after the last slash)
    meta: string;
}

interface RefGroup {
    label: string;
    items: RefItem[];
    // A pinned group renders its rows at the top with no collapsible header, for
    // the working tree and the checked-out branch (the two most-picked refs).
    pinned?: boolean;
}

// Group branches by their path prefix so a long flat list stays scannable:
// `user/feature/dev-123` shows as `dev-123` under a `user/feature` heading.
// Branches with no slash stay flat under the given top-level heading.
function groupByPrefix(list: BranchInfo[], topLabel: string): RefGroup[] {
    const top: RefItem[] = [];
    const byPrefix = new Map<string, RefItem[]>();

    for (const branch of list) {
        const slash = branch.name.lastIndexOf('/');
        const item: RefItem = {
            name: branch.name,
            label: slash === -1 ? branch.name : branch.name.slice(slash + 1),
            // No per-branch note here: the working-tree and current-branch rows
            // are the only annotated ones, and both are special-cased in `groups`.
            meta: '',
        };
        if (slash === -1) {
            top.push(item);
            continue;
        }

        const prefix = branch.name.slice(0, slash);
        const bucket = byPrefix.get(prefix);
        if (bucket) {
            bucket.push(item);
            continue;
        }

        byPrefix.set(prefix, [item]);
    }

    const groups: RefGroup[] = [];
    if (top.length > 0) {
        groups.push({ label: topLabel, items: top });
    }

    // A fresh array from the Map spread, so sorting it in place mutates nothing
    // shared (and toSorted is not in the project's TS lib target).
    // oxlint-disable-next-line unicorn/no-array-sort
    const sorted = [...byPrefix].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [prefix, items] of sorted) {
        groups.push({ label: prefix, items });
    }

    return groups;
}

// The full, unfiltered set of refs. Command does the text filtering itself as
// the user types, so this component only owns the grouping.
const groups = computed<RefGroup[]>(() => {
    const result: RefGroup[] = [];

    // The working tree and the checked-out branch are the two most-picked refs, so
    // they sit at the very top as plain rows (pinned: no collapsible header). The
    // current branch shows its full name and is dropped from "Local branches"
    // below so it never appears twice.
    if (props.side === 'head') {
        result.push({
            label: 'Uncommitted',
            pinned: true,
            items: [{ name: WORKING_TREE, label: WORKING_TREE, meta: 'on disk' }],
        });
    }

    const currentBranch = comparison.localBranches.find((b) => b.isCurrent);
    if (currentBranch) {
        result.push({
            label: 'Current',
            pinned: true,
            // The "current" note makes clear why this row is pinned to the top.
            items: [{ name: currentBranch.name, label: currentBranch.name, meta: 'current' }],
        });
    }

    const locals = comparison.localBranches.filter((b) => !b.isCurrent);
    result.push(...groupByPrefix(locals, 'Local branches'));
    result.push(...groupByPrefix(comparison.remoteBranches, 'Remotes'));

    return result;
});

// Collapse/expand-all mirrors the file tree: the single toggle opens everything
// only when it is already fully closed, and otherwise closes everything.
// Only the collapsible groups take part in collapse/expand-all; the pinned rows
// have no header and always stay visible.
const groupLabels = computed(() =>
    groups.value.filter((group) => !group.pinned).map((group) => group.label)
);
const allCollapsed = computed(
    () =>
        groupLabels.value.length > 0 &&
        groupLabels.value.every((label) => collapsed.value[label] === true)
);

function expandAll() {
    collapsed.value = {};
}

function collapseAll() {
    const next: Record<string, boolean> = {};
    for (const label of groupLabels.value) {
        next[label] = true;
    }

    collapsed.value = next;
}

function toggleAll() {
    if (allCollapsed.value) {
        expandAll();
        return;
    }

    collapseAll();
}

function pick(name: string) {
    if (props.side === 'base') {
        comparison.setBase(name);
    } else {
        comparison.setHead(name);
    }

    open.value = false;
}
</script>

<template>
    <Popover v-model:open="open">
        <PopoverTrigger as-child>
            <Button
                variant="ghost"
                class="h-8 min-w-[196px] justify-start gap-2.5 rounded-md border border-moire-border bg-transparent px-3 font-normal text-moire-fg hover:bg-moire-hover hover:text-moire-fg dark:hover:bg-moire-hover"
                :class="
                    open ? 'border-moire-ring hover:bg-transparent dark:hover:bg-transparent' : ''
                "
                :style="open ? { boxShadow: 'var(--moire-ring-glow)' } : undefined"
            >
                <span class="text-[10px] tracking-wider text-moire-faint uppercase">{{
                    side
                }}</span>
                <span class="flex-1 truncate text-left font-mono text-xs text-moire-fg">
                    {{ current }}
                </span>
                <ChevronDown class="size-3 shrink-0 text-moire-faint" />
            </Button>
        </PopoverTrigger>

        <PopoverContent
            align="start"
            :side-offset="6"
            class="w-[306px] overflow-hidden border-moire-border bg-moire-pop p-0"
            :style="{ boxShadow: 'var(--moire-pop-shadow)' }"
        >
            <Command class="bg-transparent" @input="onSearch">
                <CommandInput placeholder="Search refs…" class="font-mono text-moire-fg" />
                <div class="flex items-center justify-between px-2.5 py-1">
                    <span class="text-[10px] font-medium tracking-wider text-moire-faint uppercase">
                        Branches
                    </span>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        :aria-label="allCollapsed ? 'Expand all groups' : 'Collapse all groups'"
                        :title="allCollapsed ? 'Expand all' : 'Collapse all'"
                        class="text-moire-faint hover:bg-moire-hover hover:text-moire-fg"
                        @click="toggleAll()"
                    >
                        <ChevronsUpDown v-if="allCollapsed" :size="14" />
                        <ChevronsDownUp v-else :size="14" />
                    </Button>
                </div>
                <CommandList class="max-h-[322px]">
                    <CommandEmpty class="text-moire-faint">No refs found.</CommandEmpty>
                    <CommandGroup v-for="group in groups" :key="group.label">
                        <button
                            v-if="!group.pinned"
                            type="button"
                            data-slot="ref-group-header"
                            class="flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-left text-xs font-medium text-moire-faint hover:bg-moire-hover hover:text-moire-fg"
                            :aria-expanded="!isCollapsed(group.label)"
                            @click="toggleGroup(group.label)"
                        >
                            <ChevronRight
                                :size="12"
                                class="shrink-0 transition-transform"
                                :class="isCollapsed(group.label) ? '' : 'rotate-90'"
                            />
                            <span data-slot="ref-group-label" class="flex-1 truncate">{{
                                group.label
                            }}</span>
                            <span class="text-[10px] tabular-nums text-moire-faint">{{
                                group.items.length
                            }}</span>
                        </button>
                        <CommandItem
                            v-for="item in group.items"
                            :key="item.name"
                            :value="item.name"
                            :disabled="isCollapsed(group.label)"
                            class="gap-2 font-mono text-xs text-moire-file-fg data-[highlighted]:bg-moire-hover data-[highlighted]:text-moire-fg"
                            :class="{ hidden: isCollapsed(group.label) }"
                            @select="pick(item.name)"
                        >
                            <Check
                                :size="14"
                                :class="
                                    item.name === current ? 'text-moire-fg' : 'text-transparent'
                                "
                            />
                            <span class="flex-1 truncate" :title="item.name">{{ item.label }}</span>
                            <!-- Full path, hidden but kept in the text so Command
                                 searches match the prefix as well as the leaf. -->
                            <span class="sr-only">{{ item.name }}</span>
                            <span class="text-[11px] whitespace-nowrap text-moire-faint">
                                {{ item.meta }}
                            </span>
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </Command>
        </PopoverContent>
    </Popover>
</template>
