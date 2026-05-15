#!/usr/bin/env python3
"""Generate PNG icons for Chrome manifest (stdlib only)."""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "..", "public", "icons")


def crc32(data: bytes) -> int:
    import binascii

    return binascii.crc32(data) & 0xFFFFFFFF


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc32(tag + data))


def lerp(a: float, b: float, t: float) -> int:
    return int(round(a + (b - a) * max(0.0, min(1.0, t))))


def line_dist(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    ln = (dx * dx + dy * dy) ** 0.5 or 1.0
    u = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (ln * ln)))
    cx, cy = ax + u * dx, ay + u * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def rgba(x: int, y: int, size: int) -> tuple[int, int, int, int]:
    bg = (248, 250, 252)
    pad = size * 0.1
    handle_h = size * 0.14
    bx = pad
    by = pad + handle_h * 0.85
    bw = size - pad * 2
    bh = size * 0.5
    in_handle = bx + bw * 0.32 <= x <= bx + bw * 0.68 and pad * 0.6 <= y < by
    in_body = bx <= x <= bx + bw and by <= y <= by + bh
    inside = in_body or in_handle
    nx, ny = x / (size - 1), y / (size - 1)
    t = min(1.0, max(0.0, (nx * 0.5 + ny * 0.9) / 1.35))
    c0, c1 = (0, 180, 219), (142, 36, 170)

    def grad():
        return (lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t), 255)

    x1, y1 = bx + bw * 0.3, by + bh * 0.52
    x2, y2 = bx + bw * 0.46, by + bh * 0.68
    x3, y3 = bx + bw * 0.78, by + bh * 0.34
    wline = max(1.1, size * 0.085)
    on_check = inside and (
        line_dist(x, y, x1, y1, x2, y2) < wline or line_dist(x, y, x2, y2, x3, y3) < wline
    )
    if on_check:
        return (255, 255, 255, 255)
    if inside:
        return grad()
    return (*bg, 255)


def write_png(path: str, size: int) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            r, g, b, a = rgba(x, y, size)
            raw.extend((r, g, b, a))
    compressed = zlib.compress(bytes(raw), 9)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    sig = b"\x89PNG\r\n\x1a\n"
    data = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for s in (16, 32, 48, 128):
        p = os.path.join(OUT, f"icon-{s}.png")
        write_png(p, s)
        print("wrote", p, os.path.getsize(p))


if __name__ == "__main__":
    main()
