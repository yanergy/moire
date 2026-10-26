// Polls GitHub for the repository open in Moiré and turns changes into native
// notifications, the dock badge and the recent activity list. One Notifier lives
// in the main process; main.ts points it at a repository whenever one opens.
//
// Everything Electron or disk related comes in through NotifierDeps, so the poll
// loop, the event filtering and the summary rule are unit-testable with fakes.
// The data itself (fetching, diffing) lives in github/notifications.ts.

import {
    diffSnapshots,
    type ActivityEntry,
    type DashboardEvent,
    type DashboardPr,
    type DashboardSnapshot,
    type RepoIdentityResult,
    type SnapshotResult,
} from './github/notifications';
import type { PrStatus } from './github/gh';
import type { NotificationPrefs, NotifierRepoState } from './settings';

export const POLL_INTERVAL_MS = 2 * 60 * 1000;

// More events than this in one poll collapse into a single summary notification,
// so reopening a repository after a busy week does not flood the screen.
const SUMMARY_THRESHOLD = 3;

const MAX_ACTIVITY = 50;

export interface NotificationContent {
    title: string;
    subtitle: string;
    body: string;
}

// What the dashboard shows: the last poll's outcome for the open repository.
export interface NotifierView {
    status: PrStatus;
    message?: string;
    snapshot: DashboardSnapshot | null;
    activity: ActivityEntry[];
}

// What the renderer's dashboard receives: the view plus the "Show drafts" toggle,
// which the dashboard applies to its lists. Mirrored as DashboardState in
// src/shared/types.ts; keep the two in sync.
export interface DashboardState extends NotifierView {
    showDrafts: boolean;
}

export interface NotifierDeps {
    getRepoIdentity: (repoPath: string) => Promise<RepoIdentityResult>;
    fetchSnapshot: (repoPath: string, repo: string, now: Date) => Promise<SnapshotResult>;
    getPrefs: () => Promise<NotificationPrefs>;
    loadState: (key: string) => Promise<NotifierRepoState | null>;
    saveState: (key: string, state: NotifierRepoState) => Promise<void>;
    // Show a native notification; `onClick` runs when the user clicks it.
    notify: (content: NotificationContent, onClick: () => void) => void;
    // 0 clears the badge.
    setBadge: (count: number) => void;
    onOpenPr: (pr: DashboardPr) => void;
    onOpenDashboard: () => void;
    // Called after every poll and repository change, for the dashboard.
    onChange?: (view: NotifierView) => void;
    logError: (scope: string, error: unknown) => void;
    now?: () => Date;
}

function prLine(pr: DashboardPr): string {
    return `#${pr.number} ${pr.title}`;
}

// The notification text for one event. The repository goes in the subtitle so
// the body can stay about the PR.
export function describeEvent(event: DashboardEvent, repo: string): NotificationContent {
    const { pr } = event;
    let title: string;
    let body = prLine(pr);

    switch (event.kind) {
        case 'review-requested':
            title = 'Review requested';
            body = `${prLine(pr)}\nby ${pr.author}`;
            break;
        case 'changes-requested':
            title = event.actor ? `${event.actor} requested changes` : 'Changes requested';
            break;
        case 'closed-unmerged':
            title = 'Closed without merge';
            break;
        case 'checks-failed':
            title = 'Checks failed';
            if (event.checks?.length) {
                body = `${prLine(pr)}\n${event.checks.join(', ')}`;
            }
            break;
        case 'approved':
            title = 'Approved';
            break;
        case 'merge-conflict':
            title = 'Merge conflict';
            break;
        case 'ready-to-merge':
            title = 'Ready to merge';
            break;
        case 'merged-by-other':
            title = event.actor ? `Merged by ${event.actor}` : 'Merged';
            break;
    }

    return { title, subtitle: repo, body };
}

function toActivity(event: DashboardEvent, at: string): ActivityEntry {
    return {
        kind: event.kind,
        at,
        number: event.pr.number,
        title: event.pr.title,
        url: event.pr.url,
        ...(event.actor ? { actor: event.actor } : {}),
        ...(event.checks ? { checks: event.checks } : {}),
    };
}

const EMPTY_VIEW: NotifierView = { status: 'ok', snapshot: null, activity: [] };

export class Notifier {
    private repoPath: string | null = null;
    // The open repository's owner/name, resolved once per repository.
    private repo: string | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    // Bumped on every repository change, so a poll that was in flight for the
    // previous repository drops its result instead of reporting it.
    private generation = 0;
    private inFlight: Promise<void> | null = null;
    private view: NotifierView = EMPTY_VIEW;

    constructor(private readonly deps: NotifierDeps) {}

    getView(): NotifierView {
        return this.view;
    }

