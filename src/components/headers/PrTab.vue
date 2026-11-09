<script setup lang="ts">
import { computed } from 'vue';
import { GitPullRequest, GitPullRequestDraft, LoaderCircle, TriangleAlert } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { useUiStore } from '@/stores/ui';
import ToolbarNavButton from '@/components/headers/ToolbarNavButton.vue';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// The toolbar's PR tab, right after Diff: the PR view is the compared range's
// other view (its conversation, as Diff is its files). It keeps its place while a
// repository is open and changes state instead of coming and going, so the centered
// tabs never shift when the range changes:
//   - a PR is found: "PR #n" with its status dot, going to the PR view
//   - the lookup is running: a spinner (the previous range's status is not shown,
//     so it cannot be misread as the new one's)
//   - no PR for the branches, or the gh lookup failed: disabled, with the reason
//     (and how to fix a failed lookup) in the tooltip
const props = defineProps<{
    selected: boolean;
}>();

const comparison = useComparisonStore();
const ui = useUiStore();

type TabState = 'ok' | 'loading' | 'warning' | 'none';
const state = computed<TabState>(() => {
    if (comparison.prLoading) {
        return 'loading';
    }
    if (comparison.hasPullRequest) {
        return 'ok';
    }

    return comparison.prWarning ? 'warning' : 'none';
});

const pr = computed(() => comparison.pullRequest);

// The status dot: vibrant green open, red closed, purple merged, gray draft, and
// yellow when changes are requested (which overrides the draft dot; the draft icon
// still marks it as a draft). The dedicated --moire-pr-* / --moire-changes-* tones
// keep it bright.
const statusDotClass = computed(() => {
    const current = pr.value;
    if (!current) {
        return '';
    }
    if (current.isDraft && current.reviewDecision !== 'CHANGES_REQUESTED') {
        return 'bg-moire-pr-draft';
    }
    if (current.state === 'MERGED') {
        return 'bg-moire-pr-merged';
    }
    if (current.state === 'CLOSED') {
        return 'bg-moire-pr-closed';
    }
    if (current.reviewDecision === 'CHANGES_REQUESTED') {
        return 'bg-moire-changes-fg';
    }
    return 'bg-moire-pr-open';
});

const hint = computed<string[]>(() => {
    switch (state.value) {
        case 'loading':
            return ['Checking for a pull request…'];
        case 'warning':
            return comparison.prWarning ?? [];
        case 'none':
            return ['There is no pull request for these branches.'];
        default:
            return [];
    }
});
</script>

<template>
    <toolbar-nav-button
        v-if="state === 'ok'"
        :selected="props.selected"
        data-slot="pr-tab"
        @navigate="ui.setMainView('pr')"
    >
        <span class="size-2.5 shrink-0 rounded-full" :class="statusDotClass" />
        <GitPullRequestDraft v-if="pr?.isDraft" :size="18" />
        <GitPullRequest v-else :size="18" />
        PR #{{ pr?.number }}
    </toolbar-nav-button>

    <!-- Unavailable: the tooltip trigger is a wrapper, since a disabled control
         would not report the hover. -->
    <Tooltip v-else>
        <TooltipTrigger as-child>
            <span class="flex self-stretch">
                <toolbar-nav-button
                    :selected="false"
                    disabled
                    data-slot="pr-tab"
                    :data-state="state"
                >
                    <LoaderCircle v-if="state === 'loading'" :size="18" class="animate-spin" />
                    <TriangleAlert
                        v-else-if="state === 'warning'"
                        :size="18"
                        class="text-moire-warn"
                    />
                    <GitPullRequest v-else :size="18" />
                    PR
                </toolbar-nav-button>
            </span>
        </TooltipTrigger>
        <TooltipContent class="flex max-w-xs flex-col gap-2">
            <span v-for="(line, i) in hint" :key="i">{{ line }}</span>
        </TooltipContent>
    </Tooltip>
</template>
