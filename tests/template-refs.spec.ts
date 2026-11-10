import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

// In a production build, <script setup> templates are compiled inline, and a
// template `ref="name"` then binds to the setup variable called `name` when one
// exists. That is only right when the variable is the ref meant to hold the
// element (`useTemplateRef('name')`, `ref()` or `shallowRef()`). Any other binding
// of that name (a computed, a store) breaks rendering for the whole app, and only
// in the packaged app: the dev server and these tests keep string refs as they
// are. So this checks the source of every component instead.

const ROOT = join(__dirname, '..', 'src', 'components');

function vueFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '__tests__' ? [] : vueFiles(path);
        }
        return entry.name.endsWith('.vue') ? [path] : [];
    });
}

function clashes(file: string): string[] {
    const source = readFileSync(file, 'utf8');
    const script = source.split('<template>')[0] ?? '';
    const found: string[] = [];

    for (const [, name] of source.matchAll(/\sref="([A-Za-z_$][\w$]*)"/g)) {
        const declaration = new RegExp(String.raw`\b(?:const|let|var)\s+${name}\s*=\s*([^\n;]*)`);
        const initializer = script.match(declaration)?.[1];
        const imported = new RegExp(String.raw`import[^;]*\b${name}\b[^;]*from`).test(script);
        const fn = new RegExp(String.raw`\bfunction\s+${name}\b`).test(script);
        const holdsElement =
            initializer !== undefined &&
            (new RegExp(String.raw`^useTemplateRef(<.*>)?\(\s*'${name}'\s*\)`).test(initializer) ||
                /^(shallowRef|ref)(<.*>)?\(/.test(initializer));

        if ((initializer !== undefined && !holdsElement) || imported || fn) {
            found.push(`${relative(ROOT, file)}: ref="${name}"`);
        }
    }

    return found;
}

describe('template refs', () => {
    it('never name a setup binding that is not the ref holding the element', () => {
        const files = vueFiles(ROOT);
        // Guards against a wrong root silently checking nothing.
        expect(files.length).toBeGreaterThan(20);
        expect(files.flatMap(clashes)).toEqual([]);
    });
});
