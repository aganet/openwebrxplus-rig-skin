# OpenWebRX+ Rig Skin Plugin

This plugin makes the OpenWebRX+ receiver panel look and work like a real
rig: dark front panel, a VFO dial you can actually turn, an LCD with proper
readouts and meters. I wrote it for my own receiver because I never got
used to tuning with sliders.

It is a plain receiver plugin. No fork, nothing patched. It adds a "Rig"
entry to the normal theme dropdown, so you can switch between this and the
stock look any time.

![screenshot](docs/screenshot.png)

## What it does

The dial tunes. Drag it, flick it and it keeps spinning, or use the mouse
wheel for single steps. It follows the tuning step. Works with a finger on
phones and tablets too.

The LCD shows the frequency in white digits, the mode on a blue badge, and
FIL / TS readouts so you always know the filter width and what one dial
click does. The S-meter is segmented with peak hold.

Under the meter sit two scopes:

- A band scope centered on the tuned frequency. Click it to tune, scroll
  it to step, SPAN switches between 50/24/10 kHz, HIDE collapses it. It
  uses the same colors and levels as the main waterfall and averages the
  trace, so weak signals are easy to spot and click.
- An audio scope: audio spectrum with a small waterfall on the left,
  scrolling waveform on the right. Good for tuning SSB by eye. Click the
  S-meter to show or hide it.

Keys around the dial, each with a status LED:

- NR: noise reduction
- LOCK: freezes the dial (blinking LED), saves you on a wall mounted tablet
- TS: tuning step picker, including an Auto entry that follows the mode
- SCAN: runs the bookmark scanner
- SQL: squelch on/off, level set automatically
- MW: writes a bookmark at the current frequency
- PROP and SAT: open the propagation and satellite screens
- small - / + and left / right pairs for waterfall zoom and paging, so you
  never need to pinch the waterfall on a phone. Paging can also move the
  receiver window itself if the server allows center frequency changes.

The active mode key lights a green LED, like the rest. There is also a
"Rig" waterfall palette in the waterfall theme selector, a jet style ramp
that keeps weak signals visible. The panel is a bit wider than stock
(364 px) and the dial shrinks on short screens.

On large screens a chevron in the top left corner expands the rig to a
wide, two column face: readouts on the left, scopes on the right, plus
extra readouts on the LCD (current band, S units, squelch, mute, UTC).

![wide layout with propagation](docs/screenshot-wide.png)

There is also a second, collapsible LCD under the dial showing HF
propagation: band conditions estimated from NOAA SWPC data (SFI and K),
and the live MUF world map from prop.kc2g.com. Click the caption to
switch views; the wide layout shows both at once.

![band conditions](docs/screenshot-prop.png)

The SAT key opens a satellite screen: predicted passes over the receiver
location for a small list of active satellites (ISS, SO-50, AO-91, RS-44,
AO-7 with its 10 m downlink, Meteor M2-3/M2-4), with countdown, duration,
color coded max elevation, the downlink frequency, and a NOW marker while
a pass is in progress. A MIN control filters out low passes. Orbits come
from the public TLE API and are computed in the browser.

![satellite passes](docs/screenshot-sats.png)

## Credits

- Orbit propagation: [satellite.js](https://github.com/shashwatak/satellite-js) (MIT), loaded on demand
- Solar data: NOAA SWPC (public domain)
- MUF map: [prop.kc2g.com](https://prop.kc2g.com/)
- TLE data: [tle.ivanstanojevic.me](https://tle.ivanstanojevic.me/)

## Install

### Remote (no files on the server)

One line in your `plugins/receiver/init.js`:

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

Step 1: go to the folder that holds your `docker-compose.yml` and create
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

Step 2: mount it into the openwebrx service in `docker-compose.yml`.
Relative paths work in compose. Two options:

Option A, mount the whole plugins folder. Simple, and the layout the
official docs use. It hides the plugins bundled inside the image (`utils`,
the examples) and anything previously copied into the container, so use it
when this folder is your only source of plugins:

```yaml
services:
  openwebrx:
    volumes:
      - ./plugins:/usr/lib/python3/dist-packages/htdocs/plugins
```

Option B, mount only the rig_skin folder plus init.js. Nothing else in the
container is touched, so plugins that already exist inside the image or
container keep working:

```yaml
services:
  openwebrx:
    volumes:
      - ./plugins/receiver/rig_skin:/usr/lib/python3/dist-packages/htdocs/plugins/receiver/rig_skin:ro
      - ./plugins/receiver/init.js:/usr/lib/python3/dist-packages/htdocs/plugins/receiver/init.js
```

If your installation already has its own `init.js` loading other plugins,
do not mount a new one over it: drop the second line and add
`Plugins.load('rig_skin');` to the existing file instead.

Step 3: recreate the container and refresh the browser:

```sh
docker compose up -d
```

Then pick "Rig" in the theme dropdown (Settings section of the receiver
panel). Hard-refresh once (Ctrl+Shift+R) if it does not show up.

With plain `docker run` the same mounts work as `-v "$PWD/plugins:..."`
arguments.

Tip: if an edit to `plugins/receiver/init.js` does not show up, restart the
container. Some editors replace the file on save, which breaks a
single-file bind mount until a restart.

## License

MIT, see [LICENSE](LICENSE).
