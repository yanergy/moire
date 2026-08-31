// GitService wraps the system git binary (via simple-git) for one open
// repository. All git and filesystem work stays in the main process; the
// renderer reaches these methods only through the preload bridge. Output parsing
// lives in ./parsers so the porcelain formats stay unit-testable.

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { simpleGit, type SimpleGit } from 'simple-git';
import {
    parseNameStatus,
    parseNumstat,
    parseNulPaths,
    mergeChangedFiles,
    type ChangedFile,
    type FileStatus,
} from './parsers';

const execFileAsync = promisify(execFile);

// The backend's single source for the compare-mode union, imported by the IPC
// handlers. It must match CompareMode in src/shared/types.ts (the renderer's
// copy); the strict process split means that shared type cannot be imported here.
type CompareMode = 'merge-base' | 'direct';

interface BranchInfo {
    name: string;
    kind: 'local' | 'remote';
    isCurrent?: boolean;
}

interface FilePair {
    path: string;
    oldContent: string | null;
    newContent: string | null;
    language: string;
    binary: boolean;
    tooLarge: boolean;
    sizeBytes: number;
    image?: boolean;
    oldImage?: string | null;
    newImage?: string | null;
}

interface GitServiceDeps {
    readBlobBytes?: (ref: string, filePath: string) => Promise<Buffer | null>;
    readDiskBytes?: (filePath: string) => Promise<Buffer | null>;
}

// Must match WORKING_TREE in src/shared/types.ts. That shared constant belongs
// to the renderer; the strict process split (electron never imports from src/)
// means the head-side sentinel is restated here rather than imported.
const WORKING_TREE = 'WORKING TREE';

// Content larger than this is flagged tooLarge so the renderer can gate
// rendering (the "Load diff" gate). The bytes are still returned; the flag only
// signals that the file is heavy.
const MAX_RENDER_BYTES = 512 * 1024;

// Images are previewed inline as base64 data URIs. Above this the base64 payload
// (which inflates ~33%) gets heavy to pass over IPC and render, so an oversized
// image falls back to the plain binary notice instead of a preview.
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

// Image extensions Monaco can't diff but the renderer can show as before/after
// pictures. SVG is included: though it is text, it is shown as a rendered image
// (from its markup) rather than a code diff. An <img>-loaded SVG does not run
// scripts, so previewing untrusted markup this way is safe.
const IMAGE_MIME: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    avif: 'image/avif',
    svg: 'image/svg+xml',
};

function imageMimeForPath(filePath: string): string | null {
    const dot = filePath.lastIndexOf('.');
    if (dot === -1) {
        return null;
    }

    return IMAGE_MIME[filePath.slice(dot + 1).toLowerCase()] ?? null;
}

function dataUri(mime: string, buffer: Buffer | null): string | null {
    return buffer === null ? null : `data:${mime};base64,${buffer.toString('base64')}`;
}

// Extension → Monaco language id. This mirrors src/lib/language.ts, duplicated
// across the process boundary on purpose: the renderer owns that module and the
// main process cannot import from src/. Keep the two in rough sync.
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
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
    xml: 'xml',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
    php: 'php',
    ini: 'ini',
    dockerfile: 'dockerfile',
    babelrc: 'json', // .babelrc is JSON
};

function languageForPath(filePath: string): string {
    const dot = filePath.lastIndexOf('.');
    if (dot === -1) {
        return 'plaintext';
    }

    return LANGUAGE_BY_EXTENSION[filePath.slice(dot + 1).toLowerCase()] ?? 'plaintext';
}

// A NUL byte in the decoded content is git's own binary heuristic; it also
// stands in for content that is not valid UTF-8 text.
function isBinary(content: string | null): boolean {
    return content !== null && content.includes('\0');
}

function byteLength(content: string | null): number {
    return content === null ? 0 : Buffer.byteLength(content, 'utf8');
}

// Line count of newly added content, matching git's numstat addition count for a
// new file: a trailing newline closes the last line rather than adding an empty
// one.
function countLines(content: string | null): number {
    if (!content) {
        return 0;
    }

    const lines = content.split('\n').length;
    return content.endsWith('\n') ? lines - 1 : lines;
}

class GitService {
    repoPath: string;
    git: SimpleGit;
    readBlobBytes: (ref: string, filePath: string) => Promise<Buffer | null>;
    readDiskBytes: (filePath: string) => Promise<Buffer | null>;

    // git is injectable so the service is unit-testable without a real repo. The
    // binary readers (raw image bytes at a ref / on disk) are injectable too, since
    // they shell out for Buffer output that simple-git's string API can't give.
    constructor(repoPath: string, git: SimpleGit = simpleGit(repoPath), deps: GitServiceDeps = {}) {
        this.repoPath = repoPath;
        this.git = git;
        this.readBlobBytes =
            deps.readBlobBytes ?? ((ref, filePath) => this.blobBytes(ref, filePath));
        this.readDiskBytes = deps.readDiskBytes ?? ((filePath) => this.diskBytes(filePath));
    }

    // Raw bytes of a blob at a committed ref, or null when the path is absent
    // there. simple-git decodes stdout to a string (lossy for binary), so read the
    // blob with buffer output instead. maxBuffer is generous so the caller can
    // measure the size and decide whether to inline it.
    async blobBytes(ref: string, filePath: string): Promise<Buffer | null> {
        try {
            const { stdout } = await execFileAsync(
                'git',
                ['-C', this.repoPath, 'show', `${ref}:${filePath}`],
                { encoding: 'buffer', maxBuffer: 4 * MAX_IMAGE_BYTES }
            );
            return stdout;
        } catch {
            return null;
        }
    }

