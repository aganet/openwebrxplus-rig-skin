# rig_skin

Dark transceiver front-panel theme for OpenWebRX+. Adds a "Rig" entry to the
theme selector with an amber LCD frequency display, a segmented S-meter with
peak hold, domed keys, and a working VFO dial (drag, flick or scroll to tune,
following the tuning step).

![screenshot](../../docs/screenshot.png)

## Load

```js
// local
Plugins.load('rig_skin');
// or remote
Plugins.load('https://aganet.github.io/openwebrxplus-rig-skin/receiver/rig_skin/rig_skin.js');
```

No dependencies. The skin only applies while the "Rig" theme is selected, so
it is safe to keep loaded at all times.
