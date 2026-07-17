# rig_skin

Dark transceiver front-panel theme for OpenWebRX+. Adds a "Rig" entry to the
theme selector with a white LCD frequency display (mode badge, FIL and TS
readouts), a segmented S-meter with peak hold, an audio scope with waterfall
and roll-mode waveform, LED keys around a working VFO dial (drag, flick or
scroll to tune), waterfall zoom and paging keys, and a jet-style waterfall
palette.

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
