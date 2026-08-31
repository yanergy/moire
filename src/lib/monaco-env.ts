// oxlint-disable import/default -- Vite `?worker` virtual modules expose a
// default Worker constructor that the static import resolver can't see.
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
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
        // Only two workers ship: the editor worker (the diff editor needs it to
        // compute diffs) and the JSON worker (JSON is the one language kept as a
        // rich service). Every other mapped language uses a worker-free Monarch
        // grammar, so no ts/css/html workers are bundled.
        getWorker(_workerId: string, label: string) {
            if (label === 'json') {
                return new jsonWorker();
            }

            return new editorWorker();
        },
    };
}
