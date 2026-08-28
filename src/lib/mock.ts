import type { FilePair } from '@/shared/types';
import { inferLanguage } from '@/lib/language';

// Placeholder file-pair content for the diff pane, mirroring the design
// prototype, until file selection is wired to the git backend's getFilePair.
// The real values come from the git backend later; the shape matches so wiring
// it up is a store-level swap, not a component rewrite.

// Showcase file. Long enough that Monaco folds the unchanged regions above and
// below the change cluster, echoing the design's "N unchanged lines" pills.
const PARSERS_OLD = `/**
 * Parsers for \`git diff\` porcelain output.
 *
 * Every git invocation is run with the \`-z\` flag so records are
 * NUL-separated. That keeps paths with spaces or embedded newlines
 * intact instead of being split apart on whitespace.
 */
import type { ChangedFile } from '@/shared/types';

// Rename records look like \`R100\\told\\tnew\`; the score is discarded.
const RENAME = /^R\\d+$/;

// Status letters git can emit in --name-status output.
const STATUS = ['A', 'M', 'D'] as const;

export function parseNameStatus(out: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of out.split('\\n')) {
    if (!line) continue;
    const [status, path] = line.split('\\t');
    files.push({ path, status, additions: 0, deletions: 0, binary: false });
  }
  return files;
}

export function parseNumstat(out: string): Map<string, [number, number]> {
  const counts = new Map<string, [number, number]>();
  for (const rec of out.split('\\0')) {
    if (!rec) continue;
    const [add, del, path] = rec.split('\\t');
    if (add === '-' || del === '-') {
      counts.set(path, [0, 0]);
      continue;
    }
    counts.set(path, [Number(add), Number(del)]);
  }
  return counts;
}

export function isBinary(add: string, del: string): boolean {
  return add === '-' && del === '-';
}
`;

const PARSERS_NEW = `/**
 * Parsers for \`git diff\` porcelain output.
 *
 * Every git invocation is run with the \`-z\` flag so records are
 * NUL-separated. That keeps paths with spaces or embedded newlines
 * intact instead of being split apart on whitespace.
 */
import type { ChangedFile } from '@/shared/types';

// Rename records look like \`R100\\told\\tnew\`; the score is discarded.
const RENAME = /^R\\d+$/;

// Status letters git can emit in --name-status output.
const STATUS = ['A', 'M', 'D', 'R'] as const;

export function parseNameStatus(out: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const rec of out.split('\\0')) {
    if (!rec) continue;
    const [status, path, newPath] = rec.split('\\t');
    files.push({
      path: newPath ?? path,
      oldPath: newPath ? path : undefined,
      status: status[0] as ChangedFile['status'],
      additions: 0,
      deletions: 0,
      binary: false,
    });
  }
  return files;
}

export function parseNumstat(out: string): Map<string, [number, number]> {
  const counts = new Map<string, [number, number]>();
  for (const rec of out.split('\\0')) {
    if (!rec) continue;
    const [add, del, path] = rec.split('\\t');
    if (add === '-' || del === '-') {
      counts.set(path, [0, 0]);
      continue;
    }
    counts.set(path, [Number(add), Number(del)]);
  }
  return counts;
}

export function isBinary(add: string, del: string): boolean {
  return add === '-' && del === '-';
}
`;

const GITSERVICE_OLD = `import { simpleGit, type SimpleGit } from 'simple-git';

export class GitService {
  private git: SimpleGit;

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  async branches(): Promise<string[]> {
    const summary = await this.git.branchLocal();
    return summary.all;
  }
}
`;

const GITSERVICE_NEW = `import { simpleGit, type SimpleGit } from 'simple-git';
import type { BranchInfo, CompareMode } from '@/shared/types';

export class GitService {
  private git: SimpleGit;

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  async branches(): Promise<BranchInfo[]> {
    const local = await this.git.branchLocal();
    const remote = await this.git.branch(['-r']);
    return [
      ...local.all.map((name) => ({ name, kind: 'local' as const })),
      ...remote.all.map((name) => ({ name, kind: 'remote' as const })),
    ];
  }

  private range(base: string, head: string, mode: CompareMode): string {
    return mode === 'merge-base' ? \`\${base}...\${head}\` : \`\${base}..\${head}\`;
  }
}
`;

const HANDLERS_OLD = `import { ipcMain } from 'electron';
import { GitService } from '../git/GitService';

export function registerHandlers(git: GitService) {
  ipcMain.handle('git:branches', () => git.branches());
}
`;

const HANDLERS_NEW = `import { ipcMain } from 'electron';
import { GitService } from '../git/GitService';

export function registerHandlers(git: GitService) {
  ipcMain.handle('git:branches', () => git.branches());
  ipcMain.handle('git:changed-files', (_e, base, head, mode) =>
    git.changedFiles(base, head, mode)
  );
  ipcMain.handle('git:file-pair', (_e, base, head, path) =>
    git.filePair(base, head, path)
  );
}
`;

