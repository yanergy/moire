import { describe, it, expect, vi } from 'vitest';

// settings.ts persists through electron-store (dynamically imported). Back it with
// an in-memory store so the pure logic (dedup, cap, cascade, round-trips) is
// testable without touching disk. Each test re-imports settings after resetting
// modules, since the module caches its store promise, so every case starts clean.
vi.mock('electron-store', () => {
    class Store {
        private data: Record<string, unknown>;
        constructor(opts: { defaults?: Record<string, unknown> } = {}) {
            this.data = { ...opts.defaults };
        }
        get(key: string, def: unknown) {
            return key in this.data ? this.data[key] : def;
        }
        set(key: string, value: unknown) {
            this.data[key] = value;
        }
    }
    return { default: Store };
});

async function loadSettings() {
    vi.resetModules();
    return import('../electron/settings');
}

describe('settings: recent repos', () => {
    it('returns an empty list by default', async () => {
        const { getRecentRepos } = await loadSettings();
        expect(await getRecentRepos()).toEqual([]);
    });

    it('adds most-recent-first and de-duplicates', async () => {
        const { addRecentRepo, getRecentRepos } = await loadSettings();
        await addRecentRepo('/a');
        await addRecentRepo('/b');
        const list = await addRecentRepo('/a'); // re-open moves to front, no dupe

        expect(list).toEqual(['/a', '/b']);
        expect(await getRecentRepos()).toEqual(['/a', '/b']);
    });

    it('caps the list at ten, dropping the oldest', async () => {
        const { addRecentRepo } = await loadSettings();
        let list: string[] = [];
        for (let i = 0; i < 15; i++) {
            // Sequential on purpose: each add is a read-modify-write of the same list.
            // oxlint-disable-next-line no-await-in-loop
            list = await addRecentRepo(`/repo-${i}`);
        }

        expect(list).toHaveLength(10);
        expect(list[0]).toBe('/repo-14'); // newest first
        expect(list).not.toContain('/repo-0'); // oldest evicted
    });

    it('removes an entry and cascades to its branch selection', async () => {
        const settings = await loadSettings();
        await settings.addRecentRepo('/a');
        await settings.addRecentRepo('/b');
        await settings.setBranchSelection('/a', 'main', 'feature');

        const next = await settings.removeRecentRepo('/a');

        expect(next).toEqual(['/b']);
        expect(await settings.getRecentRepos()).toEqual(['/b']);
        expect(await settings.getBranchSelection('/a')).toBeNull(); // selection dropped too
    });
});

describe('settings: branch selection', () => {
    it('round-trips a selection and is null when none is stored', async () => {
        const { setBranchSelection, getBranchSelection } = await loadSettings();
        expect(await getBranchSelection('/a')).toBeNull();

        await setBranchSelection('/a', 'main', 'WORKING TREE');
        expect(await getBranchSelection('/a')).toEqual({ base: 'main', head: 'WORKING TREE' });
        expect(await getBranchSelection('/b')).toBeNull(); // isolated per repo
    });
});

describe('settings: theme and window state', () => {
    it('defaults the theme to system and persists a change', async () => {
        const { getThemePreference, setThemePreference } = await loadSettings();
        expect(await getThemePreference()).toBe('system');

        await setThemePreference('dark');
        expect(await getThemePreference()).toBe('dark');
    });

    it('is null until a window state is stored, then round-trips it', async () => {
        const { getWindowState, setWindowState } = await loadSettings();
        expect(await getWindowState()).toBeNull();

        await setWindowState({ width: 800, height: 600, maximized: false });
        expect(await getWindowState()).toEqual({ width: 800, height: 600, maximized: false });
    });
});
