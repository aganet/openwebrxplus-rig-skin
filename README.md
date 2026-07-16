# OpenWebRX+ Rig Skin Plugin

A receiver plugin for [OpenWebRX+](https://fms.komkon.org/OWRX/) that adds a
"Rig" theme: a dark transceiver front panel with a working VFO dial and a
segmented S-meter.

![screenshot](receiver/rig_skin/screenshot.png)

## Features

- Dark front-panel theme, selectable from the standard theme dropdown
  (Settings section of the receiver panel). Switching themes turns the whole
  skin on and off, no reload needed.
- VFO dial with chrome bezel and finger cup. Drag around its center to tune
  (one tuning step per 15 degrees), scroll for single steps, or flick it and
  it keeps spinning with flywheel inertia.
- Segmented horizontal S-meter drawn inside the frequency LCD, with S1..S9
  plus red 20/40/60 dB scale, meter ballistics (fast attack, slow decay) and
  a peak-hold segment.
- Amber backlit LCD frequency display, domed keys with backlit active state,
  recessed sliders with metal thumbs.
- The receiver panel widens to 330 px while the theme is active; the dial
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

Follow the official plugin layout for the
[openwebrxplus image](https://hub.docker.com/r/slechev/openwebrxplus):
bind-mount a host folder over the container plugins directory and put the
plugin there.

```sh
mkdir -p /opt/owrx-docker/plugins/receiver
cp -r receiver/rig_skin /opt/owrx-docker/plugins/receiver/
echo "Plugins.load('rig_skin');" >> /opt/owrx-docker/plugins/receiver/init.js
```

```yaml
# docker-compose.yml
volumes:
  - /opt/owrx-docker/plugins:/usr/lib/python3/dist-packages/htdocs/plugins
```

Then select "Rig" in the theme dropdown and hard-refresh the browser once
(Ctrl+Shift+R) if the theme does not show up.

## License

MIT, see [LICENSE](LICENSE).
