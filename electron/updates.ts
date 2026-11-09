import { app, dialog, net, shell } from 'electron';
import { logError } from './logger';
import type { UpdateCheckResult } from '../src/shared/types';

// The GitHub repository whose Releases feed is the update source. Hardcoded (not
// read from the git remote) so the check always points at the canonical download
// location, regardless of which fork or remote a clone was made from.
const RELEASES_ENDPOINT = 'https://api.github.com/repos/yanergy/moire/releases/latest';
const RELEASES_PAGE = 'https://github.com/yanergy/moire/releases/latest';

// The app is unsigned, so this cannot auto-install; it only surfaces a banner.
// Keep the check short so a slow or blocked network never delays anything the
// user sees (the banner is best-effort, absent on any failure).
const REQUEST_TIMEOUT_MS = 5000;

// Parse a version like "v1.2.3" or "1.2.3" into its numeric parts, ignoring any
// pre-release or build suffix ("1.2.3-beta.1" -> [1, 2, 3]). Returns null when
// there is no leading numeric version, so a malformed tag compares as not-newer.
function parseVersion(value: string): [number, number, number] | null {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
    if (!match) {
        return null;
    }

    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// True when `latest` is a strictly higher version than `current`. Unparseable
// input on either side compares as not-newer, so a bad tag never nags the user.
export function isNewerVersion(latest: string, current: string): boolean {
    const a = parseVersion(latest);
    const b = parseVersion(current);
    if (!a || !b) {
        return false;
    }

    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) {
            return a[i] > b[i];
        }
    }

    return false;
}

// Ask the GitHub Releases feed whether a version newer than the running build
// exists. Resolves a status result and never rejects: any failure (offline,
// rate-limited, no release yet) comes back as 'error' so the app stays silent.
export async function checkForUpdate(): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await net.fetch(RELEASES_ENDPOINT, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'Moire-Update-Check',
            },
            signal: controller.signal,
        });
        if (!response.ok) {
            return {
                status: 'error',
                currentVersion,
                message: `GitHub responded ${response.status}.`,
            };
        }

        const data = (await response.json()) as { tag_name?: string; html_url?: string };
        if (!data.tag_name) {
            return { status: 'error', currentVersion, message: 'No published release was found.' };
        }

        const latestVersion = data.tag_name.replace(/^v/, '');
        if (!isNewerVersion(data.tag_name, currentVersion)) {
            return { status: 'current', currentVersion, latestVersion };
        }

        return {
            status: 'available',
            currentVersion,
            latestVersion,
            url: data.html_url ?? RELEASES_PAGE,
        };
    } catch (error) {
        logError('updates:check', error);
        return { status: 'error', currentVersion, message: 'Could not reach the update server.' };
    } finally {
        clearTimeout(timer);
    }
}

// Show the native update popup (the same dialog surface the git/gh errors use)
// for an available release, offering to open its release page. The app is
// unsigned and cannot self-install, so "Download" just opens the page in the
// browser and the user replaces their copy by hand.
export async function showUpdatePrompt(result: UpdateCheckResult): Promise<void> {
    const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'Update available',
        message: `Moiré ${result.latestVersion} is available.`,
        detail: `You're on ${result.currentVersion}. Open the releases page to download the new version, then replace Moiré in your Applications folder.`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
    });
    if (response === 0 && result.url) {
        await shell.openExternal(result.url);
    }
}

// How often to ask GitHub while the app runs. Unauthenticated requests are
// limited to 60 an hour per IP, so stay far below that: one an hour on the timer,
// plus at most one per FOCUS_CHECK_MIN_GAP_MS when the app comes to the front.
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;
export const FOCUS_CHECK_MIN_GAP_MS = 15 * 60 * 1000;

export interface UpdateWatcherDeps {
    check: () => Promise<UpdateCheckResult>;
    prompt: (result: UpdateCheckResult) => Promise<void>;
    // Whether one of the app's windows is focused, i.e. the user can see a popup.
    isAppFocused: () => boolean;
    now?: () => number;
}

// Keeps checking for a newer release while the app runs (at launch, on an hourly
// timer, and when the app is focused again after a while) and pops the update
// dialog as soon as the user can see it. A release found while the app is in the
// background is held until a window is focused. Each version is announced at most
// once per session, so "Later" does not bring the same popup back on every focus
// or check; a release newer than the one announced prompts again.
export class UpdateWatcher {
    private announcedVersion: string | null = null;
    private pending: UpdateCheckResult | null = null;
    private lastCheckAt = Number.NEGATIVE_INFINITY;
    private inFlight: Promise<void> | null = null;
    private prompting = false;
    private timer: ReturnType<typeof setInterval> | null = null;
    private readonly now: () => number;

    constructor(private readonly deps: UpdateWatcherDeps) {
        this.now = deps.now ?? Date.now;
    }

    start(): void {
        this.stop();
        void this.check();
        this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    // A window was focused: show a held popup right away, otherwise re-check when
    // the last check is old enough (the app may have sat in the background).
    async onFocus(): Promise<void> {
        if (this.pending) {
            await this.showPending();
            return;
        }

        if (this.now() - this.lastCheckAt >= FOCUS_CHECK_MIN_GAP_MS) {
            await this.check();
        }
    }

    // One check at a time: an overlapping call joins the running one.
    check(): Promise<void> {
        this.inFlight ??= this.runCheck().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    private async runCheck(): Promise<void> {
        this.lastCheckAt = this.now();
        const result = await this.deps.check();
        if (result.status !== 'available' || !result.latestVersion) {
            return;
        }

        if (!this.isUnannounced(result.latestVersion)) {
            return;
        }

        this.pending = result;
        if (this.deps.isAppFocused()) {
            await this.showPending();
        }
    }

    private isUnannounced(version: string): boolean {
        return this.announcedVersion === null || isNewerVersion(version, this.announcedVersion);
    }

    private async showPending(): Promise<void> {
        // A popup already open covers it; a newer find stays pending for the next focus.
        if (!this.pending || this.prompting) {
            return;
        }

        const result = this.pending;
        this.pending = null;
        this.announcedVersion = result.latestVersion ?? null;
        this.prompting = true;
        try {
            await this.deps.prompt(result);
        } finally {
            this.prompting = false;
        }
    }
}
