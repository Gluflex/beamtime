// Pure geometry helpers. No DOM access, so they run in Node tests too.

const UNIT_MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };

/** Parse an SVG length like "210mm" or "800". Returns { value, unit } or null. */
export function parseLength(str) {
  if (str == null) return null;
  const m = String(str).trim().match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc|px|%)?$/i);
  if (!m) return null;
  return { value: parseFloat(m[1]), unit: (m[2] || '').toLowerCase() };
}

/**
 * Millimetres per SVG user unit, from the root width/height and viewBox.
 * Returns { mmPerUnit, assumed } where assumed=true means no physical unit was given
 * and 96 dpi px was used.
 */
export function detectScale(widthAttr, heightAttr, viewBox) {
  const w = parseLength(widthAttr);
  const vb = viewBox ? String(viewBox).trim().split(/[\s,]+/).map(Number) : null;
  const hasVb = vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0;
  if (w && w.unit !== '%' && w.unit in UNIT_MM) {
    const widthMm = w.value * UNIT_MM[w.unit];
    const assumed = w.unit === '' || w.unit === 'px';
    if (hasVb) return { mmPerUnit: widthMm / vb[2], assumed };
    return { mmPerUnit: UNIT_MM[w.unit], assumed };
  }
  return { mmPerUnit: UNIT_MM.px, assumed: true };
}

export function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function polylineLength(points, closed = false) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  if (closed && points.length > 2) len += dist(points[points.length - 1], points[0]);
  return len;
}

export function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function unionBbox(boxes) {
  if (!boxes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const x of boxes) {
    b.minX = Math.min(b.minX, x.minX); b.minY = Math.min(b.minY, x.minY);
    b.maxX = Math.max(b.maxX, x.maxX); b.maxY = Math.max(b.maxY, x.maxY);
  }
  return { ...b, w: b.maxX - b.minX, h: b.maxY - b.minY };
}

/** Ray-casting point-in-polygon. */
export function pointInPolygon([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Hue-based default operation: red-ish = cut, blue-ish = score, rest = ignore. */
export function defaultOp(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 'ignore';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 0.15) return 'ignore'; // grey, black, white
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  if (h < 25 || h >= 330) return 'cut';
  if (h >= 190 && h < 260) return 'score';
  return 'ignore';
}

/** Group contours by colour. Each contour gets length and bbox attached. */
export function groupLayers(contours, ops = {}) {
  const byColor = new Map();
  for (const c of contours) {
    if (c.points.length < 2) continue;
    const lengthMm = polylineLength(c.points, c.closed);
    const item = { ...c, lengthMm, box: bbox(c.points) };
    if (!byColor.has(c.color)) byColor.set(c.color, []);
    byColor.get(c.color).push(item);
  }
  return [...byColor.entries()].map(([color, list]) => ({
    color,
    op: ops[color] || defaultOp(color),
    contours: list,
    lengthMm: list.reduce((s, c) => s + c.lengthMm, 0),
    pierces: list.length,
  }));
}

function containedIn(inner, outer) {
  if (!outer.closed || outer === inner) return false;
  const a = inner.box, b = outer.box;
  if (a.minX < b.minX || a.minY < b.minY || a.maxX > b.maxX || a.maxY > b.maxY) return false;
  if (a.w * a.h >= b.w * b.h) return false;
  return pointInPolygon(inner.points[0], outer.points);
}

/**
 * Cut order: a contour may only be cut once every contour inside it is cut
 * (so parts do not drop out before their holes are cut). Among the allowed ones,
 * pick the one whose start point is nearest to the current head position.
 * Returns { order, travelMm }.
 */
export function orderContours(contours, start = [0, 0]) {
  const n = contours.length;
  const blockers = contours.map(() => 0);
  const parentsOf = contours.map(() => []);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && containedIn(contours[i], contours[j])) {
        blockers[j]++;
        parentsOf[i].push(j);
      }
    }
  }
  const done = new Array(n).fill(false);
  const order = [];
  let head = start;
  let travelMm = 0;
  for (let k = 0; k < n; k++) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (done[i] || blockers[i] > 0) continue;
      const d = dist(head, contours[i].points[0]);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) {
      // Containment cycle should not happen; fall back to any remaining contour.
      best = done.indexOf(false);
      bestD = dist(head, contours[best].points[0]);
    }
    done[best] = true;
    for (const p of parentsOf[best]) blockers[p]--;
    travelMm += bestD;
    order.push(contours[best]);
    const pts = contours[best].points;
    head = contours[best].closed ? pts[0] : pts[pts.length - 1];
  }
  return { order, travelMm };
}
