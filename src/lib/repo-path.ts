// The trailing segment of a repository's filesystem path, i.e. its folder name,
// for display in the repo picker and the restored-repo label. Splits on both
// POSIX and Windows separators, so `C:\Users\me\proj` yields `proj`, and falls
// back to the input when it has no segments.
//
// This is deliberately duplicated as `repoLabel` in electron/menu.ts: the strict
// process split means the main process cannot import from src/, so the main-side
// menu builder keeps its own copy. Keep the two in sync.
//
// For git-reported file paths (always forward-slash, never a Windows drive path)
// use the store's `baseName` instead, which splits on `/` only.
export function repoLabel(repoPath: string): string {
    const parts = repoPath.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] ?? repoPath;
}
