// Time and price model. Pure, no DOM.

export const DEFAULT_SETTINGS = {
  cutSpeed: 12,        // mm/s, example for 3 mm plywood on a 60 W CO2 laser
  scoreSpeed: 120,     // mm/s
  pierceSec: 0.4,      // s per pierce
  travelSpeed: 400,    // mm/s, head moves with the laser off
  setupMin: 3,         // min, loading the sheet and focusing
  ratePerMin: 1.5,     // currency per machine minute
  sheetW: 600,         // mm
  sheetH: 400,         // mm
  sheetPrice: 9,       // currency per sheet
  chargeFullSheet: false,
  marginMm: 5,         // added around the part bounding box for material share
  currency: 'CHF',
};

const num = (v, d) => (Number.isFinite(+v) && +v >= 0 ? +v : d);

export function sanitizeSettings(s = {}) {
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (k === 'chargeFullSheet') out[k] = Boolean(s[k] ?? DEFAULT_SETTINGS[k]);
    else if (k === 'currency') out[k] = String(s[k] || DEFAULT_SETTINGS[k]).slice(0, 6);
    else out[k] = num(s[k], DEFAULT_SETTINGS[k]);
  }
  return out;
}

/**
 * layers: [{ op, lengthMm, pierces }]
 * travelMm: head travel between contours (laser off)
 * box: bounding box of all active contours in mm ({ w, h })
 */
export function estimate(layers, travelMm, box, settings) {
  const s = sanitizeSettings(settings);
  const active = layers.filter((l) => l.op !== 'ignore');
  const cutMm = active.filter((l) => l.op === 'cut').reduce((a, l) => a + l.lengthMm, 0);
  const scoreMm = active.filter((l) => l.op === 'score').reduce((a, l) => a + l.lengthMm, 0);
  const pierces = active.reduce((a, l) => a + l.pierces, 0);

  const sec = {
    cut: s.cutSpeed > 0 ? cutMm / s.cutSpeed : 0,
    score: s.scoreSpeed > 0 ? scoreMm / s.scoreSpeed : 0,
    pierce: pierces * s.pierceSec,
    travel: s.travelSpeed > 0 ? travelMm / s.travelSpeed : 0,
    setup: s.setupMin * 60,
  };
  const totalSec = sec.cut + sec.score + sec.pierce + sec.travel + sec.setup;
  const machineMin = totalSec / 60;

  const sheetArea = s.sheetW * s.sheetH;
  const usedArea = box && box.w > 0 ? (box.w + 2 * s.marginMm) * (box.h + 2 * s.marginMm) : 0;
  const sheets = sheetArea > 0 ? usedArea / sheetArea : 0;
  const materialShare = s.chargeFullSheet ? Math.max(1, Math.ceil(sheets)) : sheets;
  const fitsOnSheet = box ? (box.w <= s.sheetW && box.h <= s.sheetH) || (box.h <= s.sheetW && box.w <= s.sheetH) : true;

  const price = {
    machine: machineMin * s.ratePerMin,
    material: usedArea > 0 ? materialShare * s.sheetPrice : 0,
  };
  price.total = price.machine + price.material;

  return { cutMm, scoreMm, travelMm, pierces, sec, totalSec, machineMin, sheets, materialShare, fitsOnSheet, price, settings: s };
}

export function fmtDuration(sec) {
  const t = Math.round(sec);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatQuote(fileName, est) {
  const s = est.settings;
  const c = s.currency;
  const money = (v) => `${c} ${v.toFixed(2)}`;
  const mm = (v) => `${Math.round(v).toLocaleString('en-US')} mm`;
  const lines = [
    `Laser job estimate: ${fileName}`,
    '',
    `Cut      ${mm(est.cutMm)} at ${s.cutSpeed} mm/s     ${fmtDuration(est.sec.cut)}`,
    `Score    ${mm(est.scoreMm)} at ${s.scoreSpeed} mm/s     ${fmtDuration(est.sec.score)}`,
    `Pierces  ${est.pierces} x ${s.pierceSec} s     ${fmtDuration(est.sec.pierce)}`,
    `Travel   ${mm(est.travelMm)} at ${s.travelSpeed} mm/s     ${fmtDuration(est.sec.travel)}`,
    `Setup    ${s.setupMin} min     ${fmtDuration(est.sec.setup)}`,
    `Machine time  ${fmtDuration(est.totalSec)} (${est.machineMin.toFixed(1)} min)`,
    '',
    `Machine  ${est.machineMin.toFixed(1)} min x ${money(s.ratePerMin)}/min = ${money(est.price.machine)}`,
    s.chargeFullSheet
      ? `Material ${est.materialShare} sheet(s) x ${money(s.sheetPrice)} = ${money(est.price.material)}`
      : `Material ${(est.materialShare * 100).toFixed(0)}% of a ${s.sheetW} x ${s.sheetH} mm sheet at ${money(s.sheetPrice)} = ${money(est.price.material)}`,
    `Total    ${money(est.price.total)}`,
    '',
    'Estimate without corner slowdown; real time can be higher on detailed parts.',
  ];
  return lines.join('\n');
}