    // Point the notifier at a repository (or none). Polls right away when
    // notifications are on.
    async setRepo(repoPath: string | null): Promise<void> {
        if (repoPath === this.repoPath) {
            return;
        }

        this.generation += 1;
        this.repoPath = repoPath;
        this.repo = null;
        this.inFlight = null;
        this.setView(EMPTY_VIEW);
        await this.restart();
    }

    // Re-read the preferences and start or stop background polling to match.
    // Called after the master switch changes, or the gh account is switched.
    async restart(): Promise<void> {
        this.stop();
        const prefs = await this.deps.getPrefs();
        if (!this.repoPath || !prefs.enabled) {
            this.deps.setBadge(0);
            return;
        }

        this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
        await this.poll();
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    // After the Mac wakes from sleep: poll right away instead of waiting for the
    // next tick, but only while background polling is on.
    onResume(): void {
        if (this.timer) {
            void this.poll();
        }
    }

    // Poll now. Concurrent calls share the poll in flight. Also used by the
    // dashboard's refresh, which works while notifications are off.
    poll(): Promise<void> {
        if (!this.inFlight) {
            const poll = this.runPoll().finally(() => {
                // A repository change may already have replaced it.
                if (this.inFlight === poll) {
                    this.inFlight = null;
                }
            });
            this.inFlight = poll;
        }
        return this.inFlight;
    }

    private async runPoll(): Promise<void> {
        const { generation, repoPath } = this;
        if (!repoPath) {
            return;
        }

        try {
            if (!this.repo) {
                const identity = await this.deps.getRepoIdentity(repoPath);
                if (generation !== this.generation) {
                    return;
                }
                if (identity.status !== 'ok' || !identity.repo) {
                    this.setView({
                        ...EMPTY_VIEW,
                        status: identity.status,
                        message: identity.message,
                    });
                    return;
                }
                this.repo = identity.repo;
            }

            const now = (this.deps.now ?? (() => new Date()))();
            const result = await this.deps.fetchSnapshot(repoPath, this.repo, now);
            if (generation !== this.generation) {
                return;
            }
            if (result.status !== 'ok' || !result.snapshot) {
                // Keep the last good data on screen; just report why it is stale.
                this.setView({ ...this.view, status: result.status, message: result.message });
                return;
            }

            const prefs = await this.deps.getPrefs();
            const key = `${result.snapshot.login}|${result.snapshot.repo}`;
            const saved = await this.deps.loadState(key);

            let state: NotifierRepoState;
            if (saved) {
                const diff = diffSnapshots(saved.snapshot, result.snapshot);
                // Events are diffed (and so recorded as seen) even when they are
                // not shown, so turning a toggle on later does not replay them.
                const delivered = diff.events.filter(
                    (e) =>
                        prefs.enabled && prefs.events[e.kind] && (prefs.showDrafts || !e.pr.isDraft)
                );
                const at = now.toISOString();
                state = {
                    snapshot: diff.snapshot,
                    activity: [
                        ...delivered.map((e) => toActivity(e, at)).toReversed(),
                        ...saved.activity,
                    ].slice(0, MAX_ACTIVITY),
                };
                this.deliver(delivered, result.snapshot.repo);
            } else {
                // First poll for this login and repository: a silent baseline.
                // Carry the CI flags for PRs already failing, so they do not all
                // notify on the next poll.
                state = {
                    snapshot: {
                        ...result.snapshot,
                        failureNotified: result.snapshot.mine
                            .filter((pr) => pr.state === 'OPEN' && pr.ci === 'failing')
                            .map((pr) => pr.id),
                    },
                    activity: [],
                };
            }

            await this.deps.saveState(key, state);
            if (generation !== this.generation) {
                return;
            }

            this.updateBadge(state.snapshot, prefs);
            this.setView({ status: 'ok', snapshot: state.snapshot, activity: state.activity });
        } catch (error) {
            this.deps.logError('notifier poll', error);
        }
    }

    private deliver(events: DashboardEvent[], repo: string): void {
        if (events.length > SUMMARY_THRESHOLD) {
            this.deps.notify(
                {
                    title: `${events.length} pull request updates`,
                    subtitle: repo,
                    body: 'Open the dashboard to see what changed.',
                },
                () => this.deps.onOpenDashboard()
            );
            return;
        }

        for (const event of events) {
            this.deps.notify(describeEvent(event, repo), () => this.deps.onOpenPr(event.pr));
        }
    }

    private updateBadge(snapshot: DashboardSnapshot, prefs: NotificationPrefs): void {
        if (!prefs.enabled || !prefs.dockBadge) {
            this.deps.setBadge(0);
            return;
        }

        const count = snapshot.toReview.filter((pr) => prefs.showDrafts || !pr.isDraft).length;
        this.deps.setBadge(count);
    }

    private setView(view: NotifierView): void {
        this.view = view;
        this.deps.onChange?.(view);
    }
}
