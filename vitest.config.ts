import { fileURLToPath, URL } from 'node:url';
import { defineConfig, configDefaults } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            'monaco-editor': fileURLToPath(
                new URL('./src/components/__tests__/monaco-stub.ts', import.meta.url)
            ),
        },
    },
    test: {
        environment: 'jsdom',
        exclude: [...configDefaults.exclude, 'e2e/**'],
        // Polyfills for the browser APIs reka-ui touches under jsdom.
        setupFiles: ['./src/components/__tests__/vitest.setup.ts'],
        root: fileURLToPath(new URL('./', import.meta.url)),
    },
});
