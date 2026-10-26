# GitHub notifications and dashboard

Plan for two connected features: native notifications for GitHub pull request events, and a
dashboard that summarizes what needs your attention ("you have 3 PRs to review"). Both read from
one shared data source, so they always agree with each other.

Both are scoped to **the repository open in Moiré** and **the active `gh` account**. Nothing
outside that repository is watched or shown. Opening another repository in the repo picker moves
the notifications, the dashboard and the dock badge to that repository.

Branch: `feat/github-notifications`.

## Features

### Master switch

A "GitHub Notifications" toggle in the Git → Notifications menu, **on by default**. Turning it off
stops polling, notifications and the dock badge. The dashboard keeps working when it is off
(it fetches on open and on refresh instead of in the background).

### Notifications

Native macOS notifications, sent by the main process, for these events:

| Event | When it fires | Default |
|---|---|---|
| Review requested | An open PR newly requests your review, including a re-request after the author pushes changes | On |
| Changes requested | A reviewer submits a Changes requested review on one of your PRs | On |
| Closed without merge | One of your PRs is closed and not merged | On |
| Checks failed | The CI status of one of your PRs turns failed (see "CI status per PR" below) | On |
| Approved | The review decision on one of your PRs changes to Approved | On |
| Merge conflict | One of your PRs changes to conflicting, usually because the base branch moved | On |
| Ready to merge | One of your PRs is approved, has passing checks and has no conflicts, all at once | Off |
| Merged by someone else | One of your PRs is merged by another account (your own merges never notify) | Off |

Each event type has its own toggle in the Git → Notifications menu. That menu lives under Git
because, like the account switcher there, it needs a connected `gh`. Clicking a notification opens the
PR (see "Opening a PR" below). More event types can be added later by extending the diff
function.

If one poll produces more than 3 events, they are combined into a single summary notification
("5 updates in owner/repo") that opens the dashboard. Every event still lands in the recent
activity list.

#### CI status per PR

CI is tracked per PR, not per commit or per job. A PR has one CI state (passing, pending or
failing), taken from the check rollup of its latest commit. "Checks failed" fires when a PR enters
the failing state, and then stays quiet for that PR until its checks have passed again. Pushing a
fix that fails again therefore does not notify a second time, and several failed jobs produce a
single notification that lists their names.

#### Drafts

Draft PRs are included by default, in the dashboard and in notifications. A "Show drafts" toggle
in the dashboard header turns them off in both places. The toggle is persisted.

#### Later

Not part of this branch, but candidates for a later round:

- **Review with comments**: one notification per submitted review on your PR (never per
  individual comment). Needs comment reviews added to the query.
- **Mentioned**: someone mentions you in a PR. Needs an extra search.

Deliberately left out: every new comment (too noisy, GitHub email covers it), CI results on other
people's PRs, new pushes to PRs you review (re-requests cover this), and "checks passed" (frequent,
and "Ready to merge" is the more useful version).

### Dashboard

An overview of the open repository's pull requests, as a grid of cards. Each card shows a status
dot, a label, the PR count and a caption saying what is counted:

| Card | Counts | Caption (default) |
|---|---|---|
| Needs your review (blue) | Open PRs that request your review, whatever the user filter | Requested from you |
| Changes requested (orange) | Open PRs with changes requested | On your PRs |
| Ready to merge (green) | Open PRs that are approved, with passing checks and no conflicts | Approved, checks green |
| Failing checks (red) | Open PRs with failing checks | On your PRs |
| Your open PRs (purple) | Open PRs | Authored by you |
| Stale (gray) | Open PRs with no activity in 7 or more days | No activity in 7+ days |
| Drafts (gray) | Open draft PRs | Not ready for review |

Every card but the first counts the open PRs of the authors picked in the **Users** submenu of
the header's **Display** menu. It defaults to the signed in account (stored as "me", so it
follows an account switch), and can pick any mix of the authors with an open PR in the
repository, or **All**. The captions follow the pick ("Any author", "By ann", "3 authors"), and
"Your open PRs" reads "Open PRs" for anyone but yourself.

Clicking a card lists its PRs (title, author, branches, age, size and CI state), with a way back
to the overview. The header shows how many PRs the cards cover, when the data was last refreshed,
the **Display** menu (with "Show drafts" and **Users**) and a refresh button. With drafts hidden,
the Drafts card goes away and drafts are left out of every other card.

