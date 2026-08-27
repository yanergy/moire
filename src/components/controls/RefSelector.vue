<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, ChevronDown } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
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

const current = computed(() => (props.side === 'base' ? comparison.base : comparison.head));

interface RefItem {
    name: string;
    meta: string;
}

interface RefGroup {
    label: string;
    items: RefItem[];
}

// The full, unfiltered set of refs. Command does the text filtering itself as
// the user types, so this component only owns the grouping.
const groups = computed<RefGroup[]>(() => {
    const result: RefGroup[] = [];

    if (props.side === 'head') {
        result.push({ label: 'Uncommitted', items: [{ name: WORKING_TREE, meta: 'on disk' }] });
    }

    const local = comparison.localBranches.map((b) => ({ name: b.name, meta: b.meta ?? '' }));
    if (local.length > 0) {
        result.push({ label: 'Local branches', items: local });
    }

    const remote = comparison.remoteBranches.map((b) => ({ name: b.name, meta: b.meta ?? '' }));
    if (remote.length > 0) {
        result.push({ label: 'Remotes', items: remote });
    }

    return result;
});

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
            <Command class="bg-transparent">
                <CommandInput placeholder="Search refs…" class="font-mono text-moire-fg" />
                <CommandList class="max-h-[322px]">
                    <CommandEmpty class="text-moire-faint">No refs found.</CommandEmpty>
                    <CommandGroup v-for="group in groups" :key="group.label" :heading="group.label">
                        <CommandItem
                            v-for="item in group.items"
                            :key="item.name"
                            :value="item.name"
                            class="gap-2 font-mono text-xs text-moire-file-fg data-[highlighted]:bg-moire-hover data-[highlighted]:text-moire-fg"
                            @select="pick(item.name)"
                        >
                            <Check
                                :size="14"
                                :class="
                                    item.name === current ? 'text-moire-fg' : 'text-transparent'
                                "
                            />
                            <span class="flex-1 truncate">{{ item.name }}</span>
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
