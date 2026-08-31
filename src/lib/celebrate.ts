// A brief particle flourish shown when a change set is fully reviewed. Best-effort:
// it quietly no-ops when there is no DOM or 2D canvas (e.g. under test), so callers
// can fire it unconditionally.
//
// hornSrc is a party-horn recording bundled by Vite so it resolves in dev and the
// packaged app.
import hornSrc from '@/assets/partyblower.mp3';

const COLORS = ['#9bb955', '#4078be', '#c84646', '#e0b341', '#7d5bed', '#e07b39'];

// Gate for the whole flourish, driven by the View menu toggle (App wires it from
// the persisted setting). On by default.
let enabled = true;

export function setFlourishesEnabled(value: boolean): void {
    enabled = value;
}
const COUNT = 90;
const DURATION = 1500;
const GRAVITY = 0.15;

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    vr: number;
    size: number;
    color: string;
}

// The recording opens with a short quiet lead-in, so playback starts a little in
// to line the toot up with the burst instead of trailing it.
const HORN_START = 0.15;

function createHorn(): HTMLAudioElement | null {
    // jsdom (tests) has an Audio constructor but no real media playback, so skip it.
    if (typeof Audio === 'undefined') {
        return null;
    }
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) {
        return null;
    }

    try {
        const el = new Audio(hornSrc);
        el.preload = 'auto';
        el.volume = 0.4;
        el.load();
        return el;
    } catch {
        return null;
    }
}

// Decoded up front (at import, which the app does early) so the toot is ready the
// instant the burst fires; a lazily created element would buffer/seek late and lag.
const horn = createHorn();

function playPartyHorn(): void {
    if (!horn) {
        return;
    }

    try {
        horn.currentTime = HORN_START;
        const played = horn.play();
        if (played && typeof played.catch === 'function') {
            played.catch(() => {});
        }
    } catch {
        // Audio unavailable or blocked; the visual flourish still runs.
    }
}

export function celebrate(): void {
    if (
        !enabled ||
        typeof document === 'undefined' ||
        typeof requestAnimationFrame !== 'function'
    ) {
        return;
    }

    playPartyHorn();

    const canvas = document.createElement('canvas');
    let context: CanvasRenderingContext2D | null = null;
    try {
        context = canvas.getContext('2d');
    } catch {
        return;
    }

    if (!context) {
        return;
    }

    // const so the non-null narrowing holds inside the animation closure below.
    const ctx = context;
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    Object.assign(canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '2147483647',
    });
    ctx.scale(dpr, dpr);
    document.body.appendChild(canvas);

    const particles: Particle[] = [];
    for (let i = 0; i < COUNT; i++) {
        const angle = (Math.PI * 2 * i) / COUNT + Math.random() * 0.6;
        const speed = 4 + Math.random() * 6;
        particles.push({
            x: width / 2,
            y: height / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 5,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.4,
            size: 5 + Math.random() * 6,
            color: COLORS[i % COLORS.length]!,
        });
    }

    const start = performance.now();

    function frame(now: number): void {
        const elapsed = now - start;
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION);
        for (const p of particles) {
            p.vy += GRAVITY;
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vr;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
        }

        if (elapsed < DURATION) {
            requestAnimationFrame(frame);
        } else {
            canvas.remove();
        }
    }

    requestAnimationFrame(frame);
}