The dashboard is a third main view next to the diff and PR views, reachable from the toolbar and
View → Dashboard. It only exists while a repository is open: with no repository open, the toolbar
button and the menu item are not available. When the repository has no GitHub remote, or `gh` is
missing or not signed in, the dashboard shows the reason using the existing `PrStatus` style
messages.

The recent activity list is still recorded by the notifier but not shown on the dashboard.

### Dock badge

The dock icon shows the number of PRs in the open repository waiting for your review, and is
cleared when there are none or no repository is open. macOS only (`app.dock.setBadge`). It has its
own toggle in the Git → Notifications menu and follows the master switch.

### Opening a PR

Every PR shown belongs to the open repository, so clicking one (in a notification or on the
dashboard) opens it inside Moiré:

1. Select the PR's base branch and its head branch (the local branch if it exists, otherwise the
   remote tracking branch `origin/<head>`).
2. Switch to the PR view.

When the head branch is not available locally or as a remote tracking branch (a PR from a fork,
or a branch that has not been fetched yet), the PR opens on GitHub in the browser instead.

If the main window is closed when a notification is clicked, it is reopened first.

## How it works

### Repository and account

When a repository is opened, the main process resolves its GitHub identity once with
`gh repo view --json nameWithOwner` and the signed in login with `gh api user`. Both are cached
until the repository changes or the `gh` account is switched in Moiré.

### Data source

While a repository is open, the main process runs one `gh api graphql` query every 2 minutes
through the existing `gh` runner in `electron/github/gh.ts`. The query contains three searches,
all limited with `repo:<owner>/<name>`:

1. `is:open is:pr user-review-requested:@me archived:false` for review requests.
2. `is:pr author:@me` limited to open PRs and PRs updated in the last 7 days, with each PR's
   state, merged flag, who merged it, base and head branch names, review decision, latest review
   per reviewer, mergeable state, check rollup (with failed check names) and draft flag.
3. `is:pr is:open archived:false` for every open PR in the repository (up to 100), for the
   cards when the user filter picks other authors, and for the Users submenu. This list is not
   diffed.

The result is normalized into a **snapshot**: a plain object with these lists.

GitHub webhooks are not an option, because they need a publicly reachable server. GitHub's own
notifications feed is not used either: it reports that something happened on your PR without
saying what, so the PR would have to be fetched anyway.

### Diffing and notifying

A pure function compares the previous snapshot with the new one and returns events:

- A PR in the review list that was not there before produces "Review requested". A PR that left
  the list and comes back produces it again, which covers re-requests.
- A new Changes requested review (by review id) on one of your PRs produces "Changes requested".
- A PR of yours that changes from open to closed with `merged: false` produces "Closed without
  merge".
- A PR of yours whose CI state becomes failing produces "Checks failed", unless it already
  notified for that PR and the checks have not passed since. The snapshot stores a per PR
  "failure notified" flag that is cleared when the checks pass.
- A review decision that changes to `APPROVED` produces "Approved".
- A mergeable state that changes to `CONFLICTING` produces "Merge conflict". GitHub computes this
  lazily and can report `UNKNOWN` for a while; `UNKNOWN` is ignored and never counts as a change.
- A PR that was not ready to merge and now is (approved, checks passing, not conflicting, not a
  draft) produces "Ready to merge".
- A PR of yours that changes to merged, with a merger other than the signed in account, produces
  "Merged by someone else".

Events whose type is toggled off, and events for drafts while "Show drafts" is off, are dropped.
The rest become native notifications and are appended to the recent activity list (capped at 50
per repository).

### Persistence

The latest snapshot and the recent activity list are saved with electron-store, keyed by `gh`
login plus repository, so restarting the app or switching repositories does not resend
notifications. When there is no saved snapshot for that key yet (first run, a repository opened
for the first time, or another account), the snapshot is stored as a baseline and no
notifications are sent, to avoid a flood of old items.

Reopening a repository that already has a saved snapshot reports what changed while it was not
open. The summary rule above keeps that to a single notification when a lot happened.

### Polling behavior

- Starts when a repository is opened, stops when it is closed or replaced, then restarts for the
  new one.
- Polls immediately on start, then every 2 minutes.
- Keeps running while the window is closed on macOS (the app stays alive and the repository stays
  open); stops on quit.
