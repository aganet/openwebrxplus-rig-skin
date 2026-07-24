# Changelog

## 0.9.5 (2026-07-24)

- Reworked the VFO A/B readout. Instead of one big frequency that swapped
  around, the LCD now shows two equal boxes, A and B, each holding its own
  frequency. They never swap, so it is always clear which is which. The
  box the radio is actually listening to glows and shows a green RX in the
  corner. A/B picks which VFO is active and tunes there; click the active
  box to type a frequency, same as the old digits. Mode, filter width, the
  tuning step and the hover frequency now sit on a line under the boxes.
- Dual watch marks activity the same way: the RX badge and glow move to
  whichever VFO has a signal, and back to the other when it goes quiet.

## 0.9.4 (2026-07-24)

- Wide layout fix: the second VFO (B) readout sat over the audio scope.
  It now sits under the S-meter, in the empty left-column space.

## 0.9.3 (2026-07-24)

- VFO A/B and Dual Watch. A/B (middle key column) swaps between two
  frequency+mode slots; right-click copies the current VFO into the
  other. DW watches the other VFO in the waterfall and switches the
  audio there while it is active, then returns; a small dot by the B
  readout lights green when that frequency has signal. Both work within
  the current capture window (same band).
- Front-panel keys grouped by function: audio/RX on the left (MUTE, NR,
  TS, SQL), VFO and memory in the middle (A/B, DW, LOCK, MW), scan and
  screens on the right (SCAN, PROP, SAT, AUTO).
- S-meter restyled to a modern-rig look: blue segments up to S9, red
  beyond, grey guide rails with the top rail turning red over the S9+
  zone, and a "+20 +40 +60" scale.

## 0.9.2 (2026-07-24)

- The audio scope now keeps running while the audio is muted. It taps
  the signal before the volume stage, so muting silences the speakers
  but the spectrum, waterfall and waveform carry on, like a rig's scope.
- The waveform is redrawn from a rolling buffer instead of scrolling the
  canvas pixels, which removes the Canvas2D readback console warnings.
- Version string is proper semver.

## 0.9 (2026-07-24)

- DX map is now interactive: scroll to zoom toward the cursor, drag to
  pan, double-click to reset to the whole world, pinch to zoom on touch.
  Hover a spot to see its callsign, bearing and distance from your QTH,
  and continent. Zooming in separates spots that pile up near home.
- Brighter map: lighter ocean and land and a softer day/night line, so
  the coastlines and spots read clearly.
- Fixed coastlines that streaked horizontal lines across the map where a
  landmass crossed the date line.
- DX band-activity view: an ACT chip in the window header switches to a
  bar chart of spots per band (160m through VHF/UHF), the band you are
  tuned to highlighted, with a per-band trend sparkline. Click a band to
  jump there. Choosing a band filter returns to the map.
- Propagation screen has clear prev/next arrows and a page counter, so
  it is obvious the screen holds several views (band conditions,
  beacons, MUF map) and how to move between them.

## 0.8.2 (2026-07-24)

- AUTO tune now lands SSB on the carrier frequency, the on-air number
  you tune, quote and see in the DX cluster, instead of parking the
  dial on the signal peak and leaving the audio at the edge of the
  filter. AM, FM and CW are unchanged.

## 0.8.1 (2026-07-23)

- MW now mirrors the stock bookmark button both ways: left-click adds a
  bookmark here, right-click opens the bookmark search (on OWRX+
  versions that have it).
- Fix the bookmark dialog: it was rendering inline and pushing the
  panel up the page instead of floating centered. It is a centered
  overlay again, in both the add and search forms.

## 0.8 (2026-07-20)

- DX cluster window: a DX button in the top banner opens a floating,
  draggable, resizable window with live spots from the cluster network.
  A world map (public domain Natural Earth coastlines, drawn locally)
  shows every spot as a pin with a great circle path from your QTH and
  the live day/night terminator; the list shows age, callsign,
  frequency, mode, bearing and distance from the receiver and country.
  Click a spot or a pin and the receiver tunes there with the right
  mode. Filter chips switch between the current band, all HF and
  everything. Live spots stream from HolyCluster over a websocket;
  DXSummit fills the backlog where reachable, and a local cache keeps
  the window warm between sessions. Size, position and filter are
  remembered. Grab the corner grip to make the map and the list as
  big as you like.
- The top banner follows the rig look while the theme is active: dark
  metal bar instead of the photo, silver icons without the glow.

## 0.7 (2026-07-19)

- NCDXF/IARU beacon tracker as a propagation screen view: shows which
  of the 18 synchronized beacons transmits right now on each of the
  five beacon frequencies, with the slot countdown. Click a frequency
  to listen in CW; while tuned to a beacon frequency the row turns
  green and shows the live S reading, a real time world path check.
  Pure UTC clock math, no external data.
- AUTO key: snaps the VFO onto the strongest signal near the current
  frequency (search window follows the mode bandwidth), like a rig's
  auto tune. Lands within a few Hz using an FFT centroid.
- MUTE key (LED lit while muted); key layout rearranged: MUTE/NR/TS
  left, LOCK/SQL/MW middle, SCAN/PROP/SAT/AUTO right.
