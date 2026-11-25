<script setup lang="ts">
// A small icon button that copies a piece of text (a branch name, say) to the
// system clipboard through the preload bridge, then shows a check and "Copied" in
// its tooltip for a moment.
import { onBeforeUnmount, ref } from 'vue';
import { Check, Copy } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const props = defineProps<{
    text: string;
    // What the button copies, for its tooltip and aria-label ("Copy branch name").
    label: string;
}>();

const COPIED_MS = 1500;

const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
    await window.api?.copyText(props.text);
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
        copied.value = false;
    }, COPIED_MS);
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
    <Tooltip>
        <TooltipTrigger as-child>
            <Button
                variant="ghost"
                size="icon-xs"
                data-slot="copy-button"
                :data-copied="copied || undefined"
                :aria-label="label"
                class="size-5 text-moire-faint hover:bg-moire-hover hover:text-moire-fg"
                @click="copy"
            >
                <Check v-if="copied" :size="14" class="text-moire-status-a" />
                <Copy v-else :size="14" />
            </Button>
        </TooltipTrigger>
        <TooltipContent>{{ copied ? 'Copied' : label }}</TooltipContent>
    </Tooltip>
</template>
