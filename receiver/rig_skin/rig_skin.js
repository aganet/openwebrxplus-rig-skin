/*
 * rig_skin: dark receiver front-panel theme with a rotating VFO knob.
 *
 * Adds a "Rig" entry to the theme selector. When active, the receiver
 * panel is skinned as a rig front panel and a tuning knob appears below
 * the frequency display. Drag, flick or scroll the knob to tune; each
 * knob step follows the tuning step selector.
 */

Plugins.rig_skin._version = 0.7;

Plugins.rig_skin.init = function () {
    // Register the theme in the selector
    $('#openwebrx-themes-listbox').append(
        $('<option>').val('rig').text('Rig')
    );

    // If the saved theme was applied before this plugin loaded,
    // sync the selector to it
    if (typeof UI !== 'undefined' && UI.theme === 'rig') {
        $('#openwebrx-themes-listbox').val('rig');
    }

    Plugins.rig_skin.registerWfTheme();
    Plugins.rig_skin.createVfoLine();
    return true;
};

// Rig-style waterfall palette: most of the gradient lives in the low
// dB range, so weak signals stand out against the noise floor.
Plugins.rig_skin.registerWfTheme = function () {
    if (typeof UI === 'undefined' || !UI.wfThemes) return;

    UI.wfThemes['rig'] = [
        0x000010, 0x001048, 0x0040C0, 0x00A0F0, 0x50E0D0,
        0xB0F090, 0xFFF040, 0xFF7020, 0xFFFFFF
    ];
    $('#openwebrx-wf-themes-listbox').append($('<option>').val('rig').text('Rig'));

    // re-apply a saved selection regardless of whether this plugin loads
    // before or after the core UI restores its settings
    function restore() {
        if (typeof LS !== 'undefined' && LS.has('wf_theme') &&
            LS.loadStr('wf_theme') === 'rig' && UI.wfTheme !== 'rig') {
            UI.setWfTheme('rig');
        }
    }
    restore();
    $(document).on('event:owrx_initialized', restore);
    setTimeout(restore, 2000);
    setTimeout(restore, 6000);
};

// The S-meter goes inside the frequency LCD window (like a modern
// rig's screen); the VFO knob gets its own centered line below it.
Plugins.rig_skin.createVfoLine = function () {
    var $container = $('#openwebrx-panel-receiver .frequencies-container');
    if (!$container.length) return;

    Plugins.rig_skin.createMeter($container.find('.frequencies'));

    // the scopes live in their own block: below the meter in the normal
    // layout, in a right-hand column when the panel is expanded
    var $scopes = $('<div>').attr('id', 'owrx-rig-lcd-right');
    $container.append($scopes);
    Plugins.rig_skin.createBandScope($scopes);
    Plugins.rig_skin.createScope($scopes);

    Plugins.rig_skin.createSignalInfo($container);
    Plugins.rig_skin.createExpandToggle();
    var $line = $('<div>').attr('id', 'owrx-rig-knob-line').addClass('openwebrx-panel-line');
    $container.after($line);
    Plugins.rig_skin.createSideKeys($line);
    Plugins.rig_skin.createKnob($line);
    Plugins.rig_skin.createScanKeys($line);
    Plugins.rig_skin.createPropScreen($line);
    Plugins.rig_skin.createSatScreen();
};

// Tune the VFO to any frequency; if it lies outside the current capture
// window, move the receiver window first (needs the server to allow
// center frequency changes).
Plugins.rig_skin.tuneTo = function (f, mode) {
    if (!f || typeof UI === 'undefined') return;
    if (typeof UI.toggleScanner === 'function') UI.toggleScanner(false);

    function land() {
        if (mode) UI.setModulation(mode);
        UI.setFrequency(f, false);
    }

    var inWindow = typeof center_freq !== 'undefined' && typeof bandwidth !== 'undefined' &&
        Math.abs(f - center_freq) < bandwidth / 2 - 10000;
    if (inWindow) {
        land();
        return;
    }
    if (typeof ws === 'undefined') return;
    var key;
    try { key = UI.getDemodulatorPanel().getMagicKey(); } catch (e) {}
    ws.send(JSON.stringify({ type: 'setfrequency', params: { frequency: f, key: key } }));
    var tries = 0;
    var iv = setInterval(function () {
        if (Math.abs(f - center_freq) < bandwidth / 2) {
            clearInterval(iv);
            // give the demodulator a moment to restart on the new window
            setTimeout(land, 500);
        } else if (++tries > 20) {
            clearInterval(iv);
        }
    }, 250);
};

