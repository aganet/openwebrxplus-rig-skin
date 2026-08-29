/*
 * rig_skin: dark receiver front-panel theme with a rotating VFO knob.
 *
 * Author: SV1DOD / HB9ISH
 *
 * Adds a "Rig" entry to the theme selector. When active, the receiver
 * panel is skinned as a rig front panel and a tuning knob appears below
 * the frequency display. Drag, flick or scroll the knob to tune; each
 * knob step follows the tuning step selector.
 */

Plugins.rig_skin._version = '0.10.0';
Plugins.rig_skin._author = 'SV1DOD / HB9ISH';

// where this script was loaded from, for fetching companion files
// (works for both local and remote plugin installs)
Plugins.rig_skin._base = (function () {
    var src = (document.currentScript && document.currentScript.src) || '';
    return src.replace(/[^\/]*$/, '');
})();


// the stock loader would fetch the stylesheet with a plain URL that
// mobile browsers cache across releases; load it here with the version
// appended instead, so every release refreshes the CSS everywhere
Plugins.rig_skin.no_css = true;

Plugins.rig_skin.init = function () {
    $('<link>', {
        rel: 'stylesheet',
        href: Plugins.rig_skin._base + 'rig_skin.css?v=' + Plugins.rig_skin._version
    }).appendTo('head');

    // the loader fetches rig_skin.js with a plain URL that browsers
    // cache across releases; revalidate it in the background (at most
    // once an hour) so a normal reload picks up a new build without
    // clearing the cache. A new build carries a new version, which in
    // turn refreshes the CSS above.
    try {
        var reval = parseInt(localStorage.getItem('rig_skin_revalidate') || '0', 10);
        if (Date.now() - reval > 3600000) {
            localStorage.setItem('rig_skin_revalidate', '' + Date.now());
            ['rig_skin.js', 'rig_skin_map.js'].forEach(function (f) {
                fetch(Plugins.rig_skin._base + f, { cache: 'no-cache', mode: 'no-cors' })
                    .catch(function () {});
            });
        }
    } catch (e) {}

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
    Plugins.rig_skin.createDxWindow();
    Plugins.rig_skin.createSatWindow();
    Plugins.rig_skin.createSpotRibbon();
    try { Plugins.rig_skin.createPwa(); } catch (e) {}
    return true;
};

// Install-to-home-screen: a runtime web app manifest, so the receiver
// installs like an app and opens fullscreen on tablets and phones (a
// wall-mounted rig with no browser chrome). The icon is the rig dial,
// drawn at runtime. Browsers only offer installation on secure origins
// (https or localhost); on iOS the meta tags below give the fullscreen
// home-screen app on any origin.
Plugins.rig_skin.createPwa = function () {
    // never fight a manifest the operator already ships
    if (document.querySelector('link[rel="manifest"]')) return;

    function icon(size) {
        var c = document.createElement('canvas');
        c.width = c.height = size;
        var x = c.getContext('2d');
        var u = size / 64;                    // design units on a 64px grid
        x.fillStyle = '#15181c';
        x.beginPath();
        if (x.roundRect) x.roundRect(0, 0, size, size, 12 * u);
        else x.rect(0, 0, size, size);
        x.fill();
        // bezel ring
        var g = x.createLinearGradient(0, 0, size, size);
        g.addColorStop(0, '#9aa0a6');
        g.addColorStop(0.5, '#4a4f55');
        g.addColorStop(1, '#8f959b');
        x.strokeStyle = g;
        x.lineWidth = 5 * u;
        x.beginPath();
        x.arc(size / 2, size / 2, 22 * u, 0, 2 * Math.PI);
        x.stroke();
        // dial face and finger cup
        x.fillStyle = '#26292d';
        x.beginPath();
        x.arc(size / 2, size / 2, 19 * u, 0, 2 * Math.PI);
        x.fill();
        x.fillStyle = '#0c0e10';
        x.beginPath();
        x.arc(size / 2, size / 2 - 11 * u, 4.5 * u, 0, 2 * Math.PI);
        x.fill();
        return c.toDataURL('image/png');
    }

    var name = (document.title || '').split('|')[0].trim() || 'OpenWebRX+';
    var manifest = {
        name: name,
        short_name: name.length <= 12 ? name : name.slice(0, 12).trim(),
        start_url: location.origin + location.pathname,
        scope: location.origin + location.pathname,
        display: 'standalone',
        background_color: '#0d1013',
        theme_color: '#17191d',
        icons: [
            { src: icon(192), sizes: '192x192', type: 'image/png' },
            { src: icon(512), sizes: '512x512', type: 'image/png' }
        ]
    };
    $('<link>', {
        rel: 'manifest',
        href: 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest))
    }).appendTo('head');

    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
        $('<meta>', { name: 'apple-mobile-web-app-capable', content: 'yes' }).appendTo('head');
        $('<meta>', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }).appendTo('head');
    }
};

