<script setup lang="ts">
// The rendered view of a Markdown file: the base version on the left and the head
// version on the right, the way GitHub's "rich diff" shows them. An added or deleted
// file has one version only, which then takes the full width.
import { computed } from 'vue';
import { isRelativeUrl, renderMarkdownFile } from '@/lib/markdown';

const props = defineProps<{
    // null when the file does not exist on that side (an add or a delete).
    oldSource: string | null;
    newSource: string | null;
}>();

const sides = computed(() =>
    [
        { key: 'old', source: props.oldSource },
        { key: 'new', source: props.newSource },
    ]
        .filter((side) => side.source !== null)
        .map((side) => ({ key: side.key, html: renderMarkdownFile(side.source) }))
);

// A web link opens in the browser rather than navigating the app window. A
// relative link points into the repository at some ref, which there is no page
// for, so it does nothing.
function onClick(event: MouseEvent) {
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    const href = anchor?.getAttribute('href');
    if (!href) {
        return;
    }

    event.preventDefault();
    if (isRelativeUrl(href)) {
        return;
    }

    void window.api?.openExternal(href);
}
</script>

<template>
    <div class="overflow-auto bg-moire-app" @click="onClick">
        <div class="flex min-h-full">
            <template v-for="(side, index) in sides" :key="side.key">
                <div v-if="index > 0" class="w-px shrink-0 bg-moire-border" />
                <!-- v-html is safe here: renderMarkdownFile sanitizes the output through
                     DOMPurify (see lib/markdown). -->
                <div
                    class="pr-markdown min-w-0 flex-1 px-6 py-5 text-[14px] leading-[1.6] text-moire-file-fg"
                    :data-side="side.key"
                    v-html="side.html"
                />
            </template>
        </div>
    </div>
</template>
