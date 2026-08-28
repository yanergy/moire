// GitService wraps the system git binary (via simple-git) for one open
// repository. All git and filesystem work stays in the main process; the
// renderer reaches these methods only through the preload bridge. Output parsing
// lives in ./parsers.cjs so the porcelain formats stay unit-testable.

const fs = require('node:fs/promises');
const path = require('node:path');
const { simpleGit } = require('simple-git');
const {
    parseNameStatus,
    parseNumstat,
    parseNulPaths,
    mergeChangedFiles,
} = require('./parsers.cjs');

// Must match WORKING_TREE in src/shared/types.ts. That shared constant belongs
// to the renderer; the strict process split (electron never imports from src/)
// means the head-side sentinel is restated here rather than imported.
const WORKING_TREE = 'WORKING TREE';

// Content larger than this is flagged tooLarge so the renderer can gate
// rendering (the "Load diff" gate lands in Phase 4). The bytes are still
// returned; the flag only signals that the file is heavy.
const MAX_RENDER_BYTES = 512 * 1024;

// Extension → Monaco language id. This mirrors src/lib/language.ts, duplicated
// across the process boundary on purpose: the renderer owns that module and the
// main process cannot import from src/. Keep the two in rough sync.
const LANGUAGE_BY_EXTENSION = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    vue: 'html',
    json: 'json',
    jsonc: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
};

function languageForPath(filePath) {
    const dot = filePath.lastIndexOf('.');
    if (dot === -1) {
        return 'plaintext';
    }

    return LANGUAGE_BY_EXTENSION[filePath.slice(dot + 1).toLowerCase()] ?? 'plaintext';
}

// A NUL byte in the decoded content is git's own binary heuristic; it also
// stands in for content that is not valid UTF-8 text.
function isBinary(content) {
    return content !== null && content.includes('\0');
}

function byteLength(content) {
    return content === null ? 0 : Buffer.byteLength(content, 'utf8');
}

// Line count of newly added content, matching git's numstat addition count for a
// new file: a trailing newline closes the last line rather than adding an empty
// one.
function countLines(content) {
    if (!content) {
        return 0;
    }

    const lines = content.split('\n').length;
    return content.endsWith('\n') ? lines - 1 : lines;
}

class GitService {
    // git is injectable so the service is unit-testable without a real repo.
    constructor(repoPath, git = simpleGit(repoPath)) {
        this.repoPath = repoPath;
        this.git = git;
    }

    // Local branches first (current one flagged), then remote-tracking branches.
    async branches() {
        const [local, remote] = await Promise.all([
            this.git.branchLocal(),
            this.git.branch(['-r']),
        ]);

        const locals = local.all.map((name) => {
            const info = { name, kind: 'local' };
            if (name === local.current) {
                info.isCurrent = true;
            }

            return info;
        });

        const remotes = remote.all
            // Drop the symbolic `origin/HEAD -> origin/main` pointer.
            .filter((name) => !name.includes(' -> ') && !name.endsWith('/HEAD'))
            .map((name) => ({ name, kind: 'remote' }));

        return [...locals, ...remotes];
    }

    async changedFiles(base, head, mode) {
        const range = this.rangeArgs(base, head, mode);
        const [nameStatusOut, numstatOut] = await Promise.all([
            this.git.raw(['diff', '--name-status', '-M', '-z', ...range]),
            this.git.raw(['diff', '--numstat', '-M', '-z', ...range]),
        ]);

        const tracked = mergeChangedFiles(parseNameStatus(nameStatusOut), parseNumstat(numstatOut));
        if (head !== WORKING_TREE) {
            return tracked;
        }

        // git diff reports only tracked files, so a brand-new file on disk is
        // invisible to it. Against the working tree that file is a real addition,
        // so list untracked files (git-ignored ones excluded) and fold them in.
        return [...tracked, ...(await this.untrackedFiles())];
    }

    // Untracked files as added ChangedFile entries, for the working-tree
    // comparison. --exclude-standard drops git-ignored paths so build output and
    // node_modules never show up.
    async untrackedFiles() {
        const out = await this.git.raw(['ls-files', '--others', '--exclude-standard', '-z']);
        return Promise.all(parseNulPaths(out).map((filePath) => this.untrackedFile(filePath)));
    }

    async untrackedFile(filePath) {
        const content = await this.diskContent(filePath);
        const binary = isBinary(content);
        return {
            path: filePath,
            status: 'A',
            additions: binary ? 0 : countLines(content),
            deletions: 0,
            binary,
        };
    }

    async filePair(base, head, filePath) {
        const oldContent = await this.contentAt(base, filePath);
        const newContent =
            head === WORKING_TREE
                ? await this.diskContent(filePath)
                : await this.contentAt(head, filePath);

        const binary = isBinary(oldContent) || isBinary(newContent);
        const size = Math.max(byteLength(oldContent), byteLength(newContent));

        return {
            path: filePath,
            // Binary content is withheld from the text diff; Phase 4 adds a
            // dedicated binary/image preview.
            oldContent: binary ? null : oldContent,
            newContent: binary ? null : newContent,
            language: languageForPath(filePath),
            binary,
            tooLarge: size > MAX_RENDER_BYTES,
            sizeBytes: size,
        };
    }

    // Three-dot (merge-base) is the default, matching what a GitHub PR shows;
    // two-dot is the literal diff. A working-tree head has no second ref:
    // `git diff <base>` compares the base against what is currently on disk.
    rangeArgs(base, head, mode) {
        if (head === WORKING_TREE) {
            return [base];
        }

        return [mode === 'direct' ? `${base}..${head}` : `${base}...${head}`];
    }

    // File content at a committed ref, or null when the path does not exist there
    // (an added file has no base side; a deleted file has no head side).
    async contentAt(ref, filePath) {
        try {
            return await this.git.show([`${ref}:${filePath}`]);
        } catch {
            return null;
        }
    }

    async diskContent(filePath) {
        try {
            return await fs.readFile(path.join(this.repoPath, filePath), 'utf8');
        } catch {
            return null; // absent on disk (deleted) or unreadable
        }
    }
}

module.exports = { GitService, WORKING_TREE };
