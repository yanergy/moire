<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, ExternalLink } from '@lucide/vue';
import { useComparisonStore } from '@/stores/comparison';
import { renderMarkdown } from '@/lib/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

const comparison = useComparisonStore();

const pr = computed(() => comparison.pullRequest);

// The description is Markdown; renderMarkdown returns HTML that is safe to insert
// with v-html (raw tags escaped, unsafe link schemes rejected). See lib/markdown.
const renderedBody = computed(() => renderMarkdown(pr.value?.body));

// State pill: a draft PR reads as such regardless of open/closed; otherwise the
// GitHub state maps to the same status colors the file tree already uses (open is
// green like an add, merged purple like a rename, closed red like a delete).
const stateLabel = computed(() => {
    if (!pr.value) {
        return '';
    }

    if (pr.value.isDraft) {
        return 'Draft';
    }

    const byState: Record<string, string> = { OPEN: 'Open', MERGED: 'Merged', CLOSED: 'Closed' };
    return byState[pr.value.state] ?? pr.value.state;
});

const stateClass = computed(() => {
    if (!pr.value || pr.value.isDraft) {
        return 'border-moire-border text-moire-muted';
    }

    const byState: Record<string, string> = {
        OPEN: 'border-moire-status-a text-moire-status-a',
        MERGED: 'border-moire-status-r text-moire-status-r',
        CLOSED: 'border-moire-status-d text-moire-status-d',
    };
    return byState[pr.value.state] ?? 'border-moire-border text-moire-muted';
});

// Up to two initials from the author login (e.g. "s.trivedi" -> "ST"), for the
// avatar chip. A single-word login yields one initial.
const initials = computed(() => {
    const login = pr.value?.author ?? '';
    return login
        .split(/[.\s@_-]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]!.toUpperCase())
        .join('');
});

const hasBody = computed(() => !!pr.value?.body.trim());

function openOnGitHub() {
    if (pr.value?.url) {
        void window.api?.openExternal(pr.value.url);
    }
}

// A link inside the rendered description opens in the browser rather than
// navigating the app window. The main process only opens http(s).
function onBodyClick(event: MouseEvent) {
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    const href = anchor?.getAttribute('href');
    if (!href) {
        return;
    }

    event.preventDefault();
    void window.api?.openExternal(href);
}
</script>

<template>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-moire-app">
        <ScrollArea v-if="pr" class="min-h-0 flex-1">
            <div class="mx-auto max-w-[880px] px-5 py-4">
                <div class="flex items-start gap-3 border-b border-moire-border pb-3.5">
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span class="text-[16px] leading-[1.35] font-semibold text-moire-fg">
                                {{ pr.title }}
                            </span>
                            <span class="text-[15px] font-normal text-moire-faint">
                                #{{ pr.number }}
                            </span>
                        </div>

                        <div
                            class="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-moire-muted"
                        >
                            <span
                                class="flex size-[18px] items-center justify-center rounded-full bg-moire-hover text-[9px] font-semibold text-moire-muted"
                            >
                                {{ initials }}
                            </span>
                            <span class="font-medium text-moire-fg">{{ pr.author }}</span>
                            <span>wants to merge into</span>
                            <span
                                class="rounded bg-moire-hover px-1.5 py-px font-mono text-moire-fg"
                            >
                                {{ pr.baseRefName }}
                            </span>
                            <ArrowRight :size="12" class="text-moire-faint" />
                            <span
                                class="rounded bg-moire-hover px-1.5 py-px font-mono text-moire-fg"
                            >
                                {{ pr.headRefName }}
                            </span>
                        </div>
                    </div>

                    <div class="flex shrink-0 items-center gap-2">
                        <Badge
                            variant="outline"
                            :class="['px-2 py-0.5 text-[10px] font-semibold', stateClass]"
                        >
                            {{ stateLabel }}
                        </Badge>
                        <Button
                            variant="outline"
                            size="sm"
                            class="h-7 gap-1.5 border-moire-border text-moire-muted hover:bg-moire-hover hover:text-moire-fg"
                            @click="openOnGitHub"
                        >
                            <ExternalLink :size="14" />
                            GitHub
                        </Button>
                    </div>
                </div>

                <!-- v-html is safe here: renderMarkdown escapes raw HTML in the
                     source and rejects unsafe link schemes (see lib/markdown). -->
                <div
                    v-if="hasBody"
                    class="pr-markdown pt-4 text-[12.5px] leading-[1.6] text-moire-fg"
                    @click="onBodyClick"
                    v-html="renderedBody"
                />
                <div v-else class="pt-4 text-[12.5px] text-moire-faint italic">
                    No description provided.
                </div>
            </div>
        </ScrollArea>
    </div>
</template>

<style scoped>
/* The rendered Markdown body. Injected via v-html, so it carries no scope
   attribute; :deep reaches it. Element styling leans on the --moire-* tokens so
   it matches the app in both themes. */
:deep(.pr-markdown > *:first-child) {
    margin-top: 0;
}

:deep(.pr-markdown p) {
    margin: 0 0 10px;
}

:deep(.pr-markdown h1),
:deep(.pr-markdown h2),
:deep(.pr-markdown h3),
:deep(.pr-markdown h4) {
    margin: 18px 0 8px;
    font-weight: 600;
    line-height: 1.3;
}

:deep(.pr-markdown h1) {
    font-size: 1.4em;
}

:deep(.pr-markdown h2) {
    font-size: 1.25em;
}

:deep(.pr-markdown h3) {
    font-size: 1.1em;
}

:deep(.pr-markdown h4) {
    font-size: 1em;
}

:deep(.pr-markdown ul),
:deep(.pr-markdown ol) {
    margin: 0 0 10px;
    padding-left: 22px;
}

:deep(.pr-markdown li) {
    margin: 3px 0;
}

:deep(.pr-markdown li > ul),
:deep(.pr-markdown li > ol) {
    margin: 3px 0;
}

:deep(.pr-markdown a) {
    color: var(--moire-accent);
    text-decoration: none;
}

:deep(.pr-markdown a:hover) {
    text-decoration: underline;
}

:deep(.pr-markdown code) {
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--moire-hover);
    font-family: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
    font-size: 0.9em;
}

:deep(.pr-markdown pre) {
    margin: 0 0 12px;
    padding: 10px 12px;
    border: 1px solid var(--moire-border);
    border-radius: 6px;
    overflow-x: auto;
    background: var(--moire-chrome);
}

:deep(.pr-markdown pre code) {
    padding: 0;
    border-radius: 0;
    background: transparent;
    font-size: 0.92em;
}

:deep(.pr-markdown blockquote) {
    margin: 0 0 10px;
    padding: 2px 0 2px 12px;
    border-left: 3px solid var(--moire-border);
    color: var(--moire-muted);
}

:deep(.pr-markdown hr) {
    margin: 16px 0;
    border: 0;
    border-top: 1px solid var(--moire-border);
}

:deep(.pr-markdown img) {
    max-width: 100%;
}

:deep(.pr-markdown table) {
    margin: 0 0 12px;
    border-collapse: collapse;
}

:deep(.pr-markdown th),
:deep(.pr-markdown td) {
    padding: 4px 8px;
    border: 1px solid var(--moire-border);
}
</style>
