---
doc: spec
status: approved
---
<!-- Drafted by the coding agent. Leandro reviews and sets status to approved. -->

# Beamtime — Technical Spec

## How This Works, In Plain Language
Beamtime is one web page with no server logic. The browser reads the SVG file, puts it into a hidden drawing area, and walks along every shape in small steps to collect points in millimetres. From those points it computes lengths, counts where the laser has to pierce, chooses a cut order, and adds up time and price with the settings in the side panel. A canvas draws the parts and plays back the cut. Nothing is uploaded.

It is plain HTML, CSS and JavaScript modules because there is nothing to fetch and nothing to store on a server; a framework would add a build step and no benefit.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.
1. User drops a file → `app.js` reads it as text → `svg-sampler.js` parses it with DOMParser and inserts it off-screen.
2. `svg-sampler.js` finds the scale (mm per user unit), samples every shape with `getPointAtLength`, applies the shape's transform, splits at move-tos, and returns contours: `{ color, closed, points: [[x, y], ...] }` in mm.
3. `geometry.js` groups contours by colour into layers, computes lengths and pierces, orders the contours (inner first, then nearest next) and measures travel.
4. `estimate.js` turns layer totals and settings into a time and price breakdown.
5. `app.js` renders the layer table and quote; `preview.js` draws the bed and runs playback on a canvas.
6. "Copy quote" formats the breakdown as text and writes it to the clipboard.

## Stack
- HTML, CSS, JavaScript ES modules. No framework, no bundler.
- Browser SVG DOM: `SVGGeometryElement.getTotalLength / getPointAtLength`, `getScreenCTM` (https://developer.mozilla.org/en-US/docs/Web/API/SVGGeometryElement).
- Canvas 2D for preview and playback.
- Node 18+ for a zero-dependency static server (`serve.mjs`) and `node --test` for the pure modules.

## Where It Runs and How Someone Tries It
Runs in a current Chrome, Edge or Firefox.
- `npm start` → open http://localhost:5173
- `npm test` → unit tests for geometry and estimate.
No API keys. Demo: load the sample box, change a layer, press Play, copy the quote.
Deployment is optional; any static host works because the app is static files.

## Look and Feel
From `prd.md > Look and Feel`: bed #111, grid #222, cut #ff3b30, score #2f7bff, ignored #555. Side panel white on #f5f5f2, system sans for labels, monospace tabular figures for numbers. Dense, calm, no decoration.

## Components

### svg-sampler.js
Parses SVG text, detects scale, samples shapes into mm contours. Browser only.
PRD ref: `prd.md > Reading the file`.

### geometry.js
Pure functions: `polylineLength`, `bbox`, `pointInPolygon`, `groupLayers`, `orderContours`, `travelLength`.
PRD ref: `prd.md > Layers`, `prd.md > Playback`.

### estimate.js
Pure function `estimate(layers, travelMm, bboxMm, settings)` → breakdown; `formatQuote(...)` → text.
PRD ref: `prd.md > Time and price`.

### preview.js
Canvas renderer: fit to view, grid, layer colours, playback timeline from the ordered contours.
PRD ref: `prd.md > Playback`.

### app.js
Wires file input, drop zone, sample button, layer table, settings form (localStorage), quote panel, copy button.
PRD ref: `prd.md > Screens and Layout`.

## Data Model
- Contour: `{ color: "#rrggbb", closed: bool, points: [[x_mm, y_mm], ...] }`.
- Layer: `{ color, op: "cut" | "score" | "ignore", lengthMm, pierces, contours }`.
- Settings (localStorage key `beamtime.settings.v1`): cutSpeed, scoreSpeed (mm/s), pierceSec, travelSpeed (mm/s), setupMin, ratePerMin, sheetW, sheetH (mm), sheetPrice, chargeFullSheet, currency.
- Layer operations are kept in memory per file.

## File Structure
```
build-with-ai-2026/
├── index.html          # page layout
├── styles.css
├── src/
│   ├── app.js          # UI wiring and state
│   ├── svg-sampler.js  # SVG → mm contours (browser)
│   ├── geometry.js     # lengths, layers, cut order (pure)
│   ├── estimate.js     # time and price model, quote text (pure)
│   └── preview.js      # canvas preview and playback
├── samples/box-panels.svg
├── test/*.test.mjs     # node --test
├── serve.mjs           # static server, no dependencies
├── devpost/            # scope, prd, spec, checklist
└── README.md, LICENSE
```

## External Services and Dependencies
None. No network calls, no keys, no cost.

## Important Failure Modes
- **SVG without units or with odd scale** → assume 96 dpi px, show "units assumed" and a scale override field.
- **Text elements or embedded images** → not counted; the app lists how many were skipped so the user knows to convert text to paths.
- **Very large files** → sampling step grows with size so it stays under about a second.

## What Was Simplified and Why
- **Fixed acceleration-free speed model** instead of a motion planner — real machines slow down in corners, so small detailed parts take longer than estimated. A fuller version would add a per-corner penalty calibrated against real jobs.
- **Bounding-box material share** instead of nesting-aware usage — simple and honest; the full-sheet toggle covers shops that charge per sheet.
- **Greedy cut order** instead of an optimised tour — close to what laser software does by default and enough to show inner-before-outer.

## Decisions and Open Issues
- No framework (agent recommendation, to keep the POC to static files). Leandro to confirm.
- Colour-to-operation defaults by hue (confirmed by Leandro 23.10.2026: red cut, blue score).
- Uncertainty discussed: how SVG units map to mm. Clarified by reading width/height units and viewBox; covered by a unit test fixture.
- Open: corner slowdown not modelled; documented as a known underestimate.
