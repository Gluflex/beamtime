import { groupLayers, planJob, unionBbox } from './geometry.js';
import { estimate, formatQuote, fmtDuration, sanitizeSettings, DEFAULT_SETTINGS } from './estimate.js';
import { sampleSvg } from './svg-sampler.js';
import { Preview } from './preview.js';

const $ = (id) => document.getElementById(id);
const STORE = 'beamtime.settings.v1';

const state = {
  fileName: null,
  text: null,
  sampled: null,     // { contours, mmPerUnit, assumed, skipped }
  scaleOverride: null,
  ops: {},           // colour -> op, per file
  settings: loadSettings(),
  result: null,
};

const preview = new Preview($('canvas'), (t, total, done) => {
  $('clock').textContent = fmtDuration(t);
  if (done) $('play').textContent = 'Play again';
});

function loadSettings() {
  try { return sanitizeSettings(JSON.parse(localStorage.getItem(STORE) || '{}')); }
  catch { return sanitizeSettings({}); }
}
function saveSettings() {
  try { localStorage.setItem(STORE, JSON.stringify(state.settings)); } catch { /* private mode */ }
}

function fillSettingsForm() {
  for (const input of $('settings').querySelectorAll('[data-key]')) {
    const v = state.settings[input.dataset.key];
    if (input.type === 'checkbox') input.checked = v;
    else input.value = v;
  }
}

const mm = (v) => `${Math.round(v).toLocaleString('en-US')} mm`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showError(msg) {
  $('error').textContent = msg || '';
  $('bed').classList.toggle('has-error', Boolean(msg));
  if (msg) setTimeout(() => { if ($('error').textContent === msg) showError(''); }, 5000);
}

function load(name, text) {
  let sampled;
  try {
    sampled = sampleSvg(text);
  } catch (e) {
    showError(e.message);
    return;
  }
  showError('');
  state.fileName = name;
  state.text = text;
  state.sampled = sampled;
  state.scaleOverride = null;
  state.ops = {};
  $('bed').classList.add('loaded');
  $('play').disabled = false;
  $('copy').disabled = false;
  $('play').textContent = 'Play cut';
  $('clock').textContent = '0:00';
  recompute();
}

function resample() {
  try {
    state.sampled = sampleSvg(state.text, { mmPerUnit: state.scaleOverride });
    recompute();
  } catch (e) {
    showError(e.message);
  }
}

function recompute() {
  const { sampled, settings } = state;
  if (!sampled) return;
  const layers = groupLayers(sampled.contours, state.ops);
  for (const l of layers) state.ops[l.color] = l.op;
  const activeBoxes = layers.filter((l) => l.op !== 'ignore').flatMap((l) => l.contours.map((c) => c.box));
  const allBox = unionBbox(layers.flatMap((l) => l.contours.map((c) => c.box)));
  const box = activeBoxes.length ? unionBbox(activeBoxes) : null;
  const start = [allBox.minX, allBox.minY];
  const { plan, travelMm } = planJob(layers, start);
  const est = estimate(layers, travelMm, box, settings);
  state.result = { layers, est, box };

  renderFile(sampled, allBox);
  renderLayers(layers);
  renderQuote(est, box);
  preview.set(layers, plan, allBox, est.settings, start);
  $('bedNote').textContent = plan.length
    ? `${plan.length} contours. Playback is compressed to 10 s; the clock shows laser time without setup.`
    : 'All layers are set to Ignore.';
  $('play').disabled = plan.length === 0;
  $('clock').textContent = '0:00';
  $('play').textContent = 'Play cut';
}

function renderFile(sampled, allBox) {
  $('fName').textContent = state.fileName;
  $('fSize').textContent = `${allBox.w.toFixed(1)} x ${allBox.h.toFixed(1)} mm`;
  $('scale').value = +sampled.mmPerUnit.toFixed(6);
  $('scaleNote').textContent = state.scaleOverride ? '(set by you)' : sampled.assumed ? '(no units in file, assumed 96 dpi px)' : '(from file)';
  const sk = sampled.skipped;
  const parts = [];
  if (sk.text) parts.push(`${sk.text} text element(s)`);
  if (sk.image) parts.push(`${sk.image} image(s)`);
  if (sk.use) parts.push(`${sk.use} <use> clone(s)`);
  $('skipped').textContent = parts.length ? `Not counted: ${parts.join(', ')}. Convert them to paths to include them.` : '';
}

