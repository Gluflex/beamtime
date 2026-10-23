// Canvas preview of the machine bed and the cut playback.
import { polylineLength } from './geometry.js';

const COLORS = { cut: '#ff3b30', score: '#2f7bff', ignore: '#4a4a4a' };
const PLAYBACK_SECONDS = 10;

export class Preview {
  constructor(canvas, onClock) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onClock = onClock;
    this.layers = [];
    this.timeline = [];
    this.box = null;
    this.raf = 0;
    this.progress = null; // null = idle (all drawn as planned), number = machine seconds elapsed
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  /** layers: grouped layers; plan: ordered active contours with op; settings: speeds */
  set(layers, plan, box, settings, start) {
    this.stop();
    this.layers = layers;
    this.box = box;
    this.timeline = buildTimeline(plan, settings, start);
    this.progress = null;
    this.draw();
  }

  clear() {
    this.stop();
    this.layers = [];
    this.timeline = [];
    this.box = null;
    this.draw();
  }

  get duration() {
    const last = this.timeline[this.timeline.length - 1];
    return last ? last.t1 : 0;
  }

  play() {
    if (!this.timeline.length) return;
    this.stop();
    const total = this.duration;
    const speed = total / PLAYBACK_SECONDS;
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(total, ((now - t0) / 1000) * speed);
      this.progress = t;
      this.draw();
      this.onClock?.(t, total, t >= total);
      if (t < total) this.raf = requestAnimationFrame(tick);
      else this.raf = 0;
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  get playing() {
    return this.raf !== 0;
  }

  draw() {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    if (!this.box || !(this.box.w > 0)) return;

    const pad = 28;
    const b = this.box;
    const s = Math.min((W - 2 * pad) / Math.max(b.w, 1), (H - 2 * pad) / Math.max(b.h, 1));
    const ox = (W - b.w * s) / 2 - b.minX * s;
    const oy = (H - b.h * s) / 2 - b.minY * s;
    const X = (p) => [ox + p[0] * s, oy + p[1] * s];

    // mm grid: 10 mm minor, 50 mm major
    const gx0 = Math.floor(b.minX / 10) * 10 - 10, gx1 = Math.ceil(b.maxX / 10) * 10 + 10;
    const gy0 = Math.floor(b.minY / 10) * 10 - 10, gy1 = Math.ceil(b.maxY / 10) * 10 + 10;
    ctx.lineWidth = 1;
    for (let x = gx0; x <= gx1; x += 10) {
      ctx.strokeStyle = x % 50 === 0 ? '#2a2a2a' : '#1c1c1c';
      ctx.beginPath(); ctx.moveTo(ox + x * s, oy + gy0 * s); ctx.lineTo(ox + x * s, oy + gy1 * s); ctx.stroke();
    }
    for (let y = gy0; y <= gy1; y += 10) {
      ctx.strokeStyle = y % 50 === 0 ? '#2a2a2a' : '#1c1c1c';
      ctx.beginPath(); ctx.moveTo(ox + gx0 * s, oy + y * s); ctx.lineTo(ox + gx1 * s, oy + y * s); ctx.stroke();
    }

    const path = (pts, closed, upTo = Infinity) => {
      ctx.beginPath();
      let [x, y] = X(pts[0]);
      ctx.moveTo(x, y);
      let acc = 0;
      const all = closed ? [...pts, pts[0]] : pts;
      for (let i = 1; i < all.length; i++) {
        const seg = Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]);
        if (acc + seg >= upTo) {
          const f = seg > 0 ? (upTo - acc) / seg : 0;
          const p = [all[i - 1][0] + (all[i][0] - all[i - 1][0]) * f, all[i - 1][1] + (all[i][1] - all[i - 1][1]) * f];
          [x, y] = X(p);
          ctx.lineTo(x, y);
          ctx.stroke();
          return [x, y];
        }
        acc += seg;
        [x, y] = X(all[i]);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      return [x, y];
    };

    const idle = this.progress === null;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const layer of this.layers) {
      ctx.strokeStyle = COLORS[layer.op];
      ctx.globalAlpha = idle ? (layer.op === 'ignore' ? 0.8 : 1) : 0.28;
      ctx.lineWidth = 1.25;
      for (const c of layer.contours) path(c.points, c.closed);
    }
    ctx.globalAlpha = 1;
    if (idle) return;

    let head = null;
    for (const ev of this.timeline) {
      if (ev.t0 > this.progress) break;
      if (ev.kind === 'travel') {
        const f = Math.min(1, (this.progress - ev.t0) / Math.max(ev.t1 - ev.t0, 1e-9));
        const p = [ev.from[0] + (ev.to[0] - ev.from[0]) * f, ev.from[1] + (ev.to[1] - ev.from[1]) * f];
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(...X(ev.from)); ctx.lineTo(...X(p)); ctx.stroke();
        ctx.setLineDash([]);
        head = X(p);
      } else {
        const burnStart = ev.t0 + ev.pierce;
        const frac = this.progress <= burnStart ? 0 : Math.min(1, (this.progress - burnStart) / Math.max(ev.t1 - burnStart, 1e-9));
        ctx.strokeStyle = COLORS[ev.op];
        ctx.lineWidth = 2.25;
        ctx.shadowColor = COLORS[ev.op];
        ctx.shadowBlur = 6;
        head = frac > 0 ? path(ev.contour.points, ev.contour.closed, frac * ev.len) : X(ev.contour.points[0]);
        ctx.shadowBlur = 0;
      }
    }
    if (head && this.progress < this.duration) {
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#ff6b5e';
      ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(head[0], head[1], 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

/** Machine-time timeline: travel, then pierce + burn per contour. */
export function buildTimeline(plan, settings, start = null) {
  const events = [];
  let t = 0;
  let head = start || plan[0]?.contour.points[0] || [0, 0];
  for (const { contour, op } of plan) {
    const start = contour.points[0];
    const d = Math.hypot(start[0] - head[0], start[1] - head[1]);
    if (d > 0.01) {
      const dt = settings.travelSpeed > 0 ? d / settings.travelSpeed : 0;
      events.push({ kind: 'travel', from: head, to: start, t0: t, t1: t + dt });
      t += dt;
    }
    const len = contour.lengthMm ?? polylineLength(contour.points, contour.closed);
    const speed = op === 'cut' ? settings.cutSpeed : settings.scoreSpeed;
    const burn = speed > 0 ? len / speed : 0;
    events.push({ kind: 'burn', op, contour, len, pierce: settings.pierceSec, t0: t, t1: t + settings.pierceSec + burn });
    t += settings.pierceSec + burn;
    head = contour.closed ? start : contour.points[contour.points.length - 1];
  }
  return events;
}