// Satellite passes over the receiver location. TLEs come from
// tle.ivanstanojevic.me (cached for 12 hours), orbit propagation uses
// the MIT licensed satellite.js loaded on demand, and the downlink
// frequencies are a small built-in table. Collapsed by default.
Plugins.rig_skin.createSatScreen = function () {
    var SATS = [
        { id: 25544, name: 'ISS', freq: '145.800 FM', f: 145800000, mode: 'nfm' },
        { id: 27607, name: 'SO-50', freq: '436.795 FM', f: 436795000, mode: 'nfm' },
        { id: 43017, name: 'AO-91', freq: '145.960 FM', f: 145960000, mode: 'nfm' },
        { id: 44909, name: 'RS-44', freq: '435.640 SSB', f: 435640000, mode: 'usb' },
        { id: 7530, name: 'AO-7', freq: '29.450 SSB', f: 29450000, mode: 'usb' },
        { id: 57166, name: 'METEOR M2-3', freq: '137.900 LRPT', f: 137900000, mode: 'nfm' },
        { id: 59051, name: 'METEOR M2-4', freq: '137.100 LRPT', f: 137100000, mode: 'nfm' }
    ];

    function tuneSat(s) {
        Plugins.rig_skin.tuneTo(s.f, s.mode);
    }

    var minEl = (typeof LS !== 'undefined' && LS.has('rig_sat_minel')) ? LS.loadInt('rig_sat_minel') : 10;

    var $head = $('<div>').addClass('owrx-rig-sats-head').text('loading...');
    var $list = $('<div>').addClass('owrx-rig-sats-list');
    var $minCtl = $('<span>').addClass('owrx-rig-prop-label');
    var $sat = $('<div>').attr('id', 'owrx-rig-sats')
        .append($head).append($list)
        .append($('<div>').addClass('owrx-rig-prop-cap')
            .append($('<span>').addClass('owrx-rig-prop-label').text('PASSES over this receiver - TLE: ivanstanojevic.me'))
            .append($minCtl)
            .append($('<span>').addClass('owrx-rig-prop-hide').text('HIDE')));
    $('#owrx-rig-prop').after($sat);

    function minLabel() {
        $minCtl.text('MIN ' + minEl + '°');
    }
    $minCtl.on('click', function () {
        var opts = [0, 10, 20, 30];
        minEl = opts[(opts.indexOf(minEl) + 1) % opts.length];
        if (typeof LS !== 'undefined') LS.save('rig_sat_minel', minEl);
        minLabel();
        render();
    });
    minLabel();

    $sat.find('.owrx-rig-prop-hide').on('click', function () {
        setOpen(false);
    });

    var passes = null, timer = null;

    function ensureLib(cb) {
        if (typeof satellite !== 'undefined') return cb();
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js';
        s.onload = cb;
        s.onerror = function () {
            $head.text('orbit library unavailable');
        };
        document.head.appendChild(s);
    }

    function ensureTles(cb) {
        var cached = null;
        try {
            cached = JSON.parse(localStorage.getItem('rig_sat_tles') || 'null');
        } catch (e) {}
        if (cached && cached.tles && Date.now() - cached.ts < 12 * 3600 * 1000) return cb(cached.tles);

        var tles = {}, pending = SATS.length;
        function done() {
            if (--pending > 0) return;
            if (Object.keys(tles).length === 0) {
                $head.text('TLE download failed');
                return;
            }
            try {
                localStorage.setItem('rig_sat_tles', JSON.stringify({ ts: Date.now(), tles: tles }));
            } catch (e) {}
            cb(tles);
        }
        SATS.forEach(function (s) {
            fetch('https://tle.ivanstanojevic.me/api/tle/' + s.id)
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    if (j.line1 && j.line2) tles[s.id] = { line1: j.line1, line2: j.line2 };
                    done();
                })
                .catch(done);
        });
    }

    function computePasses(tles) {
        var pos = typeof Utils !== 'undefined' && Utils.getReceiverPos ? Utils.getReceiverPos() : null;
        if (!pos || typeof pos.lat !== 'number') {
            $head.text('receiver position not configured');
            return;
        }
        var obs = {
            latitude: satellite.degreesToRadians(pos.lat),
            longitude: satellite.degreesToRadians(pos.lon),
            height: 0.1
        };
        var out = [];
        SATS.forEach(function (s) {
            var tle = tles[s.id];
            if (!tle) return;
            var rec = satellite.twoline2satrec(tle.line1, tle.line2);
            var inPass = false, aos = null, maxEl = 0, found = 0;
            for (var t = 0; t <= 24 * 3600 && found < 3; t += 30) {
                var d = new Date(Date.now() + t * 1000);
                var pv = satellite.propagate(rec, d);
                if (!pv || !pv.position) continue;
                var la = satellite.ecfToLookAngles(obs, satellite.eciToEcf(pv.position, satellite.gstime(d)));
                var el = la.elevation * 180 / Math.PI;
                if (el > 0) {
                    if (!inPass) {
                        inPass = true;
                        aos = d;
                        maxEl = el;
                    } else if (el > maxEl) {
                        maxEl = el;
                    }
                } else if (inPass) {
                    inPass = false;
                    found++;
                    out.push({ sat: s, aos: aos, los: d, maxEl: maxEl });
                }
            }
        });
        out.sort(function (a, b) { return a.aos - b.aos; });
        passes = out;
        render();
    }

    function fmtUtc(d) {
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
    }

    function render() {
        if (!passes) return;
        var now = Date.now();
        $head.text('NEXT PASSES (UTC)');
        $list.empty();
        var counted = false, shown = 0;
        passes.forEach(function (p) {
            if (p.los.getTime() < now || p.maxEl < minEl || shown >= 10) return;
            shown++;
            var active = p.aos.getTime() <= now;
            var mins = Math.round((p.los - p.aos) / 60000);
            var when;
            if (active) {
                when = 'NOW';
            } else if (!counted) {
                counted = true;
                var toGo = Math.round((p.aos.getTime() - now) / 60000);
                when = fmtUtc(p.aos) + ' (' + (toGo >= 60 ? Math.floor(toGo / 60) + 'h' + (toGo % 60) : toGo + 'm') + ')';
            } else {
                when = fmtUtc(p.aos);
            }
            var elClass = p.maxEl >= 40 ? 'good' : p.maxEl >= 20 ? 'fair' : 'low';
            var $freqCell = $('<span>').addClass('sfreq').text(p.sat.freq)
                .attr('title', 'Tune the VFO here')
                .on('click', function () { tuneSat(p.sat); });
            $list.append(
                $('<div>').addClass('owrx-rig-sat-row' + (active ? ' active' : ''))
                    .append($('<span>').addClass('swhen').text(when))
                    .append($('<span>').addClass('sname').text(p.sat.name))
                    .append($('<span>').addClass('sel ' + elClass).text(Math.round(p.maxEl) + '°'))
                    .append($('<span>').addClass('sdur').text(mins + 'min'))
                    .append($freqCell)
            );
        });
    }

    function refresh() {
        ensureLib(function () {
            ensureTles(computePasses);
        });
    }

    function setOpen(on) {
        $sat.toggleClass('visible', on);
        if (Plugins.rig_skin._satKey) Plugins.rig_skin._satKey.toggleClass('highlighted', on);
        if (typeof LS !== 'undefined') LS.save('rig_sats', on);
        if (on) {
            refresh();
            if (!timer) {
                timer = setInterval(function () {
                    if (!passes) return;
                    // recompute once the front pass has ended, else re-render times
                    if (passes.length && passes[0].los.getTime() < Date.now()) refresh();
                    else render();
                }, 15000);
            }
        } else if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    Plugins.rig_skin._satToggle = function () {
        setOpen(!$sat.hasClass('visible'));
    };

    setOpen((typeof LS !== 'undefined' && LS.has('rig_sats'))
        ? LS.loadBool('rig_sats') : false);
};

