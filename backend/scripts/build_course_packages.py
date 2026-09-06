"""把现有「旧格式」数据（data/NCE*.js + data/notes*.js + data/notes/**）转换为标准课程包。

产出（前端 AppData 只认这套）：
  app/data/courses/index.json                    预设清单
  app/data/courses/<pkg>.json                     课程包（meta + units 索引）
  app/data/courses/content/<pkg>/<unitId>.json    教材内容（按课懒加载）

用法：python3 backend/scripts/build_course_packages.py
可重复运行（先清空 app/data/courses）。
"""
import json
import os
import re
import shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "app", "data"))
OUT = os.path.join(ROOT, "courses")
OLD_NOTES = os.path.join(ROOT, "notes")

BOOKS = [
    # key,   包 id,  标题,              副标题,                     level
    ("NCE1", "nce1", "新概念英语 第一册", "FIRST THINGS FIRST",     "A1"),
    ("NCE2", "nce2", "新概念英语 第二册", "PRACTICE AND PROGRESS",  "A2-B1"),
    ("NCE3", "nce3", "新概念英语 第三册", "DEVELOPING SKILLS",      "B2"),
    ("NCE4", "nce4", "新概念英语 第四册", "FLUENCY IN ENGLISH",     "C1"),
]

PHON = re.compile(r"^\s*(/[^/]+/)\s*")
POS = re.compile(r"^(verb|noun|adjective|adverb|interjection|preposition|conjunction|pronoun|"
                 r"adj|adv|prep|conj|pron|int|n|v)\.", re.I)
USAGE = re.compile(r"[（(]([^）)]*)[）)]\s*$")


def load_js_global(path):
    s = open(path, encoding="utf-8").read()
    return json.loads(s[s.index("{"):s.rindex("}") + 1])


def parse_word_zh(s):
    """'/ɪkˈskjuːz/ verb. 原谅；宽恕（请求原谅时用）' -> (phonetic, pos, [释义...], usage)"""
    s = (s or "").strip()
    phonetic = ""
    m = PHON.match(s)
    if m:
        phonetic, s = m.group(1), s[m.end():]
    pos = ""
    m = POS.match(s)
    if m:
        pos, s = m.group(1).rstrip("."), s[m.end():]
    usage = ""
    m = USAGE.search(s)
    if m:
        usage, s = m.group(1), s[:m.start()]
    meanings = [x.strip() for x in re.split(r"[；;]", s) if x.strip()]
    return phonetic, pos, meanings, usage


def conv_words(words):
    out = []
    for w in words or []:
        if isinstance(w, dict):                      # 已是新格式
            out.append(w)
            continue
        phonetic, pos, meanings, usage = parse_word_zh(w[1] if len(w) > 1 else "")
        entry = {"word": w[0]}
        if phonetic:
            entry["phonetic"] = phonetic
        ms = [{"meaning": m} for m in meanings] or [{"meaning": ""}]
        if pos:
            ms[0]["pos"] = pos
        if usage:
            ms[0]["usage"] = usage
        entry["meanings"] = ms
        out.append(entry)
    return out


def conv_phrases(phrases, legacy_words):
    out = []
    for p in phrases or []:
        if isinstance(p, dict):
            out.append(p)
            continue
        out.append({
            "phrase": p[0],
            "usage": p[1] if len(p) > 1 else "",
            "examples": [{"en": e[0], "zh": e[1] if len(e) > 1 else ""} for e in (p[2] if len(p) > 2 else [])],
        })
    # 旧手写数据把短语混在 words 里（靠空格区分），这里拆出来
    for w in legacy_words or []:
        if not isinstance(w, (list, tuple)) or not str(w[0]).strip():
            continue
        if " " in str(w[0]).strip():
            out.append({"phrase": w[0], "usage": w[1] if len(w) > 1 else "", "examples": []})
    return out


def conv_grammar(gs):
    out = []
    for g in gs or []:
        if "title" in g:                     # 已是新格式
            out.append(g)
            continue
        out.append({
            "title": g.get("k", ""),
            "structure": g.get("f", ""),
            "definition": g.get("d", ""),
            "examples": [{"en": e[0], "zh": e[1] if len(e) > 1 else ""} for e in (g.get("ex") or [])],
        })
    return out


