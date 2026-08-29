# Changelog

## 0.9.11 (2026-08-29)

- The S-meter has two faces now: the segmented bar and a virtual analog
  needle drawn like the real Icom meter face, a wide curved arc with
  fine ticks, S to 9 in white and the +20/+40/+60dB overscale in red,
  switched with a right-click on the meter and remembered. The needle
  runs on the same ballistics as the bar (fast attack, slow decay),
  stays long and visible at any deflection, and a ghost needle holds
  the peak with a small "pk" readout. Both faces show the S reading as
  a number; the needle face adds the live dB value.
- The squelch threshold is drawn on the meter: an SQL pointer under the
  needle's arc and a line through the bar, at the exact spot where the
  audio gate opens. The marker is draggable on both faces: grab it and
  the squelch slider follows, so you set the squelch by dropping the
  marker just above the noise, right on the instrument.
- The frequency readout uses heavy Icom style digits (bold sans with
  tabular figures) instead of the thin monospace.
- The NCDXF beacons can be shown on the DX cluster map: a BCN chip in
  the DX window draws all 18 beacon sites as diamonds, click one to
  listen in CW. While the beacon radar is running, the diamonds fill
  with the measured grades, so the world map shows where propagation is
  open right now. The radar's own small map is gone; the big map does
  it better.
- The radar grades by the median of each slot's readings instead of the
  peak, so noise spikes cannot fake a beacon.
- The face gained texture: a fine powder-coat grain on the panel metal.
- Power-on: switching to the Rig theme boots the face in stages, LCD
  first, then the dial, then the controls.

## 0.9.10 (2026-08-29)

- Fix: no more CORS errors in the console on every load. The DX spot
  backlog always asked HolyCluster's history API first, but that
  endpoint sends no CORS headers, so no browser could ever read it and
  the attempt only logged errors before falling back. The backlog now
  goes straight to DXSummit on plain-http pages; on https pages, where
  neither API accepts browser calls, it is skipped and spots come from
  the live HolyCluster websocket and the local cache as before.

- DX cluster spots on the top ribbon: spots inside the visible waterfall
  show as small dark chips with the callsign, next to the stock yellow
  bookmarks and at their exact frequency. Click a chip to tune (CW, SSB
  and digital pick a sensible mode); hover for frequency, mode and the
  spotter's comment. Overlapping spots collapse to the freshest one, so
  an FT8 pileup stays one readable chip. The spot feed runs while the
  Rig theme is active, no need to keep the DX window open.
- Beacon radar: in the propagation screen's beacon view, arm a band chip
  (20m to 10m) and the rig parks on that beacon frequency in CW while
  the NCDXF/IARU rotation brings all 18 world beacons past, ten seconds
  each. Every beacon is graded by measured SNR against the live noise
  floor (green, yellow, or dim for not heard), refreshed each 3 minute
  cycle: real propagation from your own antenna, not a model. Turning
  the dial or hiding the screen hands the receiver back.
- Tune by digit: hover any digit of the big frequency readout and scroll
  to spin exactly that digit by its place value. Spinning a large digit
  moves the receiver window along, so the waterfall follows you across
  bands (window moves use the stock "allow center frequency changes"
  server permission, like the built-in controls). Respects LOCK.
- Install as an app: the page carries a web app manifest with a rig dial
  icon, so the receiver installs to the home screen and opens fullscreen
  like a native app. Android and desktop offer the install on https;
  on iPads use Safari's Add to Home Screen, which also gives a clean
  fullscreen rig without the Chrome gesture problems.
- The band / S-units / squelch / clock line under the S-meter now shows
  in the one-column layout too, not only in the wide face.
- Touch polish: bigger SPAN, HIDE and ms/Div tap targets on the scopes,
  dark thin scrollbars on the skin's scroll areas, and compact beacon
  locations in the radar list (full names on hover).

## 0.9.9 (2026-08-27)

- Icom-style face. The keys are flat-top rectangles with near-square
  corners and a matte finish instead of the glossy rounded domes, the
  legends are printed matte silver instead of glowing white, and the
  icon keys (display row, slider buttons) are dimmed to the same level,
  so only the LCD, the LEDs and the active key light up, like a real
  front panel. Legend contrast stays above the WCAG AAA bar (10:1).
- The dial matches: gunmetal bezel and a matte rubber face with a soft
  sheen instead of mirror chrome.
- The S-meter, band scope and audio scope render at their displayed
  resolution instead of being stretched from a fixed-size buffer, so
  the LCD is pin sharp at any panel size, including the scaled-up wide
  layout on large screens.
- Less busywork per frame: the canvases re-measure their size only when
  the layout actually changed, and the VFO and info line readouts skip
  the DOM update when the text is unchanged. The whole skin (meter
  ballistics, band scope, audio scope) costs about 4% of one core over
  the stock theme.
- All README screenshots regenerated from the current look.

## 0.9.8 (2026-08-24)