// Second LCD screen with HF propagation: our own band conditions view
// computed from NOAA SWPC data, and the live MUF world map from
// prop.kc2g.com. One view at a time in the normal layout (click the
// caption to switch), side by side in the wide layout. Collapsed by
// default.
Plugins.rig_skin.createPropScreen = function ($knobLine) {
    // estimated band conditions from solar flux and Kp; a rough but
    // honest heuristic, labeled as an estimate in the caption
    function cond(group, night, sfi, k) {
        switch (group) {
            case 0:  // 80m-40m
                if (night) return k <= 2 ? 'good' : k <= 4 ? 'fair' : 'poor';
                return k <= 3 ? 'fair' : 'poor';
            case 1:  // 30m-20m
                if (night) return sfi >= 120 && k <= 3 ? 'good' : sfi >= 90 && k <= 5 ? 'fair' : 'poor';
                return sfi >= 100 && k <= 3 ? 'good' : sfi >= 80 && k <= 5 ? 'fair' : 'poor';
            case 2:  // 17m-15m
                if (night) return sfi >= 105 && k <= 4 ? 'fair' : 'poor';
                return sfi >= 120 && k <= 3 ? 'good' : sfi >= 95 && k <= 5 ? 'fair' : 'poor';
            default: // 12m-10m
                if (night) return 'poor';
                return sfi >= 160 && k <= 3 ? 'good' : sfi >= 120 && k <= 5 ? 'fair' : 'poor';
        }
    }

    var GROUPS = ['80m-40m', '30m-20m', '17m-15m', '12m-10m'];
    var $bandsHead = $('<div>').addClass('owrx-rig-bands-head').text('waiting for NOAA data...');
    var $bands = $('<div>').addClass('owrx-rig-bands').append($bandsHead);
    var bandCells = [];
    var $hdr = $('<div>').addClass('owrx-rig-band-row owrx-rig-band-hdr')
        .append($('<span>').addClass('bname'))
        .append($('<span>').addClass('owrx-rig-cond-hdr').text('DAY'))
        .append($('<span>').addClass('owrx-rig-cond-hdr').text('NIGHT'));
    $bands.append($hdr);
    GROUPS.forEach(function (g) {
        var $day = $('<span>').addClass('owrx-rig-cond').text('--');
        var $night = $('<span>').addClass('owrx-rig-cond').text('--');
        bandCells.push([$day, $night]);
        $bands.append(
            $('<div>').addClass('owrx-rig-band-row')
                .append($('<span>').addClass('bname').text(g))
                .append($day).append($night)
        );
    });

    function refreshBands() {
        if (typeof fetch !== 'function') return;
        Promise.all([
            fetch('https://services.swpc.noaa.gov/json/f107_cm_flux.json').then(function (r) { return r.json(); }),
            fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').then(function (r) { return r.json(); })
        ]).then(function (res) {
            var sfi = Math.round(Number(res[0][0].flux));
            var last = res[1][res[1].length - 1];
            var k = Number(last.Kp);
            var a = last.a_running;
            $bandsHead.text('SFI ' + sfi + '   K ' + k.toFixed(1) + (a !== undefined ? '   A ' + a : ''));
            GROUPS.forEach(function (g, i) {
                [0, 1].forEach(function (n) {
                    var c = cond(i, n === 1, sfi, k);
                    bandCells[i][n].attr('class', 'owrx-rig-cond ' + c).text(c.toUpperCase());
                });
            });
        }).catch(function () {
            $bandsHead.text('NOAA data unavailable');
        });
    }

    // NCDXF/IARU beacon network: 18 beacons in a fixed, UTC synchronized
    // 3 minute rotation, 10 seconds per beacon per band. Pure clock math,
    // no external data needed.
    var BEACONS = [
        ['4U1UN', 'United Nations NY'], ['VE8AT', 'Canada'], ['W6WX', 'USA West'],
        ['KH6RS', 'Hawaii'], ['ZL6B', 'New Zealand'], ['VK6RBP', 'Australia'],
        ['JA2IGY', 'Japan'], ['RR9O', 'Russia'], ['VR2B', 'Hong Kong'],
        ['4S7B', 'Sri Lanka'], ['ZS6DN', 'South Africa'], ['5Z4B', 'Kenya'],
        ['4X6TU', 'Israel'], ['OH2B', 'Finland'], ['CS3B', 'Madeira'],
        ['LU4AA', 'Argentina'], ['OA4B', 'Peru'], ['YV5B', 'Venezuela']
    ];
    var BFREQ = [14100000, 18110000, 21150000, 24930000, 28200000];

    var $beacons = $('<div>').addClass('owrx-rig-beacons');
    var beaconRows = [];
    BFREQ.forEach(function (f) {
        var $freq = $('<span>').addClass('bfreq').text((f / 1000000).toFixed(3))
            .attr('title', 'Tune here in CW')
            .on('click', function () { Plugins.rig_skin.tuneTo(f, 'cw'); });
        var $call = $('<span>').addClass('bcall');
        var $where = $('<span>').addClass('bwhere');
        var $slot = $('<span>').addClass('bslot');
        beaconRows.push({ f: f, $call: $call, $where: $where, $slot: $slot, $row: null });
        var $row = $('<div>').addClass('owrx-rig-beacon-row')
            .append($freq).append($call).append($where).append($slot);
        beaconRows[beaconRows.length - 1].$row = $row;
        $beacons.append($row);
    });

    function updateBeacons() {
        var sec = Math.floor(Date.now() / 1000) % 180;
        var tenIdx = Math.floor(sec / 10);
        var tuned = typeof UI !== 'undefined' && UI.getFrequency ? UI.getFrequency() : 0;
        beaconRows.forEach(function (r, b) {
            var i = ((tenIdx - b) % 18 + 18) % 18;
            r.$call.text(BEACONS[i][0]);
            r.$where.text(BEACONS[i][1]);
            r.$slot.text((10 - (sec % 10)) + 's');
            var listening = Math.abs(tuned - r.f) < 3000;
            r.$row.toggleClass('listening', listening);
            if (listening && typeof Plugins.rig_skin._sLevel === 'number') {
                var v = Plugins.rig_skin._sLevel;
                var s = v <= 0 ? 'S0' : v <= 0.65 ? 'S' + Math.round(v / 0.65 * 9)
                    : 'S9+' + (Math.round((v - 0.65) / 0.35 * 12) * 5);
                r.$slot.text((10 - (sec % 10)) + 's ' + s);
            }
        });
    }

    updateBeacons();
    setInterval(function () {
        if ($prop.hasClass('visible')) updateBeacons();
    }, 1000);

    var views = [
        { key: 'bands', label: 'BAND CONDITIONS - est. from NOAA SWPC', content: $bands, refresh: refreshBands },
        { key: 'beacons', label: 'NCDXF/IARU BEACONS - click to listen', content: $beacons, refresh: updateBeacons },
        { key: 'muf', label: 'MUF MAP - prop.kc2g.com', url: 'https://prop.kc2g.com/renders/current/mufd-normal-now.svg' }
    ];

    var $prop = $('<div>').attr('id', 'owrx-rig-prop');

    var imgs = [];
    views.forEach(function (v, i) {
        var $content;
        if (v.content) {
            $content = v.content;
            imgs.push(null);
        } else {
            $content = $('<img>').attr('alt', v.label);
            imgs.push($content);
        }
        var $cap = $('<div>').addClass('owrx-rig-prop-cap')
            .append($('<span>').addClass('owrx-rig-prop-label').text(v.label))
            .append($('<span>').addClass('owrx-rig-prop-hide').text('HIDE'));
        $cap.find('.owrx-rig-prop-label').on('click', function () {
            setView((viewIdx + 1) % views.length);
        });
        $cap.find('.owrx-rig-prop-hide').on('click', function () {
            setOpen(false);
        });
        $prop.append(
            $('<div>').addClass('owrx-rig-prop-view').attr('data-view', v.key)
                .append($content).append($cap)
        );
    });

    $knobLine.after($prop);

    var viewIdx = 0;

    function refresh() {
        views.forEach(function (v, i) {
            if (v.refresh) {
                v.refresh();
            } else if (imgs[i]) {
                var sep = v.url.indexOf('?') >= 0 ? '&' : '?';
                imgs[i].attr('src', v.url + sep + '_=' + Math.floor(Date.now() / 600000));
            }
        });
    }

    function setView(i) {
        viewIdx = i;
        $prop.find('.owrx-rig-prop-view').each(function (n) {
            $(this).toggleClass('active', n === i);
        });
        if (typeof LS !== 'undefined') LS.save('rig_prop_view', i);
    }

    function setOpen(on) {
        $prop.toggleClass('visible', on);
        if (Plugins.rig_skin._propKey) Plugins.rig_skin._propKey.toggleClass('highlighted', on);
        if (on) refresh();
        if (typeof LS !== 'undefined') LS.save('rig_prop', on);
    }

    Plugins.rig_skin._propToggle = function () {
        setOpen(!$prop.hasClass('visible'));
    };

    setView((typeof LS !== 'undefined' && LS.has('rig_prop_view')) ? LS.loadInt('rig_prop_view') : 0);
    setOpen((typeof LS !== 'undefined' && LS.has('rig_prop')) ? LS.loadBool('rig_prop') : false);
    setInterval(function () {
        if ($prop.hasClass('visible')) refresh();
    }, 600000);
};

// Chevron in the panel's top left corner: expands the rig to a wide,
// two-column layout on large screens.
Plugins.rig_skin.createExpandToggle = function () {
    var $panel = $('#openwebrx-panel-receiver');
    var $btn = $('<div>').attr('id', 'owrx-rig-expand').attr('title', 'Expand / shrink the rig');

    function apply(wide) {
        $panel.toggleClass('rig-wide', wide);
        // the panel grows to the left, so left chevrons mean expand
        $btn.text(wide ? '❯❯' : '❮❮');
        if (typeof LS !== 'undefined') LS.save('rig_wide', wide);
    }

    $btn.on('click', function () {
        apply(!$panel.hasClass('rig-wide'));
    });
    $panel.append($btn);

    apply((typeof LS !== 'undefined' && LS.has('rig_wide'))
        ? LS.loadBool('rig_wide') : false);
};

// Waterfall zoom pair, two half-width keys sharing one key slot,
// easier than pinch zoom on touch devices.
Plugins.rig_skin.makeZoomRow = function () {
    var $out = $('<div>').addClass('openwebrx-button owrx-rig-zoom-key')
        .attr('title', 'Zoom waterfall out').text('−');
    var $in = $('<div>').addClass('openwebrx-button owrx-rig-zoom-key')
        .attr('title', 'Zoom waterfall in').text('+');

    $out.on('click', function () {
        if (typeof zoomOutOneStep === 'function') zoomOutOneStep();
    });
    $in.on('click', function () {
        if (typeof zoomInOneStep === 'function') zoomInOneStep();
    });

    return $('<div>').addClass('owrx-rig-zoom-row').append($out).append($in);
};

