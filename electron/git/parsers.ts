// Parsers for `git diff` porcelain output. Every git invocation runs with `-z`
// so records are NUL-separated: paths keep their spaces and newlines intact
// instead of being split apart on whitespace. Each parser here has matching
// cases in tests/parsers.spec.ts (see documentation/code-conventions.md).

export type FileStatus = 'A' | 'M' | 'D' | 'R';

export interface NameStatusEntry {
    status: FileStatus;
    path: string;
    oldPath?: string;
}

export interface NumstatEntry {
    additions: number;
    deletions: number;
    binary: boolean;
}

export interface ChangedFile {
    path: string;
    status: FileStatus;
    additions: number;
    deletions: number;
    binary: boolean;
    oldPath?: string;
}

// git emits A, M, D, R, C, T, U, and rename/copy carry a similarity score
// (e.g. R065). The renderer's FileStatus is only A|M|D|R, so fold the rest:
// a copy reads as a rename (it has an old path and a new path); a type change
// reads as a modification.
function normalizeStatus(token: string): FileStatus {
    const letter = token[0];
    if (letter === 'A' || letter === 'M' || letter === 'D' || letter === 'R') {
        return letter;
    }
    if (letter === 'C') {
        return 'R';
    }

    return 'M';
}

// Rename and copy records carry two paths (old then new); everything else one.
function hasTwoPaths(token: string): boolean {
    return token[0] === 'R' || token[0] === 'C';
}

// `git diff --name-status -M -z` → a flat NUL-separated token stream:
//   M \0 path              (single path)
//   R065 \0 old \0 new     (rename/copy: score token, then two paths)
// Returns one entry per file, keyed on the new path, with oldPath set only for
// renames. The trailing NUL leaves an empty final token, which is skipped.
export function parseNameStatus(out: string): NameStatusEntry[] {
    const tokens = out.split('\0');
    const files: NameStatusEntry[] = [];

    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        if (!token) {
            i++;
            continue;
        }

        const status = normalizeStatus(token);
        if (hasTwoPaths(token)) {
            files.push({ status, oldPath: tokens[i + 1], path: tokens[i + 2] });
            i += 3;
            continue;
        }

        files.push({ status, path: tokens[i + 1] });
        i += 2;
    }

    return files;
}

// `git diff --numstat -M -z` → NUL-separated records:
//   add \t del \t path            (normal: one token)
//   add \t del \t \0 old \0 new   (rename: empty path field, then two tokens)
// Binary files report `-` for both counts. Returns a Map keyed by the new path,
// each value carrying additions, deletions, and a binary flag.
export function parseNumstat(out: string): Map<string, NumstatEntry> {
    const tokens = out.split('\0');
    const counts = new Map<string, NumstatEntry>();

    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        if (!token) {
            i++;
            continue;
        }

        const [add, del, path] = token.split('\t');
        const binary = add === '-' && del === '-';
        const stat: NumstatEntry = {
            additions: binary ? 0 : Number(add),
            deletions: binary ? 0 : Number(del),
            binary,
        };

        // An empty path field marks a rename: the old and new paths follow as
        // their own NUL-separated tokens. Key the counts on the new path.
        if (path === '') {
            counts.set(tokens[i + 2], stat);
            i += 3;
            continue;
        }

        counts.set(path, stat);
        i += 1;
    }

    return counts;
}

// `git ls-files --others --exclude-standard -z` → a NUL-separated list of the
// untracked file paths (git-ignored files already filtered out by
// --exclude-standard). The trailing NUL leaves an empty final token, dropped.
export function parseNulPaths(out: string): string[] {
    return out.split('\0').filter((token) => token !== '');
}

// Combine the two porcelain passes into ChangedFile[]. name-status is the
// authority on the file set and status; numstat contributes the line counts and
// the binary flag. A file missing from numstat (an empty-content change) keeps
// zero counts rather than dropping out.
export function mergeChangedFiles(
    nameStatus: NameStatusEntry[],
    numstat: Map<string, NumstatEntry>
): ChangedFile[] {
    return nameStatus.map((entry) => {
        const stat = numstat.get(entry.path);
        const file: ChangedFile = {
            path: entry.path,
            status: entry.status,
            additions: stat ? stat.additions : 0,
            deletions: stat ? stat.deletions : 0,
            binary: stat ? stat.binary : false,
        };
        if (entry.oldPath !== undefined) {
            file.oldPath = entry.oldPath;
        }

        return file;
    });
}