function renderLayers(layers) {
  const opts = (sel) => ['cut', 'score', 'ignore']
    .map((o) => `<option value="${o}"${o === sel ? ' selected' : ''}>${o[0].toUpperCase() + o.slice(1)}</option>`).join('');
  $('layers').innerHTML = layers.map((l) => `
    <tr>
      <td><span class="swatch" style="background:${esc(l.color)}"></span><code>${esc(l.color)}</code></td>
      <td><select data-color="${esc(l.color)}" aria-label="Operation for ${esc(l.color)}">${opts(l.op)}</select></td>
      <td class="num">${mm(l.lengthMm)}</td>
      <td class="num">${l.pierces}</td>
    </tr>`).join('');
}

function renderQuote(est, box) {
  const s = est.settings;
  const c = s.currency;
  const money = (v) => `${esc(c)} ${v.toFixed(2)}`;
  const row = (label, detail, value, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="detail">${detail}</td><td class="num">${value}</td></tr>`;
  const rows = [
    row('Cut', `${mm(est.cutMm)} at ${s.cutSpeed} mm/s`, fmtDuration(est.sec.cut)),
    row('Score', `${mm(est.scoreMm)} at ${s.scoreSpeed} mm/s`, fmtDuration(est.sec.score)),
    row('Pierces', `${est.pierces} x ${s.pierceSec} s`, fmtDuration(est.sec.pierce)),
    row('Travel', `${mm(est.travelMm)} at ${s.travelSpeed} mm/s`, fmtDuration(est.sec.travel)),
    row('Setup', `${s.setupMin} min`, fmtDuration(est.sec.setup)),
    row('Machine time', `${est.machineMin.toFixed(1)} min`, fmtDuration(est.totalSec), 'sum'),
    row('Machine', `${est.machineMin.toFixed(1)} min x ${money(s.ratePerMin)}`, money(est.price.machine)),
    row('Material', s.chargeFullSheet
      ? `${est.materialShare} sheet(s) x ${money(s.sheetPrice)}`
      : `${(est.materialShare * 100).toFixed(0)}% of ${s.sheetW} x ${s.sheetH} mm`, money(est.price.material)),
    row('Total', '', money(est.price.total), 'sum total'),
  ];
  if (box && !est.fitsOnSheet) rows.push(row('Warning', `Parts (${box.w.toFixed(0)} x ${box.h.toFixed(0)} mm) do not fit on one sheet`, '', 'warn'));
  $('quote').innerHTML = rows.join('');
}

async function readFile(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { showError('File is larger than 20 MB.'); return; }
  load(file.name, await file.text());
}

// Events
for (const id of ['file', 'file2']) {
  $(id).addEventListener('change', (e) => { readFile(e.target.files[0]); e.target.value = ''; });
}
$('sample').addEventListener('click', async () => {
  const res = await fetch('samples/box-panels.svg');
  load('box-panels.svg (sample)', await res.text());
});
const bed = $('bed');
bed.addEventListener('dragover', (e) => { e.preventDefault(); bed.classList.add('dragover'); });
bed.addEventListener('dragleave', (e) => { if (!bed.contains(e.relatedTarget)) bed.classList.remove('dragover'); });
bed.addEventListener('drop', (e) => {
  e.preventDefault();
  bed.classList.remove('dragover');
  readFile(e.dataTransfer.files[0]);
});
$('layers').addEventListener('change', (e) => {
  const color = e.target.dataset.color;
  if (!color) return;
  state.ops[color] = e.target.value;
  recompute();
});
$('settings').addEventListener('input', (e) => {
  const key = e.target.dataset.key;
  if (!key) return;
  const raw = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (e.target.type === 'number' && (raw === '' || !(+raw >= 0))) return;
  state.settings = sanitizeSettings({ ...state.settings, [key]: e.target.type === 'number' ? +raw : raw });
  saveSettings();
  recompute();
});
$('reset').addEventListener('click', () => {
  state.settings = sanitizeSettings(DEFAULT_SETTINGS);
  saveSettings();
  fillSettingsForm();
  recompute();
});
$('scale').addEventListener('change', (e) => {
  const v = +e.target.value;
  if (!(v > 0)) return;
  state.scaleOverride = v;
  resample();
});
$('play').addEventListener('click', () => {
  if (preview.playing) return;
  $('play').textContent = 'Playing';
  preview.play();
});
$('copy').addEventListener('click', async () => {
  if (!state.result) return;
  const text = formatQuote(state.fileName, state.result.est);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  $('copied').textContent = 'Copied as plain text.';
  setTimeout(() => { $('copied').textContent = ''; }, 2500);
});

fillSettingsForm();
preview.draw();
