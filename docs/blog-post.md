# Giving OpenWebRX+ a real radio face: rig_skin

These days, much of my shortwave listening happens in a browser.

At home, an SDRplay connected to a passive magnetic loop antenna runs behind
OpenWebRX+. Unlike the public receivers you find on the map, mine is private
and primarily for my own use. It lets me tune the bands from anywhere, on
almost any device.

I am a big fan of OpenWebRX+: it is fast, stable, and puts a capable SDR
receiver wherever I happen to be.

There was just one thing that never quite clicked with me: the default
controls.

This is purely personal taste. Tuning with sliders and frequency digits is
perfectly efficient, but I grew up turning a VFO dial. My hands still expect
one.

Since I am the main user of my own receiver, I decided it should feel more
like my radio.

So I built **rig_skin**: an OpenWebRX+ plugin that transforms the receiver
panel into a dark, rig-style front panel.

![rig_skin in action](https://aganet.github.io/openwebrxplus-rig-skin/docs/screenshot.png)

## What you get

* **A real VFO dial.** Drag it, flick it, and let it keep spinning with
  inertia. Use the scroll wheel for single-step tuning. The dial follows the
  tuning step selected in OpenWebRX+.
* **A rig-style LCD.** White frequency digits with the mode on a blue
  badge, plus live readouts for the filter width (FIL) and the tuning step
  (TS), so the screen always tells you what one click of the dial will do.
* **A segmented S-meter with peak hold**, spanning the full width of the
  display, with proper meter ballistics.
* **An audio scope, like a modern rig screen.** The audio spectrum
  with a scrolling waterfall on the left, an oscilloscope waveform on the
  right, complete with graticules and a labeled kHz axis. It is a genuine
  tuning aid: on SSB you can see the voice energy sit in the passband, on CW
  the tone spike lands right where it should. Click the S-meter to show or
  hide it.
* **Front panel keys around the dial**, each with a status LED:
  * **NR** toggles noise reduction.
  * **LOCK** freezes the dial against accidental tuning, with a blinking
    LED. Very handy on a wall-mounted tablet.
  * **TS** opens the tuning step picker, on a phone it is the native
    selection wheel.
  * **SCAN** runs the bookmark scanner, a feature the stock UI hides behind
    a right-click.
  * **SQL** switches the squelch on with an automatically chosen level, and
    off again.
  * **MW** writes a bookmark at the tuned frequency.
* **Touch support out of the box.** The dial spins with a finger on phones
  and tablets, turning a mounted tablet into a convincing remote control
  head for your receiver.

Most importantly, it is a **plain OpenWebRX+ plugin**.

There is no fork and no need to patch OpenWebRX+ files. The plugin adds a
**Rig** entry to the standard theme selector, so users can switch between
the stock interface and the rig_skin interface with a single click.

## Try it

Add the plugin to your receiver with one line in `plugins/receiver/init.js`:

```js
Plugins.load('https://aganet.github.io/openwebrxplus-rig-skin/receiver/rig_skin/rig_skin.js');
```

The source code and the full installation guide (local and Docker) are on
GitHub: [github.com/aganet/openwebrxplus-rig-skin](https://github.com/aganet/openwebrxplus-rig-skin).

The project is MIT licensed. Feedback, bug reports, and pull requests are
welcome.

If you use OpenWebRX+ and prefer the feel of a traditional radio interface,
give rig_skin a try.
