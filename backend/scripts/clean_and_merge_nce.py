"""重新清洗 backend/data/raw/ 原始抓取文本，并合并进标准课程包内容。

策略（与用户确认：合并保留 + 遍历补缺失 + 本地启发式导学）：
  - 生词：用原始 material 按词形匹配刷新（补音标/词性/释义），并补入原文有而现有缺的词。
  - 课文(text)：nce2/3/4 现有内容缺 text 字段，从原始 prose + 参考译文补建；nce1 已有精修 text 保持不变。
  - 翻译(translation)：用原始「参考译文」刷新。
  - 导学(lead)：为缺 lead 的课生成 question/summary/tips（nce1 用原始「听录音」提问；其余用现有 grammar/patterns/标题）。
  - 保留：现有 grammar / patterns / exercises / 已有 lead / 句型 drill。

用法：
  python3 backend/scripts/clean_and_merge_nce.py --dry   # 写到 /tmp/nce_out，不改动真实文件
  python3 backend/scripts/clean_and_merge_nce.py         # 直接写回 app/data/courses/content
"""
import os, re, json, glob, argparse, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TMP = os.path.join(ROOT, "backend", "data", "raw")
CONTENT = os.path.join(ROOT, "app", "data", "courses", "content")
BOOKS = ["nce1", "nce2", "nce3", "nce4"]

POSSET = {"n", "v", "adj", "adv", "prep", "conj", "pron", "int", "abbr", "num", "art", "modal"}
ABBR = {"Mr", "Mrs", "Ms", "Dr", "Prof", "Capt", "Gen", "Sgt", "St", "Vs", "etc",
        "Jr", "Sr", "No", "Vol", "Fig", "Apr", "Aug", "Sept", "Oct", "Nov", "Dec",
        "Mt", "Rev", "Col", "Lt", "Bros", "Co", "Inc", "Esq", "Ph"}

ANCHOR = "(单词翻译"
LESSON_RE = re.compile(r"Lesson\s+(\d{1,3})\s+(.+)", re.I)
HEAR_RE = re.compile(r"听录音.*?回答.*?问题")
ANSWER_EN_RE = re.compile(r"answer\s+(?:this|the)\s+question\.?\s*(.*)", re.I)
WORDSEC_RE = re.compile(r"new\s*words?\s+and\s*expressions", re.I)
REF_RE = re.compile(r"参考译文")
SECTION_RE = re.compile(r"(语法|Grammar in use|课堂笔记|Notes on the text|自学导读|新概念英语默写|新概念英语正版|单词连连看|课后练习)")
SPEAKER_RE = re.compile(r"^([A-Z][A-Z'’.\- ]{1,20}?):\s+(.*)$")
PHON_RE = re.compile(r"/[^/\n]+/")
DIGIT_LINE = re.compile(r"^\s*\d{1,2}\s*$")
SINGLE_RE = re.compile(r"^(\S+)\s*(/[^\n/]+/)?\s*((?:n|v|adj|adv|prep|conj|pron|int|abbr|num|art|modal)\.?\s+.*)$", re.I)
POSONLY_RE = re.compile(r"^((?:n|v|adj|adv|prep|conj|pron|int|abbr|num|art|modal)\.?\s+.*)$", re.I)


def strip_idx(lines):
    return [l for l in lines if not DIGIT_LINE.match(l.strip())]


def cjk_start(s):
    return bool(re.match(r"[一-鿿]", s.strip()))


def first_cjk(s):
    m = re.search(r"[一-鿿]", s)
    return m.start() if m else -1