// DX cluster window: a DX button in the top banner (after Status) opens
// a floating window with live spots on a world map plus a click-to-tune
// list. Live spots stream from the HolyCluster network over a websocket;
// the backlog comes from its history API when reachable, from DXSummit
// on plain-http pages, and from a local cache of previous sessions.
Plugins.rig_skin.createDxWindow = function () {
    var HC = 'holycluster.iarc.org';
    var MAX_AGE = 60 * 60 * 1000;

    var spots = {};        // key -> normalized spot
    var open = false, sock = null, reconnect = null, tickTimer = null;
    var scopeFeed = false; // the band scope keeps the feed alive too
    var landLoading = false;

    function filterSetting(v) {
        if (v !== undefined && typeof LS !== 'undefined') LS.save('rig_dx_filter', v);
        return (typeof LS !== 'undefined' && LS.has('rig_dx_filter'))
            ? LS.loadStr('rig_dx_filter') : 'band';
    }

    // --- window DOM ---

    var $title = $('<span>').addClass('owrx-rig-dx-title').text('DX CLUSTER');
    // ACT toggles the band-activity chart (spots per band) over the
    // map+list view
    var showActivity = false;
    function setActivity(on) {
        showActivity = on;
        $act.toggleClass('on', on);
        $lcd.toggleClass('activity', on);
    }

    var $chips = {};
    ['band', 'hf', 'all'].forEach(function (k) {
        $chips[k] = $('<span>').addClass('owrx-rig-dx-chip').text(k.toUpperCase())
            .on('click', function () {
                // choosing a filter returns to the map+list from the chart
                setActivity(false);
                filterSetting(k);
                syncChips();
                render();
            });
    });
    var $act = $('<span>').addClass('owrx-rig-dx-chip owrx-rig-dx-act').text('ACT')
        .attr('title', 'Band activity: spots per band')
        .on('click', function () {
            setActivity(!showActivity);
            render();
        });
    var showBeacons = (typeof LS !== 'undefined' && LS.has('rig_dx_beacons'))
        ? LS.loadBool('rig_dx_beacons') : false;
    var $bcn = $('<span>').addClass('owrx-rig-dx-chip').text('BCN')
        .attr('title', 'NCDXF/IARU beacons on the map; colored by the beacon radar grades, click one to listen')
        .toggleClass('on', showBeacons)
        .on('click', function () {
            showBeacons = !showBeacons;
            $bcn.toggleClass('on', showBeacons);
            if (typeof LS !== 'undefined') LS.save('rig_dx_beacons', showBeacons);
            render();
        });
    var $count = $('<span>').addClass('owrx-rig-dx-count');
    var $close = $('<span>').addClass('owrx-rig-dx-close').html('&#x2715;')
        .on('click', function () { setOpen(false); });
    var $hdr = $('<div>').addClass('owrx-rig-dx-hdr')
        .append($title).append($chips.band).append($chips.hf).append($chips.all)
        .append($act).append($bcn).append($count).append($close);

    var canvas = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    var mctx = canvas.getContext('2d');
    var MW, MH;

    function sizeCanvas(w) {
        MW = w;
        MH = Math.round(w / 2);       // 2:1 equirectangular
        canvas.width = MW * dpr;
        canvas.height = MH * dpr;
        mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // activity chart canvas: bars of spots-per-band with a trend sparkline
    var actCanvas = document.createElement('canvas');
    var actCtx = actCanvas.getContext('2d');
    var AW, AH;
    function sizeActCanvas(w, h) {
        AW = w; AH = h;
        actCanvas.width = AW * dpr;
        actCanvas.height = AH * dpr;
        actCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    var $list = $('<table>').addClass('owrx-rig-dx-list');
    var $lcd = $('<div>').addClass('owrx-rig-dx-lcd')
        .append(canvas).append(actCanvas).append($list);
    var $foot = $('<div>').addClass('owrx-rig-dx-foot')
        .append($('<span>').text('scroll to zoom, drag to pan, click to tune'))
        .append($('<span>').addClass('owrx-rig-dx-src').text('HolyCluster'));
    var $grip = $('<div>').addClass('owrx-rig-dx-grip');
    var $win = $('<div>').attr('id', 'owrx-rig-dx')
        .append($hdr).append($lcd).append($foot).append($grip).appendTo('body');

    // window size: persisted, resizable by the corner grip; the map
    // canvas is re-rendered at the new resolution
    var winW = 400, listH = 300;
    if (window.innerWidth >= 1200) { winW = 480; listH = 340; }
    try {
        if (typeof LS !== 'undefined' && LS.has('rig_dx_size')) {
            var sz = JSON.parse(LS.loadStr('rig_dx_size'));
            winW = sz.w || winW;
            listH = sz.h || listH;
        }
    } catch (e) {}

    function applySize() {
        winW = Math.min(Math.max(winW, 340), 1100);
        listH = Math.min(Math.max(listH, 120), 800);
        $win.css('width', winW + 'px');
        $list.css('max-height', listH + 'px');
        sizeCanvas(winW - 32);        // panel + lcd padding
        // the activity chart fills the same box as the map + a slice of
        // the list area, so the whole window becomes the chart
        sizeActCanvas(winW - 32, MH + Math.min(listH, 220));
    }
    applySize();

    (function () {
        var sx, sy, w0, h0, sizing = false;
        function point(e) {
            var t = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
            return [t.clientX, t.clientY];
        }
        $grip.on('mousedown touchstart', function (e) {
            var pt = point(e);
            sx = pt[0]; sy = pt[1]; w0 = winW; h0 = listH;
            sizing = true;
            e.preventDefault();
            e.stopPropagation();
        });
        $(document).on('mousemove touchmove', function (e) {
            if (!sizing) return;
            var pt = point(e);
            winW = w0 + pt[0] - sx;
            listH = h0 + pt[1] - sy;
            applySize();
            render();
        });
        $(document).on('mouseup touchend', function () {
            if (!sizing) return;
            sizing = false;
            if (typeof LS !== 'undefined') {
                LS.save('rig_dx_size', JSON.stringify({ w: winW, h: listH }));
            }
        });
    })();

    // restore position, kept inside the viewport
    try {
        if (typeof LS !== 'undefined' && LS.has('rig_dx_pos')) {
            var p = JSON.parse(LS.loadStr('rig_dx_pos'));
            $win.css({
                left: Math.min(Math.max(p.left, 0), window.innerWidth - 60) + 'px',
                top: Math.min(Math.max(p.top, 0), window.innerHeight - 60) + 'px'
            });
        }
    } catch (e) {}

    // drag by the header
    (function () {
        var sx, sy, ox, oy, moving = false;
        function point(e) {
            var t = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
            return [t.clientX, t.clientY];
        }
        $hdr.on('mousedown touchstart', function (e) {
            if ($(e.target).is('.owrx-rig-dx-chip, .owrx-rig-dx-close')) return;
            var pt = point(e), off = $win.offset();
            sx = pt[0]; sy = pt[1];
            ox = off.left - $(window).scrollLeft();
            oy = off.top - $(window).scrollTop();
            moving = true;
            e.preventDefault();
        });
        $(document).on('mousemove touchmove', function (e) {
            if (!moving) return;
            var pt = point(e);
            $win.css({ left: (ox + pt[0] - sx) + 'px', top: (oy + pt[1] - sy) + 'px' });
        });
        $(document).on('mouseup touchend', function () {
            if (!moving) return;
            moving = false;
            if (typeof LS !== 'undefined') {
                var o = $win.position();
                LS.save('rig_dx_pos', JSON.stringify({ left: o.left, top: o.top }));
            }
        });
    })();

    // --- header button, after Status ---

    var $btn = $('<div>').addClass('button').attr('id', 'owrx-rig-dx-button')
        .html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">' +
            '<circle cx="12" cy="12" r="9"/>' +
            '<path d="M3 12h18M12 3c-2.5 2.5-3.8 5.6-3.8 9s1.3 6.5 3.8 9m0-18c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9"/>' +
            '</svg><br/>DX')
        .attr('title', 'DX cluster spots')
        .on('click', function () { setOpen(!open); });
    var $status = $('.openwebrx-main-buttons [data-toggle-panel="openwebrx-panel-status"]');
    if ($status.length) $status.after($btn);
    else $('.openwebrx-main-buttons').append($btn);

    // --- spot handling ---

    function normKey(s) {
        return s.call + '|' + Math.round(s.freq / 100);
    }

    function addSpots(raw) {
        var now = Date.now();
        var added = false;
        raw.forEach(function (r) {
            if (!r || !r.dx_callsign || !r.freq) return;
            var s = {
                call: r.dx_callsign,
                freq: Math.round(r.freq * 1000),      // kHz -> Hz
                mode: (r.mode || '').toUpperCase(),
                time: Math.round(r.time * 1000),      // s -> ms
                loc: (r.dx_loc && r.dx_loc.length === 2) ? r.dx_loc : null,
                cont: r.dx_continent || '',
                spotter: r.spotter_callsign || '',
                comment: (r.comment || '').trim()
            };
            if (!s.time || now - s.time > MAX_AGE) return;
            var k = normKey(s);
            if (!spots[k] || spots[k].time < s.time) {
                spots[k] = s;
                added = true;
            }
        });
        if (added && open) render();
    }

    function prune() {
        var now = Date.now();
        Object.keys(spots).forEach(function (k) {
            if (now - spots[k].time > MAX_AGE) delete spots[k];
        });
    }

    function saveCache() {
        if (typeof LS === 'undefined') return;
        prune();
        var list = sorted().slice(0, 150);
        try { LS.save('rig_dx_cache', JSON.stringify(list)); } catch (e) {}
    }

    function loadCache() {
        try {
            var list = JSON.parse(LS.loadStr('rig_dx_cache'));
            var now = Date.now();
            list.forEach(function (s) {
                if (s && s.call && now - s.time < MAX_AGE) spots[normKey(s)] = s;
            });
        } catch (e) {}
    }

    function sorted() {
        return Object.keys(spots).map(function (k) { return spots[k]; })
            .sort(function (a, b) { return b.time - a.time; });
    }

    function currentBand() {
        if (typeof bandplan === 'undefined' || !bandplan || !bandplan.bands ||
            typeof UI === 'undefined') return null;
        var f = UI.getFrequency();
        for (var i = 0; i < bandplan.bands.length; i++) {
            var b = bandplan.bands[i];
            if (f >= b.low_bound && f <= b.high_bound) return b;
        }
        return null;
    }

    function filtered() {
        var mode = filterSetting(), band = currentBand();
        prune();
        return sorted().filter(function (s) {
            if (mode === 'hf') return s.freq <= 30000000;
            if (mode === 'band') {
                if (!band) return s.freq <= 30000000;
                return s.freq >= band.low_bound && s.freq <= band.high_bound;
            }
            return true;
        });
    }

    function syncChips() {
        var mode = filterSetting(), band = currentBand();
        $chips.band.text(band && band.name ? band.name : 'BAND');
        Object.keys($chips).forEach(function (k) {
            $chips[k].toggleClass('on', k === mode);
        });
    }

    // demodulator to use for a spot
    function spotMode(s) {
        switch (s.mode) {
            case 'CW': return 'cw';
            case 'FM': return 'nfm';
            case 'SSB': case '':
                // LSB below 10 MHz except 60 m, USB above
                return (s.freq < 10000000 && !(s.freq > 5200000 && s.freq < 5500000))
                    ? 'lsb' : 'usb';
            default: return 'usb';   // FT8/FT4/RTTY/DIGI
        }
    }

    function tuneSpot(s) {
        Plugins.rig_skin.tuneTo(s.freq, spotMode(s));
        // refresh highlights once the retune has settled
        setTimeout(render, 800);
        setTimeout(render, 3000);
    }

    function listening(s) {
        return typeof UI !== 'undefined' && Math.abs(UI.getFrequency() - s.freq) < 2000;
    }

    function inWindow(s) {
        return typeof center_freq !== 'undefined' &&
            Math.abs(s.freq - center_freq) < bandwidth / 2;
    }

    // bearing and distance from the receiver
    function qth() {
        var p = (typeof Utils !== 'undefined' && Utils.getReceiverPos) ? Utils.getReceiverPos() : null;
        return (p && typeof p.lat === 'number') ? p : null;
    }

    function bearingDist(loc) {
        var p = qth();
        if (!p || !loc) return null;
        var toR = Math.PI / 180;
        var f1 = p.lat * toR, f2 = loc[1] * toR, dl = (loc[0] - p.lon) * toR;
        var y = Math.sin(dl) * Math.cos(f2);
        var x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
        var brg = (Math.atan2(y, x) / toR + 360) % 360;
        var d = 6371 * Math.acos(Math.min(1,
            Math.sin(f1) * Math.sin(f2) + Math.cos(f1) * Math.cos(f2) * Math.cos(dl)));
        return [Math.round(brg), d < 1500 ? Math.round(d) + 'km' : (d / 1000).toFixed(1) + 'Mm'];
    }

    function ageText(t) {
        var m = Math.max(0, Math.round((Date.now() - t) / 60000));
        return m < 60 ? m + 'm' : Math.round(m / 60) + 'h';
    }

    // --- rendering ---

    function renderList(list) {
        $list.empty();
        list.slice(0, 30).forEach(function (s) {
            var bd = bearingDist(s.loc);
            var $tr = $('<tr>').addClass('owrx-rig-dx-spot')
                .toggleClass('listening', listening(s))
                .attr('title', (s.spotter ? 'de ' + s.spotter : '') +
                    (s.comment ? ': ' + s.comment : ''))
                .on('click', function () { tuneSpot(s); });
            $tr.append($('<td>').addClass('age').text(ageText(s.time)));
            $tr.append($('<td>').addClass('call').text(s.call));
            $tr.append($('<td>').addClass('freq').toggleClass('inwin', inWindow(s))
                .text((s.freq / 1000000).toFixed(4)));
            $tr.append($('<td>').addClass('mode').text(s.mode));
            $tr.append($('<td>').addClass('brg').text(bd ? bd[0] + '° ' + bd[1] : ''));
            $tr.append($('<td>').addClass('cty').text(s.cont));
            $list.append($tr);
        });
    }

    var pinBoxes = [];   // [x, y, spot] for click hit-testing

    // map view transform: zoom (1 = whole world) and pan offset in
    // canvas pixels. lonlat -> base equirectangular -> zoomed/panned.
    var mapZoom = 1, mapPanX = 0, mapPanY = 0;

    function clampPan() {
        // keep the world filling the canvas, no empty margins
        var minX = MW - MW * mapZoom, minY = MH - MH * mapZoom;
        mapPanX = Math.min(0, Math.max(minX, mapPanX));
        mapPanY = Math.min(0, Math.max(minY, mapPanY));
    }

    function px(lat, lon) {
        var bx = (lon + 180) / 360 * MW;
        var by = (90 - lat) / 180 * MH;
        return [bx * mapZoom + mapPanX, by * mapZoom + mapPanY];
    }

    function greatCircle(a, b) {
        var toR = Math.PI / 180;
        var f1 = a[0] * toR, l1 = a[1] * toR, f2 = b[0] * toR, l2 = b[1] * toR;
        var d = 2 * Math.asin(Math.sqrt(
            Math.pow(Math.sin((f2 - f1) / 2), 2) +
            Math.cos(f1) * Math.cos(f2) * Math.pow(Math.sin((l2 - l1) / 2), 2)));
        if (!d) return [];
        var pts = [];
        for (var t = 0; t <= 1.0001; t += 0.03) {
            var A = Math.sin((1 - t) * d) / Math.sin(d), B = Math.sin(t * d) / Math.sin(d);
            var x = A * Math.cos(f1) * Math.cos(l1) + B * Math.cos(f2) * Math.cos(l2);
            var y = A * Math.cos(f1) * Math.sin(l1) + B * Math.cos(f2) * Math.sin(l2);
            var z = A * Math.sin(f1) + B * Math.sin(f2);
            pts.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / toR, Math.atan2(y, x) / toR]);
        }
        return pts;
    }

    function renderMap(list) {
        pinBoxes = [];
        clampPan();
        mctx.fillStyle = '#0a2436';
        mctx.fillRect(0, 0, MW, MH);

        mctx.strokeStyle = 'rgba(120,190,255,0.06)';
        mctx.lineWidth = 0.5;
        var lon, lat;
        for (lon = -150; lon < 180; lon += 30) {
            mctx.beginPath();
            mctx.moveTo(px(90, lon)[0], 0);
            mctx.lineTo(px(-90, lon)[0], MH);
            mctx.stroke();
        }
        for (lat = -60; lat < 90; lat += 30) {
            mctx.beginPath();
            mctx.moveTo(0, px(lat, 0)[1]);
            mctx.lineTo(MW, px(lat, 0)[1]);
            mctx.stroke();
        }

        if (Plugins.rig_skin._land) {
            mctx.fillStyle = '#2c4658';
            Plugins.rig_skin._land.forEach(function (poly) {
                // a polygon segment that jumps more than half the map
                // width is an antimeridian wrap: lift the pen so it does
                // not draw a streak straight across the map. Fill only,
                // no stroke (the stroke was what streaked).
                mctx.beginPath();
                var prevX = null;
                poly.forEach(function (pt) {
                    var p = px(pt[1], pt[0]);
                    if (prevX !== null && Math.abs(p[0] - prevX) > MW * mapZoom / 2) {
                        mctx.moveTo(p[0], p[1]);
                    } else {
                        prevX === null ? mctx.moveTo(p[0], p[1]) : mctx.lineTo(p[0], p[1]);
                    }
                    prevX = p[0];
                });
                mctx.fill();
            });
        }

        // day/night terminator from the current sun position
        var now = new Date();
        var doy = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
            Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000;
        var decl = -23.44 * Math.cos(2 * Math.PI / 365 * (doy + 10)) * Math.PI / 180;
        var utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
        var sunLon = (12 - utcH) * 15;
        mctx.fillStyle = 'rgba(0,0,12,0.30)';
        mctx.beginPath();
        var north = decl > 0;
        for (var x = 0; x <= MW; x += 4) {
            lon = x / MW * 360 - 180;
            var H0 = (lon - sunLon) * Math.PI / 180;
            lat = Math.atan(-Math.cos(H0) / Math.tan(decl)) * 180 / Math.PI;
            var p = px(lat, lon);
            x ? mctx.lineTo(p[0], p[1]) : mctx.moveTo(p[0], p[1]);
        }
        // the dark cap is on the winter side
        mctx.lineTo(MW, north ? MH : 0);
        mctx.lineTo(0, north ? MH : 0);
        mctx.closePath();
        mctx.fill();

        var p0 = qth();
        var mapped = list.filter(function (s) { return s.loc; }).slice(0, 60);

        if (p0) {
            mctx.lineWidth = 0.8;
            mapped.forEach(function (s) {
                var on = listening(s);
                mctx.strokeStyle = on ? 'rgba(58,219,74,0.8)' : 'rgba(90,168,255,0.28)';
                mctx.beginPath();
                var pv = null;
                greatCircle([p0.lat, p0.lon], [s.loc[1], s.loc[0]]).forEach(function (pt) {
                    var p = px(pt[0], pt[1]);
                    if (pv !== null && Math.abs(p[0] - pv) > MW / 2) mctx.moveTo(p[0], p[1]);
                    else pv === null ? mctx.moveTo(p[0], p[1]) : mctx.lineTo(p[0], p[1]);
                    pv = p[0];
                });
                mctx.stroke();
            });
        }

        var labeled = false;
        mapped.forEach(function (s) {
            var p = px(s.loc[1], s.loc[0]);
            var on = listening(s);
            mctx.fillStyle = on ? '#3adb4a' : '#ffb238';
            mctx.beginPath();
            mctx.arc(p[0], p[1], 2.4, 0, 7);
            mctx.fill();
            mctx.strokeStyle = 'rgba(0,0,0,0.7)';
            mctx.lineWidth = 0.7;
            mctx.stroke();
            pinBoxes.push([p[0], p[1], s]);
            if (on && !labeled) {
                labeled = true;
                mctx.font = 'bold 8px monospace';
                mctx.fillStyle = '#3adb4a';
                mctx.shadowColor = '#000';
                mctx.shadowBlur = 3;
                mctx.fillText(s.call, p[0] + 5, p[1] - 4);
                mctx.shadowBlur = 0;
            }
        });

        if (p0) {
            var q = px(p0.lat, p0.lon);
            mctx.fillStyle = '#ff5148';
            mctx.beginPath();
            mctx.arc(q[0], q[1], 2.8, 0, 7);
            mctx.fill();
            mctx.strokeStyle = '#ffffff';
            mctx.lineWidth = 0.8;
            mctx.stroke();
        }

        // NCDXF beacons as diamonds, so they read differently from the
        // round spot pins; filled with the radar's grade when measured,
        // and the one transmitting right now gets a ring
        if (showBeacons && Plugins.rig_skin._beacons) {
            var bc = Plugins.rig_skin._beacons;
            var st = bc.state();
            var bandFreq = st.band >= 0 ? bc.freqs[st.band] : bc.freqs[0];
            bc.loc.forEach(function (ll, i) {
                var p = px(ll[1], ll[0]);
                var d = st.data[i];
                var color = !d ? '#8f959b' : d.snr >= 14 ? '#3adb4a'
                    : d.snr >= 8 ? '#f0c040' : '#5b656e';
                mctx.strokeStyle = color;
                mctx.lineWidth = 1.4;
                mctx.beginPath();
                mctx.moveTo(p[0], p[1] - 4);
                mctx.lineTo(p[0] + 4, p[1]);
                mctx.lineTo(p[0], p[1] + 4);
                mctx.lineTo(p[0] - 4, p[1]);
                mctx.closePath();
                if (d && d.snr >= 8) {
                    mctx.fillStyle = color;
                    mctx.fill();
                }
                mctx.stroke();
                if (st.band >= 0 && i === st.active) {
                    mctx.strokeStyle = '#5db8ff';
                    mctx.lineWidth = 1;
                    mctx.beginPath();
                    mctx.arc(p[0], p[1], 7, 0, 2 * Math.PI);
                    mctx.stroke();
                }
                pinBoxes.push([p[0], p[1], {
                    call: bc.calls[i][0], freq: bandFreq, mode: 'CW',
                    loc: ll, cont: bc.calls[i][1], time: Date.now()
                }]);
            });
        }

    }

    // canvas coordinates from a pointer event
    function canvasXY(e) {
        var r = canvas.getBoundingClientRect();
        return [(e.clientX - r.left) * MW / r.width, (e.clientY - r.top) * MH / r.height];
    }

    // nearest spot pin to a canvas point, within a pixel radius
    function pinAt(cx, cy) {
        var best = null, bd = 9 * 9;
        pinBoxes.forEach(function (b) {
            var d = (b[0] - cx) * (b[0] - cx) + (b[1] - cy) * (b[1] - cy);
            if (d < bd) { bd = d; best = b[2]; }
        });
        return best;
    }

    // floating callsign tooltip over the map
    var $tip = $('<div>').addClass('owrx-rig-dx-tip').appendTo($lcd);
    function showTip(spot, clientX, clientY) {
        if (!spot) { $tip.removeClass('show'); return; }
        var bd = bearingDist(spot.loc);
        $tip.html(spot.call + (bd ? '<br>' + bd[0] + '&deg; ' + bd[1] : '') +
            (spot.cont ? '<br>' + spot.cont : ''));
        var lr = $lcd[0].getBoundingClientRect();
        $tip.css({ left: (clientX - lr.left + 10) + 'px', top: (clientY - lr.top + 10) + 'px' })
            .addClass('show');
    }

    // wheel zoom toward the cursor
    $(canvas).on('wheel', function (e) {
        e.preventDefault();
        var oe = e.originalEvent;
        var xy = canvasXY(oe);
        // world pixel under the cursor before zoom
        var wx = (xy[0] - mapPanX) / mapZoom, wy = (xy[1] - mapPanY) / mapZoom;
        var factor = oe.deltaY < 0 ? 1.25 : 0.8;
        mapZoom = Math.min(8, Math.max(1, mapZoom * factor));
        // keep that world pixel under the cursor
        mapPanX = xy[0] - wx * mapZoom;
        mapPanY = xy[1] - wy * mapZoom;
        clampPan();
        render();
    });

    // drag to pan; suppress the click that follows a real drag
    var dragging = false, dragStart = null, dragged = false;
    $(canvas).on('mousedown', function (e) {
        dragging = true; dragged = false;
        dragStart = [e.clientX, e.clientY, mapPanX, mapPanY];
    });
    $(document).on('mousemove.dxmap', function (e) {
        if (dragging) {
            var scale = MW / canvas.getBoundingClientRect().width;
            var nx = dragStart[2] + (e.clientX - dragStart[0]) * scale;
            var ny = dragStart[3] + (e.clientY - dragStart[1]) * scale;
            if (Math.abs(e.clientX - dragStart[0]) + Math.abs(e.clientY - dragStart[1]) > 3) dragged = true;
            mapPanX = nx; mapPanY = ny;
            clampPan();
            render();
            return;
        }
        // hover tooltip (only when the map view is showing)
        if (!open || showActivity) return;
        var xy = canvasXY(e);
        var lr = canvas.getBoundingClientRect();
        if (e.clientX < lr.left || e.clientX > lr.right || e.clientY < lr.top || e.clientY > lr.bottom) {
            $tip.removeClass('show');
            return;
        }
        var spot = pinAt(xy[0], xy[1]);
        $(canvas).css('cursor', spot ? 'pointer' : (mapZoom > 1 ? 'grab' : 'crosshair'));
        showTip(spot, e.clientX, e.clientY);
    });
    $(document).on('mouseup.dxmap', function () { dragging = false; });

    $(canvas).on('click', function (e) {
        if (dragged) return;    // a pan, not a click
        var xy = canvasXY(e);
        var spot = pinAt(xy[0], xy[1]);
        if (spot) tuneSpot(spot);
    });

    // double-click resets the view to the whole world
    $(canvas).on('dblclick', function (e) {
        e.preventDefault();
        mapZoom = 1; mapPanX = 0; mapPanY = 0;
        render();
    });

    // touch: one finger pans, two fingers pinch-zoom
    var touchStart = null;
    function touchDist(t) {
        var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    $(canvas).on('touchstart', function (e) {
        var t = e.originalEvent.touches;
        touchStart = { panX: mapPanX, panY: mapPanY, zoom: mapZoom,
            x: t[0].clientX, y: t[0].clientY,
            dist: t.length > 1 ? touchDist(t) : null,
            cx: t.length > 1 ? (t[0].clientX + t[1].clientX) / 2 : t[0].clientX,
            cy: t.length > 1 ? (t[0].clientY + t[1].clientY) / 2 : t[0].clientY };
    });
    $(canvas).on('touchmove', function (e) {
        if (!touchStart) return;
        e.preventDefault();
        var t = e.originalEvent.touches;
        var scale = MW / canvas.getBoundingClientRect().width;
        if (t.length > 1 && touchStart.dist) {
            var f = touchDist(t) / touchStart.dist;
            var r = canvas.getBoundingClientRect();
            var ax = (touchStart.cx - r.left) * scale, ay = (touchStart.cy - r.top) * scale;
            var wx = (ax - touchStart.panX) / touchStart.zoom, wy = (ay - touchStart.panY) / touchStart.zoom;
            mapZoom = Math.min(8, Math.max(1, touchStart.zoom * f));
            mapPanX = ax - wx * mapZoom;
            mapPanY = ay - wy * mapZoom;
        } else {
            mapPanX = touchStart.panX + (t[0].clientX - touchStart.x) * scale;
            mapPanY = touchStart.panY + (t[0].clientY - touchStart.y) * scale;
        }
        clampPan();
        render();
    }, { passive: false });
    $(canvas).on('touchend', function (e) {
        if (e.originalEvent.touches.length === 0) touchStart = null;
    });

    function utc() {
        var d = new Date();
        function z(n) { return (n < 10 ? '0' : '') + n; }
        return z(d.getUTCHours()) + ':' + z(d.getUTCMinutes()) + 'z';
    }

    // --- band activity chart ---

    // ham band buckets by frequency (Hz). VHF/UHF folded into one each.
    var ACT_BANDS = [
        ['160', 1800000, 2000000], ['80', 3500000, 4000000],
        ['60', 5250000, 5450000], ['40', 7000000, 7300000],
        ['30', 10100000, 10150000], ['20', 14000000, 14350000],
        ['17', 18068000, 18168000], ['15', 21000000, 21450000],
        ['12', 24890000, 24990000], ['10', 28000000, 29700000],
        ['6', 50000000, 54000000], ['V/U', 100000000, 470000000]
    ];

    function bandOf(freq) {
        for (var i = 0; i < ACT_BANDS.length; i++) {
            if (freq >= ACT_BANDS[i][1] && freq <= ACT_BANDS[i][2]) return i;
        }
        return -1;
    }

    function bandCounts() {
        var counts = new Array(ACT_BANDS.length).fill(0);
        Object.keys(spots).forEach(function (k) {
            var i = bandOf(spots[k].freq);
            if (i >= 0) counts[i]++;
        });
        return counts;
    }

    // trend history: total spots-per-band sampled every 30s, keep ~1h
    var HIST_MAX = 120;
    var hist = ACT_BANDS.map(function () { return []; });
    function sampleActivity() {
        var c = bandCounts();
        for (var i = 0; i < ACT_BANDS.length; i++) {
            hist[i].push(c[i]);
            if (hist[i].length > HIST_MAX) hist[i].shift();
        }
    }
    var actTimer = setInterval(sampleActivity, 30000);
    sampleActivity();

    function drawActivity() {
        var ctx = actCtx, W = AW, H = AH;
        ctx.clearRect(0, 0, W, H);
        var counts = bandCounts();
        var rows = ACT_BANDS.length;
        var rowH = H / rows;
        var labelW = 34, sparkW = 46;
        var barX = labelW, barMax = W - labelW - sparkW - 6;
        var maxCount = Math.max(4, Math.max.apply(null, counts));
        var curBand = currentBand();
        var curName = curBand && curBand.name ? curBand.name.replace('m', '') : null;

        ctx.font = '9px roboto-mono, monospace';
        ctx.textBaseline = 'middle';
        for (var i = 0; i < rows; i++) {
            var y = i * rowH, cy = y + rowH / 2;
            var name = ACT_BANDS[i][0];
            var isCur = curName !== null && name === curName;

            // band label
            ctx.textAlign = 'left';
            ctx.fillStyle = isCur ? '#3adb4a' : '#cfd4d9';
            ctx.fillText(name + (name.length < 3 ? 'm' : ''), 2, cy);

            // bar
            var w = counts[i] / maxCount * barMax;
            ctx.fillStyle = isCur ? '#3adb4a' : '#1d5fae';
            ctx.fillRect(barX, y + rowH * 0.18, w, rowH * 0.64);
            // count
            ctx.textAlign = 'left';
            ctx.fillStyle = '#e8ecef';
            if (counts[i] > 0) ctx.fillText(String(counts[i]), barX + w + 4, cy);

            // sparkline of this band's recent trend
            var h = hist[i];
            if (h.length > 1) {
                var sx = W - sparkW, sh = rowH * 0.6, sy = y + rowH * 0.2;
                var smax = Math.max(1, Math.max.apply(null, h));
                ctx.strokeStyle = 'rgba(90,168,255,0.7)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (var j = 0; j < h.length; j++) {
                    var px = sx + j / (HIST_MAX - 1) * sparkW;
                    var py = sy + sh - (h[j] / smax) * sh;
                    j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                }
                ctx.stroke();
            }

            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
    }

    // click a band row: filter the list to that band and leave activity view
    $(actCanvas).on('click', function (e) {
        var r = actCanvas.getBoundingClientRect();
        var i = Math.floor((e.clientY - r.top) / r.height * ACT_BANDS.length);
        if (i < 0 || i >= ACT_BANDS.length) return;
        // jump the receiver to the middle of that band so BAND filter follows
        var mid = Math.round((ACT_BANDS[i][1] + ACT_BANDS[i][2]) / 2);
        if (ACT_BANDS[i][0] !== 'V/U') Plugins.rig_skin.tuneTo(mid);
        filterSetting('band');
        setActivity(false);
        syncChips();
        setTimeout(render, 300);
        render();
    });

    function render() {
        if (!open) return;
        var list = filtered();
        $count.text(list.length + ' spots  ' + utc());
        if (showActivity) {
            drawActivity();
        } else {
            renderList(list);
            renderMap(list);
        }
    }

    // --- data sources ---

    function ensureLand() {
        if (Plugins.rig_skin._land || landLoading) return;
        landLoading = true;
        $.getScript(Plugins.rig_skin._base + 'rig_skin_map.js')
            .done(render)
            .fail(function () { landLoading = false; });
    }

    // Backlog from DXSummit, whose API allows browser calls but only
    // over plain http (the https endpoint hangs). HolyCluster's history
    // endpoint sends no CORS headers at all, so a browser can never read
    // it and asking only fills the console with errors; live spots
    // stream from its websocket either way, which CORS does not gate.
    function backlog() {
        if (location.protocol !== 'http:') return;
        $.getJSON('http://www.dxsummit.fi/api/v1/spots?limit=150')
            .done(function (d) {
                $win.find('.owrx-rig-dx-src').text('HolyCluster + DXSummit');
                addSpots((d || []).map(function (r) {
                    return {
                        dx_callsign: r.dx_call,
                        freq: r.frequency,
                        mode: '',
                        time: Date.parse(r.time + 'Z') / 1000,
                        // DXSummit longitudes are west-positive
                        dx_loc: (typeof r.dx_longitude === 'number')
                            ? [-r.dx_longitude, r.dx_latitude] : null,
                        dx_continent: r.dx_country || '',
                        spotter_callsign: r.de_call,
                        comment: r.info || ''
                    };
                }));
            });
    }

    function connect() {
        if (sock) return;
        try {
            sock = new WebSocket('wss://' + HC + '/spots_ws');
        } catch (e) {
            sock = null;
            return;
        }
        sock.onmessage = function (m) {
            try {
                var d = JSON.parse(m.data);
                if (d.spots) addSpots(d.spots);
            } catch (e) {}
        };
        sock.onclose = function () {
            sock = null;
            if (open || scopeFeed) reconnect = setTimeout(connect, 15000);
        };
    }

    function disconnect() {
        if (reconnect) { clearTimeout(reconnect); reconnect = null; }
        if (sock) {
            sock.onclose = null;
            sock.close();
            sock = null;
        }
    }

    function setOpen(on) {
        open = on;
        $win.toggleClass('visible', on);
        $btn.toggleClass('highlighted', on);
        if (on) {
            ensureLand();
            loadCache();
            backlog();
            connect();
            syncChips();
            render();
            if (!tickTimer) tickTimer = setInterval(function () {
                syncChips();
                render();
                saveCache();
            }, 15000);
        } else {
            if (!scopeFeed) disconnect();
            saveCache();
            if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        }
    }

    // the radar refreshes the open window so beacon grades stay live
    Plugins.rig_skin._dxRender = function () {
        if (open) render();
    };

    // live spots for the band scope tags: the scope requests the feed
    // while it is visible, so its tags stay fresh without the window open
    Plugins.rig_skin._dxSpots = sorted;
    Plugins.rig_skin._dxFeed = function (on) {
        on = !!on;
        if (on === scopeFeed) return;
        scopeFeed = on;
        if (on) {
            loadCache();
            backlog();
            connect();
        } else if (!open) {
            disconnect();
            saveCache();
        }
    };

};

