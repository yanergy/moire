<script setup lang="ts">
import type { DropdownMenuCheckboxItemEmits, DropdownMenuCheckboxItemProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { Check } from '@lucide/vue';
import { reactiveOmit } from '@vueuse/core';
import { DropdownMenuCheckboxItem, DropdownMenuItemIndicator, useForwardPropsEmits } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<DropdownMenuCheckboxItemProps & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<DropdownMenuCheckboxItemEmits>();

const delegatedProps = reactiveOmit(props, 'class');

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
    <DropdownMenuCheckboxItem
        data-slot="dropdown-menu-checkbox-item"
        v-bind="forwarded"
        :class="
            cn(
                `group focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0`,
                props.class
            )
        "
    >
        <!-- A leading checkbox box like the file tree's: an outlined square that
             fills accent with a check once the option is selected. -->
        <span
            class="flex size-[15px] shrink-0 items-center justify-center rounded-sm border border-moire-border group-hover:border-moire-ring group-data-[state=checked]:border-moire-accent group-data-[state=checked]:bg-moire-accent group-data-[state=checked]:text-moire-check-fg"
        >
            <DropdownMenuItemIndicator>
                <slot name="indicator-icon">
                    <Check :size="11" />
                </slot>
            </DropdownMenuItemIndicator>
        </span>
        <slot />
    </DropdownMenuCheckboxItem>
</template>
