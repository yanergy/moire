import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import electron from 'vite-plugin-electron/simple';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        vue(),
        vueDevTools(),
        tailwindcss(),
        electron({
            main: { entry: 'electron/main.cjs' },
            // A sandboxed preload must be CommonJS, so emit it as preload.cjs even
            // though the project is "type": "module".
            preload: {
                input: 'electron/preload.cjs',
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
});