- Polls immediately after the Mac wakes from sleep (`powerMonitor` `resume`).
- The dashboard's refresh button triggers an immediate poll.
- Failures (offline, `gh` missing or not authenticated, no GitHub remote) are logged and skipped.
- Cost: one GraphQL query per poll, a negligible share of the 5,000 points per hour limit.

### Process split

Following `documentation/code-conventions.md`:

- **Main process** owns the polling, the snapshot, notifications, the dock badge and settings.
- **Renderer** only displays the dashboard. It gets the snapshot over IPC and receives a push
  when a new one arrives. A notification click that opens a PR is pushed to the renderer, which
  selects the branches and switches to the PR view.
- New IPC channels (`dashboard:get`, `dashboard:refresh`, `dashboard:changed`,
  `dashboard:set-show-drafts`, `dashboard:open-pr`, `dashboard:show`) each get a handler or push
  in `electron/ipc/`, exposure in the preload bridge, and a `MoireApi` type in
  `src/shared/types.ts`.

## Files

| File | Change |
|---|---|
| `electron/github/notifications.ts` (new) | Repository and login lookup, GraphQL query, parsing into a snapshot, the pure diff function |
| `electron/notifier.ts` (new) | Poll loop tied to the open repository, wake handling, native notifications, summary notification, click handling, dock badge, recent activity |
| `electron/settings.ts` | Master switch, per event toggles, dock badge toggle, "Show drafts", saved snapshot and recent activity per login and repository |
| `electron/menu.ts` | Git → "Notifications" submenu with the master switch, a checkbox per event type and one for the dock badge; "Dashboard" item under View, enabled only while a repository is open |
| `electron/main.ts` | Start, restart and stop the notifier as repositories open and close |
| `electron/ipc/handlers.ts`, `electron/preload.ts`, `src/shared/types.ts` | Dashboard IPC channels and types |
| `src/stores/dashboard.ts` (new) | Pinia store mirroring the snapshot |
| `src/components/dashboard/` (new) | Dashboard view and its row and section components, built from shadcn-vue and `--moire-*` tokens, reusing `UserAvatar` |
| `src/stores/ui.ts`, `src/shared/types.ts` | Add `'dashboard'` to `MainView` |
| `tests/` and `src/components/__tests__/` | Diff function, parsing (with a fake `gh` runner), notifier dedupe and summary rule, dashboard rendering |
| `README.md` | Feature description and known limitations |

## Build order

1. Data layer: repository and login lookup, query, parsing, snapshot, diff function, with tests.
2. Notifier: polling tied to the open repository, persistence, notifications, menu toggles. Usable
   on its own at this point.
3. Dashboard IPC and store.
4. Dashboard UI, including the "Show drafts" toggle.
5. Opening PRs in Moiré from the dashboard and from notifications, and the dock badge.
6. README, packaged build check, PR.

## Limitations

- Only the repository open in Moiré is watched. PRs in other repositories never notify.
- Notifications only arrive while Moiré is running (closing the window keeps it running on
  macOS, quitting does not).
- Only the active `gh` account is checked; switching accounts in Moiré switches the data too.
- GitHub keeps sending its own email and mobile notifications. Moiré cannot turn those off.
- macOS notification permission must be verified on the packaged release build, not only in
  dev, because code signing affects whether notifications show.
- Clicking a notification while the main window is closed reopens it, but the repository's
  branches may not be loaded yet when the PR arrives, in which case the PR opens on GitHub.

Resolved during implementation: the PR lookup used to pass a remote tracking head
(`origin/<head>`) to `gh pr list --head` unchanged, so it never found the PR. It now drops the
remote prefix for remote tracking branches.

## Decisions

- **Scope**: only the repository open in the repo picker. With no repository open there are no
  notifications, no dashboard and no badge.
- **Account**: only the active `gh` account.
- **Master switch**: on by default, users can opt out.
- **Team review requests** are left out. Only requests addressed to you personally count
  (`user-review-requested:@me`). Team requests are listed as a possible expansion in the README.
- **Drafts**: shown by default, with a "Show drafts" toggle in the dashboard that also applies to
  notifications.
- **Dashboard placement**: a third main view inside the main window, next to the diff and PR
  views. Not a separate window. It is a quick overview, so it stays compact.
- **Dock badge**: yes, counting review requests in the open repository, with its own toggle.
