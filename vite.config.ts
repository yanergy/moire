import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import electron from 'vite-plugin-electron/simple';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
    base: './',
    plugins: [
        vue(),
        // Dev-server only: the Vue DevTools plugin has no place in a production
        // build. Recent versions self-limit, but gating it explicitly keeps that
        // from being load-bearing.
        ...(command === 'serve' ? [vueDevTools()] : []),
        tailwindcss(),
        electron({
            main: { entry: 'electron/main.ts' },
            // A sandboxed preload must be CommonJS, so emit it as preload.cjs even
            // though the source is TypeScript ESM and the project is "type": "module".
            preload: {
                input: 'electron/preload.ts',
                vite: {
                    build: {
                        rollupOptions: {
                            output: { format: 'cjs', entryFileNames: '[name].cjs' },
                        },
                    },
                },
            },
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
}));
