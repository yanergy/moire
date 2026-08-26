// src/components/__tests__/monaco-stub.ts
import { vi } from 'vitest';
import type * as Monaco from 'monaco-editor';

export const languages = {
    register: vi.fn<typeof Monaco.languages.register>(),
};

export const editor = {
    createModel: vi.fn<typeof Monaco.editor.createModel>(),
    create: vi.fn<typeof Monaco.editor.create>(),
};

export const Uri = {
    parse: vi.fn<typeof Monaco.Uri.parse>(),
};
