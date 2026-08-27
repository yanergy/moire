// oxlint-disable import/default -- Vite `?worker` virtual modules expose a
// default Worker constructor that the static import resolver can't see.
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import type { Environment } from 'monaco-editor';

// Worker wiring for Monaco under Vite. Kept isolated from monaco-theme.ts so
// the theme helpers can be imported (e.g. in unit tests) without pulling the
// `?worker` bundles into the graph.

declare global {
    interface Window {
        MonacoEnvironment?: Environment;
    }
}

let configured = false;

export function setupMonacoEnv() {
    if (configured) {
        return;
    }

    configured = true;
    self.MonacoEnvironment = {
        getWorker(_workerId: string, label: string) {
            if (label === 'json') {
                return new jsonWorker();
            }
            if (label === 'css' || label === 'scss' || label === 'less') {
                return new cssWorker();
            }
            if (label === 'html' || label === 'handlebars' || label === 'razor') {
                return new htmlWorker();
            }
            if (label === 'typescript' || label === 'javascript') {
                return new tsWorker();
            }

            return new editorWorker();
        },
    };
}