- Satellite frequencies are clickable: the receiver window moves there
  if needed and the right mode is set.
- Mobile fixes: text inflation disabled on the panel, satellite rows
  can no longer overflow, panel fits narrow phone viewports.

## 0.6 (2026-07-19)

- Satellite passes screen: predicted passes over the receiver location
  for a curated list of active satellites (ISS, SO-50, AO-91, RS-44,
  AO-7 with its 10 m downlink, Meteor M2-3 and M2-4), with AOS time and
  countdown, duration, color coded max elevation, downlink frequency
  and a live NOW marker during a pass. Adjustable minimum elevation
  filter (MIN 0/10/20/30 degrees). Orbits come from the public TLE API
  (cached 12 h); propagation runs in the browser with the MIT licensed
  satellite.js, loaded on demand.
- PROP and SAT keys in a third key column right of the dial open the
  propagation and satellite screens; their LEDs follow the screen
  state. The slim toggle bars and the header button are gone; the
  paging keys moved under MW.
- The band scope span follows the demodulator bandwidth: wide modes
  (WFM) grow the span so the passband stays a focused slice instead of
  filling the whole scope.

## 0.5 (2026-07-19)

- Wide layout: a chevron in the panel's top left corner (large screens
  only) expands the rig to a two column face, readouts left, scopes
  right. The LCD gains extra readouts in wide mode: current band name,
  S units, squelch state, a MUTE flag and the UTC clock.
- Propagation screen: a second collapsible LCD under the dial with two
  views, band conditions estimated from NOAA SWPC data (SFI and K,
  rendered as day/night pills per band group) and the live MUF world
  map from prop.kc2g.com. One view at a time in the normal layout,
  side by side in the wide layout. Collapsed by default.
- One wheel notch is one tuning step: high resolution wheel and
  trackpad deltas are accumulated on the dial and the band scope.

## 0.4 (2026-07-19)

- Band scope in the LCD: a narrow spectrum and waterfall centered on the
  tuned frequency, like a rig's center-mode scope. Click to tune (about
  70 Hz per pixel at the 24 kHz span), scroll for single steps, click
  SPAN to cycle 50/24/10 kHz, click HIDE to collapse it to a slim bar.
  It shares the main waterfall's palette and level range and averages
  its trace, so weak signals stand out and are easy to click.
- AUTO tuning step: the TS picker gains an Auto entry that follows the
  mode (SSB/CW 100 Hz, AM 5 kHz or 9 kHz below 2 MHz, NFM and digital
  voice 12.5 kHz, WFM 50 kHz). Any manual step choice disengages it.
- Audio scope fixes: the analyser taps the audio before the volume gain
  and the waveform display auto-scales, so speech is clearly visible at
  any volume setting.
- The saved rig waterfall theme is re-applied reliably after page load.
- Mode key legends match the dial keys in size; spacing between the LCD
  and the dial row.

## 0.3 (2026-07-17)

- White LCD palette with the mode shown on a blue badge, following the
  colors of modern rig screens; bigger S-meter scale numbers.
- Audio scope upgrades: the waveform scrolls in roll mode (300ms/Div),
  the spectrum span follows the demodulator passband (4/8/16 kHz), and
  the axis labels are bright blue.
- Waterfall zoom keys (- / +) and paging keys (left / right) beside the
  dial as half-width pairs. Paging shifts the zoomed view by one visible
  span; at the window edge, or when unzoomed, it moves the receiver
  window itself (needs "allow center frequency changes" on the server).
  Right-click always moves the window, like the stock scale arrows.
- The TS key opens a dropdown with all tuning steps instead of cycling.
- Every mode key carries an LED window; the active mode's LED lights
  green, like physical keys.
- "Rig" waterfall color palette in the waterfall theme selector: a
  standard jet-style ramp with a steep low end, so weak signals stand
  out of the noise floor.

## 0.2 (2026-07-16)

- Audio scope inside the LCD, styled like a modern rig screen:
  audio spectrum with a scrolling waterfall on the left, oscilloscope
  waveform with graticule on the right, framed plots with kHz axis labels.
  Toggled by clicking the S-meter, visible by default.
- Mode, filter width (FIL) and tuning step (TS) readout in the LCD corner.
- Front panel keys around the dial, all with status LEDs:
  - NR: noise reduction on/off
  - LOCK: locks the dial against accidental tuning, blinking LED
  - TS: opens the native tuning step picker
  - SCAN: runs the bookmark scanner, blinking LED while scanning
  - SQL: squelch on/off with automatic level
  - MW: writes a bookmark at the tuned frequency
- Segmented S-meter with peak hold, spanning the full LCD width.
- Bigger 140 px main dial; the stock bookmark ribbon is hidden (MW covers it).
- Wider 364 px front panel with matching slider widths.

## 0.1 (2026-07-16)

- Initial release: dark rig-style front panel theme selectable from the
  standard theme dropdown, chrome-bezel VFO dial (drag, flick with inertia,
  scroll to tune), amber LCD frequency display, segmented S-meter, domed
  keys with backlit active state.