// Satellite tracking window: a SAT button in the top banner opens a
// world map with every satellite's live position, ground track and
// visibility footprint, green while above this receiver's horizon.
// Click a bird to tune its downlink. Orbits come from the same tracker
// the passes screen uses; positions refresh every 5 seconds.
Plugins.rig_skin.createSatWindow = function () {
    var open = false, timer = null, landLoading = false;
    var MW = 432, MH = 216;
    var dpr = window.devicePixelRatio || 1;
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var pins = [];       // [x, y, sat, elevation]
    var selected = null; // sat name whose path is pinned on the map

    function sizeCanvas(w) {
        MW = w;
        MH = Math.round(w / 2);
        canvas.width = MW * dpr;
        canvas.height = MH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // category filters: amateur birds and weather birds, both on by default
    var cats = { ham: true, wx: true };
    try {
        if (typeof LS !== 'undefined' && LS.has('rig_satwin_cats')) {
            var cc = JSON.parse(LS.loadStr('rig_satwin_cats'));
            cats.ham = cc.ham !== false;
            cats.wx = cc.wx !== false;
        }
    } catch (e) {}

    function catChip(key, label, title) {
        return $('<span>').addClass('owrx-rig-dx-chip').text(label).attr('title', title)
            .toggleClass('on', cats[key])
            .on('click', function () {
                cats[key] = !cats[key];
                $(this).toggleClass('on', cats[key]);
                if (typeof LS !== 'undefined') LS.save('rig_satwin_cats', JSON.stringify(cats));
                refresh();
            });
    }

    var $title = $('<span>').addClass('owrx-rig-dx-title').text('SAT TRACKING');
    var $close = $('<span>').addClass('owrx-rig-dx-close').html('&#x2715;')
        .on('click', function () { setOpen(false); });
    var $hdr = $('<div>').addClass('owrx-rig-dx-hdr').append($title)
        .append(catChip('ham', 'HAM', 'Amateur radio satellites'))
        .append(catChip('wx', 'WX', 'Weather satellites'))
        .append($close);
    var $tip = $('<div>').addClass('owrx-rig-dx-tip');
    var $plist = $('<table>').addClass('owrx-rig-satwin-list');
    var $lcd = $('<div>').addClass('owrx-rig-dx-lcd').append(canvas).append($tip).append($plist);
    var $foot = $('<div>').addClass('owrx-rig-dx-foot')
        .append($('<span>').text('click a bird for its path, click again to tune'))
        .append($('<span>').text('TLE: celestrak.org'));
    var $grip = $('<div>').addClass('owrx-rig-dx-grip');
    var $win = $('<div>').attr('id', 'owrx-rig-satwin')
        .append($hdr).append($lcd).append($foot).append($grip).appendTo('body');

    // window size: persisted, resizable by the corner grip; the map
    // canvas is re-rendered at the new resolution
    var winW = 464, listH = 150;
    try {
        if (typeof LS !== 'undefined' && LS.has('rig_satwin_size')) {
            var sz = JSON.parse(LS.loadStr('rig_satwin_size'));
            winW = sz.w || winW;
            listH = sz.h || listH;
        }
    } catch (e) {}

    function applySize() {
        winW = Math.min(Math.max(winW, 340), 1100);
        listH = Math.min(Math.max(listH, 60), 600);
        $win.css('width', winW + 'px');
        $plist.css('max-height', listH + 'px');
        sizeCanvas(winW - 32);   // panel + lcd padding
    }
    applySize();

    (function () {
        var sx, sy, w0, h0, sizing = false;
        function point(e) {
            var t = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
            return [t.clientX, t.clientY];
        }
        $grip.on('mousedown touchstart', function (e) {
            var pt = point(e);
            sx = pt[0]; sy = pt[1]; w0 = winW; h0 = listH;
            sizing = true;
            e.preventDefault();
            e.stopPropagation();
        });
        $(document).on('mousemove touchmove', function (e) {
            if (!sizing) return;
            var pt = point(e);
            winW = w0 + pt[0] - sx;
            listH = h0 + pt[1] - sy;
            applySize();
            render();
        });
        $(document).on('mouseup touchend', function () {
            if (!sizing) return;
            sizing = false;
            if (typeof LS !== 'undefined') {
                LS.save('rig_satwin_size', JSON.stringify({ w: winW, h: listH }));
            }
        });
    })();

    function px(lat, lon) {
        return [(lon + 180) / 360 * MW, (90 - lat) / 180 * MH];
    }

    function qth() {
        var pos = typeof Utils !== 'undefined' && Utils.getReceiverPos ? Utils.getReceiverPos() : null;
        return (pos && typeof pos.lat === 'number') ? pos : null;
    }

    function render() {
        if (!open) return;
        ctx.clearRect(0, 0, MW, MH);
        pins = [];
        if (Plugins.rig_skin._land) {
            ctx.fillStyle = '#2c4658';
            Plugins.rig_skin._land.forEach(function (poly) {
                ctx.beginPath();
                var prevX = null;
                poly.forEach(function (pt) {
                    var p = px(pt[1], pt[0]);
                    // antimeridian wrap: lift the pen, no streaks
                    if (prevX !== null && Math.abs(p[0] - prevX) > MW / 2) ctx.moveTo(p[0], p[1]);
                    else prevX === null ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
                    prevX = p[0];
                });
                ctx.fill();
            });
        }
        // day/night terminator, same math as the DX map
        var now = new Date();
        var doy = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
            Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000;
        var decl = -23.44 * Math.cos(2 * Math.PI / 365 * (doy + 10)) * Math.PI / 180;
        var sunLon = (12 - (now.getUTCHours() + now.getUTCMinutes() / 60)) * 15;
        ctx.fillStyle = 'rgba(0,0,12,0.30)';
        ctx.beginPath();
        for (var x = 0; x <= MW; x += 4) {
            var lon = x / MW * 360 - 180;
            var H0 = (lon - sunLon) * Math.PI / 180;
            var lat = Math.atan(-Math.cos(H0) / Math.tan(decl)) * 180 / Math.PI;
            var p = px(lat, lon);
            x ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        }
        var north = decl > 0;
        ctx.lineTo(MW, north ? MH : 0);
        ctx.lineTo(0, north ? MH : 0);
        ctx.closePath();
        ctx.fill();

        var pos = qth();
        if (pos) {
            var q = px(pos.lat, pos.lon);
            ctx.fillStyle = '#ff5148';
            ctx.beginPath();
            ctx.arc(q[0], q[1], 2.8, 0, 7);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.8;
            ctx.stroke();
        }

        if (!Plugins.rig_skin._satTrack || !Plugins.rig_skin._satTrack.ready()) {
            ctx.font = '9px roboto-mono, monospace';
            ctx.fillStyle = '#5c6670';
            ctx.fillText(Plugins.rig_skin._satTrack && Plugins.rig_skin._satTrack.failed()
                ? 'TLE download failed, retrying...' : 'loading orbits...', 8, MH - 8);
            return;
        }
        Plugins.rig_skin._satTrack.positions().forEach(function (sp) {
            if (!cats[sp.sat.cat]) return;
            var up = sp.el !== null && sp.el > 0;
            var sel = sp.sat.name === selected;
            // track and footprint only for selected or above-horizon
            // birds; with this many the map drowns otherwise
            if (up || sel) {
                ctx.strokeStyle = sel ? 'rgba(93, 184, 255, 0.8)' : 'rgba(58, 219, 74, 0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                var pv = null;
                sp.track.forEach(function (pt) {
                    var p = px(pt[1], pt[0]);
                    if (pv !== null && Math.abs(p[0] - pv) > MW / 2) ctx.moveTo(p[0], p[1]);
                    else pv === null ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
                    pv = p[0];
                });
                ctx.stroke();
                ctx.strokeStyle = sel ? 'rgba(93, 184, 255, 0.5)' : 'rgba(58, 219, 74, 0.35)';
                ctx.beginPath();
                var la0 = sp.lat * Math.PI / 180, lo0 = sp.lon * Math.PI / 180;
                var a = sp.foot * Math.PI / 180;
                pv = null;
                for (var az = 0; az <= 360; az += 12) {
                    var azr = az * Math.PI / 180;
                    var la2 = Math.asin(Math.sin(la0) * Math.cos(a) +
                        Math.cos(la0) * Math.sin(a) * Math.cos(azr));
                    var lo2 = lo0 + Math.atan2(Math.sin(azr) * Math.sin(a) * Math.cos(la0),
                        Math.cos(a) - Math.sin(la0) * Math.sin(la2));
                    var p = px(la2 * 180 / Math.PI, ((lo2 * 180 / Math.PI + 540) % 360) - 180);
                    if (pv !== null && Math.abs(p[0] - pv) > MW / 2) ctx.moveTo(p[0], p[1]);
                    else pv === null ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
                    pv = p[0];
                }
                ctx.stroke();
            }
            // the bird itself, with its name
            var pp = px(sp.lat, sp.lon);
            var hs = sel ? 3.5 : 2.5;
            ctx.fillStyle = up ? '#3adb4a' : '#f0c040';
            ctx.fillRect(pp[0] - hs, pp[1] - hs, hs * 2, hs * 2);
            ctx.strokeStyle = sel ? '#eef3f7' : 'rgba(0, 0, 0, 0.7)';
            ctx.lineWidth = sel ? 1 : 0.7;
            ctx.strokeRect(pp[0] - hs, pp[1] - hs, hs * 2, hs * 2);
            ctx.font = 'bold 8px monospace';
            ctx.fillStyle = up ? '#3adb4a' : '#f0c040';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = 3;
            ctx.fillText(sp.sat.name, pp[0] + 5, pp[1] - 4);
            ctx.shadowBlur = 0;
            pins.push([pp[0], pp[1], sp.sat, sp.el]);
        });
    }

    function ensureLand() {
        if (Plugins.rig_skin._land || landLoading) return;
        landLoading = true;
        $.getScript(Plugins.rig_skin._base + 'rig_skin_map.js')
            .done(render)
            .fail(function () { landLoading = false; });
    }

    function canvasXY(e) {
        var r = canvas.getBoundingClientRect();
        return [(e.clientX - r.left) * MW / r.width, (e.clientY - r.top) * MH / r.height];
    }

    function pinAt(cx, cy) {
        var best = null, bd = 10 * 10;
        pins.forEach(function (b) {
            var d = (b[0] - cx) * (b[0] - cx) + (b[1] - cy) * (b[1] - cy);
            if (d < bd) { bd = d; best = b; }
        });
        return best;
    }

    $(canvas).on('mousemove', function (e) {
        var xy = canvasXY(e);
        var b = pinAt(xy[0], xy[1]);
        if (!b) { $tip.removeClass('show'); return; }
        $tip.html(b[2].name + '<br>' + b[2].freq +
            (b[3] !== null ? '<br>el ' + Math.round(b[3]) + '&deg;' : ''));
        var lr = $lcd[0].getBoundingClientRect();
        $tip.css({ left: (e.clientX - lr.left + 10) + 'px', top: (e.clientY - lr.top + 10) + 'px' })
            .addClass('show');
    });

    // first click pins a bird's path; a second click on it tunes,
    // a click on open water clears the selection
    $(canvas).on('click', function (e) {
        var xy = canvasXY(e);
        var b = pinAt(xy[0], xy[1]);
        if (!b) {
            selected = null;
            render();
        } else if (selected === b[2].name) {
            Plugins.rig_skin.tuneTo(b[2].f, b[2].mode);
        } else {
            selected = b[2].name;
            render();
        }
    });

    // restore position, kept inside the viewport
    try {
        if (typeof LS !== 'undefined' && LS.has('rig_satwin_pos')) {
            var p = JSON.parse(LS.loadStr('rig_satwin_pos'));
            $win.css({
                left: Math.min(Math.max(p.left, 0), window.innerWidth - 60) + 'px',
                top: Math.min(Math.max(p.top, 0), window.innerHeight - 60) + 'px'
            });
        }
    } catch (e) {}

    // drag by the header
    (function () {
        var sx, sy, ox, oy, moving = false;
        function point(e) {
            var t = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
            return [t.clientX, t.clientY];
        }
        $hdr.on('mousedown touchstart', function (e) {
            if ($(e.target).is('.owrx-rig-dx-close')) return;
            var pt = point(e), off = $win.offset();
            sx = pt[0]; sy = pt[1];
            ox = off.left - $(window).scrollLeft();
            oy = off.top - $(window).scrollTop();
            moving = true;
            e.preventDefault();
        });
        $(document).on('mousemove touchmove', function (e) {
            if (!moving) return;
            var pt = point(e);
            $win.css({ left: (ox + pt[0] - sx) + 'px', top: (oy + pt[1] - sy) + 'px' });
        });
        $(document).on('mouseup touchend', function () {
            if (!moving) return;
            moving = false;
            if (typeof LS !== 'undefined') {
                var o = $win.position();
                LS.save('rig_satwin_pos', JSON.stringify({ left: o.left, top: o.top }));
            }
        });
    })();

    function fmtUtc(d) {
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
    }

    // every upcoming pass in the next 24 hours, soonest first;
    // a row click pins the bird on the map and tunes it
    function renderList() {
        if (!open) return;
        var st = Plugins.rig_skin._satTrack;
        if (!st || !st.ready()) return;
        var passes = st.passes();
        $plist.empty();
        if (!passes.length) {
            $plist.append($('<tr>').append($('<td>')
                .text('no passes: receiver position not configured')));
            return;
        }
        var now = Date.now();
        passes.forEach(function (p) {
            if (p.los.getTime() < now || !cats[p.sat.cat]) return;
            var active = p.aos.getTime() <= now;
            var mins = Math.round((p.los - p.aos) / 60000);
            var toGo = Math.round((p.aos.getTime() - now) / 60000);
            var when = active ? 'NOW' : fmtUtc(p.aos) + ' (' +
                (toGo >= 60 ? Math.floor(toGo / 60) + 'h' + (toGo % 60) : toGo + 'm') + ')';
            $plist.append($('<tr>').toggleClass('active', active)
                .append($('<td>').addClass('name').text(p.sat.name))
                .append($('<td>').addClass('when').text(when))
                .append($('<td>').addClass('dur').text(mins + 'm'))
                .append($('<td>').addClass('el').text(Math.round(p.maxEl) + '°'))
                .append($('<td>').addClass('freq').text(p.sat.freq))
                .on('click', function () {
                    selected = p.sat.name;
                    render();
                    Plugins.rig_skin.tuneTo(p.sat.f, p.sat.mode);
                }));
        });
    }

    function refresh() {
        render();
        renderList();
    }

    // the TLE download can fail (the API rate-limits); retry while open
    var lastEnsure = 0;
    function ensureOrbits() {
        var st = Plugins.rig_skin._satTrack;
        if (!st || (st.ready() && !st.failed())) return;
        if (Date.now() - lastEnsure < 30000) return;
        lastEnsure = Date.now();
        st.ensure(refresh);
    }

    function tick() {
        if (!open) return;
        ensureOrbits();
        refresh();
    }

    function setOpen(on) {
        open = on;
        $win.toggleClass('visible', on);
        $btn.toggleClass('highlighted', on);
        if (on) {
            ensureLand();
            ensureOrbits();
            refresh();
            if (!timer) timer = setInterval(tick, 5000);
        } else if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    var $btn = $('<div>').addClass('button').attr('id', 'owrx-rig-sat-button')
        .html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">' +
            '<rect x="9.4" y="9.4" width="5.2" height="5.2" transform="rotate(45 12 12)"/>' +
            '<path d="M3.5 7l4 4M16.5 13l4 4M5.5 5l6 6M12.5 12l6 6"/>' +
            '<path d="M14 3.5a6.5 6.5 0 0 1 6.5 6.5"/>' +
            '</svg><br/>SAT')
        .attr('title', 'Live satellite tracking map')
        .on('click', function () { setOpen(!open); });
    var $dxBtn = $('#owrx-rig-dx-button');
    if ($dxBtn.length) $dxBtn.after($btn);
    else $('.openwebrx-main-buttons').append($btn);
};

// mode for a clicked DX spot; set it only when it is unambiguous
Plugins.rig_skin.spotMode = function (s) {
    if (s.mode === 'CW') return 'cw';
    if (s.mode === 'SSB') return s.freq < 10000000 ? 'lsb' : 'usb';
    if (s.mode === 'FT8' || s.mode === 'FT4' || s.mode === 'RTTY' ||
        s.mode === 'DIGITAL') return 'usb';
    return null;
};

// DX cluster callsigns on the top ribbon: spots inside the visible
// waterfall show as small dark chips alongside the stock bookmarks,
// click to tune. Rendered only while the rig theme is active, and the
// spot feed runs only then, so the stock themes stay untouched.
Plugins.rig_skin.createSpotRibbon = function () {
    var $host = $('#openwebrx-bookmarks-container');
    if (!$host.length) return;
    var $strip = $('<div>').attr('id', 'owrx-rig-spots').appendTo($host);

    function rigActive() {
        return $('body').hasClass('theme-rig');
    }

    function render() {
        if (!rigActive() || typeof get_visible_freq_range !== 'function' ||
            typeof scale_px_from_freq !== 'function' || !Plugins.rig_skin._dxSpots) {
            $strip.empty();
            return;
        }
        var range = get_visible_freq_range();
        if (!range) return;
        var width = $strip.width() || $host.width();
        $strip.empty();
        var used = [];   // occupied [x0, x1] intervals; newest spot wins
        Plugins.rig_skin._dxSpots().forEach(function (s) {
            if (s.freq <= range.start || s.freq >= range.end) return;
            var x = scale_px_from_freq(s.freq, range);
            var w = s.call.length * 5.5 + 10;
            var x0 = Math.max(0, Math.min(width - w, x - w / 2));
            var clash = used.some(function (u) {
                return x0 < u[1] + 4 && x0 + w > u[0] - 4;
            });
            if (clash) return;
            used.push([x0, x0 + w]);
            $('<div>').addClass('owrx-rig-spot')
                .css('left', Math.round(x0) + 'px')
                .text(s.call)
                .attr('title', s.call + '  ' + (s.freq / 1000).toFixed(1) + ' kHz  ' +
                    s.mode + (s.comment ? '  ' + s.comment : ''))
                .on('click', function (e) {
                    e.stopPropagation();
                    Plugins.rig_skin.tuneTo(s.freq, Plugins.rig_skin.spotMode(s));
                })
                .appendTo($strip);
        });
    }

    Plugins.rig_skin._spotsRibbon = render;

    // the feed follows the theme: live spots while the rig face is up
    Plugins.rig_skin._syncDxFeed = function () {
        if (Plugins.rig_skin._dxFeed) Plugins.rig_skin._dxFeed(rigActive());
        render();
    };

    // reposition when the waterfall zooms or pans, like the bookmarks do
    if (typeof bookmarks !== 'undefined' && bookmarks && bookmarks.position) {
        var origPosition = bookmarks.position.bind(bookmarks);
        bookmarks.position = function () {
            var res = origPosition.apply(this, arguments);
            render();
            return res;
        };
    }

    // fresh spots and aging, on a relaxed clock
    setInterval(function () {
        if (rigActive()) render();
    }, 10000);

    setTimeout(Plugins.rig_skin._syncDxFeed, 0);
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
    Plugins.rig_skin.createVfoKeys();
    Plugins.rig_skin.createPropScreen($line);
    Plugins.rig_skin.createSatScreen();
    Plugins.rig_skin.createPanelFit();
    Plugins.rig_skin.createPanelDrag();
};

Plugins.rig_skin.createVfoKeys = function () {
    var makeKey = Plugins.rig_skin.makeKey;
    var pulse = Plugins.rig_skin.pulseKey;
    var $panel = $('#openwebrx-panel-receiver');
    var $squelch = $panel.find('.openwebrx-squelch-slider');

    var vfoA = { freq: null, mod: null };
    var vfoB = { freq: null, mod: null };
    var active = 'A';
    try {
        if (typeof LS !== 'undefined') {
            if (LS.has('rig_vfo_a')) vfoA = JSON.parse(LS.loadStr('rig_vfo_a'));
            if (LS.has('rig_vfo_b')) vfoB = JSON.parse(LS.loadStr('rig_vfo_b'));
            if (LS.has('rig_vfo_active')) active = LS.loadStr('rig_vfo_active');
        }
    } catch (e) {}
    if (active !== 'A' && active !== 'B') active = 'A';

    function slot(id) { return id === 'A' ? vfoA : vfoB; }
    function other(id) { return id === 'A' ? 'B' : 'A'; }

    function save() {
        if (typeof LS === 'undefined') return;
        LS.save('rig_vfo_a', JSON.stringify(vfoA));
        LS.save('rig_vfo_b', JSON.stringify(vfoB));
        LS.save('rig_vfo_active', active);
    }

    function makeBox(id) {
        var $freq = $('<span>').addClass('owrx-rig-vfo-freq');
        var $labels = $('<div>').addClass('owrx-rig-vfo-labels')
            .append($('<span>').addClass('owrx-rig-vfo-tag').text(id))
            .append($('<span>').addClass('owrx-rig-vfo-rx').text('RX'));
        var $box = $('<div>').addClass('owrx-rig-vfo-box').attr('data-vfo', id)
            .append($labels)
            .append($freq);
        $box.on('click', function (e) {
            // clicking the active box opens the stock frequency entry;
            // clicking the other box just selects it. Stop propagation so
            // the stock body-level click handler does not immediately submit
            // and close the input we are opening.
            e.stopPropagation();
            if (id === active) $stockFreq.trigger('click');
            else setActive(id);
        });
        return { $box: $box, $freq: $freq };
    }

    var boxA = makeBox('A');
    var boxB = makeBox('B');
    var $vfoLine = $('<div>').addClass('owrx-rig-vfo-strip')
        .append(boxA.$box).append(boxB.$box);

    var $freqs = $panel.find('.frequencies');
    var $info = $('#owrx-rig-info');
    // the stock frequency display stays alive (its digits hidden by CSS)
    // and rides inside the active box to provide click-to-type entry
    var $stockFreq = $panel.find('.webrx-actual-freq');
    var $mouseFreq = $panel.find('.webrx-mouse-freq');

    // Remember where the stock elements live so the rig layout can be
    // fully undone when another theme is selected: moving stock DOM without
    // reverting it would leave the default theme's frequency area broken.
    function anchor($el) {
        var el = $el[0];
        if (!el) return null;
        return { el: el, parent: el.parentNode, next: el.nextSibling };
    }
    function restore(a) {
        if (a && a.parent) a.parent.insertBefore(a.el, a.next);
    }
    var stockFreqHome = anchor($stockFreq);
    var mouseFreqHome = anchor($mouseFreq);
    var infoHome = anchor($info);

    // A/B boxes lead the LCD; below them the mode/FIL/TS line and the
    // hover-frequency readout, then the S-meter and scopes. Applied only
    // while the rig theme is active, and reverted otherwise.
    function applyLayout() {
        $freqs.prepend($vfoLine);
        if ($info.length) {
            $info.append($mouseFreq);
            $vfoLine.after($info);
        }
        redraw();
        if (Plugins.rig_skin._fitPanel) Plugins.rig_skin._fitPanel();
    }
    function revertLayout() {
        $vfoLine.detach();
        restore(mouseFreqHome);
        restore(infoHome);
        restore(stockFreqHome);
        if (Plugins.rig_skin._fitPanel) Plugins.rig_skin._fitPanel();
    }

    function showFreq(box, hz) {
        var t = hz ? (hz / 1000000).toFixed(4) : '-.----';
        // skip the write when unchanged: the once-a-second refresh must
        // not invalidate the panel layout while idling
        if (box._shown === t) return;
        box._shown = t;
        // each digit is a span carrying its place value, so the wheel
        // can spin an individual digit like on an SDR console
        box.$freq.empty();
        var place = 100;   // the last shown decimal is the 100 Hz digit
        for (var i = t.length - 1; i >= 0; i--) {
            var ch = t[i];
            var $d = $('<span>').text(ch);
            if (ch >= '0' && ch <= '9') {
                $d.attr('data-place', place).addClass('owrx-rig-digit');
                place *= 10;
            }
            box.$freq.prepend($d);
        }
    }

    // wheel over a digit tunes by that digit's place value; tuneTo also
    // moves the receiver window when a big digit (MHz) walks the target
    // out of it, so the waterfall follows the frequency across bands
    $panel.on('wheel', '.owrx-rig-vfo-box.active .owrx-rig-digit', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof UI === 'undefined' || Plugins.rig_skin.dialLocked) return;
        var steps = Plugins.rig_skin.wheelSteps(e.originalEvent);
        if (!steps) return;
        var place = parseInt($(this).attr('data-place'));
        Plugins.rig_skin.tuneTo(UI.getFrequency() + steps * place, null);
    });

    // update the tuned box live on every dial move by hooking the stock
    // frequency display, so the number tracks the dial instead of lagging
    // behind the once-a-second poll
    try {
        var disp = UI.getDemodulatorPanel().tuneableFrequencyDisplay;
        var origSet = disp.setFrequency.bind(disp);
        disp.setFrequency = function (freq) {
            origSet(freq);
            var box = rxVfo() === 'A' ? boxA : boxB;
            slot(rxVfo()).freq = freq;
            showFreq(box, freq);
        };
    } catch (e) {}

    // which VFO the receiver is tuned to right now: the active slot
    // normally, the other while dual watch has moved the audio to it
    function rxVfo() {
        return (dwOn && onOther) ? other(active) : active;
    }

    function rigActive() {
        return $('body').hasClass('theme-rig');
    }

    function redraw() {
        if (typeof UI !== 'undefined') {
            var s = slot(rxVfo());
            s.freq = UI.getFrequency();
            s.mod = UI.getModulation();
        }
        // only touch the DOM while the rig theme is active; otherwise the
        // stock frequency elements must stay in their own layout
        if (!rigActive()) return;
        var rx = rxVfo();
        [['A', boxA], ['B', boxB]].forEach(function (e) {
            var id = e[0], box = e[1];
            showFreq(box, slot(id).freq);
            box.$box.toggleClass('active', id === rx);
        });
        var activeBox = rx === 'A' ? boxA : boxB;
        if ($stockFreq.length && !$stockFreq.parent().is(activeBox.$box)) {
            activeBox.$box.append($stockFreq);
        }
    }

    var $ab = makeKey('A/B', 'Switch the active VFO (right-click: copy active VFO to the other)');
    var $dw = makeKey('DW', 'Dual watch: listen to the other VFO while it has activity (right-click: sensitivity)')
        .addClass('owrx-rig-key-dw');

    function setActive(id) {
        if (typeof UI === 'undefined' || id === active) return;
        setDw(false);
        var cur = slot(active);
        cur.freq = UI.getFrequency();
        cur.mod = UI.getModulation();
        active = id;
        save();
        var tgt = slot(active);
        if (tgt.freq) Plugins.rig_skin.tuneTo(tgt.freq, tgt.mod);
        redraw();
    }

    $ab.on('click', function () {
        setActive(other(active));
        pulse($ab);
    });

    $ab.on('contextmenu', function (e) {
        e.preventDefault();
        if (typeof UI === 'undefined') return;
        var cur = slot(active);
        cur.freq = UI.getFrequency();
        cur.mod = UI.getModulation();
        var o = slot(other(active));
        o.freq = cur.freq;
        o.mod = cur.mod;
        save();
        redraw();
        pulse($ab);
    });

    var dwOn = false, onOther = false, returnTo = null, expected = null;
    var hot = 0, quiet = 0, timer = null;
    var lastCenter = null;
    var dwMargin = 8;   // dB above the noise floor that counts as activity

    function watchVfo() { return slot(other(active)); }

    function otherInWindow() {
        var v = watchVfo();
        return v.freq && typeof center_freq !== 'undefined' &&
            Math.abs(v.freq - center_freq) < bandwidth / 2 - 5000;
    }

    // peak FFT level in a +/-1.5 kHz window around freq
    function watchLevel(freq) {
        var data = Plugins.rig_skin._lastFft;
        if (!data || typeof center_freq === 'undefined') return null;
        var hzPerBin = bandwidth / data.length;
        var c = (freq - center_freq) / hzPerBin + data.length / 2;
        var b0 = Math.max(0, Math.floor(c - 1500 / hzPerBin));
        var b1 = Math.min(data.length - 1, Math.ceil(c + 1500 / hzPerBin));
        if (b1 < b0) return null;
        var v = -1000;
        for (var b = b0; b <= b1; b++) {
            if (data[b] > v) v = data[b];
        }
        return v;
    }

    // local noise floor near freq: the median of a +/-8 kHz guard band,
    // excluding the +/-2 kHz signal window, so it tracks live conditions
    function noiseFloor(freq) {
        var data = Plugins.rig_skin._lastFft;
        if (!data || typeof center_freq === 'undefined') return null;
        var hzPerBin = bandwidth / data.length;
        var c = (freq - center_freq) / hzPerBin + data.length / 2;
        var g0 = Math.max(0, Math.floor(c - 8000 / hzPerBin));
        var g1 = Math.min(data.length - 1, Math.ceil(c + 8000 / hzPerBin));
        var sig = 2000 / hzPerBin;
        var vals = [];
        for (var b = g0; b <= g1; b++) {
            if (Math.abs(b - c) > sig) vals.push(data[b]);
        }
        if (vals.length < 4) return null;
        vals.sort(function (a, b) { return a - b; });
        return vals[Math.floor(vals.length / 2)];
    }

    // signal-to-noise margin at freq, in dB, or null if no data
    function watchSnr(freq) {
        var pk = watchLevel(freq), nf = noiseFloor(freq);
        if (pk === null || nf === null) return null;
        return pk - nf;
    }

    function goTo(vfo) {
        if (vfo.mod) UI.setModulation(vfo.mod);
        UI.setFrequency(vfo.freq, false);
        expected = UI.getFrequency();
    }

    function tick() {
        if (!dwOn || typeof UI === 'undefined') return;

        // band changed: disarm if the watched VFO left the window, else re-baseline
        if (typeof center_freq !== 'undefined' && lastCenter !== null &&
            center_freq !== lastCenter) {
            lastCenter = center_freq;
            if (!otherInWindow()) { setDw(false); return; }
            if (onOther) { onOther = false; $dw.removeClass('dw-active'); redraw(); }
            expected = UI.getFrequency();
            hot = 0; quiet = 0;
            return;
        }
        if (typeof center_freq !== 'undefined') lastCenter = center_freq;

        // user turned the dial: if parked on the other VFO, stay there and drop DW
        if (expected !== null && Math.abs(UI.getFrequency() - expected) > 1) {
            if (onOther) {
                onOther = false;
                setDw(false);
                return;
            }
            expected = UI.getFrequency();
        }

        if (!otherInWindow()) return;

        // Priority watch judged on signal-to-noise, not an absolute level:
        // the other VFO is "active" when its peak sits dwMargin dB above the
        // live noise floor. Measuring against the floor makes it track band
        // and time-of-day conditions instead of a fixed squelch line. Jump
        // when active for ~1.5s; return once it drops 3 dB below for ~1.5s
        // (hysteresis stops chatter at the threshold).
        var snr = watchSnr(watchVfo().freq);
        if (!onOther) {
            if (snr !== null && snr >= dwMargin) hot++; else hot = 0;
            if (hot >= 3) {
                returnTo = { freq: UI.getFrequency(), mod: UI.getModulation() };
                onOther = true;
                quiet = 0;
                goTo(watchVfo());
                $dw.addClass('dw-active');
                redraw();
            }
        } else {
            if (snr === null || snr < dwMargin - 3) quiet++; else quiet = 0;
            if (quiet >= 3) {
                onOther = false;
                hot = 0;
                goTo(returnTo);
                $dw.removeClass('dw-active');
                redraw();
            }
        }
    }

    function setDw(on) {
        if (on) {
            if (!otherInWindow()) {
                pulse($dw);
                return;
            }
            dwOn = true;
            onOther = false;
            hot = 0;
            quiet = 0;
            expected = UI.getFrequency();
            lastCenter = (typeof center_freq !== 'undefined') ? center_freq : null;
            $dw.addClass('highlighted');
            if (!timer) timer = setInterval(tick, 500);
        } else {
            var wasOnOther = dwOn && onOther && returnTo;
            dwOn = false;
            if (wasOnOther) goTo(returnTo);
            onOther = false;
            $dw.removeClass('highlighted dw-active');
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }
        redraw();
    }

    $dw.on('click', function () {
        setDw(!dwOn);
    });

    // right-click DW: pick the activity margin (dB above the noise floor)
    var $dwMenu = $('<div>').addClass('owrx-rig-rit-menu owrx-rig-menu-down');
    [6, 8, 10, 12].forEach(function (db) {
        $('<div>').addClass('owrx-rig-rit-menu-item').text(db + ' dB')
            .on('click', function (e) {
                e.stopPropagation();
                dwMargin = db;
                $dwMenu.removeClass('open');
            })
            .appendTo($dwMenu);
    });
    $dw.css('position', 'relative').append($dwMenu);
    $dw.on('contextmenu', function (e) {
        e.preventDefault();
        $dwMenu.children().each(function () {
            $(this).toggleClass('sel', $(this).text() === dwMargin + ' dB');
        });
        $dwMenu.toggleClass('open');
    });
    $(document).on('click', function (e) {
        if (!$dw.is(e.target) && !$.contains($dw[0], e.target)) $dwMenu.removeClass('open');
    });

    $('#owrx-rig-keys-right').prepend($dw).prepend($ab);

    if (typeof UI !== 'undefined' && !slot(active).freq) {
        slot(active).freq = UI.getFrequency();
        slot(active).mod = UI.getModulation();
        save();
    }

    // apply the rig layout only when the rig theme is (or becomes) active,
    // and revert it when another theme is selected, so the stock themes are
    // left exactly as they were
    if (rigActive()) applyLayout();
    if (typeof UI !== 'undefined' && typeof UI.setTheme === 'function') {
        var origSetTheme = UI.setTheme.bind(UI);
        UI.setTheme = function (theme) {
            var wasRig = rigActive();
            origSetTheme(theme);
            var isRig = rigActive();
            if (isRig && !wasRig) applyLayout();
            else if (!isRig && wasRig) revertLayout();
        };
    }

    setInterval(function () {
        if (!rigActive()) return;
        redraw();
        save();
    }, 1000);
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
// celestrak.org group files (cached for 12 hours), orbit propagation
// uses the MIT licensed satellite.js loaded on demand, and the downlink
// frequencies are a small built-in table. Collapsed by default.
Plugins.rig_skin.createSatScreen = function () {
    var SATS = [
        { id: 25544, name: 'ISS', freq: '145.800 FM', f: 145800000, mode: 'nfm', cat: 'ham' },
        { id: 27607, name: 'SO-50', freq: '436.795 FM', f: 436795000, mode: 'nfm', cat: 'ham' },
        { id: 43017, name: 'AO-91', freq: '145.960 FM', f: 145960000, mode: 'nfm', cat: 'ham' },
        { id: 43678, name: 'PO-101', freq: '145.900 FM', f: 145900000, mode: 'nfm', cat: 'ham' },
        { id: 22825, name: 'AO-27', freq: '436.795 FM', f: 436795000, mode: 'nfm', cat: 'ham' },
        { id: 61781, name: 'AO-123', freq: '435.400 FM', f: 435400000, mode: 'nfm', cat: 'ham' },
        { id: 63217, name: 'TEVEL2-1', freq: '436.400 FM', f: 436400000, mode: 'nfm', cat: 'ham' },
        { id: 63219, name: 'TEVEL2-2', freq: '436.400 FM', f: 436400000, mode: 'nfm', cat: 'ham' },
        { id: 63218, name: 'TEVEL2-3', freq: '436.400 FM', f: 436400000, mode: 'nfm', cat: 'ham' },
        { id: 63213, name: 'TEVEL2-4', freq: '436.400 FM', f: 436400000, mode: 'nfm', cat: 'ham' },
        { id: 63214, name: 'TEVEL2-5', freq: '436.400 FM', f: 436400000, mode: 'nfm', cat: 'ham' },
        { id: 63215, name: 'TEVEL2-6', freq: '436.400 FM', f: 436400000, mode: 'nfm', cat: 'ham' },
        { id: 63238, name: 'TEVEL2-7', freq: '436.400 FM', f: 436400000, mode: 'nfm', cat: 'ham' },
        { id: 63239, name: 'TEVEL2-8', freq: '436.400 FM', f: 436400000, mode: 'nfm', cat: 'ham' },
        { id: 63237, name: 'TEVEL2-9', freq: '436.400 FM', f: 436400000, mode: 'nfm', cat: 'ham' },
        { id: 44909, name: 'RS-44', freq: '435.640 SSB', f: 435640000, mode: 'usb', cat: 'ham' },
        { id: 7530, name: 'AO-7', freq: '29.450 SSB', f: 29450000, mode: 'usb', cat: 'ham' },
        { id: 24278, name: 'FO-29', freq: '435.850 SSB', f: 435850000, mode: 'usb', cat: 'ham' },
        { id: 39444, name: 'AO-73', freq: '145.950 SSB', f: 145950000, mode: 'usb', cat: 'ham' },
        { id: 43803, name: 'JO-97', freq: '145.855 SSB', f: 145855000, mode: 'usb', cat: 'ham' },
        { id: 50466, name: 'XW-3', freq: '435.180 SSB', f: 435180000, mode: 'usb', cat: 'ham' },
        { id: 60209, name: 'MO-122', freq: '435.825 SSB', f: 435825000, mode: 'usb', cat: 'ham' },
        { id: 53109, name: 'IO-117', freq: '435.310 DATA', f: 435310000, mode: 'usb', cat: 'ham' },
        { id: 26931, name: 'NO-44', freq: '145.825 APRS', f: 145825000, mode: 'nfm', cat: 'ham' },
        { id: 57166, name: 'METEOR M2-3', freq: '137.900 LRPT', f: 137900000, mode: 'nfm', cat: 'wx' },
        { id: 59051, name: 'METEOR M2-4', freq: '137.900 LRPT', f: 137900000, mode: 'nfm', cat: 'wx' },
        { id: 25338, name: 'NOAA 15', freq: '137.620 APT', f: 137620000, mode: 'nfm', cat: 'wx' },
        { id: 33591, name: 'NOAA 19', freq: '137.100 APT', f: 137100000, mode: 'nfm', cat: 'wx' }
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
            .append($('<span>').addClass('owrx-rig-prop-label').text('PASSES over this receiver - TLE: celestrak.org'))
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

    function parseTles(text, into) {
        var lines = text.split(/\r?\n/);
        for (var i = 0; i + 1 < lines.length; i++) {
            var l1 = lines[i], l2 = lines[i + 1];
            if (l1.charAt(0) === '1' && l1.charAt(1) === ' ' &&
                l2 && l2.charAt(0) === '2' && l2.charAt(1) === ' ') {
                into[parseInt(l1.substring(2, 7), 10)] = { line1: l1, line2: l2 };
            }
        }
    }

    // Celestrak group files cover most birds in three requests; anything
    // missing (the decommissioned NOAAs) is fetched by catalog number
    function ensureTles(cb) {
        // the cache is only valid for the exact satellite list it was
        // built for, or new birds would stay invisible until it expires
        var ids = SATS.map(function (s) { return s.id; }).join(',');
        var cached = null;
        try {
            cached = JSON.parse(localStorage.getItem('rig_sat_tles') || 'null');
        } catch (e) {}
        if (cached && cached.tles && cached.ids === ids &&
            Date.now() - cached.ts < 12 * 3600 * 1000) return cb(cached.tles);

        var base = 'https://celestrak.org/NORAD/elements/gp.php?FORMAT=TLE&';
        var all = {};

        // celestrak throttles by holding connections open, so every
        // request gets a hard timeout; a hung one just counts as done
        function grab(query, done) {
            var ctl = new AbortController();
            var timer = setTimeout(function () { ctl.abort(); }, 15000);
            fetch(base + query, { signal: ctl.signal })
                .then(function (r) { return r.text(); })
                .then(function (t) { parseTles(t, all); })
                .catch(function () {})
                .then(function () { clearTimeout(timer); done(); });
        }

        function finish() {
            var tles = {};
            SATS.forEach(function (s) { if (all[s.id]) tles[s.id] = all[s.id]; });
            if (Object.keys(tles).length === 0) {
                tleFail = true;
                // offline or blocked: run on the stale cache if there is one
                if (cached && cached.tles) return cb(cached.tles);
                $head.text('TLE download failed');
                return;
            }
            tleFail = false;
            try {
                localStorage.setItem('rig_sat_tles', JSON.stringify({ ts: Date.now(), ids: ids, tles: tles }));
            } catch (e) {}
            cb(tles);
        }

        var groups = ['stations', 'amateur', 'weather'];
        var pending = groups.length;
        groups.forEach(function (g) {
            grab('GROUP=' + g, function () {
                if (--pending > 0) return;
                // nothing at all from the groups means the network is out
                // or celestrak blocks us; skip the by-number round
                if (Object.keys(all).length === 0) return finish();
                var missing = SATS.filter(function (s) { return !all[s.id]; });
                if (!missing.length) return finish();
                var left = missing.length;
                missing.forEach(function (s) {
                    grab('CATNR=' + s.id, function () {
                        if (--left === 0) finish();
                    });
                });
            });
        });
    }

    // live tracking for the SAT window: current geodetic position,
    // elevation from this receiver, ground track and the visibility
    // footprint of every satellite in the table
    var trackRecs = null, passCache = null, passCacheT = 0, tleFail = false;

    Plugins.rig_skin._satTrack = {
        ready: function () { return !!trackRecs; },
        failed: function () { return tleFail; },
        ensure: function (cb) {
            // after a failed download the tracker runs on stale cached
            // orbits; keep re-ensuring so it upgrades when the source
            // is reachable again
            if (trackRecs && !tleFail) return cb();
            ensureLib(function () {
                ensureTles(function (tles) {
                    trackRecs = [];
                    SATS.forEach(function (s) {
                        var tle = tles[s.id];
                        if (tle) trackRecs.push({ sat: s, rec: satellite.twoline2satrec(tle.line1, tle.line2) });
                    });
                    passCache = null;   // the pass list follows the new orbit set
                    cb();
                });
            });
        },
        positions: function () {
            if (!trackRecs) return [];
            var pos = typeof Utils !== 'undefined' && Utils.getReceiverPos ? Utils.getReceiverPos() : null;
            var obs = (pos && typeof pos.lat === 'number') ? {
                latitude: satellite.degreesToRadians(pos.lat),
                longitude: satellite.degreesToRadians(pos.lon),
                height: 0.1
            } : null;
            var now = new Date();
            var gmst = satellite.gstime(now);
            var out = [];
            trackRecs.forEach(function (e) {
                var pv = satellite.propagate(e.rec, now);
                if (!pv || !pv.position) return;
                var gd = satellite.eciToGeodetic(pv.position, gmst);
                var el = null;
                if (obs) {
                    var la = satellite.ecfToLookAngles(obs, satellite.eciToEcf(pv.position, gmst));
                    el = la.elevation * 180 / Math.PI;
                }
                // ground track from 10 min back to 90 min ahead, cached
                // for a minute (the track barely moves that fast)
                if (!e.track || now.getTime() - e.trackT > 60000) {
                    e.track = [];
                    for (var t = -600; t <= 5400; t += 90) {
                        var d = new Date(now.getTime() + t * 1000);
                        var p2 = satellite.propagate(e.rec, d);
                        if (!p2 || !p2.position) continue;
                        var g2 = satellite.eciToGeodetic(p2.position, satellite.gstime(d));
                        e.track.push([satellite.degreesLong(g2.longitude), satellite.degreesLat(g2.latitude)]);
                    }
                    e.trackT = now.getTime();
                }
                out.push({
                    sat: e.sat,
                    lon: satellite.degreesLong(gd.longitude),
                    lat: satellite.degreesLat(gd.latitude),
                    el: el,
                    // footprint radius in degrees of arc on the ground
                    foot: Math.acos(6371 / (6371 + gd.height)) * 180 / Math.PI,
                    track: e.track
                });
            });
            return out;
        },
        // upcoming passes over this receiver in the next 24 hours,
        // recomputed every 10 minutes; [] when no position is set
        passes: function () {
            if (!trackRecs) return null;
            var pos = typeof Utils !== 'undefined' && Utils.getReceiverPos ? Utils.getReceiverPos() : null;
            if (!pos || typeof pos.lat !== 'number') return [];
            if (passCache && Date.now() - passCacheT < 600000) return passCache;
            var obs = {
                latitude: satellite.degreesToRadians(pos.lat),
                longitude: satellite.degreesToRadians(pos.lon),
                height: 0.1
            };
            var out = [];
            trackRecs.forEach(function (e) {
                var inPass = false, aos = null, maxEl = 0, found = 0;
                for (var t = 0; t <= 24 * 3600 && found < 3; t += 30) {
                    var d = new Date(Date.now() + t * 1000);
                    var pv = satellite.propagate(e.rec, d);
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
                        out.push({ sat: e.sat, aos: aos, los: d, maxEl: maxEl });
                    }
                }
            });
            out.sort(function (a, b) { return a.aos - b.aos; });
            passCache = out;
            passCacheT = Date.now();
            return out;
        }
    };

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
        radarTick(sec, tenIdx);
    }

    updateBeacons();

    // Beacon radar: park on one beacon band and grade all 18 beacons by
    // SNR as the UTC rotation brings each one around (10s per beacon,
    // full cycle in 3 minutes). Measured from the live FFT against the
    // local noise floor, so it shows what this antenna actually hears,
    // not a model. Turning the dial away or hiding the screen stops it.
    var radarBand = -1;              // index into BFREQ, -1 = off
    var radarData = {};              // beacon index -> { snr, time }
    var slotBeacon = -1;             // beacon being sampled right now
    var slotSamples = [];            // its 1 Hz SNR readings this slot
    var radarChips = [];
    var radarRows = [];

    var $radarBar = $('<div>').addClass('owrx-rig-radar-bar')
        .append($('<span>').addClass('owrx-rig-radar-label').text('RADAR'));
    ['20m', '17m', '15m', '12m', '10m'].forEach(function (name, b) {
        var $c = $('<span>').addClass('owrx-rig-dx-chip').text(name)
            .attr('title', 'Grade all 18 beacons on ' + name + ' by what this receiver hears (3 min cycle)')
            .on('click', function () { setRadar(radarBand === b ? -1 : b); });
        radarChips.push($c);
        $radarBar.append($c);
    });
    $beacons.prepend($radarBar);

    // compact locations for the two-column radar list; full name on hover
    var BSHORT = ['New York', 'Canada', 'W. USA', 'Hawaii', 'N.Zealand', 'Australia',
        'Japan', 'Russia', 'HongKong', 'SriLanka', 'S.Africa', 'Kenya',
        'Israel', 'Finland', 'Madeira', 'Argentina', 'Peru', 'Venezuela'];

    var $radarList = $('<div>').addClass('owrx-rig-radar-list');
    BEACONS.forEach(function (bc, i) {
        var $call = $('<span>').addClass('bcall').text(bc[0]);
        var $where = $('<span>').addClass('bwhere').text(BSHORT[i]).attr('title', bc[1]);
        var $snr = $('<span>').addClass('bsnr');
        radarRows.push({ $row: $('<div>').addClass('owrx-rig-beacon-row')
            .append($call).append($where).append($snr), $snr: $snr });
        $radarList.append(radarRows[radarRows.length - 1].$row);
    });
    $radarList.hide();

    $beacons.append($radarList);

    // beacon sites, [lon, lat], for the DX map's beacon layer
    var BLOC = [[-73.97, 40.75], [-85.94, 79.99], [-121.80, 37.15], [-156.26, 20.71],
        [175.60, -41.05], [116.06, -32.11], [136.79, 34.45], [82.90, 54.98],
        [114.15, 22.27], [79.87, 6.89], [28.27, -25.90], [39.85, -3.62],
        [34.80, 32.11], [24.19, 60.32], [-16.88, 32.72], [-58.37, -34.61],
        [-77.05, -12.07], [-66.85, 10.43]];

    // the DX window draws the beacons on its world map and colors them
    // by the radar's grades when the radar has measured something
    Plugins.rig_skin._beacons = {
        calls: BEACONS,
        loc: BLOC,
        freqs: BFREQ,
        state: function () {
            return { band: radarBand, data: radarData, active: slotBeacon };
        }
    };

    // peak in a narrow window around f against the local median floor
    function beaconSnr(f) {
        var data = Plugins.rig_skin._lastFft;
        if (!data || typeof center_freq === 'undefined') return null;
        var hzPerBin = bandwidth / data.length;
        var c = (f - center_freq) / hzPerBin + data.length / 2;
        if (c < 10 || c > data.length - 10) return null;
        var b0 = Math.max(0, Math.floor(c - 300 / hzPerBin));
        var b1 = Math.min(data.length - 1, Math.ceil(c + 300 / hzPerBin));
        var pk = -1000, b;
        for (b = b0; b <= b1; b++) if (data[b] > pk) pk = data[b];
        var g0 = Math.max(0, Math.floor(c - 6000 / hzPerBin));
        var g1 = Math.min(data.length - 1, Math.ceil(c + 6000 / hzPerBin));
        var guard = 1000 / hzPerBin, vals = [];
        for (b = g0; b <= g1; b++) if (Math.abs(b - c) > guard) vals.push(data[b]);
        if (vals.length < 4) return null;
        vals.sort(function (x, y) { return x - y; });
        return pk - vals[Math.floor(vals.length / 2)];
    }

    function setRadar(b) {
        radarBand = b;
        radarChips.forEach(function ($c, i) { $c.toggleClass('on', i === b); });
        $radarList.toggle(b >= 0);
        beaconRows.forEach(function (r) { r.$row.toggle(b < 0); });
        if (b >= 0) {
            radarData = {};
            radarRows.forEach(function (r) { r.$snr.text('').attr('class', 'bsnr'); });
            Plugins.rig_skin.tuneTo(BFREQ[b], 'cw');
        }
    }

    function radarTick(sec, tenIdx) {
        // radarBand is still undefined when the first updateBeacons()
        // runs during setup, so test for an armed radar, not for "off"
        if (!(radarBand >= 0)) return;
        // the radar owns the dial; moving away or leaving the rig theme
        // (or hiding the screen) hands the receiver back
        if (!$('body').hasClass('theme-rig') || !$prop.hasClass('visible') ||
            typeof UI === 'undefined' ||
            Math.abs(UI.getFrequency() - BFREQ[radarBand]) > 3000) {
            setRadar(-1);
            return;
        }
        var i = ((tenIdx - radarBand) % 18 + 18) % 18;
        var slotSec = sec % 10;
        if (i !== slotBeacon) {
            slotBeacon = i;
            slotSamples = [];
        }
        // skip the first seconds of the slot (tuning, keying delay), then
        // grade by the median of the readings: a beacon is a continuous
        // carrier so its median is the real SNR, while the median votes
        // out the spikes that pure noise produces on single reads
        if (slotSec >= 2) {
            var snr = beaconSnr(BFREQ[radarBand]);
            if (snr !== null) {
                slotSamples.push(snr);
                var s = slotSamples.slice().sort(function (a, b) { return a - b; });
                radarData[i] = { snr: s[Math.floor(s.length / 2)], time: Date.now() };
            }
        }
        renderRadar(i);
    }

    function renderRadar(i) {
        radarRows.forEach(function (r, n) {
            r.$row.toggleClass('listening', n === i);
            var d = radarData[n];
            if (!d) return;
            var cls = d.snr >= 14 ? 'good' : d.snr >= 8 ? 'fair' : 'none';
            r.$snr.text(d.snr >= 8 ? '+' + Math.round(d.snr) + ' dB' : '-')
                .attr('class', 'bsnr ' + cls);
        });
        if (Plugins.rig_skin._dxRender) Plugins.rig_skin._dxRender();
    }

    var views = [
        { key: 'bands', label: 'BAND CONDITIONS - est. from NOAA SWPC', content: $bands, refresh: refreshBands },
        { key: 'beacons', label: 'NCDXF/IARU BEACONS - click to listen', content: $beacons, refresh: updateBeacons },
        { key: 'muf', label: 'MUF MAP - prop.kc2g.com', url: 'https://prop.kc2g.com/renders/current/mufd-normal-now.svg' }
    ];

    setInterval(function () {
        if ($prop.hasClass('visible')) updateBeacons();
    }, 1000);

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
        // caption bar: a clear prev/next pager on the left (so it is
        // obvious the screen has multiple views), the label with a page
        // counter, and HIDE on the right
        var $prev = $('<span>').addClass('owrx-rig-prop-nav').text('‹')
            .attr('title', 'Previous view');
        var $next = $('<span>').addClass('owrx-rig-prop-nav').text('›')
            .attr('title', 'Next view');
        var $label = $('<span>').addClass('owrx-rig-prop-label')
            .text((i + 1) + '/' + views.length + '  ' + v.label);
        var $cap = $('<div>').addClass('owrx-rig-prop-cap')
            .append($prev).append($label).append($next)
            .append($('<span>').addClass('owrx-rig-prop-hide').text('HIDE'));
        // clicking the label or the next arrow advances; prev goes back
        $label.add($next).on('click', function () {
            setView((viewIdx + 1) % views.length);
        });
        $prev.on('click', function () {
            setView((viewIdx - 1 + views.length) % views.length);
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

// Layout chip in the panel's top left corner, labeled with the action:
// "|← WIDE" grows the rig leftward into two columns, "→| NARROW" folds
// it back. The auto-fit picks the layout by itself; a click switches
// and pins the choice, right-click returns to automatic.
Plugins.rig_skin.createExpandToggle = function () {
    var $panel = $('#openwebrx-panel-receiver');
    var $btn = $('<div>').attr('id', 'owrx-rig-expand')
        .attr('title', 'Switch the layout (click: switch and keep, right-click: automatic)');

    function setView(wide) {
        $panel.toggleClass('rig-wide', wide);
        // the panel is anchored right, so wide grows leftward
        $btn.text(wide ? '→| NARROW' : '|← WIDE');
    }

    $btn.on('click', function () {
        var wide = !$panel.hasClass('rig-wide');
        setView(wide);
        if (typeof LS !== 'undefined') LS.save('rig_wide_user', wide);
        if (Plugins.rig_skin._fitPanel) Plugins.rig_skin._fitPanel();
    });
    $btn.on('contextmenu', function (e) {
        e.preventDefault();
        if (typeof LS !== 'undefined') LS.delete('rig_wide_user');
        if (Plugins.rig_skin._fitPanel) Plugins.rig_skin._fitPanel();
    });
    $panel.append($btn);

    Plugins.rig_skin._setWideView = setView;

    setView((typeof LS !== 'undefined' && LS.has('rig_wide_user'))
        ? LS.loadBool('rig_wide_user') : false);
};

// Fluid auto-fit: the full rig face is ~880px tall, and the stock layout
// anchors the panel to the bottom of the viewport, so on low resolution
// screens and phones the LCD half was pushed off the top with no way to
// reach it. The panel scales itself (CSS zoom) to fit below the top bar,
// and as it zooms down it widens the layout by the same factor, so the
// rig keeps its natural on-screen size (or the screen width on phones)
// instead of shrinking into a strip. On short wide screens the sections
// rearrange side by side (the two-column layout) before shrinking; the
// chevron still pins one layout manually. Past MIN_ZOOM the panel stops
// shrinking and scrolls instead.
Plugins.rig_skin.createPanelFit = function () {
    var panel = document.getElementById('openwebrx-panel-receiver');
    // browsers without standard CSS zoom keep the old fixed layout
    if (!panel || !CSS.supports('zoom', '0.5')) return;

    var MIN_ZOOM = 0.5;
    var MAX_ZOOM = 1.25;
    var AUTO_WIDE_AT = 0.8;  // one-column zoom below this prefers two columns
    var AUTO_WIDE_W = 1440;  // screens at least this wide start two-column

    // the stock layout sets the panel width as an inline style (259px in
    // index.html); it must be restored, not removed, or the default theme
    // collapses to min-content once the fluid width is cleared
    var stockWidth = panel.style.width;
    var autoWide = false;

    // assign only when the value differs: identical writes still invalidate
    // style and can keep the ResizeObserver loop warm
    function setStyle(prop, value, important) {
        if (panel.style.getPropertyValue(prop) !== value) {
            panel.style.setProperty(prop, value, important ? 'important' : '');
        }
    }

    function fit() {
        if (!$('body').hasClass('theme-rig')) {
            setStyle('zoom', '');
            setStyle('max-height', '');
            setStyle('width', stockWidth);
            panel.classList.remove('rig-overflow');
            if (Plugins.rig_skin._applyPanelPos) Plugins.rig_skin._applyPanelPos();
            if (Plugins.rig_skin._syncDxFeed) Plugins.rig_skin._syncDxFeed();
            return;
        }

        // reset before measuring, the zoom included: measuring under the
        // previous zoom skews the layout by a few pixels and the error
        // feeds back through the ResizeObserver as visible oscillation.
        // All of this runs inside one animation frame, so the intermediate
        // states are never painted.
        panel.style.zoom = '';
        panel.style.maxHeight = '';
        panel.style.width = stockWidth;
        panel.classList.remove('rig-overflow');

        // the panel must clear the whole top stack: banner, bookmark row
        // and frequency scale all paint above the panels
        var topEdge = 0;
        $('.webrx-top-container, #openwebrx-frequency-container').each(function () {
            topEdge = Math.max(topEdge, this.getBoundingClientRect().bottom);
        });
        var availH = window.innerHeight - topEdge - 24;
        var availW = window.innerWidth - 24;

        // pick the layout: a pinned choice wins; otherwise go two-column
        // automatically when the one-column rig would have to shrink a lot
        // (with hysteresis, so the layout cannot flap at the threshold) or
        // when the screen has plenty of width to spare
        if (window.innerWidth >= 900 && Plugins.rig_skin._setWideView) {
            var wide;
            if (typeof LS !== 'undefined' && LS.has('rig_wide_user')) {
                wide = LS.loadBool('rig_wide_user');
            } else {
                panel.classList.remove('rig-wide');
                var zNarrow = availH / panel.offsetHeight;
                wide = zNarrow < (autoWide ? AUTO_WIDE_AT + 0.05 : AUTO_WIDE_AT) ||
                    window.innerWidth >= AUTO_WIDE_W;
                autoWide = wide;
            }
            Plugins.rig_skin._setWideView(wide);
        }

        var natW = panel.offsetWidth, natH = panel.offsetHeight;
        if (!natW || !natH) return;

        // portrait phones: the rig would cover the whole height, so leave
        // a strip of waterfall visible above it instead
        if (window.innerHeight > window.innerWidth && window.innerWidth <= 600) {
            availH -= Math.min(200, Math.round(window.innerHeight * 0.22));
        }

        // scale to fill the free height, upward too (a modest cap keeps
        // the upscaled canvases from getting soft)
        var z = Math.min(MAX_ZOOM, availH / natH, availW / natW);
        z = Math.max(MIN_ZOOM, z);

        if (z < 1) {
            // fluid width: widen the layout as it zooms down, so the rig
            // keeps its natural on-screen width (or the screen width when
            // smaller)
            var target = Math.min(natW, availW);
            var w = Math.round(target / z) - 20;
            if (Math.abs(w - (natW - 20)) > 2) {
                panel.style.setProperty('width', w + 'px', 'important');
                // a wider panel lays out shorter; refine once
                z = Math.max(MIN_ZOOM, Math.min(1, availH / panel.offsetHeight));
                setStyle('width', (Math.round(target / z) - 20) + 'px', true);
            }
        }

        if (availH / panel.offsetHeight < MIN_ZOOM) {
            setStyle('max-height', Math.max(120, Math.floor(availH / z)) + 'px');
            panel.classList.add('rig-overflow');
        }
        setStyle('zoom', Math.abs(z - 1) < 0.005 ? '' : z.toFixed(3));
        // the LCD canvases re-measure their displayed size on next draw
        Plugins.rig_skin._lcdEpoch++;

        if (Plugins.rig_skin._applyPanelPos) Plugins.rig_skin._applyPanelPos();
        if (Plugins.rig_skin._syncDxFeed) Plugins.rig_skin._syncDxFeed();
    }

    var queued = false;
    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
            queued = false;
            fit();
        });
    }

    window.addEventListener('resize', schedule);
    if (typeof ResizeObserver === 'function') {
        // refit when the panel content changes size (screens toggled,
        // wide mode, profile switch)
        new ResizeObserver(schedule).observe(panel);
    }
    Plugins.rig_skin._fitPanel = schedule;
    fit();
    // once more after fonts and restored settings settle the layout
    setTimeout(fit, 500);
};

