<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue';
import { useUiStore } from '@/stores/ui';
import { useComparisonStore } from '@/stores/comparison';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const ui = useUiStore();
const comparison = useComparisonStore();
</script>

<template>
    <TooltipProvider :delay-duration="300">
        <div
            class="flex h-9 flex-none items-center gap-3.5 border-b border-dv-border bg-dv-chrome px-3.5"
        >
            <div class="flex gap-2">
                <span class="size-3 rounded-full bg-dv-tl-red" />
                <span class="size-3 rounded-full bg-dv-tl-yellow" />
                <span class="size-3 rounded-full bg-dv-tl-green" />
            </div>

            <div class="flex-1 truncate text-center text-xs text-dv-muted">
                Moiré — <span class="font-medium text-dv-fg">{{ comparison.repoName }}</span>
            </div>

            <Tooltip>
                <TooltipTrigger as-child>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        class="h-[22px] w-7 text-dv-muted hover:bg-dv-hover hover:text-dv-fg"
                        @click="ui.toggleTheme()"
                    >
                        <Sun v-if="ui.isDark" :size="16" />
                        <Moon v-else :size="16" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
        </div>
    </TooltipProvider>
</template>