// Waterfall paging pair: shift the zoomed view left/right by one visible
// span; at the window edge (or unzoomed) retune the SDR to the next chunk
// of spectrum, so paging can walk the whole band.
Plugins.rig_skin.makePageRow = function () {
    function pageBy(dir) {
        if (typeof waterfallWidth !== 'function' || typeof resize_canvases !== 'function') return;

        if (typeof zoom_level !== 'undefined' && zoom_level > 0) {
            var winsize = waterfallWidth();
            var canvasWidth = winsize * zoom_levels[zoom_level];
            var visible = bandwidth / zoom_levels[zoom_level];
            // frequency offset currently at the screen center
            var centerOff = ((-zoom_offset_px + winsize / 2) / canvasWidth) * bandwidth - bandwidth / 2;
            var half = bandwidth / 2 - visible / 2;
            var atEdge = (dir > 0 && centerOff >= half - 1) || (dir < 0 && centerOff <= -half + 1);
            if (!atEdge) {
                zoom_center_rel = Math.max(-half, Math.min(half, centerOff + dir * visible));
                zoom_center_where = 0.5;
                resize_canvases(true);
                mkscale();
                bandplan.draw();
                bookmarks.position();
                return;
            }
        }

        // unzoomed, or already at the capture window edge: move the window
        // itself (requires the server to allow center frequency changes)
        if (typeof jumpBySteps === 'function') jumpBySteps(dir);
    }

    var $left = $('<div>').addClass('openwebrx-button owrx-rig-zoom-key')
        .attr('title', 'Page waterfall down (right-click: move the receiver window)').text('◀');
    var $right = $('<div>').addClass('openwebrx-button owrx-rig-zoom-key')
        .attr('title', 'Page waterfall up (right-click: move the receiver window)').text('▶');

    $left.on('click', function () { pageBy(-1); });
    $right.on('click', function () { pageBy(1); });

    // right-click always moves the receiver window, like the stock arrows
    $left.on('contextmenu', function (e) {
        e.preventDefault();
        if (typeof jumpBySteps === 'function') jumpBySteps(-1);
    });
    $right.on('contextmenu', function (e) {
        e.preventDefault();
        if (typeof jumpBySteps === 'function') jumpBySteps(1);
    });

    return $('<div>').addClass('owrx-rig-zoom-row').append($left).append($right);
};

// Mode and filter width readout in the LCD's top right corner,
// updated by polling the demodulator state.
Plugins.rig_skin.createSignalInfo = function ($container) {
    var $mode = $('<div>').addClass('owrx-rig-info-mode');
    var $filter = $('<div>').addClass('owrx-rig-info-filter');
    var $step = $('<div>').addClass('owrx-rig-info-step');
    $container.append(
        $('<div>').attr('id', 'owrx-rig-info').append($mode).append($filter).append($step)
    );

    // extra readouts for the wide layout: S units, squelch, UTC clock
    var $extra = $('<div>').attr('id', 'owrx-rig-extra');
    $container.find('.frequencies').append($extra);

    function sUnits() {
        var v = Plugins.rig_skin._sLevel;
        if (typeof v !== 'number') return '';
        if (v <= 0) return 'S0';
        if (v <= 0.65) return 'S' + Math.round(v / 0.65 * 9);
        return 'S9+' + (Math.round((v - 0.65) / 0.35 * 12) * 5);
    }

    function bandName(freq) {
        if (typeof bandplan === 'undefined' || !bandplan ||
            !bandplan.bands || !bandplan.bands.length) return '';
        for (var i = 0; i < bandplan.bands.length; i++) {
            var b = bandplan.bands[i];
            if (freq >= b.low_bound && freq <= b.high_bound && b.name) return b.name;
        }
        return '';
    }

    function update() {
        var mode = '', filter = '';
        if (typeof UI !== 'undefined' && typeof UI.getDemodulator === 'function') {
            var demod = UI.getDemodulator();
            if (demod) {
                mode = (UI.getModulation() || '').toUpperCase();
                if (typeof demod.low_cut === 'number' && typeof demod.high_cut === 'number') {
                    var w = demod.high_cut - demod.low_cut;
                    filter = 'FIL ' + (w >= 1000 ? (w / 1000).toFixed(1) + 'k' : w);
                }
            }
        }
        var stepText = $('#openwebrx-tuning-step-listbox option:selected').text();
        $mode.text(mode);
        $filter.text(filter);
        $step.text(stepText ? 'TS ' + stepText : '');

        var $sql = $('#openwebrx-panel-receiver .openwebrx-squelch-slider');
        var sqlOn = $sql.length && Number($sql.val()) > Number($sql.attr('min'));
        var parts = [];
        var band = typeof UI !== 'undefined' && UI.getFrequency ? bandName(UI.getFrequency()) : '';
        if (band) parts.push(band);
        var s = sUnits();
        if (s) parts.push(s);
        parts.push(sqlOn ? 'SQL ' + $sql.val() : 'SQL off');
        if (typeof UI !== 'undefined' && UI.volumeMuted >= 0) parts.push('MUTE');
        var clock = $('#openwebrx-clock-utc').text();
        if (clock) parts.push(clock);
        $extra.text(parts.join('   '));
    }

    update();
    setInterval(update, 500);
};

// Band scope inside the LCD: a narrow spectrum and waterfall centered
// on the tuned frequency, like a rig's center-mode scope. Click to
// tune, scroll for single steps, click SPAN to change the width.
Plugins.rig_skin.createBandScope = function ($freq) {
    if (!$freq.length || typeof waterfall_add !== 'function') return;

    var W = 340, TRACE_H = 36, WF_H = 22, AXIS_H = 12, H = TRACE_H + WF_H + AXIS_H;
    var SPANS = [50000, 24000, 10000];
    var spanIdx = 1;

    var canvas = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var $bs = $('<div>').attr('id', 'owrx-rig-bscope').append(canvas);
    var $bar = $('<div>').attr('id', 'owrx-rig-bscope-bar').text('BAND SCOPE');
    $freq.append($bs).append($bar);

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // scrolling waterfall backing store
    var wf = document.createElement('canvas');
    wf.width = W - 2;
    wf.height = WF_H;
    var wfCtx = wf.getContext('2d');

    function visible() {
        return $bs.hasClass('visible');
    }

    function setVisible(on) {
        $bs.toggleClass('visible', on);
        $bar.toggleClass('visible', !on);
        if (typeof LS !== 'undefined') LS.save('rig_bscope', on);
    }

    function span() {
        var s = SPANS[spanIdx];
        // wide modes (WFM, DAB) would fill the whole scope: grow the span
        // so the passband stays a focused slice of the view
        if (typeof UI !== 'undefined' && UI.getDemodulator) {
            var d = UI.getDemodulator();
            if (d && typeof d.low_cut === 'number' && typeof d.high_cut === 'number') {
                var w = d.high_cut - d.low_cut;
                if (w > s * 0.6) s = Math.ceil(w * 2.5 / 50000) * 50000;
            }
        }
        return s;
    }

    function tunedOffset() {
        if (typeof UI === 'undefined' || typeof center_freq === 'undefined') return 0;
        var f = UI.getFrequency();
        return f > 0 ? f - center_freq : 0;
    }

    // level at x, taking the strongest FFT bin covered by that pixel
    function levelAt(data, off, x) {
        var f0 = off + ((x - 0.5) / W - 0.5) * span();
        var f1 = off + ((x + 0.5) / W - 0.5) * span();
        var b0 = Math.floor((f0 / bandwidth + 0.5) * data.length);
        var b1 = Math.max(b0 + 1, Math.ceil((f1 / bandwidth + 0.5) * data.length));
        if (b1 <= 0 || b0 >= data.length) return null;
        var v = -1000;
        for (var b = Math.max(0, b0); b < Math.min(data.length, b1); b++) {
            if (data[b] > v) v = data[b];
        }
        return v;
    }

    // trace averaging: smooths the noise so steady weak signals stand out
    var avg = null, avgOff = null, avgSpan = null;

    function draw(data) {
        var off = tunedOffset();
        // exact same level range as the main waterfall, so signals look
        // just as strong here, only magnified
        var range = typeof Waterfall !== 'undefined' && Waterfall.getRange ? Waterfall.getRange() : { min: -100, max: 0 };
        var lo = range.min, hi = range.max;

        // reset the average when the view moves
        if (!avg || avgOff !== off || avgSpan !== span()) {
            avg = null;
            avgOff = off;
            avgSpan = span();
        }

        ctx.clearRect(0, 0, W, H);

        // passband shading around the center
        var demod = typeof UI !== 'undefined' && UI.getDemodulator ? UI.getDemodulator() : null;
        if (demod && typeof demod.low_cut === 'number' && typeof demod.high_cut === 'number') {
            var cwOff = UI.getFrequency() - center_freq - demod.get_offset_frequency();
            var px0 = ((demod.low_cut - cwOff) / span() + 0.5) * W;
            var px1 = ((demod.high_cut - cwOff) / span() + 0.5) * W;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
            ctx.fillRect(px0, 0, Math.max(1, px1 - px0), TRACE_H + WF_H);
        }

        // spectrum trace, averaged over time and with a gentle low-end
        // lift so weak signals are easy to spot
        var fresh = !avg;
        if (fresh) avg = new Float32Array(W);
        ctx.beginPath();
        ctx.moveTo(0, TRACE_H);
        for (var x = 0; x < W; x++) {
            var v = levelAt(data, off, x);
            if (v === null) v = lo;
            avg[x] = fresh ? v : avg[x] * 0.7 + v * 0.3;
            var t = Math.max(0, Math.min(1, (avg[x] - lo) / (hi - lo)));
            ctx.lineTo(x, TRACE_H - Math.pow(t, 0.7) * (TRACE_H - 2));
        }
        ctx.lineTo(W, TRACE_H);
        ctx.closePath();
        ctx.fillStyle = 'rgba(63, 169, 245, 0.35)';
        ctx.fill();
        ctx.strokeStyle = '#3fa9f5';
        ctx.lineWidth = 1;
        ctx.stroke();

        // waterfall: scroll down, paint the new line on top
        if (wf.height > 1) {
            var img = wfCtx.getImageData(0, 0, wf.width, wf.height - 1);
            wfCtx.putImageData(img, 0, 1);
        }
        // colors come straight from the main waterfall's theme and levels
        for (var wx = 0; wx < wf.width; wx++) {
            var wv = levelAt(data, off, wx + 1);
            var c = Waterfall.makeColor(wv === null ? lo : wv);
            wfCtx.fillStyle = 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
            wfCtx.fillRect(wx, 0, 1, 1);
        }
        ctx.drawImage(wf, 1, TRACE_H);

        // fixed center marker
        ctx.fillStyle = '#ff4a33';
        ctx.fillRect(W / 2 - 0.5, 0, 1, TRACE_H + WF_H);

        // axis: span control and edge labels
        var k = span() / 2000;
        ctx.font = '8px roboto-mono, monospace';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#5db8ff';
        ctx.textAlign = 'left';
        ctx.fillText('SPAN ' + (span() / 1000) + 'k', 2, TRACE_H + WF_H + 3);
        ctx.textAlign = 'center';
        ctx.fillText('-' + k + 'k', W * 0.25, TRACE_H + WF_H + 3);
        ctx.fillText('+' + k + 'k', W * 0.75, TRACE_H + WF_H + 3);
        ctx.fillStyle = '#5c6670';
        ctx.textAlign = 'right';
        ctx.fillText('HIDE', W - 2, TRACE_H + WF_H + 3);
    }

    // feed from the waterfall FFT stream; keep the latest line around
    // for the auto tune key as well
    var origWaterfallAdd = waterfall_add;
    waterfall_add = function (data) {
        var res = origWaterfallAdd.apply(this, arguments);
        if (data && data.length) {
            Plugins.rig_skin._lastFft = data;
            if (visible() && typeof bandwidth !== 'undefined') {
                try { draw(data); } catch (e) {}
            }
        }
        return res;
    };

    canvas.addEventListener('click', function (e) {
        var r = canvas.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width * W;
        var y = (e.clientY - r.top) / r.height * H;
        if (y > TRACE_H + WF_H) {
            // axis strip: SPAN cycles, HIDE collapses
            if (x < 70) spanIdx = (spanIdx + 1) % SPANS.length;
            else if (x > W - 40) setVisible(false);
            return;
        }
        // tune to the clicked frequency
        var f = center_freq + tunedOffset() + (x / W - 0.5) * span();
        if (typeof UI !== 'undefined') UI.setFrequency(f);
    });

    canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var steps = Plugins.rig_skin.wheelSteps(e);
        if (steps && typeof tuneBySteps === 'function') tuneBySteps(steps);
    }, { passive: false });

    $bar.on('click', function () {
        setVisible(true);
    });

    setVisible((typeof LS !== 'undefined' && LS.has('rig_bscope'))
        ? LS.loadBool('rig_bscope') : true);
};

