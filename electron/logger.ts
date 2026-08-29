// A small main-process logger: a plain-text log file under the app's userData
// directory plus capture of otherwise-invisible crashes (uncaught exceptions and
// unhandled rejections). Lines are mirrored to the console so `npm run dev`
// surfaces them in the terminal too. formatValue is pure and unit-tested; the
// file/electron wiring is exercised by hand.

import fs from 'node:fs';
import path from 'node:path';

// A log past this is truncated on the next launch, so it can't grow unbounded.
const MAX_LOG_BYTES = 512 * 1024;

let logStream: fs.WriteStream | null = null;
let logPath = '';

// Render any logged value: an Error keeps its stack (the useful part), a string
// passes through, anything else is JSON so an object still reads.
export function formatValue(value: unknown): string {
    if (value instanceof Error) {
        return value.stack ?? `${value.name}: ${value.message}`;
    }

    if (typeof value === 'string') {
        return value;
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function write(level: string, message: string): void {
    const line = `${new Date().toISOString()} [${level}] ${message}\n`;
    (level === 'ERROR' ? console.error : console.log)(line.trimEnd());
    logStream?.write(line);
}

export function logError(context: string, error: unknown): void {
    write('ERROR', `${context}: ${formatValue(error)}`);
}

// Open the log file under userData and route main-process crashes to it. Returns
// the log file path (so the menu can offer to open it). Appends across launches
// until the file passes the size cap, then starts fresh.
export function initLogging(userDataPath: string): string {
    logPath = path.join(userDataPath, 'moire.log');

    try {
        fs.mkdirSync(userDataPath, { recursive: true });
        const fresh = fs.existsSync(logPath) && fs.statSync(logPath).size >= MAX_LOG_BYTES;
        logStream = fs.createWriteStream(logPath, { flags: fresh ? 'w' : 'a' });
    } catch (error) {
        console.error('Could not open the log file:', error);
    }

    // Without these, a crash in the main process is silent (or only in a dev
    // terminal); record them so a packaged build leaves a trail.
    process.on('uncaughtException', (error) => logError('uncaughtException', error));
    process.on('unhandledRejection', (reason) => logError('unhandledRejection', reason));

    write('INFO', `Moiré started; logging to ${logPath}`);
    return logPath;
}
