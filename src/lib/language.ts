// Maps a file path to a Monaco language id, used to pick syntax highlighting.
// Monaco has no dedicated Vue grammar, so `.vue` falls back to HTML.
const BY_EXTENSION: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    vue: 'html',
    json: 'json',
    jsonc: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
};

const DISPLAY_LABEL: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    html: 'HTML',
    json: 'JSON',
    css: 'CSS',
    scss: 'SCSS',
    less: 'Less',
    markdown: 'Markdown',
    yaml: 'YAML',
    shell: 'Shell',
    plaintext: 'Plain Text',
};

export function inferLanguage(path: string): string {
    const dot = path.lastIndexOf('.');
    if (dot === -1) {
        return 'plaintext';
    }

    const ext = path.slice(dot + 1).toLowerCase();
    return BY_EXTENSION[ext] ?? 'plaintext';
}

export function languageLabel(language: string): string {
    return DISPLAY_LABEL[language] ?? language;
}