// Audio scope inside the LCD: audio spectrum on the left, waveform on
// the right, fed by an AnalyserNode tapped into the audio output chain.
// Toggled by clicking the S-meter; off by default.
Plugins.rig_skin.createScope = function ($freq) {
    if (!$freq.length) return;

    var W = 340, H = 64, PLOT_H = 53;
    var SPEC_H = 27;  // spectrum in the top half of the left plot, waterfall below
    var canvas = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var $scope = $('<div>').attr('id', 'owrx-rig-scope').append(canvas);
    $freq.append($scope);

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var FFT_W = 165, WAVE_X = 173, WAVE_W = W - WAVE_X;
    var analyser = null, freqData = null, timeData = null, timer = null;

    // spectrum span follows the demodulator passband: 4k for voice modes,
    // 8k/16k when the filter is wider (NFM, WFM)
    var span = 4000;

    function updateSpan() {
        var hb = 4000;
        if (typeof UI !== 'undefined' && typeof UI.getDemodulator === 'function') {
            var d = UI.getDemodulator();
            if (d && typeof d.high_cut === 'number' && typeof d.low_cut === 'number') {
                hb = Math.max(Math.abs(d.high_cut), Math.abs(d.low_cut));
            }
        }
        span = hb <= 4000 ? 4000 : (hb <= 8000 ? 8000 : 16000);
        canvas.dataset.span = span;
    }

    // offscreen canvas holding the scrolling audio waterfall
    var wf = document.createElement('canvas');
    wf.width = FFT_W - 2;
    wf.height = PLOT_H - SPEC_H - 2;
    var wfCtx = wf.getContext('2d');

    // offscreen canvas holding the scrolling waveform (roll mode)
    var wave = document.createElement('canvas');
    wave.width = WAVE_W - 2;
    wave.height = PLOT_H - 2;
    var waveCtx = wave.getContext('2d');
    var WAVE_STEP = 4;  // pixels scrolled per frame

    // dark blue to white colormap for waterfall intensity
    var wfPalette = [];
    (function () {
        var stops = [[4, 7, 10], [10, 58, 102], [63, 169, 245], [234, 246, 255]];
        for (var i = 0; i < 256; i++) {
            var p = i / 255 * (stops.length - 1);
            var s = Math.min(stops.length - 2, Math.floor(p));
            var f = p - s;
            var c = [0, 1, 2].map(function (j) {
                return Math.round(stops[s][j] + (stops[s + 1][j] - stops[s][j]) * f);
            });
            wfPalette.push('rgb(' + c.join(',') + ')');
        }
    })();

    function drawFrame() {
        // framed plot areas with graticule, oscilloscope style
        ctx.strokeStyle = '#1a2026';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, FFT_W - 1, PLOT_H - 1);
        ctx.strokeRect(WAVE_X + 0.5, 0.5, WAVE_W - 1, PLOT_H - 1);

        ctx.fillStyle = '#1a2026';
        // FFT grid at 1/2/3 kHz over the spectrum half
        for (var g = 1; g <= 3; g++) {
            ctx.fillRect(Math.round(FFT_W * g / 4), 1, 1, SPEC_H - 1);
        }
        // waveform graticule: center line and time divisions
        ctx.fillRect(WAVE_X + 1, Math.round(PLOT_H / 2), WAVE_W - 2, 1);
        for (var d = 1; d <= 3; d++) {
            ctx.fillRect(WAVE_X + Math.round(WAVE_W * d / 4), 1, 1, PLOT_H - 2);
        }

        // axis labels below the plots, following the current span
        var q = span / 4000;
        ctx.fillStyle = '#5db8ff';
        ctx.font = '8px roboto-mono, monospace';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText('0', 0, PLOT_H + 2);
        ctx.textAlign = 'center';
        for (var k = 1; k <= 3; k++) {
            ctx.fillText((k * q) + 'k', Math.round(FFT_W * k / 4), PLOT_H + 2);
        }
        ctx.textAlign = 'right';
        ctx.fillText((4 * q) + 'kHz', FFT_W, PLOT_H + 2);
        ctx.fillText('300ms/Div', W, PLOT_H + 2);
    }

    // the audio graph only exists once audio has started, attach lazily;
    // tap before the volume gain so the display is level-independent
    function attach() {
        if (analyser) return true;
        if (typeof audioEngine === 'undefined' || !audioEngine ||
            !audioEngine.audioContext || !audioEngine.gainNode) return false;
        analyser = audioEngine.audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.5;
        (audioEngine.audioNode || audioEngine.gainNode).connect(analyser);
        freqData = new Uint8Array(analyser.frequencyBinCount);
        timeData = new Uint8Array(analyser.fftSize);
        return true;
    }

    // display auto-scaling: track the recent peak deviation so the
    // waveform fills the plot regardless of signal level
    var wavePeak = 0.3;

    function draw() {
        ctx.clearRect(0, 0, W, H);
        updateSpan();
        drawFrame();

        if (attach()) {
            analyser.getByteFrequencyData(freqData);
            analyser.getByteTimeDomainData(timeData);

            var sr = audioEngine.audioContext.sampleRate;
            var maxBin = Math.max(1, Math.min(freqData.length,
                Math.round(span / (sr / 2) * freqData.length)));

            function binAt(x, width) {
                return freqData[Math.min(maxBin - 1, Math.floor(x * maxBin / width))];
            }

            // audio spectrum as a filled area in the top half
            ctx.beginPath();
            ctx.moveTo(1, SPEC_H);
            for (var x = 1; x < FFT_W - 1; x++) {
                ctx.lineTo(x, SPEC_H - binAt(x, FFT_W) / 255 * (SPEC_H - 2));
            }
            ctx.lineTo(FFT_W - 2, SPEC_H);
            ctx.closePath();
            ctx.fillStyle = 'rgba(63, 169, 245, 0.35)';
            ctx.fill();
            ctx.strokeStyle = '#3fa9f5';
            ctx.lineWidth = 1;
            ctx.stroke();

            // audio waterfall scrolling below the spectrum
            if (wf.height > 1) {
                var shifted = wfCtx.getImageData(0, 0, wf.width, wf.height - 1);
                wfCtx.putImageData(shifted, 0, 1);
            }
            for (var wx = 0; wx < wf.width; wx++) {
                wfCtx.fillStyle = wfPalette[binAt(wx, wf.width)];
                wfCtx.fillRect(wx, 0, 1, 1);
            }
            ctx.drawImage(wf, 1, SPEC_H + 1);

            // waveform in roll mode: scroll left, append the newest audio
            // envelope at the right edge
            var shiftedWave = waveCtx.getImageData(WAVE_STEP, 0, wave.width - WAVE_STEP, wave.height);
            waveCtx.putImageData(shiftedWave, 0, 0);
            waveCtx.clearRect(wave.width - WAVE_STEP, 0, WAVE_STEP, wave.height);

            // slowly decaying peak tracker, capped so silence stays thin
            var dev = 0;
            for (var d = 0; d < timeData.length; d++) {
                var dv = Math.abs(timeData[d] - 128);
                if (dv > dev) dev = dv;
            }
            wavePeak = Math.max(dev / 128, wavePeak * 0.995, 0.05);
            var wScale = 0.9 / wavePeak;

            var center = (wave.height - 1) / 2;
            waveCtx.strokeStyle = '#3adb4a';
            waveCtx.lineWidth = 1;
            for (var c = 0; c < WAVE_STEP; c++) {
                var i0 = Math.floor(c * timeData.length / WAVE_STEP);
                var i1 = Math.floor((c + 1) * timeData.length / WAVE_STEP);
                var mn = 255, mx = 0;
                for (var i = i0; i < i1; i++) {
                    var s = timeData[i];
                    if (s < mn) mn = s;
                    if (s > mx) mx = s;
                }
                var cx2 = wave.width - WAVE_STEP + c + 0.5;
                var y1 = center - Math.min((mx - 128) / 128 * wScale, 1) * center;
                var y2 = center - Math.max((mn - 128) / 128 * wScale, -1) * center;
                if (y2 < y1 + 1) y2 = y1 + 1;
                waveCtx.beginPath();
                waveCtx.moveTo(cx2, y1);
                waveCtx.lineTo(cx2, y2);
                waveCtx.stroke();
            }
            ctx.drawImage(wave, WAVE_X + 1, 1);
        } else {
            // no audio yet: flat baseline
            ctx.strokeStyle = '#1f4a26';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(WAVE_X + 1, PLOT_H / 2);
            ctx.lineTo(W - 1, PLOT_H / 2);
            ctx.stroke();
        }
        timer = setTimeout(draw, 33);
    }

    function setVisible(on) {
        $scope.toggleClass('visible', on);
        if (on && !timer) draw();
        if (!on && timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    $('#owrx-rig-meter')
        .css('cursor', 'pointer')
        .attr('title', 'Toggle audio scope')
        .on('click', function () {
            var on = !$scope.hasClass('visible');
            setVisible(on);
            if (typeof LS !== 'undefined') LS.save('rig_scope', on);
        });

    // visible by default, click the meter to hide
    setVisible((typeof LS !== 'undefined' && LS.has('rig_scope'))
        ? LS.loadBool('rig_scope') : true);
};

Plugins.rig_skin.makeKey = function (label, title) {
    return $('<div>')
        .addClass('openwebrx-button owrx-rig-key')
        .attr('title', title)
        .append($('<span>').addClass('owrx-rig-key-led'))
        .append(label);
};

// momentary LED feedback for one-shot keys
Plugins.rig_skin.pulseKey = function ($key) {
    $key.addClass('highlighted');
    setTimeout(function () { $key.removeClass('highlighted'); }, 300);
};

// normalize wheel events to whole steps: high resolution wheels and
// trackpads fire many small deltas per notch, accumulate to 100 units
// (one classic mouse notch) per step
Plugins.rig_skin.wheelSteps = (function () {
    var acc = 0;
    return function (e) {
        var d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 300 : 1);
        // direction change drops the leftover so the first notch back counts
        if (acc !== 0 && (d > 0) !== (acc > 0)) acc = 0;
        acc += d;
        var n = Math.trunc(acc / 100);
        if (n) acc -= n * 100;
        return -n;
    };
})();

