<script setup lang="ts">
// Before/after preview for an image file, which has no text diff. The pane always
// splits in two (base on the left, head on the right) to match the branch labels
// in the header above. A side that has no image (an add on the base side, a delete
// on the head side) is filled with a diagonal hatch, the way the diff editor marks
// a region absent on that side.
defineProps<{
    oldImage: string | null;
    newImage: string | null;
}>();

// No Tailwind utility for a diagonal hatch; --moire-border keeps it subtle and
// theme-aware.
const HATCH =
    'repeating-linear-gradient(-45deg, var(--moire-border) 0, var(--moire-border) 1px, transparent 1px, transparent 8px)';
</script>

<template>
    <div class="flex bg-moire-code">
        <div
            class="flex flex-1 items-center justify-center overflow-hidden p-6"
            :style="oldImage ? undefined : { backgroundImage: HATCH }"
        >
            <img
                v-if="oldImage"
                :src="oldImage"
                alt=""
                class="max-h-full max-w-full rounded-sm border border-moire-border object-contain"
            />
        </div>
        <div class="w-px bg-moire-border" />
        <div
            class="flex flex-1 items-center justify-center overflow-hidden p-6"
            :style="newImage ? undefined : { backgroundImage: HATCH }"
        >
            <img
                v-if="newImage"
                :src="newImage"
                alt=""
                class="max-h-full max-w-full rounded-sm border border-moire-border object-contain"
            />
        </div>
    </div>
</template>
