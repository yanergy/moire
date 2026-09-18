// Repairing PATH for a GUI launch.
//
// A macOS app opened from Finder, the Dock, or Spotlight is started by launchd,
// not by a shell, so it inherits launchd's minimal PATH (/usr/bin:/bin:/usr/sbin:
// /sbin) rather than the one the user's shell builds from .zshrc/.profile. Linux
// desktop launchers behave the same way. Anything installed by Homebrew, MacPorts,
// nvm, or into ~/.local/bin is then invisible to execFile, which fails with ENOENT
// as if the tool were not installed at all.
//
// That is why `gh` reads as "not installed" in a packaged build while working under
// `npm run dev` (which inherits the terminal's PATH), and why git still works
// either way: macOS ships a git shim at /usr/bin/git, inside the minimal PATH.
//
// This module asks the user's login shell for its PATH once at startup and merges
// it into process.env.PATH, so every later execFile (gh, git, the editor launchers
// in editors.ts) resolves the same binaries the user's terminal would. It runs in
// dev too, deliberately: the bug it fixes was a dev/packaged divergence, and having
// only one code path means dev exercises what ships.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// The shell prints its PATH between two copies of this marker, so shell noise
// (a login banner, an rc file that echoes, a job-control warning) can be trimmed
// away instead of being parsed as directories.
const MARKER = '__MOIRE_PATH__';

// Directories commonly holding user-installed CLIs, appended (lowest priority) when
// they exist on disk. This is the backstop for the case where the shell probe fails
// or returns nothing useful: a restricted shell, a login shell that hangs, or a
// /etc/shells entry that is not really a shell.
const FALLBACK_DIRS = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/opt/local/bin',
    '/opt/local/sbin',
    path.join(homedir(), '.local', 'bin'),
    path.join(homedir(), 'bin'),
];

// A login shell can hang (an rc file waiting on input, a slow network mount), so
// the probe is capped rather than allowed to stall the whole launch.
const PROBE_TIMEOUT_MS = 5_000;

// Both injectable so the merge logic is unit-testable without spawning a shell or
// touching the filesystem.
export type ShellPathProbe = () => Promise<string>;
export type DirExists = (dir: string) => Promise<boolean>;

const defaultExists: DirExists = async (dir) => {
    try {
        await access(dir);
        return true;
    } catch {
        return false;
    }
};

// Ask the login shell what PATH it builds. `-ilc` runs it as an interactive login
// shell so the full rc chain is read (Homebrew's shellenv, nvm, mise, and friends
// are usually only set up there). Returns '' when the shell cannot be run at all.
const defaultProbe: ShellPathProbe = async () => {
    const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
    // printf rather than echo: no trailing newline to trim and no shell-specific
    // flag handling. $PATH is expanded by the shell being probed, not by us.
    const script = `printf '%s' '${MARKER}'; printf '%s' "$PATH"; printf '%s' '${MARKER}'`;

    const { stdout } = await execFileAsync(shell, ['-ilc', script], {
        timeout: PROBE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        // Some rc files pause for a pager or draw a prompt on a real terminal;
        // a dumb terminal keeps them to plain output.
        env: { ...process.env, TERM: 'dumb' },
    });
    return stdout.toString();
};

// Pull the PATH out from between the markers. Anything outside them is rc-file
// noise. Returns '' when the markers are absent (the shell failed before printing).
export function extractPath(output: string): string {
    const parts = output.split(MARKER);
    if (parts.length < 3) {
        return '';
    }

    return parts[1]!.trim();
}

// Merge the candidate PATHs into one, keeping the first occurrence of each
// directory so the earlier (higher-priority) list wins and no entry repeats.
export function mergePaths(...lists: string[]): string {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const list of lists) {
        for (const dir of list.split(path.delimiter)) {
            if (!dir || seen.has(dir)) {
                continue;
            }

            seen.add(dir);
            out.push(dir);
        }
    }

    return out.join(path.delimiter);
}

// The PATH the app should run with: the login shell's PATH first (it is what the
// user's terminal would use), then whatever the process was launched with, then the
// well-known install directories that actually exist. Never throws: a failed probe
// just means the result leans on the other two sources.
export async function resolvePath(
    currentPath: string,
    probe: ShellPathProbe = defaultProbe,
    exists: DirExists = defaultExists
): Promise<string> {
    let shellPath = '';
    try {
        shellPath = extractPath(await probe());
    } catch {
        shellPath = '';
    }

    const present = await Promise.all(FALLBACK_DIRS.map((dir) => exists(dir)));
    const fallback = FALLBACK_DIRS.filter((_, i) => present[i]!).join(path.delimiter);

    return mergePaths(shellPath, currentPath, fallback);
}

// Repair process.env.PATH in place, so every later child process inherits it.
// Windows is skipped: a GUI process there inherits the user's full environment
// from the registry, so there is nothing to repair. Returns the PATH now in effect.
export async function repairPath(
    probe: ShellPathProbe = defaultProbe,
    exists: DirExists = defaultExists
): Promise<string> {
    const currentPath = process.env.PATH ?? '';
    if (process.platform === 'win32') {
        return currentPath;
    }

    const resolved = await resolvePath(currentPath, probe, exists);
    process.env.PATH = resolved;
    return resolved;
}
