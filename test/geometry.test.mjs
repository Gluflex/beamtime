import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectScale, polylineLength, groupLayers, orderContours, defaultOp, pointInPolygon } from '../src/geometry.js';
import { estimate, formatQuote, sanitizeSettings } from '../src/estimate.js';

const rect = (x, y, w, h, color = '#ff0000') => ({
  color,
  closed: true,
  points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
});

test('detectScale reads mm width with viewBox', () => {
  assert.deepEqual(detectScale('200mm', '100mm', '0 0 200 100'), { mmPerUnit: 1, assumed: false });
  assert.equal(detectScale('20cm', '10cm', '0 0 400 200').mmPerUnit, 0.5);
  assert.equal(detectScale('4in', null, null).mmPerUnit, 25.4);
});

test('detectScale falls back to 96 dpi and flags it', () => {
  const s = detectScale(null, null, '0 0 96 96');
  assert.equal(s.assumed, true);
  assert.ok(Math.abs(s.mmPerUnit - 25.4 / 96) < 1e-12);
  assert.equal(detectScale('96', '96', '0 0 96 96').assumed, true);
});

test('closed rectangle length and pierces', () => {
  const r = rect(0, 0, 100, 50);
  assert.equal(polylineLength(r.points, true), 300);
  const [layer] = groupLayers([r]);
  assert.equal(layer.lengthMm, 300);
  assert.equal(layer.pierces, 1);
  assert.equal(layer.op, 'cut');
});

test('default operations by colour', () => {
  assert.equal(defaultOp('#ff0000'), 'cut');
  assert.equal(defaultOp('#e3342f'), 'cut');
  assert.equal(defaultOp('#0000ff'), 'score');
  assert.equal(defaultOp('#2f7bff'), 'score');
  assert.equal(defaultOp('#000000'), 'ignore');
  assert.equal(defaultOp('#00aa00'), 'ignore');
});

test('pointInPolygon', () => {
  const sq = rect(0, 0, 10, 10).points;
  assert.equal(pointInPolygon([5, 5], sq), true);
  assert.equal(pointInPolygon([15, 5], sq), false);
});

test('holes are cut before the part that contains them', () => {
  const outer = rect(0, 0, 100, 100);
  const hole = rect(40, 40, 20, 20);
  const other = rect(200, 0, 10, 10);
  const [layer] = groupLayers([outer, hole, other]);
  const { order } = orderContours(layer.contours, [0, 0]);
  const iOuter = order.findIndex((c) => c.box.w === 100);
  const iHole = order.findIndex((c) => c.box.w === 20);
  assert.ok(iHole < iOuter, 'hole before outer');
  assert.equal(order.length, 3);
});

test('estimate adds up the breakdown', () => {
  const layers = [
    { op: 'cut', lengthMm: 1200, pierces: 4 },
    { op: 'score', lengthMm: 600, pierces: 2 },
    { op: 'ignore', lengthMm: 9999, pierces: 9 },
  ];
  const s = sanitizeSettings({ cutSpeed: 12, scoreSpeed: 120, pierceSec: 0.5, travelSpeed: 400, setupMin: 2, ratePerMin: 1.5, sheetW: 600, sheetH: 400, sheetPrice: 12 });
  const e = estimate(layers, 800, { w: 190, h: 90 }, s);
  assert.equal(e.sec.cut, 100);
  assert.equal(e.sec.score, 5);
  assert.equal(e.sec.pierce, 3);
  assert.equal(e.sec.travel, 2);
  assert.equal(e.sec.setup, 120);
  assert.equal(e.totalSec, 230);
  assert.ok(Math.abs(e.price.machine - (230 / 60) * 1.5) < 1e-9);
  // (190+10) x (90+10) = 20000 mm2 of 240000 mm2 sheet
  assert.ok(Math.abs(e.price.material - (20000 / 240000) * 12) < 1e-9);
  const full = estimate(layers, 800, { w: 190, h: 90 }, { ...s, chargeFullSheet: true });
  assert.equal(full.price.material, 12);
  assert.match(formatQuote('box.svg', e), /Total\s+CHF \d+\.\d\d/);
});

test('sanitizeSettings rejects junk', () => {
  const s = sanitizeSettings({ cutSpeed: 'abc', pierceSec: -1 });
  assert.equal(s.cutSpeed, 12);
  assert.equal(s.pierceSec, 0.4);
});
