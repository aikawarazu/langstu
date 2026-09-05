#!/usr/bin/env python3
"""抓取 nce.mleo.site 第二/三/四册 book.json，生成 app/data/NCE2-4.js。
第二册等为"一课一音频"，直接整册接入。"""
import json, os, re, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "app", "data"))
os.makedirs(OUT_DIR, exist_ok=True)

VIDEO = {  # 胶学合集（第二册拆两半）；逐课分P定位暂缺，先给合集原链
    "NCE2": [("L01-48", "https://www.bilibili.com/video/BV1cu411r7pw/"),
             ("L49-96", "https://www.bilibili.com/video/BV1XA4y1o72C/")],
    "NCE3": [("L01-60", "https://www.bilibili.com/video/BV1zY4y187cK/")],
    "NCE4": [],
}
CN = {"NCE2": "第二册", "NCE3": "第三册", "NCE4": "第四册"}

def fetch(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")

for key in ["NCE2", "NCE3", "NCE4"]:
    d = json.loads(fetch(f"https://nce.mleo.site/{key}/book.json"))
    base = f"https://nce.mleo.site/{key}/"
    units = []
    for i, u in enumerate(d.get("units", [])):
        fn = u["filename"]
        m = re.match(r"^(\d+)\.\s*(.*)$", u.get("title", fn))
        n = int(m.group(1)) if m else i + 1
        title = (m.group(2) if m else u.get("title", fn)).strip()
        enc = urllib.parse.quote(fn)
        units.append({
            "u": i + 1, "n": n, "title": title, "filename": fn, "ls": [n],
            "audio": f"{base}{enc}.mp3", "lrc": f"{base}{enc}.lrc",
        })
    payload = {
        "key": key, "title": f"新概念英语 {CN[key]}", "level": d.get("level", ""),
        "total": len(units), "per": "lesson",
        "units": units,
        "video": {"pages": [], "watch": [w for _, w in VIDEO.get(key, [])]},
    }
    path = os.path.join(OUT_DIR, f"{key}.js")
    js = "/* 由 backend/scripts/gen_books_data.py 生成，勿手改 */\nwindow." + key + " = " + \
         json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(path, "w", encoding="utf-8").write(js)
    print(f"written {path} units={len(units)} n1={units[0]['n']} title={units[0]['title']}")