def conv_patterns(ps):
    out = []
    for p in ps or []:
        if isinstance(p, dict) and "pattern" in p:
            out.append(p)
            continue
        if isinstance(p, dict) and p.get("p") is not None:      # 生成格式 {p,o,im}
            o = p.get("o") or ["", ""]
            out.append({
                "pattern": p["p"],
                "original": {"en": o[0], "zh": o[1] if len(o) > 1 else ""},
                "imitations": [{"en": e[0], "zh": e[1] if len(e) > 1 else ""} for e in (p.get("im") or [])],
            })
        else:                                                    # 手写格式 [en, zh]
            out.append({"pattern": p[0], "original": {"en": p[0], "zh": p[1] if len(p) > 1 else ""},
                        "imitations": []})
    return out


def conv_text(lessons):
    out = []
    for L in lessons or []:
        item = {"lesson": int(re.sub(r"\D", "", str(L.get("no") or "0")) or 0) or None}
        if L.get("title"):
            item["title"] = L["title"]
        if L.get("kind"):
            item["kind"] = L["kind"]
        lines = []
        for l in L.get("lines") or []:
            line = {"speaker": l[0] or "", "en": l[1]}
            if len(l) > 2 and l[2]:
                line["zh"] = l[2]
            if len(l) > 3 and l[3]:
                line["note"] = l[3]
            lines.append(line)
        if lines:
            item["lines"] = lines
        d = L.get("drill")
        if d:
            item["drill"] = {
                "q": d.get("q", ""),
                "zh": d.get("zh", ""),
                "slots": [{"en": s[0], "zh": s[1] if len(s) > 1 else ""} for s in (d.get("slots") or [])],
                "answers": d.get("answers") or [],
            }
        out.append(item)
    return out


def conv_content(nt):
    """旧笔记条目 -> 标准 Content（空块省略）"""
    legacy_words = nt.get("words") or []
    # 旧手写数据：words 里带空格的其实是短语，从 words 中剔除
    strict_words = [w for w in legacy_words
                    if not (isinstance(w, (list, tuple)) and " " in str(w[0]).strip())]
    c = {"schemaVersion": 1}
    if nt.get("unit"):
        c["unitId"] = nt["unit"]
    if nt.get("title"):
        c["title"] = nt["title"]
    if nt.get("subtitle"):
        c["subtitle"] = nt["subtitle"]
    lead = {}
    if nt.get("question"):
        lead["question"] = nt["question"]
    if nt.get("summary"):
        lead["summary"] = nt["summary"]
    if nt.get("tips"):
        lead["tips"] = nt["tips"]
    if lead:
        c["lead"] = lead
    text = conv_text(nt.get("lessons"))
    if text:
        c["text"] = text
    words = conv_words(strict_words)
    if words:
        c["words"] = words
    phrases = conv_phrases(nt.get("phrases"), legacy_words)
    if phrases:
        c["phrases"] = phrases
    gs = conv_grammar(nt.get("grammar"))
    if gs:
        c["grammar"] = gs
    ps = conv_patterns(nt.get("patterns"))
    if ps:
        c["patterns"] = ps
    exs = [{"q": e.get("q", ""), "a": e.get("a", ""), "note": e.get("n", "")} for e in (nt.get("exercises") or [])]
    if exs:
        c["exercises"] = exs
    return c


def bvid_of(url):
    m = re.search(r"bvid=([A-Za-z0-9]+)", url or "")
    return m.group(1) if m else ""