// NR and LOCK keys with status LEDs, left of the dial. NR mirrors the
// stock noise reduction toggle; LOCK freezes the dial against accidental
// tuning (useful on touch devices).
Plugins.rig_skin.createSideKeys = function ($line) {
    var makeKey = Plugins.rig_skin.makeKey;
    var pulse = Plugins.rig_skin.pulseKey;
    var $nr = makeKey('NR', 'Noise reduction on/off');
    var $lock = makeKey('LOCK', 'Lock the dial').addClass('owrx-rig-key-lock');
    var $ts = makeKey('TS', 'Tuning step');

    // an invisible select stretched over the TS key: tapping the key
    // opens the native picker with all steps, plus an AUTO entry that
    // follows the modulation mode
    var $orig = $('#openwebrx-tuning-step-listbox');
    if ($orig.length && typeof tuning_step_changed === 'function') {
        var $pick = $orig.clone().removeAttr('id onchange style').addClass('owrx-rig-ts-select');
        $pick.prepend($('<option>').val('auto').text('Auto'));

        function autoStepFor(mode, freq) {
            switch (mode) {
                case 'cw':
                case 'lsb':
                case 'usb':
                case 'freedv':
                    return 100;
                case 'am':
                case 'sam':
                    return freq > 0 && freq < 2000000 ? 9000 : 5000;
                case 'nfm':
                case 'dmr':
                case 'ysf':
                case 'dstar':
                case 'nxdn':
                case 'm17':
                    return 12500;
                case 'wfm':
                    return 100000;
                default:
                    return 1000;
            }
        }

        var autoStep = typeof LS !== 'undefined' && LS.has('rig_ts_auto')
            ? LS.loadBool('rig_ts_auto') : false;
        var applying = false;

        // snap to the closest step the stock list actually offers
        function nearestStepOption(target) {
            var best = null, bestDiff = Infinity;
            $orig.find('option').each(function () {
                var v = parseInt(this.value);
                if (!isNaN(v) && Math.abs(v - target) < bestDiff) {
                    bestDiff = Math.abs(v - target);
                    best = this.value;
                }
            });
            return best;
        }

        function applyAutoStep() {
            if (!autoStep || typeof UI === 'undefined' || !UI.getModulation) return;
            var step = nearestStepOption(autoStepFor(UI.getModulation() || '', UI.getFrequency()));
            if (step && $orig.val() !== step) {
                applying = true;
                $orig.val(step);
                tuning_step_changed();
                applying = false;
            }
        }

        function setAutoStep(on) {
            autoStep = on;
            $ts.toggleClass('highlighted', on);
            if (typeof LS !== 'undefined') LS.save('rig_ts_auto', on);
            if (on) applyAutoStep();
        }

        $pick.val($orig.val());
        $pick.on('change', function () {
            if (this.value === 'auto') {
                // the LED turning on is the feedback, no pulse
                setAutoStep(true);
            } else {
                setAutoStep(false);
                $orig.val(this.value);
                tuning_step_changed();
                pulse($ts);
            }
        });
        $ts.append($pick);

        // follow changes made through the stock control or profile resets;
        // a manual step change anywhere disengages AUTO
        var origChanged = tuning_step_changed;
        tuning_step_changed = function () {
            origChanged();
            if (!applying && autoStep) setAutoStep(false);
            $pick.val(autoStep ? 'auto' : $orig.val());
        };
        if (typeof tuning_step_reset === 'function') {
            var origReset = tuning_step_reset;
            tuning_step_reset = function () {
                origReset();
                if (autoStep) applyAutoStep();
                $pick.val(autoStep ? 'auto' : $orig.val());
            };
        }

        // track mode changes
        setInterval(applyAutoStep, 500);
        setAutoStep(autoStep);
    }

    $nr.on('click', function () {
        if (typeof UI !== 'undefined' && typeof UI.toggleNR === 'function') UI.toggleNR();
    });

    // sync the NR LED with every state change, from this key or elsewhere
    if (typeof UI !== 'undefined' && typeof UI.toggleNR === 'function') {
        var origToggleNR = UI.toggleNR;
        UI.toggleNR = function (on) {
            var res = origToggleNR.call(this, on);
            $nr.toggleClass('highlighted', !!UI.nrEnabled);
            return res;
        };
        $nr.toggleClass('highlighted', !!UI.nrEnabled);
    }

    function applyLock(locked) {
        Plugins.rig_skin.dialLocked = locked;
        $lock.toggleClass('highlighted', locked);
        $('#owrx-rig-knob').toggleClass('locked', locked);
    }

    applyLock((typeof LS !== 'undefined' && LS.has('rig_dial_lock'))
        ? LS.loadBool('rig_dial_lock') : false);

    $lock.on('click', function () {
        applyLock(!Plugins.rig_skin.dialLocked);
        if (typeof LS !== 'undefined') LS.save('rig_dial_lock', Plugins.rig_skin.dialLocked);
    });

    // LOCK lives in the third column; created here because the lock
    // logic belongs with the dial code
    Plugins.rig_skin._lockKey = $lock;

    $line.append(
        $('<div>').attr('id', 'owrx-rig-keys-left')
            .append($nr).append($ts)
            .append(Plugins.rig_skin.makeZoomRow())
    );
};

