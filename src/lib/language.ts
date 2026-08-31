// Maps a Monaco language id to a human-readable label for the status bar. The
// language id itself is inferred in the main process (GitService.languageForPath)
// and shipped with each file pair, so the renderer only needs the display mapping.
const DISPLAY_LABEL: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    html: 'HTML',
    xml: 'XML',
    json: 'JSON',
    css: 'CSS',
    scss: 'SCSS',
    less: 'Less',
    markdown: 'Markdown',
    yaml: 'YAML',
    shell: 'Shell',
    php: 'PHP',
    ini: 'INI',
    dockerfile: 'Dockerfile',
    plaintext: 'Plain Text',
};

export function languageLabel(language: string): string {
    return DISPLAY_LABEL[language] ?? language;
}
