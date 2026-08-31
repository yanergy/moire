import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// An in-memory fs so initLogging's truncate/append decision and the write path
// are deterministic (a real WriteStream flushes asynchronously). `files` maps a
// path to its current contents; createWriteStream appends synchronously, and
// opening with flags 'w' truncates first.
const { files } = vi.hoisted(() => ({ files: new Map<string, string>() }));

vi.mock('node:fs', () => ({
    default: {
        mkdirSync: vi.fn<() => void>(),
        existsSync: (p: string) => files.has(p),
        statSync: (p: string) => ({ size: Buffer.byteLength(files.get(p) ?? '') }),
        createWriteStream: (p: string, opts: { flags?: string } = {}) => {
            if (opts.flags === 'w' || !files.has(p)) {
                files.set(p, '');
            }
            return {
                write: (line: string) => {
                    files.set(p, (files.get(p) ?? '') + line);
                },
            };
        },
    },
}));

import { formatValue, initLogging, logError } from '../electron/logger';

const MAX_LOG_BYTES = 512 * 1024;

describe('logger formatValue', () => {
    it('keeps an Error stack, the useful part', () => {
        const error = new Error('boom');
        expect(formatValue(error)).toBe(error.stack);
        expect(formatValue(error)).toContain('boom');
    });

    it('passes a string through unchanged', () => {
        expect(formatValue('plain message')).toBe('plain message');
    });

    it('JSON-encodes a non-error object so it still reads', () => {
        expect(formatValue({ code: 128, ref: 'nope' })).toBe('{"code":128,"ref":"nope"}');
    });

    it('falls back to String for an unserializable value', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(formatValue(circular)).toBe('[object Object]');
    });
});

describe('logger initLogging', () => {
    beforeEach(() => {
        files.clear();
        // initLogging registers crash listeners on every call; lift the cap so the
        // per-test accumulation doesn't warn.
        process.setMaxListeners(50);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('opens the log, records startup, and returns the path', () => {
        const logPath = initLogging('/data');

        expect(logPath).toBe('/data/moire.log');
        const content = files.get('/data/moire.log') ?? '';
        expect(content).toContain('[INFO]');
        expect(content).toContain('Moiré started');
    });

    it('appends to a log still under the size cap', () => {
        files.set('/data/moire.log', 'earlier line\n');

        initLogging('/data');

        const content = files.get('/data/moire.log') ?? '';
        expect(content).toContain('earlier line'); // prior content preserved
        expect(content).toContain('Moiré started'); // startup line appended
    });

    it('truncates a log that is over the size cap', () => {
        files.set('/data/moire.log', 'x'.repeat(MAX_LOG_BYTES + 1));

        initLogging('/data');

        const content = files.get('/data/moire.log') ?? '';
        expect(content).not.toContain('xxxx'); // old content discarded
        expect(content).toContain('Moiré started'); // fresh file
        expect(content.length).toBeLessThan(MAX_LOG_BYTES);
    });

    it('logError writes an ERROR line naming the context and value', () => {
        initLogging('/data');

        logError('ipc git:branches', new Error('bad ref'));

        const content = files.get('/data/moire.log') ?? '';
        expect(content).toContain('[ERROR]');
        expect(content).toContain('ipc git:branches:');
        expect(content).toContain('bad ref');
    });
});