// SCAN, SQL and MW keys right of the dial. SCAN runs the stock bookmark
// scanner (otherwise only reachable by right-clicking the squelch button),
// SQL auto-sets the squelch level, MW opens the bookmark editor at the
// tuned frequency.
Plugins.rig_skin.createScanKeys = function ($line) {
    var makeKey = Plugins.rig_skin.makeKey;
    var pulse = Plugins.rig_skin.pulseKey;

    var $scan = makeKey('SCAN', 'Scan bookmarks, stop where the squelch opens')
        .addClass('owrx-rig-key-scan');
    var $sql = makeKey('SQL', 'Squelch on/off (level is set automatically)');
    var $mw = makeKey('MW', 'Write a bookmark at the current frequency');

    $scan.on('click', function () {
        if (typeof UI !== 'undefined' && typeof UI.toggleScanner === 'function') UI.toggleScanner();
    });

    // sync the SCAN LED with every state change, incl. auto-stop on tuning
    if (typeof UI !== 'undefined' && typeof UI.toggleScanner === 'function') {
        var origToggleScanner = UI.toggleScanner;
        UI.toggleScanner = function (on) {
            var res = origToggleScanner.call(this, on);
            var running = typeof scanner !== 'undefined' && scanner && scanner.isRunning();
            $scan.toggleClass('highlighted', !!running);
            return res;
        };
    }

    // SQL is a toggle: ON auto-sets the squelch level from the current
    // signal, OFF drops the slider to minimum (squelch fully open)
    function getSquelchSlider() {
        return $('#openwebrx-panel-receiver .openwebrx-squelch-slider');
    }

    function squelchEngaged() {
        var $s = getSquelchSlider();
        return $s.length > 0 && Number($s.val()) > Number($s.attr('min'));
    }

    function syncSql() {
        $sql.toggleClass('highlighted', squelchEngaged());
    }

    $sql.on('click', function () {
        if (squelchEngaged()) {
            var $s = getSquelchSlider();
            $s.val($s.attr('min')).trigger('change');
        } else {
            $('#openwebrx-panel-receiver .openwebrx-squelch-auto').trigger('click');
        }
        syncSql();
    });

    // follow manual slider moves too
    $(document).on('change input', '.openwebrx-squelch-slider', syncSql);
    syncSql();

    $mw.on('click', function () {
        $('#openwebrx-panel-receiver .openwebrx-bookmark-button').trigger('click');
        pulse($mw);
    });

    // PROP and SAT open the extra LCD screens; their LEDs follow
    var $propKey = makeKey('PROP', 'HF propagation screen');
    var $satKey = makeKey('SAT', 'Satellite passes screen');
    Plugins.rig_skin._propKey = $propKey;
    Plugins.rig_skin._satKey = $satKey;
    $propKey.on('click', function () {
        if (Plugins.rig_skin._propToggle) Plugins.rig_skin._propToggle();
    });
    $satKey.on('click', function () {
        if (Plugins.rig_skin._satToggle) Plugins.rig_skin._satToggle();
    });

    // auto tune: snap the VFO onto the strongest signal near the
    // current frequency, like a rig's auto tune key
    var $auto = makeKey('AUTO', 'Auto tune: snap to the nearest signal');
    $auto.on('click', function () {
        pulse($auto);
        var data = Plugins.rig_skin._lastFft;
        if (!data || typeof UI === 'undefined' || typeof center_freq === 'undefined') return;
        var demod = UI.getDemodulator ? UI.getDemodulator() : null;
        var bw = demod && typeof demod.high_cut === 'number' && typeof demod.low_cut === 'number'
            ? demod.high_cut - demod.low_cut : 3000;
        var search = Math.max(5000, bw * 1.5);
        var off = UI.getFrequency() - center_freq;
        var hzPerBin = bandwidth / data.length;
        var b0 = Math.max(0, Math.floor((off - search) / hzPerBin + data.length / 2));
        var b1 = Math.min(data.length - 1, Math.ceil((off + search) / hzPerBin + data.length / 2));
        var best = b0;
        for (var b = b0; b <= b1; b++) {
            if (data[b] > data[best]) best = b;
        }
        // centroid over the neighbors for sub-bin accuracy
        var num = 0, den = 0;
        for (var n = Math.max(0, best - 2); n <= Math.min(data.length - 1, best + 2); n++) {
            var w = Math.pow(10, data[n] / 10);
            num += n * w;
            den += w;
        }
        var bin = den > 0 ? num / den : best;
        var f = center_freq + (bin - data.length / 2) * hzPerBin;
        UI.setFrequency(Math.round(f / 10) * 10, false);
    });

    // quick mute, LED lit while muted
    var $mute = makeKey('MUTE', 'Mute audio');
    $mute.on('click', function () {
        if (typeof UI !== 'undefined' && typeof UI.toggleMute === 'function') UI.toggleMute();
    });
    if (typeof UI !== 'undefined' && typeof UI.toggleMute === 'function') {
        var origToggleMute = UI.toggleMute;
        UI.toggleMute = function (on) {
            var res = origToggleMute.call(this, on);
            $mute.toggleClass('highlighted', UI.volumeMuted >= 0);
            return res;
        };
        $mute.toggleClass('highlighted', UI.volumeMuted >= 0);
    }

    // MUTE sits top left; LOCK leads the first right column and SCAN
    // moves to the third column
    $('#owrx-rig-keys-left').prepend($mute);

    $line.append(
        $('<div>').attr('id', 'owrx-rig-keys-right')
            .append(Plugins.rig_skin._lockKey).append($sql).append($mw)
            .append(Plugins.rig_skin.makePageRow())
    ).append(
        $('<div>').attr('id', 'owrx-rig-keys-right2')
            .append($scan)
            .append($propKey)
            .append($satKey)
            .append($auto)
    );
};