    async diskBytes(filePath: string): Promise<Buffer | null> {
        try {
            return await fs.readFile(path.join(this.repoPath, filePath));
        } catch {
            return null; // absent on disk (deleted) or unreadable
        }
    }

    // Local branches first (current one flagged), then remote-tracking branches.
    async branches(): Promise<BranchInfo[]> {
        const [local, remote] = await Promise.all([
            this.git.branchLocal(),
            this.git.branch(['-r']),
        ]);

        const locals: BranchInfo[] = local.all.map((name) => {
            const info: BranchInfo = { name, kind: 'local' };
            if (name === local.current) {
                info.isCurrent = true;
            }

            return info;
        });

        const remotes: BranchInfo[] = remote.all
            // Drop the symbolic `origin/HEAD -> origin/main` pointer.
            .filter((name) => !name.includes(' -> ') && !name.endsWith('/HEAD'))
            .map((name) => ({ name, kind: 'remote' }));

        return [...locals, ...remotes];
    }

    async changedFiles(base: string, head: string, mode: CompareMode): Promise<ChangedFile[]> {
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
    async untrackedFiles(): Promise<ChangedFile[]> {
        const out = await this.git.raw(['ls-files', '--others', '--exclude-standard', '-z']);
        return Promise.all(parseNulPaths(out).map((filePath) => this.untrackedFile(filePath)));
    }

    async untrackedFile(filePath: string): Promise<ChangedFile> {
        const content = await this.diskContent(filePath);
        const binary = isBinary(content);
        const status: FileStatus = 'A';
        return {
            path: filePath,
            status,
            additions: binary ? 0 : countLines(content),
            deletions: 0,
            binary,
        };
    }

    async filePair(
        base: string,
        head: string,
        filePath: string,
        mode: CompareMode,
        full = false
    ): Promise<FilePair> {
        // The old side must match what the changed-file list diffed against. In
        // merge-base mode `base...head` diffs from the merge base, so read the old
        // side there rather than at the base tip. A working-tree head has no second
        // ref (rangeArgs is just `[base]`), so it always reads the base tip.
        const oldRef =
            mode === 'merge-base' && head !== WORKING_TREE
                ? await this.mergeBase(base, head)
                : base;

        const imageMime = imageMimeForPath(filePath);
        if (imageMime) {
            return this.imagePair(oldRef, head, filePath, imageMime);
        }

        const oldContent = await this.contentAt(oldRef, filePath);
        const newContent =
            head === WORKING_TREE
                ? await this.diskContent(filePath)
                : await this.contentAt(head, filePath);

        const binary = isBinary(oldContent) || isBinary(newContent);
        const size = Math.max(byteLength(oldContent), byteLength(newContent));
        const tooLarge = size > MAX_RENDER_BYTES;

        // Content is withheld when there is no text diff to render (binary), and
        // when the file is over the render threshold: shipping it would pay the full
        // IPC transfer up front for a diff that starts gated. The renderer refetches
        // with full=true when the user clears the "Load diff" gate.
        const withhold = binary || (tooLarge && !full);

        return {
            path: filePath,
            oldContent: withhold ? null : oldContent,
            newContent: withhold ? null : newContent,
            language: languageForPath(filePath),
            binary,
            tooLarge,
            sizeBytes: size,
        };
    }

    // An image file has no text diff; the renderer shows the before/after pictures
    // instead. Both sides are inlined as base64 data URIs (a missing side is null,
    // for an add or a delete). An image past the size cap drops back to the plain
    // binary notice (image false, no data URIs) so a huge payload isn't shipped.
    async imagePair(
        oldRef: string,
        head: string,
        filePath: string,
        mime: string
    ): Promise<FilePair> {
        const oldBytes = await this.readBlobBytes(oldRef, filePath);
        const newBytes =
            head === WORKING_TREE
                ? await this.readDiskBytes(filePath)
                : await this.readBlobBytes(head, filePath);

        const size = Math.max(oldBytes?.length ?? 0, newBytes?.length ?? 0);
        const image = size <= MAX_IMAGE_BYTES;

        return {
            path: filePath,
            oldContent: null,
            newContent: null,
            language: 'plaintext',
            binary: true,
            image,
            oldImage: image ? dataUri(mime, oldBytes) : null,
            newImage: image ? dataUri(mime, newBytes) : null,
            tooLarge: false,
            sizeBytes: size,
        };
    }

    // Three-dot (merge-base) is the default, matching what a GitHub PR shows;
    // two-dot is the literal diff. A working-tree head has no second ref:
    // `git diff <base>` compares the base against what is currently on disk.
    rangeArgs(base: string, head: string, mode: CompareMode): string[] {
        if (head === WORKING_TREE) {
            return [base];
        }

        return [mode === 'direct' ? `${base}..${head}` : `${base}...${head}`];
    }

    // The commit where base and head last diverged, i.e. the old side of a
    // three-dot (`base...head`) diff. Falls back to the base tip when there is no
    // common ancestor (unrelated histories) so the diff still renders instead of
    // throwing.
    async mergeBase(base: string, head: string): Promise<string> {
        try {
            const out = await this.git.raw(['merge-base', base, head]);
            return out.trim() || base;
        } catch {
            return base;
        }
    }

    // File content at a committed ref, or null when the path does not exist there
    // (an added file has no base side; a deleted file has no head side).
    async contentAt(ref: string, filePath: string): Promise<string | null> {
        try {
            return await this.git.show([`${ref}:${filePath}`]);
        } catch {
            return null;
        }
    }

    async diskContent(filePath: string): Promise<string | null> {
        try {
            return await fs.readFile(path.join(this.repoPath, filePath), 'utf8');
        } catch {
            return null; // absent on disk (deleted) or unreadable
        }
    }
}

export { GitService, WORKING_TREE };
export type { CompareMode };
