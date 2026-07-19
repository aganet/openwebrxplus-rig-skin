# Changelog

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