// The rig can be picked up and arranged: drag the grip bar on the top
// edge to move it anywhere (double-click the bar to snap back to the
// stock corner). The position is remembered and only applies while the
// rig theme is active, so the stock themes keep their own layout.
Plugins.rig_skin.createPanelDrag = function () {
    var panel = document.getElementById('openwebrx-panel-receiver');
    if (!panel) return;

    var grip = $('<div>').attr('id', 'owrx-rig-grip')
        .attr('title', 'Drag to move the rig; double-click to snap back')
        .appendTo(panel)[0];

    function saved() {
        try {
            if (typeof LS !== 'undefined' && LS.has('rig_pos')) {
                return JSON.parse(LS.loadStr('rig_pos'));
            }
        } catch (e) {}
        return null;
    }

    // keep the whole panel on screen, at its current displayed size
    function clamp(pos) {
        var r = panel.getBoundingClientRect();
        return {
            left: Math.min(Math.max(pos.left, 4), Math.max(4, window.innerWidth - r.width - 4)),
            top: Math.min(Math.max(pos.top, 4), Math.max(4, window.innerHeight - r.height - 4))
        };
    }

    // pos is in screen pixels; the panel's own zoom also scales its
    // left/top offsets, so convert into the panel's coordinate space
    function place(pos) {
        var z = parseFloat(panel.style.zoom) || 1;
        panel.style.position = 'fixed';
        panel.style.left = Math.round(pos.left / z) + 'px';
        panel.style.top = Math.round(pos.top / z) + 'px';
        panel.style.margin = '0';
    }

    function reset() {
        panel.style.position = '';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.margin = '';
    }

    Plugins.rig_skin._applyPanelPos = function () {
        var pos = $('body').hasClass('theme-rig') ? saved() : null;
        if (pos) place(clamp(pos));
        else reset();
    };

    var start = null;
    grip.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        try { grip.setPointerCapture(e.pointerId); } catch (err) {}
        var r = panel.getBoundingClientRect();
        start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
    });
    grip.addEventListener('pointermove', function (e) {
        if (!start) return;
        place(clamp({ left: start.left + e.clientX - start.x,
                      top: start.top + e.clientY - start.y }));
    });
    // pointerdown's preventDefault suppresses synthesized dblclick, so
    // the snap-back double-tap is detected from the pointerups directly
    var lastTap = 0;
    grip.addEventListener('pointerup', function (e) {
        if (!start) return;
        var moved = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 5;
        start = null;
        if (moved) {
            lastTap = 0;
            var r = panel.getBoundingClientRect();
            if (typeof LS !== 'undefined') {
                LS.save('rig_pos', JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }));
            }
        } else if (e.timeStamp - lastTap < 400) {
            lastTap = 0;
            if (typeof LS !== 'undefined') LS.delete('rig_pos');
            reset();
        } else {
            lastTap = e.timeStamp;
        }
    });

    Plugins.rig_skin._applyPanelPos();
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

