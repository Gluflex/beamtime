---
doc: scope
status: approved
---
<!-- Drafted by the coding agent from Leandro's existing laser-cutting work
     (StepToLaserKit, makerspace jobs). Leandro reviews, corrects, and sets
     status to approved. Lines marked "Assumption" are not yet confirmed by him. -->

# Beamtime

A browser tool that reads a laser-cutting SVG and tells you how long the job takes and what it costs, before you go to the machine.

## The Unique Kernel
Drop in the SVG you are about to cut and get a time and price breakdown you can explain line by line: cut length per colour layer, number of pierces, travel between parts, machine minutes, material share. Then watch the job play back in the order the laser would cut it.

## Who It's For
A maker or small fabrication freelancer who books time on a shared laser cutter (makerspace, university workshop, FabLab) and has to quote a part or decide whether a design fits into a booked slot. Today they guess from experience, or open the design in the machine software at the machine, which needs the license and the machine PC.

## The Core Loop
Open Beamtime, drop an SVG, check that the colour layers map to cut, score or ignore, read the time and price, adjust a setting or the design, drop the next version.

## Inspiration & Identity
Feels like a workshop tool: plain, technical, numbers first, no marketing copy. The preview looks like a machine screen (dark bed, red cut lines). Reference for the domain: LightBurn's job time estimate (https://lightburnsoftware.com/), boxes.py for generated box panels (https://boxes.hackerspace-bamberg.de/).

## Why This Matters to the Learner
Leandro builds laser-cut parts and a STEP-to-laser-kit tool and quotes fabrication work as a freelancer. A quick, transparent time estimate is something he needs himself when pricing jobs.

## What "Working" Looks Like
Drop an SVG of a finger-joint box. The app shows the parts, lists the red layer as cut and the blue layer as score, and reports for example 2,140 mm cut, 14 pierces, 6.1 min machine time, CHF 11.40. Press Play and a laser dot traces every part in cut order while a clock counts up machine time. That playback is the "oh, that's cool" beat.

## The POC Boundary
- SVG input (file drop, file picker, built-in sample).
- Length and pierce count from path, line, rect, circle, ellipse, polyline and polygon, with transforms and mm/px units.
- Colour layers with operation (cut / score / ignore) and speed.
- Time model: cut + score + pierce + travel + fixed setup.
- Cost model: machine rate per minute + material share of a sheet.
- Animated playback in cut order.
- Settings remembered in the browser. Copyable plain-text quote.

## Later
- DXF input (StepToLaserKit exports DXF).
- Engraving (raster) time.
- Several sheets and nesting.
- Shareable quote link.

## Explicitly Cut
- Machine connection or G-code: out of reach in a day, and the point is to estimate before the machine.
- Accounts and server storage: not needed for one person estimating a job; everything stays in the browser.
- Material database with real prices: prices differ per shop; the user types their own. (Confirmed by Leandro 23.10.2026: default values are examples only.)
