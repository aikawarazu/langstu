#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""不依赖 PIL，用标准库生成扩展图标（PNG/RGBA）。
绘制：青绿色圆角底 + 白色播放三角（呼应「音频精听 / 学习」）。
用法：python3 extension/make_icon.py
"""
import os
import struct
import zlib

ICON_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "extension", "icons")
TEAL = (43, 179, 163)
WHITE = (255, 255, 255)


def make_buffer(size):
    # rows -> [ (r,g,b,a) * size ]
    return [[list(TEAL) + [255] for _ in range(size)] for _ in range(size)]


def round_corners(buf, size, r):
    for y in range(size):
        for x in range(size):
            # 四个角外的区域透明
            corner = None
            if x < r and y < r:
                corner = (r - 1, r - 1)
            elif x >= size - r and y < r:
                corner = (size - r, r - 1)
            elif x < r and y >= size - r:
                corner = (r - 1, size - r)
            elif x >= size - r and y >= size - r:
                corner = (size - r, size - r)
            if corner and ((x - corner[0]) ** 2 + (y - corner[1]) ** 2) > r * r:
                buf[y][x][3] = 0


def fill_triangle(buf, size, color):
    # 居中播放三角
    cx = size / 2
    cy = size / 2
    half_h = size * 0.30
    half_w = size * 0.22
    p1 = (cx - half_w, cy - half_h)
    p2 = (cx - half_w, cy + half_h)
    p3 = (cx + half_w * 1.25, cy)
    pts = [p1, p2, p3]

    def sign(a, b, c):
        return (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1])

    for y in range(size):
        for x in range(size):
            p = (x + 0.5, y + 0.5)
            d1 = sign(p, p1, p2)
            d2 = sign(p, p2, p3)
            d3 = sign(p, p3, p1)
            has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
            has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
            if not (has_neg and has_pos):
                buf[y][x][0:3] = list(color)


def to_png(buf, size):
    raw = bytearray()
    for row in buf:
        raw.append(0)  # filter type 0
        for px in row:
            raw.extend([px[0], px[1], px[2], px[3]])
    compressor = zlib.compressobj(9)
    data = compressor.compress(bytes(raw)) + compressor.flush()

    def chunk(typ, body):
        c = struct.pack(">I", len(body)) + typ + body
        crc = zlib.crc32(typ + body) & 0xFFFFFFFF
        return c + struct.pack(">I", crc)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", data) + chunk(b"IEND", b"")


def main():
    os.makedirs(ICON_DIR, exist_ok=True)
    for size in (16, 48, 128):
        buf = make_buffer(size)
        round_corners(buf, size, max(2, size // 8))
        fill_triangle(buf, size, WHITE)
        png = to_png(buf, size)
        path = os.path.join(ICON_DIR, "icon%d.png" % size)
        with open(path, "wb") as f:
            f.write(png)
        print("wrote", path, len(png), "bytes")


if __name__ == "__main__":
    main()