// RIT (clarifier): a small receive offset on top of the VFO frequency.
// While engaged the left/right arrow keys nudge it by RIT_STEP instead of
// paging the waterfall; turning it off restores the exact VFO frequency.
Plugins.rig_skin._rit = (function () {
    var step = 10;          // Hz per nudge, chosen from the RIT menu
    var on = false;
    var base = null;        // VFO frequency RIT is measured from
    var offset = 0;         // current RIT offset in Hz

    function apply() {
        if (typeof UI === 'undefined' || base === null) return;
        UI.setFrequency(base + offset, false);
    }

    return {
        isOn: function () { return on; },
        offset: function () { return offset; },
        step: function () { return step; },
        setStep: function (v) {
            step = v;
            Plugins.rig_skin._ritChanged && Plugins.rig_skin._ritChanged();
        },
        set: function (v) {
            if (typeof UI === 'undefined') return;
            if (v) {
                base = UI.getFrequency();
                offset = 0;
                on = true;
            } else {
                on = false;
                offset = 0;
                if (base !== null) UI.setFrequency(base, false);
                base = null;
            }
            Plugins.rig_skin._ritChanged && Plugins.rig_skin._ritChanged();
        },
        nudge: function (dir) {
            if (!on) return;
            offset += dir * step;
            apply();
            Plugins.rig_skin._ritChanged && Plugins.rig_skin._ritChanged();
        }
    };
})();