def parse_raw(path):
    text = open(path, encoding="utf-8", errors="ignore").read()
    out = {"lesson_no": None, "title_en": "", "title_zh": "",
           "question_en": "", "question_zh": "",
           "en_lines": [], "ref_zh": [], "words": []}
    ai = text.find(ANCHOR)
    if ai == -1:
        m = LESSON_RE.search(text)
        if not m:
            return out
        ai = m.start()
    real = text[ai:]
    mt = LESSON_RE.search(real)
    if mt:
        out["lesson_no"] = int(mt.group(1))
        rest = mt.group(2).strip()
        cj = first_cjk(rest)
        if cj > 0:
            out["title_en"] = rest[:cj].strip()
            out["title_zh"] = rest[cj:].strip()
        else:
            out["title_en"] = rest
    lines = real.splitlines()
    hi = next((i for i, l in enumerate(lines) if HEAR_RE.search(l)), None)
    if hi is not None:
        hl = lines[hi]
        # zh = CJK 部分（听录音行之前的部分）；en = 该行 latin 尾句
        sp = re.search(r"[A-Za-z]", hl)
        if sp:
            out["question_zh"] = hl[:sp.start()].strip()
            out["question_en"] = hl[sp.start():].strip()
        else:
            out["question_zh"] = hl.strip()
        if "听录音" in out["question_zh"] or "回答问题" in out["question_zh"]:
            out["question_zh"] = ""
        # 优先用上行的 "answer this question. <ENQ>"
        if hi - 1 >= 0:
            em = ANSWER_EN_RE.search(lines[hi - 1])
            if em and em.group(1).strip():
                out["question_en"] = em.group(1).strip()
            elif not out["question_en"] and hi + 1 < len(lines):
                nxt = lines[hi + 1].strip()
                if nxt and not SECTION_RE.search(nxt) and "听录音" not in nxt:
                    out["question_en"] = nxt
    wi = next((i for i, l in enumerate(lines) if WORDSEC_RE.search(l)), None)
    bstart = (hi + 2) if hi is not None else 1
    body = lines[bstart:wi] if wi is not None else lines[bstart:]
    body = strip_idx([l.rstrip() for l in body if l.strip()])
    if any(SPEAKER_RE.match(l) for l in body):
        cur = None
        for l in body:
            m = SPEAKER_RE.match(l)
            if m:
                if cur:
                    out["en_lines"].append(cur)
                cur = {"speaker": m.group(1).strip(), "en": m.group(2).strip()}
            elif cur:
                cur["en"] += " " + l.strip()
        if cur:
            out["en_lines"].append(cur)
    else:
        prose = " ".join(body)
        prose = re.sub(r"\s+", " ", prose).strip()
        for a in ABBR:
            prose = re.sub(rf"\b{a}\. ", f"{a}.@", prose)
        sents = re.split(r"(?<=[.!?])\s+(?=[A-Z])", prose)
        sents = [re.sub(r"@$", ".", s.replace("@", ".")) for s in sents if s.strip()]
        out["en_lines"] = [{"speaker": None, "en": s} for s in sents]
    if wi is not None:
        ri = next((i for i in range(wi, len(lines)) if REF_RE.search(lines[i])), None)
        wlines = strip_idx([l.rstrip() for l in lines[wi + 1:ri] if l.strip()]) if ri is not None else strip_idx([l.rstrip() for l in lines[wi + 1:] if l.strip()])
        out["words"] = parse_words(wlines)
        if ri is not None:
            rstart = ri + 1
            rend = next((i for i in range(rstart, len(lines)) if SECTION_RE.search(lines[i])), len(lines))
            ref = strip_idx([l.strip() for l in lines[rstart:rend] if l.strip()])
            out["ref_zh"] = ref
    return out


def parse_words(wlines):
    words = []
    buf = [None, "", "", ""]  # word, phon, pos, meaning

    def flush():
        if buf[0]:
            meaning = re.sub(r"^\.?\s*", "", buf[3]).strip()
            if buf[0]:
                words.append({"word": buf[0], "phonetic": buf[1].strip(),
                              "pos": buf[2].lower(), "meaning": meaning})
        buf[0] = None
        buf[1] = buf[2] = buf[3] = ""

    i = 0
    while i < len(wlines):
        l = wlines[i]
        m = SINGLE_RE.match(l)
        if m and m.group(1).lower() not in POSSET:
            flush()
            word, phon, rest = m.group(1), (m.group(2) or "").strip(), m.group(3)
            pm = re.match(r"^((?:n|v|adj|adv|prep|conj|pron|int|abbr|num|art|modal)\.?)\s*", rest, re.I)
            if pm:
                buf[0], buf[1], buf[2], buf[3] = word, phon, pm.group(1).rstrip("."), rest[pm.end():].strip()
            else:
                buf[0], buf[1], buf[2], buf[3] = word, phon, "", rest.strip()
            i += 1
            continue
        if POSONLY_RE.match(l):
            if buf[0] is not None and not buf[3]:
                rest = l
                pm = re.match(r"^((?:n|v|adj|adv|prep|conj|pron|int|abbr|num|art|modal)\.?)\s*", rest, re.I)
                if pm:
                    buf[2], buf[3] = pm.group(1).rstrip("."), rest[pm.end():].strip()
                else:
                    buf[3] = rest.strip()
            elif buf[0] is not None:
                buf[3] += " " + l.strip()
            i += 1
            continue
        if re.match(r"^[A-Za-z][\w' ]*$", l) and not PHON_RE.search(l):
            nxt = wlines[i + 1] if i + 1 < len(wlines) else ""
            if nxt and (POSONLY_RE.match(nxt) or cjk_start(nxt)):
                flush()
                buf[0] = l.strip()
                i += 1
                continue
            if buf[0] is not None:
                buf[3] += " " + l.strip()
            i += 1
            continue
        if buf[0] is not None:
            buf[3] += " " + l.strip()
        i += 1
    flush()
    return words