// Horizontal segmented S-meter (rig style), drawn into the frequency
// LCD window, replacing the bar meter when the rig theme is active.
// Fed by wrapping setSmeterRelativeValue(), which receives the same
// normalized 0..1 level that drives the bar.
Plugins.rig_skin.createMeter = function ($freq) {
    if (typeof setSmeterRelativeValue !== 'function' || !$freq.length) return;

    var W = 340, H = 34;
    var canvas = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    $freq.append($('<div>').attr('id', 'owrx-rig-meter').append(canvas));

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var S9 = 0.65;                       // bar position of S9, red zone beyond
    var SEG = 34, SEGW = 8, GAP = 2;     // segment geometry, SEG*(SEGW+GAP) == W
    var BAR_Y = 18, BAR_H = 12;

    function segColor(t) {
        return t > S9 ? '#ff4a33' : '#e8ecef';
    }

    function drawScale() {
        ctx.clearRect(0, 0, W, H);
        ctx.font = 'bold 11px roboto-mono, monospace';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#aab4bd';
        ctx.fillText('S', 0, 1);

        var marks = [];
        for (var s = 1; s <= 9; s += 2) marks.push({ t: s / 9 * S9, label: '' + s });
        [20, 40, 60].forEach(function (db, i) {
            marks.push({ t: S9 + (i + 1) / 3 * (1 - S9), label: '' + db });
        });

        marks.forEach(function (m) {
            var x = Math.min(m.t * W, W - 1);
            ctx.fillStyle = segColor(m.t);
            ctx.textAlign = x > W - 12 ? 'right' : 'center';
            ctx.fillText(m.label, x, 1);
            ctx.fillRect(x - 0.5, 14, 1, 3);
        });
    }

    var target = 0, current = 0, peak = 0, peakT = 0, lastT = null, anim = null;

    function draw() {
        drawScale();
        var lit = Math.round(current * SEG);
        for (var i = 0; i < SEG; i++) {
            ctx.fillStyle = i < lit ? segColor((i + 0.5) / SEG) : '#161c22';
            ctx.fillRect(i * (SEGW + GAP), BAR_Y, SEGW, BAR_H);
        }
        // peak-hold segment
        var pk = Math.round(peak * SEG);
        if (pk > lit) {
            ctx.fillStyle = segColor((pk - 0.5) / SEG);
            ctx.fillRect((pk - 1) * (SEGW + GAP), BAR_Y, SEGW, BAR_H);
        }
    }

    // 30fps timer instead of requestAnimationFrame: plenty for a damped
    // bar, and keeps ticking under throttled/headless frame pumps
    function tick() {
        var t = performance.now();
        if (lastT !== null) {
            var dt = t - lastT;
            // meter ballistics: fast attack, slow decay
            var tau = target > current ? 60 : 250;
            current += (target - current) * (1 - Math.exp(-dt / tau));
            if (current >= peak) {
                peak = current;
                peakT = t;
            } else if (t - peakT > 1000) {
                // peak-hold expired, let the peak segment fall
                peak = Math.max(current, peak - dt * 0.0005);
            }
        }
        lastT = t;
        if (Math.abs(target - current) < 0.002 && peak - current < 0.002) {
            current = target;
            peak = Math.max(peak, current);
            draw();
            anim = null;
            return;
        }
        draw();
        anim = setTimeout(tick, 33);
    }

    Plugins.rig_skin.setMeterTarget = function (value) {
        Plugins.rig_skin._sLevel = Math.max(0, Math.min(1, value));
        target = Math.max(0, Math.min(1, value));
        if (!anim) {
            lastT = null;
            anim = setTimeout(tick, 0);
        }
    };

    var origSetSmeter = setSmeterRelativeValue;
    setSmeterRelativeValue = function (value) {
        origSetSmeter(value);
        Plugins.rig_skin.setMeterTarget(value);
    };

    draw();
};

Plugins.rig_skin.createKnob = function ($line) {
    var $face = $('<div>').addClass('owrx-rig-knob-face')
        .append($('<div>').addClass('owrx-rig-knob-dimple'));
    var $knob = $('<div>').attr('id', 'owrx-rig-knob')
        .attr('title', 'VFO dial: drag, flick or scroll to tune')
        .append($('<div>').addClass('owrx-rig-knob-ring'))
        .append($face);
    $knob.toggleClass('locked', !!Plugins.rig_skin.dialLocked);
    $line.append($knob);

    var knob = $knob[0];
    var face = $face[0];

    var DEG_PER_STEP = 15;  // 24 tuning steps per revolution
    var angle = 0;          // visual rotation of the knob face
    var acc = 0;            // rotation not yet converted to tuning steps
    var dragging = false;
    var lastAngle = 0;      // pointer angle at the previous move event
    var lastTime = 0;       // timestamp of the previous move event
    var velocity = 0;       // angular velocity in deg/ms
    var spinning = null;    // flywheel animation frame handle

    function render() {
        face.style.transform = 'rotate(' + angle + 'deg)';
    }

    function pointerAngle(e) {
        var r = knob.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    function turnBy(delta) {
        angle += delta;
        acc += delta;
        var steps = Math.trunc(acc / DEG_PER_STEP);
        if (steps) {
            acc -= steps * DEG_PER_STEP;
            tuneBySteps(steps);
        }
        render();
    }

    function stopSpin() {
        if (spinning) {
            cancelAnimationFrame(spinning);
            spinning = null;
        }
    }

    // Flywheel: keep turning after release, with exponential decay
    function spin(v) {
        var prev = null;
        function frame(t) {
            if (Plugins.rig_skin.dialLocked) {
                spinning = null;
                return;
            }
            if (prev !== null) {
                var dt = t - prev;
                turnBy(v * dt);
                v *= Math.pow(0.994, dt);
                if (Math.abs(v) < 0.02) {
                    spinning = null;
                    return;
                }
            }
            prev = t;
            spinning = requestAnimationFrame(frame);
        }
        spinning = requestAnimationFrame(frame);
    }

    knob.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        stopSpin();
        if (Plugins.rig_skin.dialLocked) return;
        try { knob.setPointerCapture(e.pointerId); } catch (err) {}
        dragging = true;
        knob.classList.add('grabbing');
        lastAngle = pointerAngle(e);
        lastTime = e.timeStamp;
        velocity = 0;
    });

    knob.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var a = pointerAngle(e);
        var delta = a - lastAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        lastAngle = a;
        var dt = e.timeStamp - lastTime;
        lastTime = e.timeStamp;
        if (dt > 0) velocity = delta / dt;
        turnBy(delta);
    });

    knob.addEventListener('pointerup', function (e) {
        if (!dragging) return;
        dragging = false;
        knob.classList.remove('grabbing');
        // ignore stale velocity if the pointer paused before release
        if (e.timeStamp - lastTime > 100) return;
        if (Math.abs(velocity) < 0.2) return;
        spin(Math.max(-2.5, Math.min(2.5, velocity)));
    });

    knob.addEventListener('pointercancel', function () {
        dragging = false;
        knob.classList.remove('grabbing');
    });

    knob.addEventListener('wheel', function (e) {
        e.preventDefault();
        e.stopPropagation();
        stopSpin();
        if (Plugins.rig_skin.dialLocked) return;
        var steps = Plugins.rig_skin.wheelSteps(e);
        if (!steps) return;
        angle += steps * DEG_PER_STEP;
        render();
        tuneBySteps(steps);
    }, { passive: false });
};
