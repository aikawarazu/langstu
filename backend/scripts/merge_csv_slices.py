#!/usr/bin/env python3
"""权威数据来自 user 提供的 backend/data/nce_media_map.csv：
给 app/data/NCE2.js、NCE3.js 每个 unit 烧入 CSV 的“整课切片视频”直链(ve=embed,vw=watch)。
合集分P数据(video/pages/v)保留之前抓取结果不动，不再访问网络。
"""
import csv, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "..", "..", "app", "data"))
CSV = os.path.abspath(os.path.join(HERE, "..", "data", "nce_media_map.csv"))

rows = list(csv.DictReader(open(CSV, encoding="utf-8")))
by_book = {}
for r in rows:
    by_book.setdefault(r["book"].strip(), []).append(r)

def load(p):
    txt = open(p, encoding="utf-8").read()
    return json.loads(txt[txt.index("=") + 1:].strip().rstrip(";"))

def save(p, d, tag):
    js = f"/* 由 backend/scripts/merge_csv_slices.py 更新（{tag}） */\nwindow.{d['key']} = " + \
         json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(p, "w", encoding="utf-8").write(js)
    return len(js)

total = 0
for key, fn in [("NCE2", "NCE2.js"), ("NCE3", "NCE3.js")]:
    p = os.path.join(APP, fn)
    d = load(p)
    rows = sorted(by_book[key], key=lambda r: int(r["unit_index"]))
    used = 0
    for r in rows:
        uid = int(r["unit_index"])
        u = next((x for x in d["units"] if x.get("u") == uid), None)
        if u is None:
            continue
        u["ve"] = r["video_lesson_embed"].strip() if r.get("video_lesson_embed") else ""
        u["vw"] = r["video_lesson_watch"].strip() if r.get("video_lesson_watch") else ""
        if u["ve"]:
            used += 1
    save(p, d, f"slices {used}/{len(rows)}")
    total += used
    print(key, f"slices烧录 {used}/{len(rows)}")
print("done total", total)
