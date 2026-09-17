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

// Run the launch-time check and, when a newer release exists, show a native
// popup (the same dialog surface the git/gh errors use) offering to open the
// release page. The app is unsigned and cannot self-install, so "Download" just
// opens the page in the browser and the user replaces their copy by hand. Does
// nothing when the build is current or the check fails, so it is safe to fire and
// forget at launch.
export async function promptUpdateIfAvailable(): Promise<void> {
    const result = await checkForUpdate();
    if (result.status !== 'available') {
        return;
    }

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