def split_zh(s):
    return [x.strip() for x in re.split(r"(?<=[。！？])", s) if x.strip()]


def build_lead(content, raw):
    lead = {}
    q_en, q_zh = raw.get("question_en", ""), raw.get("question_zh", "")
    if q_en or q_zh:
        lead["question"] = (q_en + ("（" + q_zh + "）" if q_zh else "")).strip() if q_en else q_zh
    else:
        pats = content.get("patterns") or []
        grams = content.get("grammar") or []
        if pats:
            o = pats[0].get("original") or {}
            lead["question"] = (o.get("en", "") + ("（" + o.get("zh", "") + "）" if o.get("zh") else "")).strip() or pats[0].get("pattern", "")
        elif grams:
            lead["question"] = "重点掌握：" + grams[0].get("title", "")
        else:
            lead["question"] = (raw.get("title_en") or content.get("title") or "")
    parts = []
    grams = content.get("grammar") or []
    if grams:
        parts.append("语法重点：" + "；".join(g.get("title", "") for g in grams[:3] if g.get("title")))
    pats = content.get("patterns") or []
    if pats:
        parts.append("核心句型：" + pats[0].get("pattern", ""))
    title = content.get("title") or raw.get("title_en") or ""
    if title:
        parts.append("围绕《%s》这篇课文展开学习。" % title)
    lead["summary"] = "".join(parts) if parts else (raw.get("title_en") or "")
    tips = ""
    for g in grams:
        if g.get("usage"):
            tips = g["usage"]
            break
    if not tips and pats:
        tips = "把核心句型 " + pats[0].get("pattern", "") + " 套进课文场景反复替换主语/宾语练熟。"
    if not tips:
        tips = "先听懂录音再跟读，注意生词的音标与词性；课文读熟后尝试用自己的话复述。"
    lead["tips"] = tips
    return lead


def enrich_words(content, raw):
    existing = content.get("words") or []
    by_lower = {}
    for w in existing:
        by_lower.setdefault(w.get("word", "").lower(), w)
    raw_by_lower = {}
    for r in raw.get("words") or []:
        if r.get("word"):
            raw_by_lower.setdefault(r["word"].lower(), r)
    for w in existing:
        key = w.get("word", "").lower()
        r = raw_by_lower.get(key)
        if not r:
            continue
        if not w.get("phonetic") and r.get("phonetic"):
            w["phonetic"] = r["phonetic"]
        if not w.get("meanings"):
            w["meanings"] = [{}]
        m0 = w["meanings"][0]
        if not m0.get("pos") and r.get("pos"):
            m0["pos"] = r["pos"]
        if not m0.get("meaning") and r.get("meaning"):
            m0["meaning"] = r["meaning"]
        elif r.get("meaning") and len(r["meaning"]) > len(m0.get("meaning", "")):
            m0["meaning"] = r["meaning"]
    # 补入原文有而现有缺的词
    have = set(by_lower.keys())
    for r in raw.get("words") or []:
        k = r.get("word", "").lower()
        if k and k not in have and r.get("meaning"):
            existing.append({
                "word": r["word"],
                "phonetic": r.get("phonetic", ""),
                "meanings": [{"pos": r.get("pos", ""), "meaning": r["meaning"]}] if r.get("meaning") else [{}],
            })
            have.add(k)
    if existing:
        content["words"] = existing


