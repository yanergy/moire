<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown, FolderGit2, FolderOpen, X } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Command,
    CommandGroup,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command';

const comparison = useComparisonStore();

const open = ref(false);

// Lazy-load recents each time the menu opens so the list is always fresh.
function onOpenChange(value: boolean) {
    open.value = value;
    if (value) {
        comparison.loadRecentRepos();
    }
}

function baseName(path: string): string {
    const parts = path.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] ?? path;
}

async function pickFolder() {
    open.value = false;
    await comparison.openRepository();
}

async function openRecent(path: string) {
    open.value = false;
    await comparison.openRecent(path);
}
</script>

<template>
    <Popover :open="open" @update:open="onOpenChange">
        <PopoverTrigger as-child>
            <Button
                variant="outline"
                size="sm"
                class="gap-2 border-moire-border text-[13px] font-medium text-moire-fg hover:bg-moire-hover"
            >
                <FolderGit2
                    :size="14"
                    :class="comparison.repoName ? 'text-moire-accent' : 'text-moire-faint'"
                />
                <span v-if="comparison.repoName" class="truncate">{{ comparison.repoName }}</span>
                <span v-else class="font-normal text-moire-faint">Select a repository…</span>
                <ChevronDown :size="12" class="text-moire-faint" />
            </Button>
        </PopoverTrigger>

        <PopoverContent
            align="start"
            :side-offset="6"
            class="w-[306px] overflow-hidden border-moire-border bg-moire-pop p-0"
            :style="{ boxShadow: 'var(--moire-pop-shadow)' }"
        >
            <Command class="bg-transparent">
                <CommandList class="max-h-[322px]">
                    <CommandGroup v-if="comparison.recentRepos.length > 0" heading="Recent">
                        <CommandItem
                            v-for="path in comparison.recentRepos"
                            :key="path"
                            :value="path"
                            :title="path"
                            class="group gap-2 text-xs text-moire-file-fg data-[highlighted]:bg-moire-hover data-[highlighted]:text-moire-fg"
                            @select="openRecent(path)"
                        >
                            <FolderGit2 :size="14" class="shrink-0 text-moire-faint" />
                            <span class="flex-1 truncate">{{ baseName(path) }}</span>
                            <button
                                type="button"
                                aria-label="Remove from recents"
                                class="shrink-0 rounded-sm p-0.5 text-moire-faint opacity-0 group-hover:opacity-100 group-data-[highlighted]:opacity-100 hover:bg-moire-border hover:text-moire-fg"
                                @click.stop="comparison.removeRecent(path)"
                                @pointerdown.stop
                            >
                                <X :size="13" />
                            </button>
                        </CommandItem>
                    </CommandGroup>

                    <CommandSeparator v-if="comparison.recentRepos.length > 0" class="my-1" />

                    <CommandGroup>
                        <CommandItem
                            value="Open folder"
                            class="gap-2 text-xs text-moire-file-fg data-[highlighted]:bg-moire-hover data-[highlighted]:text-moire-fg"
                            @select="pickFolder()"
                        >
                            <FolderOpen :size="14" class="shrink-0 text-moire-faint" />
                            <span class="flex-1">Open folder…</span>
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </Command>
        </PopoverContent>
    </Popover>
</template>
