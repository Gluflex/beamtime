---
doc: prd
status: draft
---
<!-- Drafted by the coding agent. Leandro reviews and sets status to approved. -->

# Beamtime — Product Requirements

A single-page browser tool for makers and small fabrication freelancers who need a laser job's time and price before they reach the machine.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
1. The user opens Beamtime. An empty drop zone says "Drop an SVG" and offers "Load sample box".
2. They drop their SVG (or load the sample). The parts appear on a dark machine bed, drawn to scale, with a mm grid.
3. The layer table lists every stroke colour found, with its total length and pierce count. Red-ish colours default to Cut, blue-ish to Score, everything else to Ignore.
4. The quote panel shows machine time (cut, score, pierce, travel, setup) and price (machine time, material) and a total.
5. They change a layer operation or a machine setting. Numbers update immediately.
6. They press Play. A laser dot traces the parts in cut order, cut lines turn bright as they are cut, and a clock shows machine time. Playback is compressed to about 10 seconds.
7. They press "Copy quote" and paste a plain-text breakdown into a mail or invoice note.

Success: the user has a time and price they trust because each line of the breakdown is visible.

## Screens and Layout
One screen. Left: the machine bed preview with the Play button and the clock. Right column: file name and detected size, layer table, machine settings, quote panel with "Copy quote".

## Look and Feel
Dark bed (near-black), red cut lines, blue score lines, grey ignored lines, a thin mm grid. Light, plain side panel with tabular numbers. Monospace for figures. No gradients, no illustrations, no marketing copy.

## Features and Behavior

### Reading the file
- As a maker, I want to drop my SVG and see it to scale so that I know Beamtime read it correctly.
  - [ ] A 100 x 50 mm rectangle in an SVG with width="100mm" reports 300 mm length and 1 pierce.
  - [ ] Shapes with transforms (translate, scale, rotate) report the transformed length.
  - [ ] Width/height in mm, cm, in or px (96 dpi) set the scale; detected size is shown as W x H mm.
  - [ ] If units cannot be detected, Beamtime assumes 96 dpi px and says so next to the size.

### Layers
- As a maker, I want each stroke colour treated as one operation so that cut and score lines get their own speed.
  - [ ] Each distinct stroke colour is one row: colour swatch, operation (Cut / Score / Ignore), length in mm, pierces.
  - [ ] Shapes with no stroke but a fill are listed under their fill colour.

### Time and price
- As a freelancer, I want a breakdown, not one number, so that I can explain the quote to a client.
  - [ ] Time = cut length / cut speed + score length / score speed + pierces x pierce time + travel length / travel speed + setup minutes.
  - [ ] Price = machine minutes x rate + material share (bounding-box area / sheet area x sheet price, or full sheet if chosen).
  - [ ] All settings are editable and remembered in the browser.
  - [ ] "Copy quote" puts a plain-text breakdown on the clipboard.

### Playback
- As a maker, I want to see the cut order so that I can check that inner shapes are cut before outer ones.
  - [ ] Parts are ordered: inner contours before the contour that contains them, then nearest-next.
  - [ ] Play draws the cut path progressively with a moving dot; travel moves show as faint dashed lines; the clock counts machine time.

## States and Boundaries
- **Empty** — drop zone and sample button, quote panel shows dashes.
- **Loaded** — preview, layers, quote.
- **Error** — not an SVG, or no drawable shapes: a one-line message in the drop zone; the previous file stays loaded.
- **Persistence** — machine and material settings persist in localStorage. Files do not persist.
- **Privacy** — the file never leaves the browser.

## Product Decisions
- Colour = operation, because that is how makerspace laser files are prepared (Assumption: red cut, blue score is the convention Leandro uses).
- Defaults are example values for a 60 W CO2 laser on 3 mm plywood and are labelled as examples.

## What We're Building
Everything in The Core Journey and Features and Behavior above.

## Deferred From the POC
- DXF input: needs a DXF parser; SVG proves the idea.
- Raster engraving time: different model (scan lines), not needed for cut jobs.
- Several sheets and nesting.

## Possible Later Enhancements
- Shareable quote link with settings in the URL.
- Machine presets per makerspace.

## Non-Goals
- Driving a laser or exporting G-code.
- Accounts or server storage.

## Open Questions
- Are the default speeds close to Leandro's machine? Can wait; values are editable.
