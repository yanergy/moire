/// <reference types="vite/client" />

import type { MoireApi } from '@/shared/types';

declare global {
    interface Window {
        // The preload bridge (electron/preload.cjs). Present in the Electron
        // renderer; undefined under Vitest/jsdom, so guard before use.
        api?: MoireApi;
    }
}
