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

import { isNewerVersion, checkForUpdate, promptUpdateIfAvailable } from '../electron/updates';

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

describe('promptUpdateIfAvailable', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.getVersion.mockReturnValue('1.0.0');
    });

    it('shows a popup and opens the release page when Download is chosen', async () => {
        state.fetch.mockResolvedValue(
            jsonResponse({ tag_name: 'v1.1.0', html_url: 'https://example.test/releases/v1.1.0' })
        );
        state.showMessageBox.mockResolvedValue({ response: 0 }); // Download

        await promptUpdateIfAvailable();

        expect(state.showMessageBox).toHaveBeenCalledTimes(1);
        expect(state.openExternal).toHaveBeenCalledWith('https://example.test/releases/v1.1.0');
    });

    it('shows the popup but does not open the page when Later is chosen', async () => {
        state.fetch.mockResolvedValue(
            jsonResponse({ tag_name: 'v1.1.0', html_url: 'https://example.test/releases/v1.1.0' })
        );
        state.showMessageBox.mockResolvedValue({ response: 1 }); // Later

        await promptUpdateIfAvailable();

        expect(state.showMessageBox).toHaveBeenCalledTimes(1);
        expect(state.openExternal).not.toHaveBeenCalled();
    });

    it('shows no popup when the build is current', async () => {
        state.fetch.mockResolvedValue(jsonResponse({ tag_name: 'v1.0.0' }));

        await promptUpdateIfAvailable();

        expect(state.showMessageBox).not.toHaveBeenCalled();
    });

    it('shows no popup when the check fails', async () => {
        state.fetch.mockRejectedValue(new Error('offline'));

        await promptUpdateIfAvailable();

        expect(state.showMessageBox).not.toHaveBeenCalled();
    });
});
