// Browser-only: turn SVG text into contours in millimetres.
import { detectScale, polylineLength } from './geometry.js';

const SHAPES = 'path, line, rect, circle, ellipse, polyline, polygon';
const SKIP_CONTAINERS = 'defs, clipPath, mask, symbol, marker, pattern';
const CLOSED_TAGS = new Set(['rect', 'circle', 'ellipse', 'polygon']);
const STEP_MM = 0.5;
const MAX_SAMPLES = 4000;
// getPointAtLength returns float32 points; ignore chord excess below this (mm).
const JUMP_TOL = 0.003;

function toHex(css) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(css || '');
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
  return '#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('');
}

const ellipsePerimeter = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

// Chrome approximates getTotalLength for circles and rounded corners (a 1.6 mm circle
// came back about 10% short), so basic shapes use their exact formula in user units.
function exactLength(el, tag) {
  const v = (name) => el[name]?.baseVal?.value ?? 0;
  if (tag === 'circle') return 2 * Math.PI * v('r');
  if (tag === 'ellipse') return ellipsePerimeter(v('rx'), v('ry'));
  if (tag === 'rect') {
    const w = v('width'), h = v('height');
    let rx = el.hasAttribute('rx') ? v('rx') : null;
    let ry = el.hasAttribute('ry') ? v('ry') : null;
    if (rx === null) rx = ry ?? 0;
    if (ry === null) ry = rx;
    rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
    if (rx <= 0 || ry <= 0) return 2 * (w + h);
    return 2 * (w - 2 * rx) + 2 * (h - 2 * ry) + ellipsePerimeter(rx, ry);
  }
  return null;
}

function sanitize(root) {
  root.querySelectorAll('script, foreignObject, image, iframe').forEach((n) => n.remove());
  for (const el of root.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
    }
  }
}

/**
 * @param {string} text SVG source
 * @param {{ mmPerUnit?: number }} opts optional scale override
 * @returns {{ contours, mmPerUnit, assumed, skipped }}
 */
export function sampleSvg(text, opts = {}) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const src = doc.documentElement;
  if (!src || src.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('This file is not a readable SVG.');
  }
  const skipped = {
    text: src.querySelectorAll('text').length,
    image: src.querySelectorAll('image').length,
    use: src.querySelectorAll('use').length,
  };
  sanitize(src);

  const detected = detectScale(src.getAttribute('width'), src.getAttribute('height'), src.getAttribute('viewBox'));
  const mmPerUnit = opts.mmPerUnit > 0 ? opts.mmPerUnit : detected.mmPerUnit;

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none;';
  const root = document.importNode(src, true);
  host.appendChild(root);
  document.body.appendChild(host);

  const contours = [];
  try {
    const rootInv = root.getScreenCTM().inverse();
    for (const el of root.querySelectorAll(SHAPES)) {
      if (el.closest(SKIP_CONTAINERS)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const color = toHex(cs.stroke !== 'none' ? cs.stroke : null) || toHex(cs.fill !== 'none' ? cs.fill : null);
      if (!color) continue;
      let total;
      try { total = el.getTotalLength(); } catch { continue; }
      if (!(total > 0)) continue;

      const m = rootInv.multiply(el.getScreenCTM());
      const tr = (p) => [(m.a * p.x + m.c * p.y + m.e) * mmPerUnit, (m.b * p.x + m.d * p.y + m.f) * mmPerUnit];
      const T2 = m.a * m.a + m.b * m.b + m.c * m.c + m.d * m.d;
      const D = m.a * m.d - m.b * m.c;
      const sMax = Math.sqrt((T2 + Math.sqrt(Math.max(0, T2 * T2 - 4 * D * D))) / 2) * mmPerUnit;
      const n = Math.min(MAX_SAMPLES, Math.max(16, Math.ceil((total * sMax) / STEP_MM)));
      const at = (len) => tr(el.getPointAtLength(Math.min(total, Math.max(0, len))));
      const dd = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);

      const tag = el.tagName.toLowerCase();
      const isPath = tag === 'path';
      const pieces = [];
      let cur = [at(0)];
      let curStart = 0;
      let prevLen = 0;
      for (let i = 1; i <= n; i++) {
        const len = (total * i) / n;
        let p = at(len);
        // A chord longer than the arc between two samples can only be a move-to (a jump).
        let a = prevLen, pa = cur[cur.length - 1];
        while (isPath && dd(pa, p) > (len - a) * sMax * 1.001 + JUMP_TOL) {
          let lo = a, hi = len, plo = pa, phi = p;
          for (let k = 0; k < 60 && (hi - lo) * sMax > 1e-4; k++) {
            const mid = (lo + hi) / 2;
            const pm = at(mid);
            if (dd(plo, pm) > (mid - lo) * sMax * 1.001 + JUMP_TOL) { hi = mid; phi = pm; } else { lo = mid; plo = pm; }
          }
          if (dd(plo, phi) < 0.02) break;
          cur.push(plo);
          pieces.push({ pts: cur, s0: curStart, s1: lo });
          cur = [phi];
          curStart = hi;
          a = hi; pa = phi;
        }
        cur.push(p);
        prevLen = len;
      }
      pieces.push({ pts: cur, s0: curStart, s1: total });

      // Under a uniform scale the exact length is the path-length interval times the scale.
      // Sampled chords cut corners, so use them only when the transform skews or stretches.
      const sMin = sMax > 0 ? (Math.abs(D) * mmPerUnit * mmPerUnit) / sMax : 0;
      const uniform = sMax > 0 && sMin / sMax > 0.999;
      for (const { pts, s0, s1 } of pieces) {
        if (pts.length < 2) continue;
        const closed = CLOSED_TAGS.has(tag) || (pts.length > 2 && dd(pts[0], pts[pts.length - 1]) < 0.05);
        const contour = { color, closed, points: pts };
        if (uniform) {
          const exact = pieces.length === 1 ? exactLength(el, tag) : null;
          const chord = polylineLength(pts, closed);
          // For paths, sampled points lie on the true curve, so their chord length is a
          // lower bound; take it if the browser's own length comes back shorter.
          contour.lengthMm = exact != null ? exact * sMax : Math.max((s1 - s0) * sMax, chord);
        }
        contours.push(contour);
      }
    }
  } finally {
    host.remove();
  }
  if (!contours.length) throw new Error('No cuttable shapes found. Convert text and images to paths.');
  return { contours, mmPerUnit, assumed: !(opts.mmPerUnit > 0) && detected.assumed, skipped };
}
