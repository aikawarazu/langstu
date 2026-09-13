#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 PWA 图标（不依赖 PIL，只用标准库写 PNG/RGBA）。

绘制：紫 → 绿渐变圆角底（与站点 --pri → --ok 呼应）+ 白色播放三角（呼应「音频精听」）。
用法：python3 backend/scripts/make_pwa_icons.py
输出：app/icons/icon-192.png、icon-512.png、icon-maskable-512.png、apple-touch-icon.png
     （maskable 版图形缩到中心安全区，整幅不透明，供 Android 自适应图标裁切）
"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ICON_DIR = os.path.join(ROOT, "app", "icons")

PRI = (67, 83, 255)      # #4353ff
OK = (26, 166, 115)      # #1aa673
WHITE = (255, 255, 255)
SS = 3                   # 每像素子采样数（抗锯齿）


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def bg_at(x, y, size):
    """对角线渐变：左上紫 → 右下绿"""
    t = (x + y) / max(1.0, (2.0 * (size - 1)))
    return lerp(PRI, OK, t)


def make_triangle(size, scale):
    """居中的播放三角顶点，scale 控制相对画布大小"""
    cx = cy = size / 2.0
    hh = size * 0.30 * scale
    hw = size * 0.22 * scale
    # 整体略微右移，让三角视觉居中（三角形重心偏左）
    cx += hw * 0.12 * scale
    return [(cx - hw, cy - hh), (cx - hw, cy + hh), (cx + hw * 1.25, cy)]


def in_triangle(p, pts):
    def sign(a, b, c):
        return (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1])
    d1 = sign(p, pts[0], pts[1])
    d2 = sign(p, pts[1], pts[2])
    d3 = sign(p, pts[2], pts[0])
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)


def corner_alpha(x, y, size, r):
    """圆角外返回 0，否则 1（子采样求覆盖率）"""
    if r <= 0:
        return 1.0
    inside = 0
    step = 1.0 / SS
    for sy in range(SS):
        for sx in range(SS):
            px = x + step * (sx + 0.5)
            py = y + step * (sy + 0.5)
            cx = cy = None
            if px < r and py < r:
                cx, cy = r, r
            elif px >= size - r and py < r:
                cx, cy = size - r, r
            elif px < r and py >= size - r:
                cx, cy = r, size - r
            elif px >= size - r and py >= size - r:
                cx, cy = size - r, size - r
            if cx is None or ((px - cx) ** 2 + (py - cy) ** 2) <= r * r:
                inside += 1
    return inside / float(SS * SS)


def render(size, radius_ratio=0.22, maskable=False, tri_scale=1.0):
    r = 0 if maskable else size * radius_ratio
    pts = make_triangle(size, tri_scale)
    step = 1.0 / SS
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            # 渐变底色（用像素中心取值）
            base = bg_at(x + 0.5, y + 0.5, size)
            tri_hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    px = x + step * (sx + 0.5)
                    py = y + step * (sy + 0.5)
                    if in_triangle((px, py), pts):
                        tri_hits += 1
            cov = tri_hits / float(SS * SS)
            rgb = lerp(base, WHITE, cov)
            alpha = 1.0 if maskable else corner_alpha(x, y, size, r)
            if not maskable:
                a = int(round(255 * alpha))
                # 圆角外：颜色保留、alpha 归零（PNG 非预乘）
                row.extend([rgb[0], rgb[1], rgb[2], a])
            else:
                row.extend([rgb[0], rgb[1], rgb[2], 255])
        rows.append(bytes(row))
    return rows


def to_png(rows, size):
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type 0
        raw.extend(row)
    compressor = zlib.compressobj(9)
    data = compressor.compress(bytes(raw)) + compressor.flush()

    def chunk(typ, body):
        return struct.pack(">I", len(body)) + typ + body + struct.pack(">I", zlib.crc32(typ + body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", data) + chunk(b"IEND", b"")


def write(name, size, **kw):
    os.makedirs(ICON_DIR, exist_ok=True)
    png = to_png(render(size, **kw), size)
    path = os.path.join(ICON_DIR, name)
    with open(path, "wb") as f:
        f.write(png)
    print("wrote %s (%dx%d, %d bytes)" % (os.path.relpath(path, ROOT), size, size, len(png)))


def main():
    write("icon-192.png", 192)
    write("icon-512.png", 512)
    write("icon-maskable-512.png", 512, maskable=True, tri_scale=0.62)  # 安全区 ~80%
    write("apple-touch-icon.png", 180, radius_ratio=0.0)                # iOS 自行加圆角


if __name__ == "__main__":
    main()
