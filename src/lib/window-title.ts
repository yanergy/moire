// The native window title (which Electron mirrors from the page's
// document.title) shows the app name, plus the open repository when one is
// selected. Kept as a pure function so the format is unit-tested without
// mounting the app.
const APP_NAME = 'Moiré';

export function windowTitle(repoName: string): string {
    return repoName ? `${APP_NAME} — ${repoName}` : APP_NAME;
}
