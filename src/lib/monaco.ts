// Trimmed Monaco entry. Importing the `monaco-editor` barrel registers ~90
// language grammars and pulls four language workers (ts.worker ~5.9 MB, css
// ~1 MB, html ~720 KB, json ~410 KB), nearly all unused. Instead take the editor
// API alone and register only the languages the app maps in
// GitService.LANGUAGE_BY_EXTENSION: the worker-free "basic" (Monarch) grammars for
// the thirteen that ship one, plus JSON's rich service (JSON has no basic grammar).
// Only the diff editor's own worker survives; see monaco-env.ts.
//
// Every module that needs Monaco imports it from here so nothing pulls the barrel
// back in. Component tests alias this path to a stub (vitest.config.ts).
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution';
import 'monaco-editor/esm/vs/basic-languages/scss/scss.contribution';
import 'monaco-editor/esm/vs/basic-languages/less/less.contribution';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution';
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution';
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution';
import 'monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';

export * from 'monaco-editor/esm/vs/editor/editor.api';