// Waterfall paging pair: shift the zoomed view left/right by one visible
// span; at the window edge (or unzoomed) retune the SDR to the next chunk
// of spectrum, so paging can walk the whole band. While RIT is engaged the
// arrows nudge the clarifier instead, and light green to show it.
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

    var rit = Plugins.rig_skin._rit;
    var $left = $('<div>').addClass('openwebrx-button owrx-rig-zoom-key')
        .attr('title', 'Page waterfall down (right-click: move the receiver window)').text('◀');
    var $right = $('<div>').addClass('openwebrx-button owrx-rig-zoom-key')
        .attr('title', 'Page waterfall up (right-click: move the receiver window)').text('▶');

    $left.on('click', function () { if (rit.isOn()) rit.nudge(-1); else pageBy(-1); });
    $right.on('click', function () { if (rit.isOn()) rit.nudge(1); else pageBy(1); });

    // right-click always moves the receiver window, like the stock arrows
    $left.on('contextmenu', function (e) {
        e.preventDefault();
        if (typeof jumpBySteps === 'function') jumpBySteps(-1);
    });
    $right.on('contextmenu', function (e) {
        e.preventDefault();
        if (typeof jumpBySteps === 'function') jumpBySteps(1);
    });

    // expose the arrows so the RIT key can tint them green while engaged
    Plugins.rig_skin._pageArrows = $left.add($right);

    return $('<div>').addClass('owrx-rig-zoom-row').append($left).append($right);
};

