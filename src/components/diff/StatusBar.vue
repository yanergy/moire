<script setup lang="ts">
import { computed } from 'vue';
import { useTimestamp } from '@vueuse/core';
import { useComparisonStore } from '@/stores/comparison';
import { languageLabel } from '@/lib/language';
import { detectEol, timeSince } from '@/lib/status-bar';

const comparison = useComparisonStore();

// A live clock so "synced N ago" ages on its own without a manual re-render. One
// second is fine for a status line.
const now = useTimestamp({ interval: 1000 });

const langLabel = computed(() => languageLabel(comparison.selectedPair.language));

// Line ending detected from the file's own content (the head side, or the base
// side for a deletion). Empty for a binary file, whose text is withheld.
const eol = computed(() =>
    detectEol(comparison.selectedPair.newContent ?? comparison.selectedPair.oldContent)
);

const syncedAgo = computed(() =>
    comparison.lastSyncedAt === null ? '' : timeSince(comparison.lastSyncedAt, now.value)
);
</script>

<template>
    <div
        class="flex h-[26px] flex-none items-center gap-3.5 border-t border-moire-border bg-moire-chrome px-3.5 text-[11px] text-moire-muted"
    >
        <span class="whitespace-nowrap">{{ comparison.fileCount }} files changed</span>
        <span class="whitespace-nowrap text-moire-add-fg">+{{ comparison.totalAdditions }}</span>
        <span class="whitespace-nowrap text-moire-del-fg">−{{ comparison.totalDeletions }}</span>

        <div class="flex-1" />

        <span v-if="comparison.selectedPair.path" class="whitespace-nowrap text-moire-faint">
            {{ langLabel }}<template v-if="eol"> · {{ eol }}</template>
        </span>
        <!-- The repo watcher (main process) re-reads the diff whenever the open
             repo changes on disk, so a green dot and the last sync time are a
             truthful liveness readout while a repo is open. -->
        <span v-if="comparison.repoPath" class="flex items-center gap-1.5 whitespace-nowrap">
            <span class="size-1.5 rounded-full bg-moire-add-fg" />
            Watching for changes<template v-if="syncedAgo"> · synced {{ syncedAgo }}</template>
        </span>
    </div>
</template>
