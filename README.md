# OpenWebRX+ Rig Skin Plugin

A receiver plugin for [OpenWebRX+](https://fms.komkon.org/OWRX/) that adds a
"Rig" theme: a dark transceiver front panel with a working VFO dial and a
segmented S-meter.

![screenshot](docs/screenshot.png)

## Features

- Dark front-panel theme, selectable from the standard theme dropdown
  (Settings section of the receiver panel). Switching themes turns the whole
  skin on and off, no reload needed.
- VFO dial with chrome bezel and finger cup. Drag around its center to tune
  (one tuning step per 15 degrees), scroll for single steps, or flick it and
  it keeps spinning with flywheel inertia.
- Rig-style LCD: white frequency digits, the mode on a blue badge, and live
  FIL (filter width) and TS (tuning step) readouts.
- Segmented S-meter with S1..S9 plus red 20/40/60 dB scale, meter ballistics
  and a peak-hold segment, spanning the full LCD width.
- Audio scope like a modern transceiver screen: audio spectrum with a
  scrolling waterfall on the left, roll-mode waveform (300ms/Div) on the
  right, kHz axis that follows the demodulator passband. Click the S-meter
  to show or hide it.
- Front panel keys around the dial, each with an LED window: NR, LOCK
  (blinking LED), TS (opens the tuning step picker), SCAN (bookmark
  scanner), SQL (squelch on/off with automatic level), MW (write a
  bookmark). The active mode key lights a green LED too.
- Waterfall zoom (- / +) and paging (left / right) key pairs beside the
  dial, made for touch devices. Paging walks the zoomed view through the
  capture window and, at the edge or when unzoomed, moves the receiver
  window itself if the server allows center frequency changes.
- "Rig" waterfall color palette in the waterfall theme selector, a standard
  jet-style ramp tuned for weak-signal visibility.
- The receiver panel widens to 364 px while the theme is active; the dial
  shrinks automatically on short screens.

## Install

### Remote (no files on the server)

Add this line to your `plugins/receiver/init.js`:

```js
Plugins.load('https://aganet.github.io/openwebrxplus-rig-skin/receiver/rig_skin/rig_skin.js');
```

### Local

Copy `receiver/rig_skin/` into the OpenWebRX+ plugins folder and load it by
name:

```sh
cp -r receiver/rig_skin /path/to/htdocs/plugins/receiver/
echo "Plugins.load('rig_skin');" >> /path/to/htdocs/plugins/receiver/init.js
```

On a Debian package install the plugins folder is
`/usr/lib/python3/dist-packages/htdocs/plugins/receiver/`.

### Docker

Keep the plugins next to your `docker-compose.yml` and bind-mount them into
the container.

**Step 1.** Go to the folder that holds your `docker-compose.yml` and create
the plugins tree with the plugin in it:

```sh
cd /path/to/your/compose/folder
git clone https://github.com/aganet/openwebrxplus-rig-skin.git
mkdir -p plugins/receiver
cp -r openwebrxplus-rig-skin/receiver/rig_skin plugins/receiver/
echo "Plugins.load('rig_skin');" >> plugins/receiver/init.js
rm -rf openwebrxplus-rig-skin
```

You end up with this layout:

```text
docker-compose.yml
plugins/
  receiver/
    init.js
    rig_skin/
      rig_skin.js
      rig_skin.css
```

**Step 2.** Mount it into the openwebrx service in `docker-compose.yml`.
Pick one of the two options (relative paths work in compose):

**Option A: mount the whole plugins folder.** Simple, and the layout the
official docs use. Note that it hides the plugins bundled inside the image
(`utils`, the examples) and anything previously copied into the container,
so use it when this folder is your only source of plugins:

```yaml
services:
  openwebrx:
    volumes:
      - ./plugins:/usr/lib/python3/dist-packages/htdocs/plugins
```

**Option B: mount only the rig_skin folder plus init.js.** Nothing else in
the container is touched, so plugins that already exist inside the image or
container keep working. Use this on an installation that already has
plugins:

```yaml
services:
  openwebrx:
    volumes:
      - ./plugins/receiver/rig_skin:/usr/lib/python3/dist-packages/htdocs/plugins/receiver/rig_skin:ro
      - ./plugins/receiver/init.js:/usr/lib/python3/dist-packages/htdocs/plugins/receiver/init.js
```

If your installation already has its own `init.js` loading other plugins,
do not mount a new one over it: drop the second line and instead add
`Plugins.load('rig_skin');` to the existing file.

**Step 3.** Recreate the container and refresh the browser:

```sh
docker compose up -d
```

Then select "Rig" in the theme dropdown (Settings section of the receiver
panel) and hard-refresh the browser once (Ctrl+Shift+R) if the theme does
not show up.

If you use `docker run` instead of compose, the same mounts work with
`-v "$PWD/plugins:..."` style arguments.

Tip: after editing `plugins/receiver/init.js` on the host, restart the
container if the change does not show up; some editors replace the file
when saving, which breaks a single-file bind mount until a restart.

## License

MIT, see [LICENSE](LICENSE).
