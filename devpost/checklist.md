---
doc: checklist
status: draft
---
<!-- Drafted and built by the coding agent in fast mode. The hands-on checkpoints and
     final review below need Leandro: he tries the app, gives feedback, and only then
     are those boxes ticked. -->

# Build Checklist

Build mode: fast

## Slices

- [x] **1. Time and price can be computed from layer totals**
  Becomes usable: Pure functions turn contours into colour layers, a cut order and a time and price breakdown.
  Why now: The estimate is the kernel; getting the model right first means the UI only displays it.
  PRD ref: `prd.md > Time and price`, `prd.md > Playback`
  Spec ref: `spec.md > geometry.js`, `spec.md > estimate.js`
  Build: Scale detection from SVG units, polyline length, layer grouping with hue-based defaults, inner-before-outer ordering, estimate and plain-text quote.
  Verify (mechanical): `npm test` passes (rectangle length, unit scale, hole-before-outline, breakdown sums).
  Learner check: Read the test for the breakdown and confirm the formula matches how you price a job.
  Commit: `Add geometry and time/price model with unit tests`

- [x] **2. Drop an SVG and see the parts, layers and quote**
  Becomes usable: The full page: drop zone, sample file, preview, layer table, quote, settings saved in the browser, copy quote, cut playback.
  Why now: Completes the core journey end to end.
  PRD ref: `prd.md > The Core Journey`
  Spec ref: `spec.md > svg-sampler.js`, `spec.md > preview.js`, `spec.md > app.js`
  Build: SVG sampling in the browser, canvas preview and playback, UI wiring.
  Verify (mechanical): Headless Chromium run: sample box reports 1,638 mm cut with 10 pierces and 197 mm score with 3 pierces (matches hand calculation from the sample generator); playback runs to the end; non-SVG shows an error; a unitless file with a transform reports 79 mm (300 px x 25.4/96) and lists the skipped text element; no console errors.
  Learner check: Run `npm start`, load the sample, switch the blue layer to Ignore, press Play, copy the quote.
  Commit: `Add browser app: SVG sampling, layer table, quote panel, cut playback`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — shared with final review (tiny build)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: not started
Route and stops: not started
Edit outcome: not started
Reflection: not started
Activity mode: not started

## Revisions

- Score contours are cut before cut contours — the spec only ordered inner before outer; scoring after parts are cut free would let them shift.
- Basic shapes use exact formulas for length — Chrome's getTotalLength returned a 1.6 mm radius circle about 10% short, so circle, ellipse and rect lengths are computed from their attributes, and path lengths take the larger of the browser length and the sampled chord length.
