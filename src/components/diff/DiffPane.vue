<script setup lang="ts">
import { computed, ref } from 'vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import BinaryFileNotice from '@/components/diff/BinaryFileNotice.vue';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import ImagePreview from '@/components/diff/ImagePreview.vue';
import LargeFileGate from '@/components/diff/LargeFileGate.vue';
import SelectionBanner from '@/components/diff/SelectionBanner.vue';
import StatusBar from '@/components/diff/StatusBar.vue';

const comparison = useComparisonStore();
const ui = useUiStore();

const diffRef = ref<InstanceType<typeof DiffViewer> | null>(null);
const changeCount = ref(0);

// The editor is shown only when nothing else claims the pane (the size gate, an
// image preview, or the binary notice). Its change count is meaningless otherwise.
const showViewer = computed(
    () => !comparison.showDiffGate && !comparison.showImagePreview && !comparison.showBinaryNotice
);

// The header labels the two sides split (base | head) or the range unified,
// following the view toggle. An image preview is always split, so it keeps the
// split header regardless of the toggle, which is then a no-op while on an image.
const splitHeader = computed(() => ui.viewMode === 'split' || comparison.showImagePreview);
</script>

<template>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-moire-app">
        <selection-banner
            :file="comparison.selectedFile"
            :viewed="comparison.isViewed(comparison.selectedFile.path)"
            :change-count="showViewer ? changeCount : 0"
            @prev="diffRef?.prev()"
            @next="diffRef?.next()"
            @toggle-viewed="comparison.toggleViewed(comparison.selectedFile.path)"
        />

        <div
            class="flex h-7 flex-none items-stretch border-b border-moire-border bg-moire-chrome font-mono text-[11px] text-moire-muted"
        >
            <template v-if="splitHeader">
                <div class="flex flex-1 items-center overflow-hidden px-3 whitespace-nowrap">
                    {{ comparison.base }}
                </div>
                <div class="w-px bg-moire-border" />
                <div class="flex flex-1 items-center overflow-hidden px-3 whitespace-nowrap">
                    {{ comparison.head }}
                </div>
            </template>
            <div v-else class="flex flex-1 items-center overflow-hidden px-3 whitespace-nowrap">
                {{ comparison.rangeLabel }}
            </div>
        </div>

        <!-- A large file is held behind a gate so an accidental click can't freeze
             Monaco; picking "Load diff" mounts the editor with the fetched pair. An
             image shows a before/after preview, and any other binary a notice, since
             none of them have a text diff. -->
        <large-file-gate
            v-if="comparison.showDiffGate"
            class="min-h-0 flex-1"
            :size-bytes="comparison.selectedPair.sizeBytes"
            @load="comparison.loadLargeDiff()"
        />
        <image-preview
            v-else-if="comparison.showImagePreview"
            class="min-h-0 flex-1"
            :old-image="comparison.selectedPair.oldImage ?? null"
            :new-image="comparison.selectedPair.newImage ?? null"
        />
        <binary-file-notice v-else-if="comparison.showBinaryNotice" class="min-h-0 flex-1" />
        <diff-viewer
            v-else
            ref="diffRef"
            class="min-h-0 flex-1"
            :original="comparison.selectedPair.oldContent"
            :modified="comparison.selectedPair.newContent"
            :language="comparison.selectedPair.language"
            :view-mode="ui.viewMode"
            :is-dark="ui.isDark"
            :code-style="ui.codeStyle"
            @update:change-count="changeCount = $event"
        />

        <status-bar />
    </div>
</template>