// Mode, filter width and tuning step readout, polled from the demodulator.
Plugins.rig_skin.createSignalInfo = function ($container) {
    var $mode = $('<div>').addClass('owrx-rig-info-mode');
    var $filter = $('<div>').addClass('owrx-rig-info-filter');
    var $step = $('<div>').addClass('owrx-rig-info-step');
    var $rit = $('<div>').addClass('owrx-rig-info-rit');
    $container.append(
        $('<div>').attr('id', 'owrx-rig-info')
            .append($mode).append($filter).append($step).append($rit)
    );

    // extra readouts under the S-meter: band, S units, squelch, UTC clock
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

        var rit = Plugins.rig_skin._rit;
        if (rit && rit.isOn()) {
            var o = rit.offset();
            $rit.text('RIT ' + (o >= 0 ? '+' : '') + o).show();
        } else {
            $rit.hide();
        }

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
        var txt = parts.join('   ');
        if ($extra._shown !== txt) {
            $extra._shown = txt;
            $extra.text(txt);
        }
    }

    Plugins.rig_skin._updateInfo = update;
    update();
    setInterval(update, 500);
};

// Render an LCD canvas at its displayed resolution: the fluid layout
// stretches the canvases, so the backing store follows the on-screen
// size (element width x panel zoom x devicePixelRatio) while the draw
// code keeps using the logical W x H coordinate space. The size is
// re-measured only when the panel fit ran (reading clientWidth every
// frame forces needless reflows between the skin's DOM updates).
Plugins.rig_skin._lcdEpoch = 1;

Plugins.rig_skin.fitCanvas = function (canvas, ctx, W, H) {
    if (canvas._rigEpoch !== Plugins.rig_skin._lcdEpoch) {
        canvas._rigEpoch = Plugins.rig_skin._lcdEpoch;
        var zoom = 1;
        var panel = document.getElementById('openwebrx-panel-receiver');
        if (panel && panel.style.zoom) zoom = parseFloat(panel.style.zoom) || 1;
        var w = Math.round((canvas.clientWidth || W) * zoom * (window.devicePixelRatio || 1));
        var h = Math.round(w * H / W);
        // the aspect can change too (the meter styles differ in height)
        if (w >= 8 && (canvas.width !== w || canvas.height !== h)) {
            canvas.width = w;
            canvas.height = h;
        }
    }
    var s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
};