- The rig now fits on any screen, fluidly. The full front panel is about
  880px tall and the stock layout pins it to the bottom of the viewport,
  so on low resolution laptops (1366x768 and below) and many phones the
  top half, the VFO readout and the S-meter, was pushed off screen with
  no way to reach it. The panel now scales itself (CSS zoom) to fit
  below the top bar, bookmark row and frequency scale, and as it scales
  down it widens the layout by the same factor, so the rig keeps its
  full on-screen size instead of shrinking into a strip. On phones it
  fills the screen width. It refits live on window resize, profile
  changes and screen toggles. Below half size it stops shrinking and
  scrolls inside the panel (very short landscape screens). Switching to
  another theme restores the stock layout exactly. Browsers without
  standard CSS zoom keep the old fixed layout.
- The wide layout is modular: the sections (LCD, dial and keys, modes,
  controls, display) are blocks that flow into two balanced columns,
  LCD and dial on the left, everything else on the right, like a real
  wide rig face. On short wide screens it engages automatically before
  any shrinking, so a 1366x768 laptop gets a full-width rig at full
  size. Screens with plenty of width (1440px and up) start in the wide
  layout right away. The old cryptic chevron is now a labeled chip in
  the top left corner that names the switch it performs, "|<- WIDE"
  grows the rig leftward into two columns and "->| NARROW" folds it
  back: click it to switch and keep your choice, right-click to hand
  the decision back to the automatic fit (which has hysteresis, so it
  cannot flap while resizing).
- The face itself is fluid at any width: the S-meter and scope canvases
  follow their column, the LCD readout and scope blocks share the width
  evenly, sliders and listboxes grow with the panel, and the key groups
  spread evenly around the dial.
- The dial is the centerpiece and behaves like it: it grows into
  whatever space the key columns leave free (up to 240px), instead of
  being shrunk to 112px on short screens as before. The rig also scales
  up (to 1.25x) to fill free screen height, so on a 1366x768 laptop the
  dial ends up around 184px instead of 112px.
- Fix: resizing the window no longer flickers. The fit re-measured the
  panel while the previous scale was still applied, and the tiny error
  fed back through the resize observer as visible oscillation; each fit
  now measures from a clean slate, so it settles in one pass.
- The rig can be picked up and arranged: drag the grip bar on its top
  edge to move it anywhere on the screen, double-click (or double-tap)
  the bar to snap it back to the stock corner. The position is
  remembered and only applies while the Rig theme is active.
- On portrait phones the rig no longer covers the whole waterfall: it
  leaves a strip of waterfall visible above the panel, and the drag
  grip lets you rearrange from there.
- The stylesheet is loaded with the plugin version appended
  (rig_skin.css?v=...), so browsers, phones especially, stop serving a
  stale cached CSS after an update.
- Fix: the audio scope's ms/Div click target was misplaced whenever the
  canvas was displayed scaled; the hotspot is mapped through the real
  canvas size.

## 0.9.7 (2026-07-24)

- Fix: the plugin no longer disturbs the other themes. The two-VFO
  readout moved some of the stock frequency elements into its own layout
  when it loaded and never put them back, so switching to the default (or
  any non-Rig) theme left the frequency area broken. The rig layout is now
  applied only while the Rig theme is active and fully restored when you
  switch away, so the stock themes look exactly as they should.

## 0.9.6 (2026-07-24)

- RIT (clarifier): a new RIT key under AUTO. With it on, the left/right
  arrow keys nudge the receive frequency in fine steps while the VFO stays
  put, and the offset shows as "RIT +30" on the info line; the arrows turn
  green to show they belong to RIT. Turn it off to snap back to the VFO.
  Right-click RIT to pick the step (10/20/50/100 Hz).
- Dual watch now decides activity by signal-to-noise, not an absolute
  squelch level. It measures how far a signal sits above the live noise
  floor, so it tracks band and time-of-day conditions and works the same
  on any setup. Default is 8 dB above the floor; right-click DW to change
  the sensitivity (6/8/10/12 dB). Dual watch no longer touches the squelch,
  so you set the squelch independently, as normal.
- The audio scope timebase is selectable, like a rig's scope. Click the
  ms/Div label to cycle 1/3/10/30/100/300 ms per division. At the faster
  settings the waveform is drawn as a steady zero-crossing triggered sweep
  so you see the actual shape; at 100 and 300 ms it rolls as an amplitude
  envelope. The scroll speed is calibrated to real time, so the number
  means what it says. Default is 300 ms.
- The VFO A and B labels and their RX badges are now compact chips stacked
  at the left edge of each readout, freeing width for high frequencies.

## 0.9.5 (2026-07-24)

- Reworked the VFO A/B readout. Instead of one big frequency that swapped
  around, the LCD now shows two frequencies side by side, A and B, each
  holding its own. They never swap, so it is always clear which is which.
  The one the radio is listening to is marked by a bright underline and a
  green RX; the number tracks the dial live. A/B picks which VFO is active
  and tunes there; click the active frequency to type one in, same as the
  old digits. Mode, filter width, the tuning step and the hover frequency
  now sit on a line under the readouts.
- Dual watch marks activity the same way: the underline and green RX move
  to whichever VFO has a signal, and back to the other when it goes quiet.

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
