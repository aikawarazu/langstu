#!/usr/bin/env python3
"""抓取 NCE2/NCE3 胶学合集播放列表 → 课↔分集P 映射，并入 app/data/NCE2.js、NCE3.js。"""
import json, os, re, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
APP_DATA = os.path.abspath(os.path.join(HERE, "..", "..", "app", "data"))
GEN = os.path.join(HERE, "..", "data", "gen")
os.makedirs(GEN, exist_ok=True)

# 册 -> [(bvid, 最大课号), ...]
COLLECTIONS = {
    "NCE2": [("BV1cu411r7pw", 48), ("BV1XA4y1o72C", 96)],
    "NCE3": [("BV1zY4y187cK", 60)],
}
TITLES = {"NCE2": "新概念英语 第二册", "NCE3": "新概念英语 第三册"}

def fetch(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=25).read()

def lesson_nums(part):
    if "开篇" in part or "总结" in part or "课前" in part:
        return []
    m = re.match(r"^L?\s*0*(\d{1,3})(?!\d)", part.strip())
    if not m:
        return []
    return [int(m.group(1))]

for book in ["NCE2", "NCE3"]:
    pages_all, vmap = [], {}
    for bvid, maxN in COLLECTIONS[book]:
        d = json.loads(fetch(f"https://api.bilibili.com/x/player/pagelist?bvid={bvid}"))["data"]
        for p in d:
            pages_all.append({"p": p["page"], "part": p["part"]})
            for n in lesson_nums(p["part"]):
                if 1 <= n <= maxN:
                    vmap.setdefault(str(n), []).append(p["page"])
    for k in vmap: vmap[k].sort()
    # 写入
    path = os.path.join(APP_DATA, f"{book}.js")
    txt = open(path, encoding="utf-8").read()
    payload = json.loads(txt[txt.index("=") + 1:].strip().rstrip(";"))
    payload["video"] = {
        "bvid": COLLECTIONS[book][0][0],
        "title": TITLES[book] + " · 胶学 x 刘羽Leo",
        "pages": pages_all,
        "watch": ["https://www.bilibili.com/video/%s/" % COLLECTIONS[book][0][0],
                  "https://www.bilibili.com/video/%s/" % COLLECTIONS[book][1][0]] if book == "NCE2" else
                  ["https://www.bilibili.com/video/%s/" % COLLECTIONS[book][0][0]],
        "embed": "https://player.bilibili.com/player.html?bvid=%s&high_quality=1&autoplay=0&p={p}" % COLLECTIONS[book][0][0],
    }
    payload["v"] = vmap
    js = "/* 由 backend/scripts/gen_more_video_map.py 更新 */\nwindow." + book + " = " + \
         json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(path, "w", encoding="utf-8").write(js)
    cov = sum(1 for k in vmap.values() if k)
    print(f"{book}: pages={len(pages_all)} 有视频课={len(vmap)}/满 示例 L1->P{vmap.get('1')} L10->P{vmap.get('10')}")
