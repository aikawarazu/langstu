#!/usr/bin/env python3
"""把 NCE1_course.json 转成纯前端可引用的 data/NCE1.js（去掉冗余 page_parts）。"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, "..", "data", "gen", "NCE1_course.json"))
OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "app", "data"))
os.makedirs(OUT_DIR, exist_ok=True)
OUT = os.path.join(OUT_DIR, "NCE1.js")

d = json.load(open(SRC, encoding="utf-8"))
meta = d["meta"]
payload = {
    "key": meta["book"],                 # 与 NCE2/3/4 一致，前端按 key 取册
    "book": meta["book"],                # 兼容旧字段
    "title": "新概念英语 第一册",
    "per": "unit",                       # 两课一个音频
    "total": meta["total_lessons"],
    "video": {
        "bvid": meta["video_collection"]["bvid"],
        "title": meta["video_collection"]["title"],
        "embed": meta["video_collection"]["embed_tpl"],
        "watch": meta["video_collection"]["watch_tpl"],
        "pages": meta["page_parts"],
    },
    "units": d["units"],          # 72: u/filename/title/lesson_no/ls/audio/lrc/audio85/lrc85
    "v": d["lesson_video_p"],     # "课号" -> [p,...]
}
body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
# 主变量名与 NCE2/3/4 统一为 window.NCE1，同时保留 window.N1 兼容旧引用
js = ("/* 由 backend/scripts/gen_app_data.py 生成，勿手改 */\n"
      "window.NCE1 = " + body + ";\n"
      "window.N1 = window.NCE1;\n")
open(OUT, "w", encoding="utf-8").write(js)
print("written", OUT, len(js), "bytes")
print("units:", len(payload["units"]), "| v map keys:", len(payload["v"]))
