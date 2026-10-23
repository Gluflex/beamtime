// Generates samples/box-panels.svg: three panels of a small finger-joint box.
// Red = cut, blue = score. Units are mm. Run: node samples/make-sample.mjs
import { writeFileSync } from 'node:fs';

const T = 3;      // material thickness = finger depth
const F = 10;     // finger width

// Edge from (x0,y0) along direction (dx,dy) of length L; fingers stick out along normal (nx,ny).
function fingerEdge(x0, y0, dx, dy, nx, ny, L, out) {
  const n = Math.max(3, Math.floor(L / F) | 1); // odd count so both ends are flat
  const w = L / n;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i * w, b = (i + 1) * w;
    const o = i % 2 === 1 ? (out ? T : -T) : 0;
    pts.push([x0 + dx * a + nx * o, y0 + dy * a + ny * o]);
    pts.push([x0 + dx * b + nx * o, y0 + dy * b + ny * o]);
  }
  return pts;
}

function panel(x, y, W, H, out) {
  const pts = [
    ...fingerEdge(x, y, 1, 0, 0, -1, W, out),
    ...fingerEdge(x + W, y, 0, 1, 1, 0, H, out),
    ...fingerEdge(x + W, y + H, -1, 0, 0, 1, W, out),
    ...fingerEdge(x, y + H, 0, -1, -1, 0, H, out),
  ];
  const d = 'M' + pts.map((p) => p.map((v) => +v.toFixed(3)).join(' ')).join(' L') + ' Z';
  return `<path d="${d}"/>`;
}

const red = 'stroke="#ff0000"';
const blue = 'stroke="#0000ff"';
const parts = [];

// Two side panels with outward fingers.
parts.push(`<g ${red}>${panel(10, 10, 100, 60, true)}${panel(10, 85, 100, 60, true)}</g>`);

// Lid with inward fingers, a cable hole and four screw holes.
parts.push(`<g ${red}>${panel(130, 10, 100, 100, false)}
  <circle cx="180" cy="60" r="15"/>
  <circle cx="142" cy="22" r="1.6"/><circle cx="218" cy="22" r="1.6"/>
  <circle cx="142" cy="98" r="1.6"/><circle cx="218" cy="98" r="1.6"/></g>`);

// Score marks on the lid: a ring and an arrow.
parts.push(`<g ${blue}><circle cx="180" cy="60" r="22"/>
  <path d="M160 90 L200 90 M192 85 L200 90 L192 95"/></g>`);

// A small rotated tag, to exercise transforms.
parts.push(`<g ${red} transform="translate(170 130) rotate(-15)"><rect x="0" y="0" width="50" height="20" rx="4"/>
  <circle cx="8" cy="10" r="3"/></g>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240mm" height="160mm" viewBox="0 0 240 160">
<g fill="none" stroke-width="0.1">
${parts.join('\n')}
</g>
</svg>
`;
writeFileSync(new URL('./box-panels.svg', import.meta.url), svg);
console.log('wrote samples/box-panels.svg');