def build():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "content"), exist_ok=True)

    hand = load_js_global(os.path.join(ROOT, "notes.js")) if os.path.exists(os.path.join(ROOT, "notes.js")) else {}
    index = []

    for key, pid, title, subtitle, level in BOOKS:
        src_path = os.path.join(ROOT, key + ".js")
        if not os.path.exists(src_path):
            print(f"[skip] {key} 无数据")
            continue
        src = load_js_global(src_path)
        units_out, count = [], 0

        for i, u in enumerate(src.get("units", []), start=1):
            uid = "u%03d" % i
            audio = []
            if u.get("audio"):
                audio.append({"variant": "new", "label": "新版英音", "url": u["audio"], "lrc": u.get("lrc", "")})
            if u.get("audio85"):
                audio.append({"variant": "1985", "label": "1985 老版", "url": u["audio85"], "lrc": u.get("lrc85", "")})
            unit = {"id": uid, "index": i, "title": u.get("title", "")}
            ls = u.get("ls") or ([u["n"]] if u.get("n") else [])
            if ls:
                unit["lessons"] = ls
                unit["lessonLabel"] = "Lesson " + " & ".join(str(x) for x in ls)
            elif u.get("lesson_no"):
                parts = [p for p in re.split(r"[-&]", str(u["lesson_no"])) if p.strip().isdigit()]
                if parts:
                    unit["lessonLabel"] = "Lesson " + " & ".join(str(int(p)) for p in parts)
            if not unit.get("lessonLabel"):
                unit["lessonLabel"] = "Lesson %d" % i
            if audio:
                unit["audio"] = audio
            if u.get("ve"):
                unit["video"] = {
                    "provider": "bilibili", "bvid": bvid_of(u["ve"]),
                    "embed": u["ve"], "watch": u.get("vw", ""),
                }
            unit["contentRef"] = f"data/courses/content/{pid}/{uid}.json"
            units_out.append(unit)

            # 内容：手写精修 > 生成笔记
            hand_key = f"{key}:{u.get('u', i)}"
            nt = hand.get(hand_key)
            if not nt:
                gen = os.path.join(OLD_NOTES, key, note_file(key, i) + ".json")
                if os.path.exists(gen):
                    nt = json.load(open(gen, encoding="utf-8"))
            if nt:
                c = conv_content(nt)
                c["unitId"] = uid
                cdir = os.path.join(OUT, "content", pid)
                os.makedirs(cdir, exist_ok=True)
                with open(os.path.join(cdir, uid + ".json"), "w", encoding="utf-8") as f:
                    json.dump(c, f, ensure_ascii=False, separators=(",", ":"))
                count += 1
                # 内容计数写回单元：未加载内容时锚点按钮也能显示条数
                unit["counts"] = {
                    "w": len(c.get("words", [])), "ph": len(c.get("phrases", [])),
                    "g": len(c.get("grammar", [])), "p": len(c.get("patterns", [])),
                    "ex": len(c.get("exercises", [])),
                    "hasLead": bool(c.get("lead")), "hasText": bool(c.get("text")),
                }

        # 分组：每 24 个单元一段
        groups = []
        for g0 in range(0, len(units_out), 24):
            seg = units_out[g0:g0 + 24]
            groups.append({"id": "p%d" % (g0 // 24 + 1),
                           "title": "Unit %d - %d" % (seg[0]["index"], seg[-1]["index"]),
                           "range": [seg[0]["index"], seg[-1]["index"]]})

        vid = src.get("video") or {}
        media = {}
        if vid:
            media["video"] = {
                "provider": "bilibili", "bvid": vid.get("bvid", ""), "title": vid.get("title", ""),
                "embed": vid.get("embed", ""), "watch": vid.get("watch", ""),
                "pages": vid.get("pages", []),
            }
        if src.get("v"):
            media["lessonVideoMap"] = {str(k): v for k, v in src["v"].items()}

        pkg = {
            "schemaVersion": 1, "id": pid, "kind": "series", "title": title, "subtitle": subtitle,
            "lang": {"from": "en", "to": "zh"}, "level": level, "tags": ["英语", "教材", "新概念"],
            "source": {
                "text": "nce.mleo.site", "audio": "nce.mleo.site（外链，不自托管）",
                "notes": "aikawarazu/new-concept-english", "video": "B 站「胶学 x 刘羽Leo」（外链）",
                "license": "内容版权归原作者，仅供个人学习",
            },
            "media": media, "groups": groups, "units": units_out,
        }
        with open(os.path.join(OUT, pid + ".json"), "w", encoding="utf-8") as f:
            json.dump(pkg, f, ensure_ascii=False, separators=(",", ":"))
        index.append({"id": pid, "title": title, "subtitle": subtitle, "kind": "series",
                      "unitCount": len(units_out), "level": level, "tags": ["英语", "教材"]})
        print(f"[{pid}] units={len(units_out)} content={count}")

    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"schemaVersion": 1, "packages": index}, f, ensure_ascii=False, indent=1)
    print(f"\nDONE -> {OUT}")


def note_file(book, i):
    """NCE1 用 001-002 命名，其余用两位课号（与 import_nce_notes.py 保持一致）"""
    if book == "NCE1":
        return "%03d-%03d" % (2 * i - 1, 2 * i)
    return "%02d" % i


if __name__ == "__main__":
    build()
