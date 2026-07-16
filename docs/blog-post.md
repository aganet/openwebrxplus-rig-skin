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
panel into a dark, transceiver-style front panel.

![rig_skin in action](https://aganet.github.io/openwebrxplus-rig-skin/docs/screenshot.png)

## What you get

* **A real VFO dial.** Drag it, flick it, and let it keep spinning with
  inertia. Use the scroll wheel for single-step tuning. The dial follows the
  tuning step selected in OpenWebRX+.
* **An amber LCD frequency display** with a segmented S-meter, proper meter
  ballistics, and peak hold.
* **Domed keys** with backlit legends that reflect the active mode.
* **Touch support out of the box.** The dial works naturally with a finger
  on phones and tablets, turning a mounted tablet into a convincing remote
  control head for your receiver.

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
