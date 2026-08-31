import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        // Array form so the specific '@/lib/monaco' entry is matched before the
        // general '@' prefix. Monaco pulls browser workers and heavy assets jsdom
        // can't run, so the trimmed entry and the bare package both resolve to a stub.
        alias: [
            {
                find: '@/lib/monaco',
                replacement: fileURLToPath(
                    new URL('./src/components/__tests__/monaco-stub.ts', import.meta.url)
                ),
            },
            { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
            {
                find: 'monaco-editor',
                replacement: fileURLToPath(
                    new URL('./src/components/__tests__/monaco-stub.ts', import.meta.url)
                ),
            },
        ],
    },
    test: {
        environment: 'jsdom',
        // Polyfills for the browser APIs reka-ui touches under jsdom.
        setupFiles: ['./src/components/__tests__/vitest.setup.ts'],
        root: fileURLToPath(new URL('./', import.meta.url)),
    },
});
