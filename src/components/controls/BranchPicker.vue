<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, ChevronDown } from '@lucide/vue';
import type { BranchInfo } from '@/shared/types';
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

// A searchable branch dropdown for the Settings page: the repo's local branches,
// then its remote ones, plus an optional "None" for a branch the repo may not
// have. `value` is the branch shown as picked (null for None).
const props = defineProps<{
    branches: BranchInfo[];
    value: string | null;
    allowNone?: boolean;
    label: string;
}>();

const emit = defineEmits<{
    select: [name: string | null];
}>();

const open = ref(false);

// cmdk-style filtering matches on the item value, so None gets a value no branch
// name can have (git refuses spaces in ref names).
const NONE = 'no branch';

const groups = computed(() =>
    [
        { heading: 'Local', items: props.branches.filter((b) => b.kind === 'local') },
        { heading: 'Remote', items: props.branches.filter((b) => b.kind === 'remote') },
    ].filter((group) => group.items.length)
);

function pick(name: string | null) {
    emit('select', name);
    open.value = false;
}
</script>

<template>
    <Popover v-model:open="open">
        <PopoverTrigger as-child>
            <Button
                variant="ghost"
                :aria-label="label"
                class="h-8 w-[280px] justify-start gap-2.5 rounded-md border border-moire-border bg-transparent px-3 font-normal text-moire-fg hover:bg-moire-hover hover:text-moire-fg dark:hover:bg-moire-hover"
                :class="
                    open ? 'border-moire-ring hover:bg-transparent dark:hover:bg-transparent' : ''
                "
                :style="open ? { boxShadow: 'var(--moire-ring-glow)' } : undefined"
            >
                <span
                    class="flex-1 truncate text-left text-xs"
                    :class="value ? 'font-mono text-moire-fg' : 'text-moire-muted'"
                >
                    {{ value ?? 'None' }}
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
                <CommandInput placeholder="Search branches…" class="font-mono text-moire-fg" />
                <CommandList class="max-h-[322px]">
                    <CommandEmpty class="text-moire-faint">No branches found.</CommandEmpty>
                    <CommandGroup v-if="allowNone">
                        <CommandItem
                            :value="NONE"
                            class="gap-2 text-xs text-moire-file-fg data-[highlighted]:bg-moire-hover data-[highlighted]:text-moire-fg"
                            @select="pick(null)"
                        >
                            <Check
                                :size="14"
                                :class="value === null ? 'text-moire-fg' : 'text-transparent'"
                            />
                            None
                        </CommandItem>
                    </CommandGroup>
                    <CommandGroup
                        v-for="group in groups"
                        :key="group.heading"
                        :heading="group.heading"
                        class="**:data-[slot=command-group-heading]:text-moire-faint"
                    >
                        <CommandItem
                            v-for="branch in group.items"
                            :key="branch.name"
                            :value="branch.name"
                            class="gap-2 font-mono text-xs text-moire-file-fg data-[highlighted]:bg-moire-hover data-[highlighted]:text-moire-fg"
                            @select="pick(branch.name)"
                        >
                            <Check
                                :size="14"
                                :class="
                                    branch.name === value ? 'text-moire-fg' : 'text-transparent'
                                "
                            />
                            <span class="flex-1 truncate" :title="branch.name">
                                {{ branch.name }}
                            </span>
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </Command>
        </PopoverContent>
    </Popover>
</template>
