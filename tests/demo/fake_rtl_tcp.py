#!/usr/bin/env python3
"""Minimal rtl_tcp server: RTL0 header, then repeating precomputed IQ with
noise plus a few carriers, paced to the sample rate. Commands are ignored."""
import math, random, socket, struct, threading, time

RATE = 2400000
PORT = 11234

def build_block(seconds=1.0, keyed_tone=False):
    n = int(RATE * seconds)
    buf = bytearray(2 * n)
    # a few carriers at fixed offsets from center (Hz), varying strength
    tones = [(-300000, 25), (-120000, 18), (5000, 30), (90000, 12), (250000, 20)]
    if keyed_tone:
        # strong extra carrier at +50 kHz, only in the ON block: the
        # alternating blocks make a pulsing signal for meter testing
        tones = tones + [(50000, 45)]
    rnd = random.Random(1)
    two_pi = 2 * math.pi
    for i in range(n):
        t = i / RATE
        re = rnd.gauss(0, 6)
        im = rnd.gauss(0, 6)
        for f, a in tones:
            ph = two_pi * f * t
            re += a * math.cos(ph)
            im += a * math.sin(ph)
        buf[2 * i] = max(0, min(255, int(127.5 + re)))
        buf[2 * i + 1] = max(0, min(255, int(127.5 + im)))
    return bytes(buf)

BLOCK = build_block()
BLOCK_ON = build_block(keyed_tone=True)

def block_now():
    # 4 s on, 4 s off, on the wall clock
    return BLOCK_ON if (int(time.time()) // 4) % 2 == 0 else BLOCK

def reader(conn):
    try:
        while conn.recv(1024):
            pass
    except OSError:
        pass

def serve(conn):
    conn.sendall(b'RTL0' + struct.pack('>II', 1, 29))
    threading.Thread(target=reader, args=(conn,), daemon=True).start()
    chunk = RATE // 10 * 2  # 100ms of IQ bytes
    pos = 0
    nxt = time.monotonic()
    try:
        while True:
            blk = block_now()
            end = pos + chunk
            if end <= len(blk):
                conn.sendall(blk[pos:end])
                pos = end % len(blk)
            else:
                conn.sendall(blk[pos:] + blk[:end - len(blk)])
                pos = end - len(blk)
            nxt += 0.1
            delay = nxt - time.monotonic()
            if delay > 0:
                time.sleep(delay)
    except OSError:
        pass
    finally:
        conn.close()

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(('127.0.0.1', PORT))
srv.listen(2)
print('fake rtl_tcp on', PORT, flush=True)
while True:
    c, _ = srv.accept()
    threading.Thread(target=serve, args=(c,), daemon=True).start()
