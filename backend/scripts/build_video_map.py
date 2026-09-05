#!/usr/bin/env python3
"""解析胶学 NCE1 合集播放列表 → 生成 课↔视频P 精确映射 + NCE1 课程数据。
输入: bilibili pagelist API + backend/data/nce_media_map.json
输出: backend/data/gen/NCE1_course.json
"""
import json, re, urllib.request, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "gen")
os.makedirs(OUT, exist_ok=True)

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=20).read()

# ---- 1. 拉取播放列表 ----
BVID = "BV1xa411J7jJ"
raw = json.loads(fetch(f"https://api.bilibili.com/x/player/pagelist?bvid={BVID}"))
pages = raw["data"]
print(f"[ok] 播放列表 {len(pages)}P")

def lesson_nums_of(part: str):
    """从 part 标题提取课号集合，如 '001 语法 文章'->[1], '023 024 ...'->[23,24], '141+142'->[141,142]"""
    s = part.split("｜")[0].strip()
    m = re.match(r"^([0-9\s+\u0026&]+)", s)
    if not m:
        return []
    tok = m.group(1)
    nums = []
    for chunk in re.split(r"[\s+&\u0026]+", tok.strip()):
        if chunk.isdigit():
            nums.append(int(chunk))
    return nums

lesson_pages = {}   # lesson -> [page,...]
page_parts = []
for p in pages:
    pg, part = p["page"], p["part"]
    page_parts.append({"p": pg, "part": part})
    for n in lesson_nums_of(part):
        if 1 <= n <= 144:
            lesson_pages.setdefault(n, []).append(pg)

# ---- 2. 检查缺口：1..144 哪些课没有视频P ----
missing = [n for n in range(1, 145) if n not in lesson_pages]
extra = sorted(k for k in lesson_pages if not (1 <= k <= 144))
print(f"[map] 有视频的课 {len(lesson_pages)}/144；缺口(无任何P): {missing or '无'}")
if extra: print(f"[warn] 超出1-144的课号: {extra}")

# ---- 3. 读 nce_media_map.json 的 NCE1 段 ----
media = json.load(open(os.path.join(HERE, "..", "data", "nce_media_map.json"), encoding="utf-8"))
n1 = [u for u in media["units"] if u["book"] == "NCE1"]
print(f"[ok] nce_media_map NCE1 units = {len(n1)}")

units_out = []
for u in n1:
    def lrange(ln):  # '001-002' -> [1,2]
        a, b = ln.split("-")
        return [int(a), int(b)]
    ls = lrange(u["lesson_no"])
    unit = {
        "u": u["unit_index"], "filename": u["unit_title"], "title": u["lesson_title_en"],
        "lesson_no": u["lesson_no"], "ls": ls,
        "audio": u.get("audio_url", ""), "lrc": u.get("lrc_url", ""),
        "audio85": u.get("audio_85_url", ""), "lrc85": u.get("lrc_85_url", ""),
    }
    units_out.append(unit)

# ---- 4. 每课的视频P（一个课可能多个P，如单词/语法文章分P）----
lesson_video = {str(n): lesson_pages.get(n, []) for n in range(1, 145)}

# ---- 5. 汇出 ----
out = {
    "meta": {
        "book": "NCE1", "title": "新概念英语第一册",
        "total_lessons": 144,
        "video_collection": {
            "bvid": BVID, "title": "新概念英语 第一册｜胶学 x 刘羽Leo",
            "pages": len(pages), "embed_tpl": "https://player.bilibili.com/player.html?bvid=" + BVID + "&high_quality=1&autoplay=0&p={p}",
            "watch_tpl": "https://www.bilibili.com/video/" + BVID + "/?p={p}"
        },
        "page_parts": page_parts,
        "missing_video_lessons": missing,
    },
    "units": units_out,
    "lesson_video_p": lesson_video,          # "1" -> [3,4] 表示 L1 视频在第3、4P
}
p_out = os.path.abspath(os.path.join(OUT, "NCE1_course.json"))
json.dump(out, open(p_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"[ok] 写入 {p_out}")
print(f"示例 L1->P{lesson_video['1']} L21->P{lesson_video['21']} L22->P{lesson_video['22']} L23->P{lesson_video['23']} L24->P{lesson_video['24']}")
# 打印有多P的课（用户关注的一课多视频）
multi = {k: v for k, v in lesson_video.items() if len(v) > 1}
print(f"[info] 一课对应多视频P 的课数: {len(multi)}，示例: " + ", ".join(f"L{k}:P{v}" for k, v in list(multi.items())[:12]))