def build_text_from_raw(book, raw, unit_title):
    en = [l["en"] for l in raw.get("en_lines") or []]
    if not en:
        return None
    ref = raw.get("ref_zh") or []
    zh_sents = []
    for r in ref:
        zh_sents += split_zh(r)
    text = [{
        "lesson": None,
        "title": raw.get("title_en") or unit_title or "",
        "kind": "课文 · 文章" if book in ("nce2", "nce3", "nce4") else "课文",
        "lines": [],
    }]
    if len(en) == len(zh_sents):
        for e, z in zip(en, zh_sents):
            text[0]["lines"].append({"en": e, "zh": z})
    else:
        for e in en:
            text[0]["lines"].append({"en": e, "zh": ""})
    return text


def merge_unit(content, raw, book):
    changed = []
    # 生词刷新
    old_words = len(content.get("words") or [])
    enrich_words(content, raw)
    if len(content.get("words") or []) != old_words:
        changed.append("words")
    # 课文：nce2/3/4 缺 text 则补建
    if book in ("nce2", "nce3", "nce4") and not content.get("text"):
        t = build_text_from_raw(book, raw, content.get("title"))
        if t:
            content["text"] = t
            changed.append("text")
    # 翻译刷新
    ref = raw.get("ref_zh") or []
    if ref:
        new_tr = "\n".join(ref)
        if content.get("translation") != new_tr:
            content["translation"] = new_tr
            changed.append("translation")
    # 导学
    if not content.get("lead"):
        content["lead"] = build_lead(content, raw)
        changed.append("lead")
    return changed


def score_raw(r):
    s = 0
    if r.get("title_en"):
        s += 1
    if r.get("words"):
        s += 2
    if r.get("ref_zh"):
        s += 2
    if r.get("en_lines"):
        s += 1
    if r.get("question_en") or r.get("question_zh"):
        s += 1
    return s


def load_raw_index():
    idx = {b: {} for b in BOOKS}
    for b in BOOKS:
        for f in glob.glob(os.path.join(TMP, b, "*.txt")):
            r = parse_raw(f)
            if r.get("lesson_no"):
                idx[b].setdefault(r["lesson_no"], []).append((f, r))
    return idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    out_root = "/tmp/nce_out" if args.dry else CONTENT
    if args.dry:
        os.makedirs(out_root, exist_ok=True)
    idx = load_raw_index()
    total_changed = 0
    lead_added = 0
    text_added = 0
    summary_rows = []
    for b in BOOKS:
        files = sorted(glob.glob(os.path.join(CONTENT, b, "u*.json")))
        for fp in files:
            c = json.load(open(fp, encoding="utf-8"))
            uis = re.search(r"u(\d+)\.json", fp).group(1)
            i = int(uis)
            lessons = [2 * i - 1, 2 * i] if b == "nce1" else [i]
            cands = []
            for ln in lessons:
                cands += idx[b].get(ln, [])
            raw = None
            if cands:
                # 选评分最高（内容最完整）的原始文件，避免选到抓取的残片
                raw = max(cands, key=lambda fr: (score_raw(fr[1]), len(fr[1].get("en_lines") or [])))[1]
            if raw is None:
                # 无原始 material：仍尝试为缺导学的课从现有 grammar/patterns/标题生成
                raw = {}
            ch = merge_unit(c, raw, b)
            if ch:
                total_changed += 1
                if "lead" in ch:
                    lead_added += 1
                if "text" in ch:
                    text_added += 1
                summary_rows.append((b, uis, ch))
            if args.dry:
                d = os.path.join(out_root, b)
                os.makedirs(d, exist_ok=True)
                json.dump(c, open(os.path.join(d, os.path.basename(fp)), "w", encoding="utf-8"),
                          ensure_ascii=False, separators=(",", ":"))
            else:
                json.dump(c, open(fp, "w", encoding="utf-8"),
                          ensure_ascii=False, separators=(",", ":"))
    print(f"DRY={args.dry} units_changed={total_changed} lead_added={lead_added} text_added={text_added}")
    for b, uis, ch in summary_rows[:40]:
        print(f"  {b}/{uis} -> {','.join(ch)}")


if __name__ == "__main__":
    main()