// Band scope inside the LCD: a narrow spectrum and waterfall centered
// on the tuned frequency, like a rig's center-mode scope. Click to
// tune, scroll for single steps, click SPAN to change the width.
Plugins.rig_skin.createBandScope = function ($freq) {
    if (!$freq.length || typeof waterfall_add !== 'function') return;

    var W = 340, TRACE_H = 36, WF_H = 22, AXIS_H = 14, H = TRACE_H + WF_H + AXIS_H;
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
    // waterfall is scrolled with getImageData each frame; flag it for
    // readback to quiet the console. (Only the waterfalls are flagged;
    // the audio waveform canvas is deliberately left on the default
    // context, flagging it corrupted its scroll on some browsers.)
    var wfCtx = wf.getContext('2d', { willReadFrequently: true });

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
        Plugins.rig_skin.fitCanvas(canvas, ctx, W, H);
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
            // axis strip: SPAN cycles, HIDE collapses (finger-sized zones)
            if (x < 90) spanIdx = (spanIdx + 1) % SPANS.length;
            else if (x > W - 56) setVisible(false);
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
    // waterfall scrolled with getImageData; flag for readback
    var wfCtx = wf.getContext('2d', { willReadFrequently: true });

    // Audio waveform, like a rig's AF scope. The timebase is click-selectable
    // on the ms/Div label. Fast sweeps (<= 30 ms/div) draw a zero-crossing
    // triggered waveform so the cycles hold steady; slow sweeps (100/300
    // ms/div) draw a rolling min/max envelope, since cycles cannot resolve
    // that slow. 300 ms/div is the default (most zoomed out).
    var WAVE_STEPS = [1, 3, 10, 30, 100, 300];  // ms/div choices
    var waveMsPerDiv = 300;
    if (typeof LS !== 'undefined' && LS.has('rig_scope_ms')) {
        var saved = LS.loadInt('rig_scope_ms');
        if (WAVE_STEPS.indexOf(saved) >= 0) waveMsPerDiv = saved;
    }
    var TRIGGERED_MAX = 30;          // ms/div at or below this uses triggered mode
    var sampleRing = null;           // Float32 ring of -1..1 samples
    var ringHead = 0, ringLen = 0;
    // envelope ring for the slow modes; columns advance by real elapsed
    // time so the timebase is accurate (not frame-rate dependent)
    var envCols = WAVE_W - 2;
    var envMin = new Float32Array(envCols);
    var envMax = new Float32Array(envCols);
    var envHead = 0;
    var envCarry = 0;                // fractional column not yet advanced
    var envLastT = null;             // timestamp of the previous env frame

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
        // small triangle marks the label as clickable (cycles the timebase)
        ctx.fillStyle = '#8fd0ff';
        ctx.fillText('▾ ' + waveMsPerDiv + 'ms/Div', W, PLOT_H + 2);
    }

    // the audio graph only exists once audio has started, attach lazily.
    // Tap audioNode, the stage BEFORE the volume/mute gain, so the scope
    // shows the signal at full scale regardless of the volume slider and
    // keeps working while the audio is muted (like a rig's scope). Wait
    // specifically for audioNode; do not fall back to gainNode, or the
    // scope would go flat whenever muted.
    function attach() {
        if (analyser) return true;
        if (typeof audioEngine === 'undefined' || !audioEngine ||
            !audioEngine.audioContext || !audioEngine.audioNode) return false;
        analyser = audioEngine.audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.5;
        audioEngine.audioNode.connect(analyser);
        freqData = new Uint8Array(analyser.frequencyBinCount);
        timeData = new Uint8Array(analyser.fftSize);
        return true;
    }

    // display auto-scaling: track the recent peak deviation so the
    // waveform fills the plot regardless of signal level
    var wavePeak = 0.3;

    function draw() {
        Plugins.rig_skin.fitCanvas(canvas, ctx, W, H);
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

            // track the recent peak deviation for auto-scaling either mode
            var dev = 0;
            for (var d = 0; d < timeData.length; d++) {
                var av = Math.abs((timeData[d] - 128) / 128);
                if (av > dev) dev = av;
            }
            wavePeak = Math.max(dev, wavePeak * 0.995, 0.05);
            var wScale = 0.9 / wavePeak;
            var wcenter = (PLOT_H - 2) / 2;
            var cols = WAVE_W - 2;
            var spanMs = waveMsPerDiv * 4;   // 4 divisions across the plot

            ctx.strokeStyle = '#3adb4a';
            ctx.lineWidth = 1;
            ctx.beginPath();

            if (waveMsPerDiv <= TRIGGERED_MAX) {
                // triggered mode: ring a bit longer than one sweep so a
                // trigger can be found with a full window of samples after it
                var spanSamples = Math.round(spanMs / 1000 * sr);
                var ringCap = spanSamples * 2;
                if (!sampleRing || sampleRing.length !== ringCap) {
                    sampleRing = new Float32Array(ringCap);
                    ringHead = 0; ringLen = 0;
                }
                for (var i = 0; i < timeData.length; i++) {
                    sampleRing[ringHead] = (timeData[i] - 128) / 128;
                    ringHead = (ringHead + 1) % ringCap;
                    if (ringLen < ringCap) ringLen++;
                }
                var at = function (k) { return sampleRing[(ringHead - ringLen + k + ringCap) % ringCap]; };

                // first rising zero-crossing in the oldest part of the window
                var trig = 0, searchEnd = Math.max(1, ringLen - spanSamples);
                for (var s = 1; s < searchEnd; s++) {
                    if (at(s - 1) <= 0 && at(s) > 0) { trig = s; break; }
                }
                for (var col = 0; col < cols; col++) {
                    var si = trig + Math.floor(col * spanSamples / cols);
                    if (si >= ringLen) break;
                    var y = 1 + wcenter - Math.max(-1, Math.min(1, at(si) * wScale)) * wcenter;
                    var px = WAVE_X + 1 + col + 0.5;
                    if (col === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
                }
                ctx.stroke();
            } else {
                // envelope (roll) mode: advance the ring by the columns that
                // represent the real time since the last frame at this
                // timebase (carry the remainder so the scroll rate is exact),
                // and fill each advanced column from its own slice of this
                // frame's samples so the trace keeps fine detail instead of
                // stretching one flat min/max across several columns.
                var now = performance.now();
                var dt = envLastT === null ? 33 : Math.min(500, now - envLastT);
                envLastT = now;
                var adv = envCarry + dt * envCols / spanMs;
                var nCols = Math.floor(adv);
                envCarry = adv - nCols;
                if (nCols < 1) nCols = 1;
                if (nCols > envCols) nCols = envCols;
                for (var a = 0; a < nCols; a++) {
                    var s0 = Math.floor(a * timeData.length / nCols);
                    var s1 = Math.floor((a + 1) * timeData.length / nCols);
                    var mn = 1, mx = -1;
                    for (var j = s0; j < s1; j++) {
                        var vv = (timeData[j] - 128) / 128;
                        if (vv < mn) mn = vv;
                        if (vv > mx) mx = vv;
                    }
                    envMax[envHead] = Math.min(mx * wScale, 1);
                    envMin[envHead] = Math.max(mn * wScale, -1);
                    envHead = (envHead + 1) % envCols;
                }
                for (var e = 0; e < envCols; e++) {
                    var ei = (envHead + e) % envCols;
                    var px2 = WAVE_X + 1 + e + 0.5;
                    var yTop = 1 + wcenter - envMax[ei] * wcenter;
                    var yBot = 1 + wcenter - envMin[ei] * wcenter;
                    if (yBot < yTop + 1) yBot = yTop + 1;
                    ctx.moveTo(px2, yTop);
                    ctx.lineTo(px2, yBot);
                }
                ctx.stroke();
            }
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

    // click the ms/Div label (bottom-right of the plot) to cycle the
    // timebase, like a rig's scope; the choice is remembered
    canvas.title = 'Click the ms/Div label to change the scope timebase';
    canvas.style.cursor = 'default';
    // map pointer position to canvas units, so the hotspot stays right
    // when the canvas is displayed scaled (phone width, panel auto-fit)
    function canvasXY(e) {
        var r = canvas.getBoundingClientRect();
        return [(e.clientX - r.left) * W / r.width,
                (e.clientY - r.top) * H / r.height];
    }
    $(canvas).on('mousemove', function (e) {
        var p = canvasXY(e), x = p[0], y = p[1];
        canvas.style.cursor = (x > W - 90 && y > PLOT_H - 8) ? 'pointer' : 'default';
    });
    $(canvas).on('click', function (e) {
        var p = canvasXY(e), x = p[0], y = p[1];
        if (x > W - 90 && y > PLOT_H - 8) {
            e.stopPropagation();
            var idx = WAVE_STEPS.indexOf(waveMsPerDiv);
            waveMsPerDiv = WAVE_STEPS[(idx + WAVE_STEPS.length - 1) % WAVE_STEPS.length];
            envLastT = null;   // re-baseline the envelope clock on a change
            if (typeof LS !== 'undefined') LS.save('rig_scope_ms', waveMsPerDiv);
        }
    });

    $('#owrx-rig-meter')
        .css('cursor', 'pointer')
        .attr('title', 'Toggle audio scope (right-click: bar / needle meter; drag the SQL marker to set the squelch)')
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
    var $mw = makeKey('MW', 'Write a bookmark here (right-click: search bookmarks)');

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

    // MW mirrors the stock bookmark button: left-click adds a bookmark
    // here, right-click opens the bookmark search (newer OWRX+ binds it
    // to the button's contextmenu; a no-op on versions without it)
    $mw.on('click', function () {
        $('#openwebrx-panel-receiver .openwebrx-bookmark-button').trigger('click');
        pulse($mw);
    });
    $mw.on('contextmenu', function (e) {
        e.preventDefault();
        $('#openwebrx-panel-receiver .openwebrx-bookmark-button').trigger('contextmenu');
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

        // f is where the signal energy sits. Turn that into the dial
        // frequency a real rig would show, so AUTO lands on the on-air
        // number a ham would tune, quote and spot (e.g. 7.125).
        //   AM/FM: carrier is at the dial, no change.
        //   SSB: the audio fills the passband to one side of a suppressed
        //     carrier, so the measured energy centroid sits about a
        //     passband-midpoint away from the carrier. Subtract that
        //     midpoint to land the dial on the carrier, with the voice
        //     falling naturally into the filter.
        //   CW: left alone; UI.setFrequency applies the pitch offset
        //     internally, so the raw signal frequency is what it wants.
        var mode = (UI.getModulation() || '').toLowerCase();
        if (mode !== 'cw' && demod &&
            typeof demod.low_cut === 'number' && typeof demod.high_cut === 'number') {
            f -= (demod.low_cut + demod.high_cut) / 2;
        }
        UI.setFrequency(Math.round(f / 10) * 10, false);
    });

    // RIT (clarifier): while on, the arrow keys nudge the receive offset
    // in 10 Hz steps; the arrows light green and the offset shows on the
    // info line. Off restores the exact VFO frequency.
    var $rit = makeKey('RIT', 'Clarifier: arrows nudge RX while on (right-click: step)');
    $rit.on('click', function () {
        Plugins.rig_skin._rit.set(!Plugins.rig_skin._rit.isOn());
    });

    // right-click opens a small menu to pick the nudge step
    var $ritMenu = $('<div>').addClass('owrx-rig-rit-menu');
    [10, 20, 50, 100].forEach(function (hz) {
        $('<div>').addClass('owrx-rig-rit-menu-item').text(hz + ' Hz')
            .on('click', function (e) {
                e.stopPropagation();
                Plugins.rig_skin._rit.setStep(hz);
                $ritMenu.removeClass('open');
            })
            .appendTo($ritMenu);
    });
    $rit.css('position', 'relative').append($ritMenu);
    $rit.on('contextmenu', function (e) {
        e.preventDefault();
        var cur = Plugins.rig_skin._rit.step();
        $ritMenu.children().each(function () {
            $(this).toggleClass('sel', $(this).text() === cur + ' Hz');
        });
        $ritMenu.toggleClass('open');
    });
    $(document).on('click', function (e) {
        if (!$rit.is(e.target) && !$.contains($rit[0], e.target)) $ritMenu.removeClass('open');
    });
    Plugins.rig_skin._ritChanged = function () {
        var on = Plugins.rig_skin._rit.isOn();
        $rit.toggleClass('highlighted', on);
        if (Plugins.rig_skin._pageArrows) {
            Plugins.rig_skin._pageArrows.toggleClass('owrx-rig-rit-arrow', on);
        }
        if (Plugins.rig_skin._updateInfo) Plugins.rig_skin._updateInfo();
    };

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

    // Keys grouped by function. Left column is audio/RX: MUTE, NR, TS,
    // SQL, then the zoom pair (NR and TS were placed by createSideKeys;
    // MUTE goes on top, SQL just above the zoom pair). Middle column is
    // VFO + memory: A/B and DW (added by createVfoKeys), then LOCK and
    // MW. Right column is scan/screens.
    $('#owrx-rig-keys-left').prepend($mute);
    $('#owrx-rig-keys-left .owrx-rig-zoom-row').before($sql);

    $line.append(
        $('<div>').attr('id', 'owrx-rig-keys-right')
            .append(Plugins.rig_skin._lockKey).append($mw)
            .append(Plugins.rig_skin.makePageRow())
    ).append(
        $('<div>').attr('id', 'owrx-rig-keys-right2')
            .append($scan)
            .append($propKey)
            .append($satKey)
            .append($auto)
            .append($rit)
    );
};

// Horizontal segmented S-meter (rig style), drawn into the frequency
// LCD window, replacing the bar meter when the rig theme is active.
// Fed by wrapping setSmeterRelativeValue(), which receives the same
// normalized 0..1 level that drives the bar.
Plugins.rig_skin.createMeter = function ($freq) {
    if (typeof setSmeterRelativeValue !== 'function' || !$freq.length) return;

    var W = 340, H = 34;
    var dpr = window.devicePixelRatio || 1;
    var canvas = document.createElement('canvas');
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var $meter = $('<div>').attr('id', 'owrx-rig-meter').append(canvas);
    $freq.append($meter);

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var S9 = 0.65;                       // bar position of S9, red zone beyond
    var SEG = 34, SEGW = 8, GAP = 2;     // segment geometry, SEG*(SEGW+GAP) == W
    var VAL_H = 13;                      // value row above the scale
    var BAR_Y = VAL_H + 18, BAR_H = 12;

    // two meter faces: the segmented bar or a virtual analog needle,
    // switched with a right-click on the meter and remembered
    var style = (typeof LS !== 'undefined' && LS.has('rig_meter_style'))
        ? LS.loadStr('rig_meter_style') : 'bar';
    if (style !== 'needle') style = 'bar';

    function meterH() {
        return style === 'needle' ? NH : 34 + VAL_H;
    }

    var pressTimer = null, pressed = false;

    function toggleStyle() {
        style = style === 'bar' ? 'needle' : 'bar';
        if (typeof LS !== 'undefined') LS.save('rig_meter_style', style);
        Plugins.rig_skin._lcdEpoch++;   // the canvas re-measures at the new aspect
        draw();
    }

    $meter.on('contextmenu', function (e) {
        e.preventDefault();
        // Android fires contextmenu on long press; drop the fallback
        // timer so the long press cannot toggle twice
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        toggleStyle();
    });

    // phones have no right-click, and iOS never fires contextmenu: a
    // long press on the meter switches the face there
    $meter.on('pointerdown', function (e) {
        if (e.originalEvent.pointerType !== 'touch') return;
        var sx = e.originalEvent.clientX, sy = e.originalEvent.clientY;
        pressTimer = setTimeout(function () {
            pressTimer = null;
            if (sqDrag) return;   // holding the SQL marker is not a press
            pressed = true;
            toggleStyle();
        }, 550);
        $meter.on('pointermove.press', function (ev) {
            if (pressTimer && Math.abs(ev.originalEvent.clientX - sx) +
                Math.abs(ev.originalEvent.clientY - sy) > 10) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        });
        $meter.one('pointerup.press pointercancel.press', function () {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            $meter.off('pointermove.press');
        });
    });

    // the release after a long press must not toggle the audio scope
    // (this handler is bound before the scope's, so it can stop it)
    $meter.on('click', function (e) {
        if (pressed) {
            pressed = false;
            e.stopImmediatePropagation();
        }
    });

    // modern-rig meter colors: blue segments up to S9, red beyond
    function segColor(t) {
        return t > S9 ? '#ff4130' : '#2ea3ff';
    }

    function sText(v) {
        return v <= 0 ? 'S0' : v <= S9 ? 'S' + Math.round(v / S9 * 9)
            : 'S9+' + (Math.round((v - S9) / (1 - S9) * 12) * 5);
    }

    // squelch threshold in meter units: the slider is in dB on the same
    // scale the stock code maps onto the meter, so the marker is exact
    var $sql = $('#openwebrx-panel-receiver .openwebrx-squelch-slider');

    function squelchT() {
        if (!$sql.length || typeof Waterfall === 'undefined' || !Waterfall.getRange) return null;
        var v = parseFloat($sql.val());
        if (!isFinite(v) || v <= parseFloat($sql.attr('min'))) return null;
        var r = Waterfall.getRange();
        var t = (v - (r.min - 20)) / ((r.max + 20) - (r.min - 20));
        return t > 0 && t <= 1 ? t : null;
    }

    // the SQL marker is draggable: grab it on any face and the squelch
    // slider follows, so the threshold is set right on the instrument
    var sqDrag = false, sqWas = false;

    function pointerT(e) {
        var r = canvas.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width * W;
        var y = (e.clientY - r.top) / r.height * meterH();
        if (style === 'needle') {
            var deg = Math.atan2(x - W / 2, PIVOT_Y - y) * 180 / Math.PI;
            return (deg + A_MAX) / (2 * A_MAX);
        }
        return x / W;
    }

    function setSquelchFromT(t) {
        if (!$sql.length || typeof Waterfall === 'undefined') return;
        var r = Waterfall.getRange();
        var db = (r.min - 20) + Math.max(0, Math.min(1, t)) * ((r.max + 20) - (r.min - 20));
        db = Math.max(parseFloat($sql.attr('min')), Math.min(parseFloat($sql.attr('max')), db));
        $sql.val(Math.round(db)).trigger('input').trigger('change');
        draw();
    }

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', function (e) {
        var sq = squelchT();
        if (sq !== null && Math.abs(pointerT(e) - sq) < 0.05) {
            sqDrag = true;
            sqWas = true;
            e.preventDefault();
            e.stopPropagation();
            try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        }
    });
    canvas.addEventListener('pointermove', function (e) {
        if (sqDrag) {
            setSquelchFromT(pointerT(e));
        } else {
            var sq = squelchT();
            canvas.style.cursor = (sq !== null && Math.abs(pointerT(e) - sq) < 0.05)
                ? 'ew-resize' : '';
        }
    });
    canvas.addEventListener('pointerup', function () { sqDrag = false; });
    canvas.addEventListener('pointercancel', function () { sqDrag = false; });
    // grabbing the marker must not toggle the audio scope
    canvas.addEventListener('click', function (e) {
        if (sqWas) {
            sqWas = false;
            e.stopPropagation();
        }
    });

    function drawScale() {
        // the bar face is taller than the original H; clear all of it or
        // the squelch marker leaves droppings below the rail
        ctx.clearRect(0, 0, W, meterH());
        ctx.font = 'bold 11px roboto-mono, monospace';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#aab4bd';
        ctx.fillText('S', 0, VAL_H + 1);

        var marks = [];
        for (var s = 1; s <= 9; s += 2) marks.push({ t: s / 9 * S9, label: '' + s });
        [20, 40, 60].forEach(function (db, i) {
            marks.push({ t: S9 + (i + 1) / 3 * (1 - S9), label: '+' + db });
        });

        marks.forEach(function (m) {
            var x = Math.min(m.t * W, W - 1);
            ctx.fillStyle = m.t > S9 ? '#ff4130' : '#aab4bd';
            ctx.textAlign = x > W - 12 ? 'right' : 'center';
            ctx.fillText(m.label, x, VAL_H + 1);
            ctx.fillRect(x - 0.5, VAL_H + 14, 1, 3);
        });
    }

    // one segmented bar with grey guide rails above and below, like a
    // modern rig's meter. `lit`/`pk` are segment counts.
    function drawBar(y, h, lit, pk) {
        // bottom rail grey the whole way; top rail grey up to S9 then red
        // over the S9+ zone, like a modern rig's meter
        var s9x = Math.round(S9 * W);
        ctx.fillStyle = '#5b656e';
        ctx.fillRect(0, y + h + 1, W, 1);
        ctx.fillRect(0, y - 2, s9x, 1);
        ctx.fillStyle = '#ff4130';
        ctx.fillRect(s9x, y - 2, W - s9x, 1);
        for (var i = 0; i < SEG; i++) {
            ctx.fillStyle = i < lit ? segColor((i + 0.5) / SEG) : '#12181e';
            ctx.fillRect(i * (SEGW + GAP), y, SEGW, h);
        }
        if (pk > lit) {
            ctx.fillStyle = segColor((pk - 0.5) / SEG);
            ctx.fillRect((pk - 1) * (SEGW + GAP), y, SEGW, h);
        }
    }

    // virtual analog meter: scale arc with a red zone past S9 and a
    // needle on a pivot below the canvas, driven by the same ballistics
    // as the bar; a thin ghost needle holds the peak
    // curved like the real face and spanning nearly the full width,
    // with the arc ends riding high enough above the bottom edge that
    // the needle stays long at full deflection; the apex clears the
    // top readout row
    var NH = 116, PIVOT_Y = 265, R_ARC = 225, A_MAX = 40;  // degrees each side

    function needleXY(t, r) {
        var a = (-A_MAX + 2 * A_MAX * Math.min(1, t)) * Math.PI / 180;
        return [W / 2 + Math.sin(a) * r, PIVOT_Y - Math.cos(a) * r];
    }

    function arc(t0, t1, r, color, width) {
        var a0 = (-A_MAX + 2 * A_MAX * t0 - 90) * Math.PI / 180;
        var a1 = (-A_MAX + 2 * A_MAX * t1 - 90) * Math.PI / 180;
        ctx.beginPath();
        ctx.arc(W / 2, PIVOT_Y, r, a0, a1);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
    }

    function drawNeedle() {
        ctx.clearRect(0, 0, W, NH);
        // Icom style face: one continuous shallow arc, white then red
        // past S9, fine ticks, the numbers with clear air above them
        arc(0, S9, R_ARC, '#e8ecef', 2);
        arc(S9, 1, R_ARC, '#ff4130', 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = 'bold 10px roboto-mono, monospace';
        for (var s = 1; s <= 9; s++) {
            var t = s / 9 * S9;
            var major = (s % 2) === 1;
            var p0 = needleXY(t, R_ARC), p1 = needleXY(t, R_ARC + (major ? 7 : 4));
            ctx.strokeStyle = '#e8ecef';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
            if (major) {
                var pl = needleXY(t, R_ARC + 14);
                ctx.fillStyle = '#e8ecef';
                ctx.fillText('' + s, pl[0], pl[1] + 3);
            }
        }
        // S sits as the first label of the row, just before the 1
        var ps = needleXY(-0.04, R_ARC + 14);
        ctx.fillStyle = '#e8ecef';
        ctx.fillText('S', ps[0], ps[1] + 3);
        for (var d = 10; d <= 60; d += 10) {
            var td = S9 + d / 60 * (1 - S9);
            var majorD = (d % 20) === 0;
            var q0 = needleXY(td, R_ARC), q1 = needleXY(td, R_ARC + (majorD ? 7 : 4));
            ctx.strokeStyle = '#ff4130';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
            if (majorD) {
                var ql = needleXY(td, R_ARC + 14);
                ctx.fillStyle = '#ff4130';
                ctx.fillText('+' + d + (d === 60 ? 'dB' : ''), ql[0], ql[1] + 3);
            }
        }
        // the corner readouts live at the top, clear of the arc ends
        ctx.textBaseline = 'top';
        // live dB readout, derived from the same mapping as the needle
        if (typeof Waterfall !== 'undefined' && Waterfall.getRange) {
            var rng = Waterfall.getRange();
            var db = (rng.min - 20) + current * ((rng.max + 20) - (rng.min - 20));
            ctx.font = '10px roboto-mono, monospace';
            ctx.fillStyle = '#93a0ab';
            ctx.textAlign = 'left';
            ctx.fillText(db.toFixed(1) + ' dB', 4, 3);
        }
        // squelch threshold: a small pointer under the arc (separate from
        // the scale); the needle past it means the audio gate is open
        var sq = squelchT();
        if (sq !== null) {
            var tip = needleXY(sq, R_ARC - 9);
            var b0 = needleXY(sq - 0.014, R_ARC - 17);
            var b1 = needleXY(sq + 0.014, R_ARC - 17);
            ctx.fillStyle = '#f0c040';
            ctx.beginPath();
            ctx.moveTo(tip[0], tip[1]);
            ctx.lineTo(b0[0], b0[1]);
            ctx.lineTo(b1[0], b1[1]);
            ctx.closePath();
            ctx.fill();
            ctx.font = 'bold 8px roboto-mono, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            var lp = needleXY(sq, R_ARC - 20);
            // near the arc ends the label would leave the face
            if (lp[1] < NH - 10) ctx.fillText('SQL', lp[0], lp[1]);
            ctx.textBaseline = 'bottom';
        }
        // numeric readout, like a modern rig's meter
        ctx.font = 'bold 13px roboto-mono, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = current > S9 ? '#ff4130' : '#f2f5f7';
        ctx.shadowColor = 'rgba(215, 232, 255, 0.4)';
        ctx.shadowBlur = 5;
        ctx.fillText(sText(current), W - 4, 2);
        ctx.shadowBlur = 0;
        if (peak > current + 0.02) {
            ctx.font = '10px roboto-mono, monospace';
            ctx.fillStyle = '#5b656e';
            ctx.fillText('pk ' + sText(peak), W - 4, 17);
        }
        ctx.textBaseline = 'bottom';
        // the needle runs from the bottom edge of the face to just past
        // the arc, so it stays long and visible at any deflection
        function needleBase(t) {
            var a = (-A_MAX + 2 * A_MAX * Math.min(1, t)) * Math.PI / 180;
            return (PIVOT_Y - NH) / Math.cos(a);
        }
        if (peak > current + 0.01) {
            var g0 = needleXY(peak, needleBase(peak)), g1 = needleXY(peak, R_ARC + 1);
            ctx.strokeStyle = '#6b7680';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.stroke();
        }
        var n0 = needleXY(current, needleBase(current)), n1 = needleXY(current, R_ARC + 3);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(215, 232, 255, 0.6)';
        ctx.shadowBlur = 5;
        ctx.beginPath(); ctx.moveTo(n0[0], n0[1]); ctx.lineTo(n1[0], n1[1]); ctx.stroke();
        ctx.shadowBlur = 0;
    }

    var target = 0, current = 0, peak = 0, peakT = 0, lastT = null, anim = null;

    // the value row above the scale: the S reading, with the held peak
    // in small print beside it
    function drawValueRow() {
        ctx.textBaseline = 'top';
        ctx.font = 'bold 12px roboto-mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = current > S9 ? '#ff4130' : '#f2f5f7';
        var val = sText(current);
        ctx.fillText(val, W - 1, 0);
        if (peak > current + 0.02) {
            var vw = ctx.measureText(val).width;
            ctx.font = '10px roboto-mono, monospace';
            ctx.fillStyle = '#5b656e';
            ctx.fillText('pk ' + sText(peak), W - vw - 9, 2);
        }
        ctx.textBaseline = 'bottom';
    }

    function draw() {
        Plugins.rig_skin.fitCanvas(canvas, ctx, W, meterH());
        if (style === 'needle') drawNeedle();
        else {
            drawScale();
            drawBar(BAR_Y, BAR_H, Math.round(current * SEG), Math.round(peak * SEG));
            // squelch threshold line through the bar
            var sq = squelchT();
            if (sq !== null) {
                var x = Math.round(sq * W);
                ctx.fillStyle = '#f0c040';
                ctx.fillRect(x - 1, BAR_Y - 3, 2, BAR_H + 6);
            }
            drawValueRow();
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
