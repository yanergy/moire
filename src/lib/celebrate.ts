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

export function celebrate(): void {
    if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') {
        return;
    }

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