const REPOWATCHER_NEW = `import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import type { RepoChangeEvent } from '@/shared/types';

// Watches a repository for ref movements and working-tree edits, coalescing
// bursts (rebases, checkouts) into a single debounced change event.
export class RepoWatcher {
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private repoPath: string,
    private onChange: (event: RepoChangeEvent) => void
  ) {}

  start() {
    const gitDir = path.join(this.repoPath, '.git');
    this.watcher = chokidar.watch(
      [path.join(gitDir, 'HEAD'), path.join(gitDir, 'refs'), this.repoPath],
      { ignoreInitial: true, ignored: /(^|[/\\\\])\\.git[/\\\\](?!HEAD|refs)/ }
    );

    this.watcher.on('all', (_event, changed) => {
      const reason = changed.includes(gitDir) ? 'refs' : 'worktree';
      this.schedule(reason);
    });
  }

  private schedule(reason: RepoChangeEvent['reason']) {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.onChange({ reason, at: Date.now() });
    }, 150);
  }

  async stop() {
    await this.watcher?.close();
    this.watcher = null;
  }
}
`;

const TYPES_OLD = `export interface ChangedFile {
  path: string;
  status: 'A' | 'M' | 'D';
  additions: number;
  deletions: number;
}
`;

const TYPES_NEW = `export type FileStatus = 'A' | 'M' | 'D' | 'R';

export interface ChangedFile {
  path: string;
  oldPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
}
`;

const COMPARISON_OLD = `import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useComparisonStore = defineStore('comparison', () => {
  const base = ref('main');
  const head = ref('HEAD');
  return { base, head };
});
`;

const COMPARISON_NEW = `import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { CompareMode } from '@/shared/types';

export const useComparisonStore = defineStore('comparison', () => {
  const base = ref('main');
  const head = ref('WORKING TREE');
  const compareMode = ref<CompareMode>('merge-base');

  const rangeLabel = computed(() =>
    base.value + (compareMode.value === 'merge-base' ? '...' : '..') + head.value
  );

  function swap() {
    [base.value, head.value] = [head.value, base.value];
  }

  return { base, head, compareMode, rangeLabel, swap };
});
`;

const LEGACY_DIFF_OLD = `<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ oldText: string; newText: string }>();

// Hand-rolled line diff; superseded by the Monaco-based DiffPane.
const lines = computed(() => {
  const a = props.oldText.split('\\n');
  const b = props.newText.split('\\n');
  const rows: { kind: string; text: string }[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) rows.push({ kind: 'ctx', text: a[i] ?? '' });
    else {
      if (a[i] !== undefined) rows.push({ kind: 'del', text: a[i] });
      if (b[i] !== undefined) rows.push({ kind: 'add', text: b[i] });
    }
  }
  return rows;
});
</script>

<template>
  <div class="legacy-diff">
    <div v-for="(row, i) in lines" :key="i" :class="row.kind">
      {{ row.text }}
    </div>
  </div>
</template>
`;

const PARSERS_SPEC_OLD = `import { describe, it, expect } from 'vitest';
import { parseNameStatus } from '../electron/git/parsers';

describe('parseNameStatus', () => {
  it('parses added and modified files', () => {
    const out = 'A\\tsrc/a.ts\\nM\\tsrc/b.ts';
    const files = parseNameStatus(out);
    expect(files).toHaveLength(2);
    expect(files[0].status).toBe('A');
  });
});
`;

const PARSERS_SPEC_NEW = `import { describe, it, expect } from 'vitest';
import { parseNameStatus } from '../electron/git/parsers';

describe('parseNameStatus', () => {
  it('parses NUL-separated added and modified files', () => {
    const out = 'A\\tsrc/a.ts\\0M\\tsrc/b.ts';
    const files = parseNameStatus(out);
    expect(files).toHaveLength(2);
    expect(files[0].status).toBe('A');
  });

  it('captures the new path and old path for renames', () => {
    const out = 'R100\\told/name.ts\\tnew/name.ts';
    const [file] = parseNameStatus(out);
    expect(file.status).toBe('R');
    expect(file.path).toBe('new/name.ts');
    expect(file.oldPath).toBe('old/name.ts');
  });
});
`;

interface MockContent {
    old: string | null;
    new: string | null;
}

const CONTENTS: Record<string, MockContent> = {
    'electron/git/parsers.ts': { old: PARSERS_OLD, new: PARSERS_NEW },
    'electron/git/GitService.ts': { old: GITSERVICE_OLD, new: GITSERVICE_NEW },
    'electron/ipc/handlers.ts': { old: HANDLERS_OLD, new: HANDLERS_NEW },
    'electron/watcher/RepoWatcher.ts': { old: null, new: REPOWATCHER_NEW },
    'shared/types.ts': { old: TYPES_OLD, new: TYPES_NEW },
    'src/components/DiffPane.vue': {
        old: LEGACY_DIFF_OLD,
        new: LEGACY_DIFF_OLD + '\n<!-- migrated to Monaco -->\n',
    },
    'src/components/FileTree.vue': {
        old: LEGACY_DIFF_OLD,
        new: LEGACY_DIFF_OLD.replace('legacy-diff', 'file-tree'),
    },
    'src/components/LegacyDiff.vue': { old: LEGACY_DIFF_OLD, new: null },
    'src/stores/comparison.ts': { old: COMPARISON_OLD, new: COMPARISON_NEW },
    'tests/parsers.spec.ts': { old: PARSERS_SPEC_OLD, new: PARSERS_SPEC_NEW },
};

const EMPTY_PAIR: FilePair = {
    path: '',
    oldContent: '',
    newContent: '',
    language: 'plaintext',
    binary: false,
    tooLarge: false,
};

export function mockFilePair(path: string): FilePair {
    const content = CONTENTS[path];
    if (!content) {
        return { ...EMPTY_PAIR, path };
    }

    return {
        path,
        oldContent: content.old,
        newContent: content.new,
        language: inferLanguage(path),
        binary: false,
        tooLarge: false,
    };
}
