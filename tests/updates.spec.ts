import { describe, it, expect, beforeEach, vi } from 'vitest';

// updates.ts talks to Electron's `app` (running version), `net.fetch` (the GitHub
// Releases feed), `dialog` (the update popup), and `shell` (opening the release
// page), none injectable here, so mock them. logError is silenced so an
// intentional failure path doesn't write noise.
const state = vi.hoisted(() => ({
    getVersion: vi.fn<() => string>(),
    fetch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    showMessageBox: vi.fn<(...args: unknown[]) => Promise<{ response: number }>>(),
    openExternal: vi.fn<(url: string) => Promise<void>>(),
    logError: vi.fn<(context: string, error: unknown) => void>(),
}));

vi.mock('electron', () => ({
    app: { getVersion: state.getVersion },
    net: { fetch: state.fetch },
    dialog: { showMessageBox: state.showMessageBox },
    shell: { openExternal: state.openExternal },
}));

vi.mock('../electron/logger', () => ({ logError: state.logError }));

import {
    isNewerVersion,
    checkForUpdate,
    showUpdatePrompt,
    UpdateWatcher,
    CHECK_INTERVAL_MS,
    FOCUS_CHECK_MIN_GAP_MS,
} from '../electron/updates';
import type { UpdateCheckResult } from '../src/shared/types';

// A Response-like stub for net.fetch, only the fields checkForUpdate reads.
function jsonResponse(body: unknown, { ok = true, status = 200 } = {}) {
    return { ok, status, json: () => Promise.resolve(body) };
}

describe('isNewerVersion', () => {
    it('treats a higher major, minor, or patch as newer', () => {
        expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
        expect(isNewerVersion('1.3.0', '1.2.9')).toBe(true);
        expect(isNewerVersion('1.2.4', '1.2.3')).toBe(true);
    });

    it('treats the same or a lower version as not newer', () => {
        expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
        expect(isNewerVersion('1.2.3', '1.3.0')).toBe(false);
        expect(isNewerVersion('1.0.0', '2.0.0')).toBe(false);
    });

    it('ignores a leading v and any pre-release suffix', () => {
        expect(isNewerVersion('v1.2.4', '1.2.3')).toBe(true);
        expect(isNewerVersion('1.2.3-beta.1', '1.2.3')).toBe(false);
    });

    it('treats an unparseable version on either side as not newer', () => {
        expect(isNewerVersion('not-a-version', '1.0.0')).toBe(false);
        expect(isNewerVersion('1.0.1', 'nightly')).toBe(false);
    });
});

describe('checkForUpdate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.getVersion.mockReturnValue('1.0.0');
    });

    it('reports an available update with the version and release url', async () => {
        state.fetch.mockResolvedValue(
            jsonResponse({ tag_name: 'v1.1.0', html_url: 'https://example.test/releases/v1.1.0' })
        );

        const result = await checkForUpdate();

        expect(result).toEqual({
            status: 'available',
            currentVersion: '1.0.0',
            latestVersion: '1.1.0',
            url: 'https://example.test/releases/v1.1.0',
        });
    });

    it('reports current when the latest release is not newer', async () => {
        state.fetch.mockResolvedValue(jsonResponse({ tag_name: 'v1.0.0' }));

        const result = await checkForUpdate();

        expect(result).toEqual({
            status: 'current',
            currentVersion: '1.0.0',
            latestVersion: '1.0.0',
        });
    });

    it('reports error on a non-ok response', async () => {
        state.fetch.mockResolvedValue(jsonResponse(null, { ok: false, status: 404 }));

        const result = await checkForUpdate();

        expect(result.status).toBe('error');
        expect(result.currentVersion).toBe('1.0.0');
    });

    it('reports error and logs when the request throws', async () => {
        state.fetch.mockRejectedValue(new Error('offline'));

        const result = await checkForUpdate();

        expect(result.status).toBe('error');
        expect(state.logError).toHaveBeenCalled();
    });
});

