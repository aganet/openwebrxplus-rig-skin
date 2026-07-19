# rig_skin

Makes the OpenWebRX+ receiver panel look and work like a real rig: a VFO
dial you can turn (drag, flick or scroll), an LCD with mode / FIL / TS
readouts, a segmented S-meter with peak hold, a click-to-tune band scope,
an audio scope, and keys with status LEDs for NR, LOCK, tuning step (with
an Auto mode), scanner, squelch, bookmarks, waterfall zoom and paging.

![screenshot](../../docs/screenshot.png)

## Load

```js
// local
Plugins.load('rig_skin');
// or remote
Plugins.load('https://aganet.github.io/openwebrxplus-rig-skin/receiver/rig_skin/rig_skin.js');
```

No dependencies. The skin only applies while the "Rig" theme is selected,
so it is safe to keep loaded at all times.
