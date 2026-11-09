import { describe, it, expect, vi } from 'vitest';

// settings.ts persists through electron-store (dynamically imported). Back it with
// an in-memory store so the pure logic (dedup, cap, cascade, round-trips) is
// testable without touching disk. Each test re-imports settings after resetting
// modules, since the module caches its store promise, so every case starts clean.
// Values a test stores before settings loads, as an older version left them.
const seeded = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));

vi.mock('electron-store', () => {
    class Store {
        private data: Record<string, unknown>;
        constructor(opts: { defaults?: Record<string, unknown> } = {}) {
            this.data = { ...opts.defaults, ...seeded.data };
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

async function loadSettings(stored: Record<string, unknown> = {}) {
    seeded.data = stored;
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

    it('removes an entry and cascades to its branch selection and favorites', async () => {
        const settings = await loadSettings();
        await settings.addRecentRepo('/a');
        await settings.addRecentRepo('/b');
        await settings.setBranchSelection('/a', 'main', 'feature');
        await settings.setFavoriteBranches('/a', ['main']);

        const next = await settings.removeRecentRepo('/a');

        expect(next).toEqual(['/b']);
        expect(await settings.getRecentRepos()).toEqual(['/b']);
        expect(await settings.getBranchSelection('/a')).toBeNull(); // selection dropped too
        expect(await settings.getFavoriteBranches('/a')).toEqual([]); // favorites too
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

describe('settings: favorite branches', () => {
    it('round-trips favorites per repo and is empty when none are stored', async () => {
        const { setFavoriteBranches, getFavoriteBranches } = await loadSettings();
        expect(await getFavoriteBranches('/a')).toEqual([]);

        await setFavoriteBranches('/a', ['main', 'origin/develop']);
        expect(await getFavoriteBranches('/a')).toEqual(['main', 'origin/develop']);
        expect(await getFavoriteBranches('/b')).toEqual([]); // isolated per repo

        await setFavoriteBranches('/a', []);
        expect(await getFavoriteBranches('/a')).toEqual([]);
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

    it('defaults flourishes on and persists a change', async () => {
        const { getFlourishes, setFlourishes } = await loadSettings();
        expect(await getFlourishes()).toBe(true);

        await setFlourishes(false);
        expect(await getFlourishes()).toBe(false);
    });

    it('defaults the code style to github and persists a change', async () => {
        const { getCodeStyle, setCodeStyle } = await loadSettings();
        expect(await getCodeStyle()).toBe('github');

        await setCodeStyle('vscode');
        expect(await getCodeStyle()).toBe('vscode');
    });

    it('defaults the editor to auto and persists a change', async () => {
        const { getEditorPreference, setEditorPreference } = await loadSettings();
        expect(await getEditorPreference()).toBe('auto');

        await setEditorPreference('phpstorm');
        expect(await getEditorPreference()).toBe('phpstorm');
    });

    it('defaults the diff layout to single and persists a change', async () => {
        const { getDiffLayout, setDiffLayout } = await loadSettings();
        expect(await getDiffLayout()).toBe('single');

        await setDiffLayout('stacked');
        expect(await getDiffLayout()).toBe('stacked');
    });
});

describe('settings: repository branches', () => {
    it('is empty until set, keeps each repo its own, and is dropped with the recent entry', async () => {
        const { getRepoBranches, setRepoBranches, addRecentRepo, removeRecentRepo } =
            await loadSettings();
        expect(await getRepoBranches('/repos/a')).toEqual({});

        await addRecentRepo('/repos/a');
        await setRepoBranches('/repos/a', { main: 'origin/trunk', development: null });
        expect(await getRepoBranches('/repos/a')).toEqual({
            main: 'origin/trunk',
            development: null,
        });
        expect(await getRepoBranches('/repos/b')).toEqual({});

        await removeRecentRepo('/repos/a');
        expect(await getRepoBranches('/repos/a')).toEqual({});
    });
});

describe('settings: notifications', () => {
    it('defaults to on, with ready to merge and merged by someone else off', async () => {
        const { getNotificationPrefs } = await loadSettings();
        const prefs = await getNotificationPrefs('/repos/a');

        expect(prefs.enabled).toBe(true);
        expect(prefs.dockBadge).toBe(true);
        expect(prefs.notifyDrafts).toBe(true);
        expect(prefs.dashboardShowDrafts).toBe(true);
        expect(prefs.dashboardAuthors).toBe('me');
        expect(prefs.dashboardHiddenCards).toEqual([]);
        expect(prefs.dashboardMergedPeriod).toBe('week');
        expect(prefs.events['checks-failed']).toBe(true);
        expect(prefs.events['ready-to-merge']).toBe(false);
        expect(prefs.events['merged-by-other']).toBe(false);
        expect(prefs.events.commented).toBe(true);
    });

    it('merges a single toggle into the repository preferences', async () => {
        const { getNotificationPrefs, setNotificationPrefs } = await loadSettings();
        await setNotificationPrefs('/repos/a', { events: { approved: false } });
        await setNotificationPrefs('/repos/a', { enabled: false });

        const prefs = await getNotificationPrefs('/repos/a');
        expect(prefs.enabled).toBe(false);
        expect(prefs.events.approved).toBe(false);
        expect(prefs.events['review-requested']).toBe(true);
    });

    it('keeps each repository its own preferences', async () => {
        const { getNotificationPrefs, setNotificationPrefs } = await loadSettings();
        await setNotificationPrefs('/repos/a', { enabled: false, dashboardMergedPeriod: 'month' });

        expect((await getNotificationPrefs('/repos/a')).enabled).toBe(false);
        expect((await getNotificationPrefs('/repos/a')).dashboardMergedPeriod).toBe('month');
        expect((await getNotificationPrefs('/repos/b')).enabled).toBe(true);
        expect((await getNotificationPrefs('/repos/b')).dashboardMergedPeriod).toBe('week');
    });

    it('starts a repository from the shared preferences stored before they were per repo', async () => {
        const { getNotificationPrefs, setNotificationPrefs } = await loadSettings({
            notifications: { dockBadge: false, events: { commented: false } },
        });
        await setNotificationPrefs('/repos/a', { enabled: false });

        const a = await getNotificationPrefs('/repos/a');
        const b = await getNotificationPrefs('/repos/b');
        expect([a.dockBadge, a.events.commented, a.enabled]).toEqual([false, false, false]);
        expect([b.dockBadge, b.events.commented, b.enabled]).toEqual([false, false, true]);
        expect((await getNotificationPrefs(null)).enabled).toBe(true);
    });

    it('carries an old shared drafts toggle over to both new ones', async () => {
        const { getNotificationPrefs, setNotificationPrefs } = await loadSettings({
            notifications: { showDrafts: false },
        });
        const prefs = await getNotificationPrefs('/repos/a');
        expect(prefs.notifyDrafts).toBe(false);
        expect(prefs.dashboardShowDrafts).toBe(false);

        // Changing one no longer moves the other.
        await setNotificationPrefs('/repos/a', { dashboardShowDrafts: true });
        const next = await getNotificationPrefs('/repos/a');
        expect(next.dashboardShowDrafts).toBe(true);
        expect(next.notifyDrafts).toBe(false);
    });

    it('keeps notifier state per key, null until stored', async () => {
        const { getNotifierState, setNotifierState } = await loadSettings();
        expect(await getNotifierState('me|o/r')).toBeNull();

        const state = {
            snapshot: {
                login: 'me',
                repo: 'o/r',
                fetchedAt: '2026-10-26T00:00:00Z',
                toReview: [],
                mine: [],
                failureNotified: [],
            },
            activity: [],
        };
        await setNotifierState('me|o/r', state);

        expect(await getNotifierState('me|o/r')).toEqual(state);
        expect(await getNotifierState('me|o/other')).toBeNull();
    });
});