describe('showUpdatePrompt', () => {
    const available: UpdateCheckResult = {
        status: 'available',
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        url: 'https://example.test/releases/v1.1.0',
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('opens the release page when Download is chosen', async () => {
        state.showMessageBox.mockResolvedValue({ response: 0 }); // Download

        await showUpdatePrompt(available);

        expect(state.showMessageBox).toHaveBeenCalledTimes(1);
        expect(state.openExternal).toHaveBeenCalledWith('https://example.test/releases/v1.1.0');
    });

    it('does not open the page when Later is chosen', async () => {
        state.showMessageBox.mockResolvedValue({ response: 1 }); // Later

        await showUpdatePrompt(available);

        expect(state.showMessageBox).toHaveBeenCalledTimes(1);
        expect(state.openExternal).not.toHaveBeenCalled();
    });
});

function availableResult(version: string): UpdateCheckResult {
    return { status: 'available', currentVersion: '1.0.0', latestVersion: version, url: 'u' };
}

describe('UpdateWatcher', () => {
    function setup({ focused = true } = {}) {
        let now = 0;
        const env = {
            focused,
            result: availableResult('1.1.0'),
            check: vi.fn<() => Promise<UpdateCheckResult>>(() => Promise.resolve(env.result)),
            prompt: vi.fn<(result: UpdateCheckResult) => Promise<void>>(() => Promise.resolve()),
            advance: (ms: number) => {
                now += ms;
            },
        };
        const watcher = new UpdateWatcher({
            check: env.check,
            prompt: env.prompt,
            isAppFocused: () => env.focused,
            now: () => now,
        });
        return { env, watcher };
    }

    it('prompts right away when an update is found while the app is focused', async () => {
        const { env, watcher } = setup();

        await watcher.check();

        expect(env.prompt).toHaveBeenCalledWith(availableResult('1.1.0'));
    });

    it('stays silent when the build is current or the check fails', async () => {
        const { env, watcher } = setup();
        env.result = { status: 'current', currentVersion: '1.0.0', latestVersion: '1.0.0' };
        await watcher.check();
        env.result = { status: 'error', currentVersion: '1.0.0' };
        await watcher.check();

        expect(env.prompt).not.toHaveBeenCalled();
    });

    it('holds the popup while the app is in the background and shows it on focus', async () => {
        const { env, watcher } = setup({ focused: false });

        await watcher.check();
        expect(env.prompt).not.toHaveBeenCalled();

        env.focused = true;
        await watcher.onFocus();

        expect(env.prompt).toHaveBeenCalledTimes(1);
        // Showing the held popup does not cost another request.
        expect(env.check).toHaveBeenCalledTimes(1);
    });

    it('announces a version only once per session', async () => {
        const { env, watcher } = setup();

        await watcher.check();
        env.advance(FOCUS_CHECK_MIN_GAP_MS);
        await watcher.onFocus();
        await watcher.check();

        expect(env.check).toHaveBeenCalledTimes(3);
        expect(env.prompt).toHaveBeenCalledTimes(1);
    });

    it('prompts again for a release newer than the one announced', async () => {
        const { env, watcher } = setup();

        await watcher.check();
        env.result = availableResult('1.2.0');
        await watcher.check();

        expect(env.prompt).toHaveBeenCalledTimes(2);
        expect(env.prompt).toHaveBeenLastCalledWith(availableResult('1.2.0'));
    });

    it('re-checks on focus only once the last check is old enough', async () => {
        const { env, watcher } = setup();
        env.result = { status: 'current', currentVersion: '1.0.0' };

        await watcher.check();
        env.advance(FOCUS_CHECK_MIN_GAP_MS - 1);
        await watcher.onFocus();
        expect(env.check).toHaveBeenCalledTimes(1);

        env.advance(1);
        await watcher.onFocus();
        expect(env.check).toHaveBeenCalledTimes(2);
    });

    it('joins an overlapping check instead of sending a second request', async () => {
        const { env, watcher } = setup();

        await Promise.all([watcher.check(), watcher.check()]);

        expect(env.check).toHaveBeenCalledTimes(1);
        expect(env.prompt).toHaveBeenCalledTimes(1);
    });

    it('checks at start and then on the hourly timer until stopped', async () => {
        vi.useFakeTimers();
        try {
            const { env, watcher } = setup();
            env.result = { status: 'current', currentVersion: '1.0.0' };

            watcher.start();
            expect(env.check).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
            expect(env.check).toHaveBeenCalledTimes(2);

            watcher.stop();
            await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
            expect(env.check).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });
});
