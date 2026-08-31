// A brief, self-contained particle flourish shown when a change set is fully
// reviewed. No dependency and best-effort: it quietly no-ops when there is no DOM
// or 2D canvas (e.g. under test), so callers can fire it unconditionally.
const COLORS = ['#9bb955', '#4078be', '#c84646', '#e0b341', '#7d5bed', '#e07b39'];
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

// A short synthesized party-horn toot: a reedy sawtooth that bends up on the
// onset and wobbles, shaped by a quick envelope. Best-effort — no-ops without Web
// Audio (e.g. under test) and stays silent if the context can't be resumed.
function playPartyHorn(): void {
    const Ctx = window.AudioContext;
    if (!Ctx) {
        return;
    }

    try {
        const ctx = new Ctx();
        void ctx.resume().catch(() => {});
        const t = ctx.currentTime;
        const dur = 0.5;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(560, t + 0.1);
        osc.frequency.linearRampToValueAtTime(500, t + dur);

        // A little reed wobble on the pitch.
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 22;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 18;
        lfo.connect(lfoGain).connect(osc.frequency);

        // Nasal, buzzy timbre.
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1100;
        filter.Q.value = 0.9;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
        gain.gain.setValueAtTime(0.2, t + dur - 0.12);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);

        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start(t);
        lfo.start(t);
        osc.stop(t + dur);
        lfo.stop(t + dur);
        osc.onended = () => void ctx.close();
    } catch {
        // Audio unavailable or blocked; the visual flourish still runs.
    }
}

export function celebrate(): void {
    if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') {
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
