/// <reference types="vite/client" />

import type { DiffViewerApi } from '@/shared/types';

declare global {
    interface Window {
        // The preload bridge (electron/preload.cjs). Present in the Electron
        // renderer; undefined under Vitest/jsdom, so guard before use.
        api?: DiffViewerApi;
    }
}
