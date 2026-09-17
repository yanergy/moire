// Detecting the code editors installed on this machine and opening files in a
// chosen one. Backs the View → "Open Files In" menu: the user can leave opening to
// the OS default app ('auto') or pick a specific editor, which is then used when a
// file is opened from the diff header.
//
// Detection is a best-effort convenience: on macOS it looks for the editors'
// application bundles; on other platforms it probes for their CLI launchers on
// PATH, falling back to the full catalog so a choice is still offered.

import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface EditorCatalogEntry {
    id: string;
    label: string;
    // macOS application bundle names (without ".app") to look for, most-preferred
    // first, so an edition suffix ("PyCharm CE") is found when the plain name is not.
    macApps: string[];
    // A command-line launcher, for detection and opening on non-macOS platforms.
    cli?: string;
}

// The editors offered in the menu. Ids are stored as the preference, so keep them
// stable. Hardcoded on purpose: it is a small, well-known set, and detection only
// narrows it to what is installed.
export const EDITOR_CATALOG: EditorCatalogEntry[] = [
    { id: 'phpstorm', label: 'PhpStorm', macApps: ['PhpStorm'], cli: 'phpstorm' },
    { id: 'webstorm', label: 'WebStorm', macApps: ['WebStorm'], cli: 'webstorm' },
    {
        id: 'intellij',
        label: 'IntelliJ IDEA',
        macApps: ['IntelliJ IDEA', 'IntelliJ IDEA Ultimate', 'IntelliJ IDEA CE'],
        cli: 'idea',
    },
    { id: 'pycharm', label: 'PyCharm', macApps: ['PyCharm', 'PyCharm CE'], cli: 'pycharm' },
    { id: 'rubymine', label: 'RubyMine', macApps: ['RubyMine'], cli: 'rubymine' },
    { id: 'goland', label: 'GoLand', macApps: ['GoLand'], cli: 'goland' },
    { id: 'clion', label: 'CLion', macApps: ['CLion'], cli: 'clion' },
    { id: 'rider', label: 'Rider', macApps: ['Rider'], cli: 'rider' },
    { id: 'datagrip', label: 'DataGrip', macApps: ['DataGrip'], cli: 'datagrip' },
    { id: 'vscode', label: 'VS Code', macApps: ['Visual Studio Code'], cli: 'code' },
    { id: 'cursor', label: 'Cursor', macApps: ['Cursor'], cli: 'cursor' },
    { id: 'zed', label: 'Zed', macApps: ['Zed'], cli: 'zed' },
    { id: 'sublime', label: 'Sublime Text', macApps: ['Sublime Text'], cli: 'subl' },
];

export interface DetectedEditor {
    id: string;
    label: string;
    // How to open a file: a macOS ".app" path (opened with `open -a`), or a CLI
    // command (spawned with the file as its argument).
    kind: 'mac-app' | 'cli';
    target: string;
}

async function pathExists(candidate: string): Promise<boolean> {
    try {
        await access(candidate);
        return true;
    } catch {
        return false;
    }
}

// The macOS locations an app bundle can live in, most-common first.
const MAC_APP_DIRS = ['/Applications', path.join(homedir(), 'Applications')];

// The bundle path for an installed editor, or null if none of its names resolve.
async function findMacApp(entry: EditorCatalogEntry): Promise<string | null> {
    const candidates = entry.macApps.flatMap((app) =>
        MAC_APP_DIRS.map((dir) => path.join(dir, `${app}.app`))
    );
    const results = await Promise.all(
        candidates.map(async (candidate) => ((await pathExists(candidate)) ? candidate : null))
    );
    return results.find((candidate) => candidate !== null) ?? null;
}

async function hasCli(cli: string): Promise<boolean> {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    try {
        await execFileAsync(finder, [cli]);
        return true;
    } catch {
        return false;
    }
}

// The editors installed on this machine, in catalog order.
export async function detectEditors(): Promise<DetectedEditor[]> {
    if (process.platform === 'darwin') {
        const found = await Promise.all(
            EDITOR_CATALOG.map(async (entry): Promise<DetectedEditor | null> => {
                const appPath = await findMacApp(entry);
                return appPath
                    ? { id: entry.id, label: entry.label, kind: 'mac-app', target: appPath }
                    : null;
            })
        );
        return found.filter((editor): editor is DetectedEditor => editor !== null);
    }

    // Non-macOS: probe for CLI launchers on PATH. If none resolve (a shell without
    // `which`/`where`, say), offer the whole catalog so the feature still works.
    const withCli = EDITOR_CATALOG.filter((entry) => entry.cli);
    const found = await Promise.all(
        withCli.map(async (entry): Promise<DetectedEditor | null> =>
            (await hasCli(entry.cli as string))
                ? { id: entry.id, label: entry.label, kind: 'cli', target: entry.cli as string }
                : null
        )
    );
    const detected = found.filter((editor): editor is DetectedEditor => editor !== null);
    return detected.length > 0
        ? detected
        : withCli.map((entry) => ({
              id: entry.id,
              label: entry.label,
              kind: 'cli' as const,
              target: entry.cli as string,
          }));
}

// Open a file in a detected editor. Returns '' on success or an error message, to
// match shell.openPath's contract so the caller can treat both the same way.
export async function openWithEditor(editor: DetectedEditor, filePath: string): Promise<string> {
    try {
        if (editor.kind === 'mac-app') {
            await execFileAsync('open', ['-a', editor.target, filePath]);
        } else {
            await execFileAsync(editor.target, [filePath]);
        }

        return '';
    } catch (error) {
        return error instanceof Error ? error.message : 'Could not open the file in the editor.';
    }
}
