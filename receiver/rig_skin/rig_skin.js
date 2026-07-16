/*
 * rig_skin: dark receiver front-panel theme with a rotating VFO knob.
 *
 * Adds a "Rig" entry to the theme selector. When active, the receiver
 * panel is skinned as a rig front panel and a tuning knob appears below
 * the frequency display. Drag, flick or scroll the knob to tune; each
 * knob step follows the tuning step selector.
 */

Plugins.rig_skin._version = 0.1;

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

    Plugins.rig_skin.createVfoLine();
    return true;
};

// The S-meter goes inside the frequency LCD window (like a modern
// rig's screen); the VFO knob gets its own centered line below it.
Plugins.rig_skin.createVfoLine = function () {
    var $container = $('#openwebrx-panel-receiver .frequencies-container');
    if (!$container.length) return;

    Plugins.rig_skin.createMeter($container.find('.frequencies'));
    Plugins.rig_skin.createScope($container.find('.frequencies'));
    Plugins.rig_skin.createSignalInfo($container);
    var $line = $('<div>').attr('id', 'owrx-rig-knob-line').addClass('openwebrx-panel-line');
    $container.after($line);
    Plugins.rig_skin.createSideKeys($line);
    Plugins.rig_skin.createKnob($line);
    Plugins.rig_skin.createScanKeys($line);
};

// Mode and filter width readout in the LCD's top right corner,
// updated by polling the demodulator state.
Plugins.rig_skin.createSignalInfo = function ($container) {
    var $mode = $('<div>').addClass('owrx-rig-info-mode');
    var $filter = $('<div>').addClass('owrx-rig-info-filter');
    $container.append(
        $('<div>').attr('id', 'owrx-rig-info').append($mode).append($filter)
    );

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
        $mode.text(mode);
        $filter.text(filter);
    }

    update();
    setInterval(update, 500);
};

// Audio scope inside the LCD: audio spectrum on the left, waveform on
// the right, fed by an AnalyserNode tapped into the audio output chain.
// Toggled by clicking the S-meter; off by default.
Plugins.rig_skin.createScope = function ($freq) {
    if (!$freq.length) return;

    var W = 310, H = 40;
    var canvas = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var $scope = $('<div>').attr('id', 'owrx-rig-scope').append(canvas);
    $freq.append($scope);

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var FFT_W = 150, WAVE_X = 158, WAVE_W = W - WAVE_X;
    var analyser = null, freqData = null, timeData = null, timer = null;

    // the audio graph only exists once audio has started, attach lazily
    function attach() {
        if (analyser) return true;
        if (typeof audioEngine === 'undefined' || !audioEngine ||
            !audioEngine.audioContext || !audioEngine.gainNode) return false;
        analyser = audioEngine.audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.5;
        audioEngine.gainNode.connect(analyser);
        freqData = new Uint8Array(analyser.frequencyBinCount);
        timeData = new Uint8Array(analyser.fftSize);
        return true;
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#1a2026';
        ctx.fillRect(FFT_W + 3, 0, 2, H);

        if (attach()) {
            analyser.getByteFrequencyData(freqData);
            analyser.getByteTimeDomainData(timeData);

            // audio spectrum 0..4 kHz as bars
            var sr = audioEngine.audioContext.sampleRate;
            var maxBin = Math.max(1, Math.min(freqData.length,
                Math.round(4000 / (sr / 2) * freqData.length)));
            var BARS = 34, bw = FFT_W / BARS;
            ctx.fillStyle = '#3fa9f5';
            for (var b = 0; b < BARS; b++) {
                var i0 = Math.floor(b * maxBin / BARS);
                var i1 = Math.max(i0 + 1, Math.floor((b + 1) * maxBin / BARS));
                var v = 0;
                for (var i = i0; i < i1; i++) v = Math.max(v, freqData[i]);
                var h = v / 255 * (H - 2);
                ctx.fillRect(b * bw, H - h, bw - 1, h);
            }

            // waveform, ~10ms window so voice and tones stay readable
            var wN = Math.floor(timeData.length / 4);
            ctx.strokeStyle = '#3adb4a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (var x = 0; x < WAVE_W; x++) {
                var s = timeData[Math.floor(x * wN / WAVE_W)] / 255;
                var y = (1 - s) * (H - 2) + 1;
                if (x === 0) ctx.moveTo(WAVE_X + x, y); else ctx.lineTo(WAVE_X + x, y);
            }
            ctx.stroke();
        } else {
            // no audio yet: flat baseline
            ctx.strokeStyle = '#1f4a26';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(WAVE_X, H / 2);
            ctx.lineTo(W, H / 2);
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

// NR and LOCK keys with status LEDs, left of the dial. NR mirrors the
// stock noise reduction toggle; LOCK freezes the dial against accidental
// tuning (useful on touch devices).
Plugins.rig_skin.createSideKeys = function ($line) {
    var makeKey = Plugins.rig_skin.makeKey;
    var $nr = makeKey('NR', 'Noise reduction on/off');
    var $lock = makeKey('LOCK', 'Lock the dial').addClass('owrx-rig-key-lock');

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

    $line.append(
        $('<div>').attr('id', 'owrx-rig-keys-left').append($nr).append($lock)
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

    $line.append(
        $('<div>').attr('id', 'owrx-rig-keys-right').append($scan).append($sql).append($mw)
    );
};

// Horizontal segmented S-meter (rig style), drawn into the frequency
// LCD window, replacing the bar meter when the rig theme is active.
// Fed by wrapping setSmeterRelativeValue(), which receives the same
// normalized 0..1 level that drives the bar.
Plugins.rig_skin.createMeter = function ($freq) {
    if (typeof setSmeterRelativeValue !== 'function' || !$freq.length) return;

    var W = 310, H = 34;
    var canvas = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    $freq.append($('<div>').attr('id', 'owrx-rig-meter').append(canvas));

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var S9 = 0.65;                       // bar position of S9, red zone beyond
    var SEG = 31, SEGW = 8, GAP = 2;     // segment geometry, SEG*(SEGW+GAP) == W
    var BAR_Y = 18, BAR_H = 12;

    function segColor(t) {
        return t > S9 ? '#ff4a33' : '#e8ecef';
    }

    function drawScale() {
        ctx.clearRect(0, 0, W, H);
        ctx.font = 'bold 9px roboto-mono, monospace';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#8a939c';
        ctx.fillText('S', 0, 2);

        var marks = [];
        for (var s = 1; s <= 9; s += 2) marks.push({ t: s / 9 * S9, label: '' + s });
        [20, 40, 60].forEach(function (db, i) {
            marks.push({ t: S9 + (i + 1) / 3 * (1 - S9), label: '' + db });
        });

        marks.forEach(function (m) {
            var x = Math.min(m.t * W, W - 1);
            ctx.fillStyle = segColor(m.t);
            ctx.textAlign = x > W - 10 ? 'right' : 'center';
            ctx.fillText(m.label, x, 2);
            ctx.fillRect(x - 0.5, 13, 1, 4);
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
        var steps = e.deltaY < 0 ? 1 : -1;
        angle += steps * DEG_PER_STEP;
        render();
        tuneBySteps(steps);
    }, { passive: false });
};
