"""从听力室抓取的 NCE2/3/4 原文页提取结构化底稿。

抓取页面版式不统一（干净版 / 网页噪声版 / 双语弹窗版 / 「Lesson N」与标题分行版），
这里统一按「锚点线」定位，再取出：标题、听力提问、课文正文、参考译文、讲义原文、官方生词。

输入：backend/data/raw/<book>/*.txt
输出：
  1) backend/data/parsed/<book>/uXXX.json                  build_course_packages.from_parsed 兼容底稿
  2) progress/nce234-craft/extract/<book>/uXXX.json        给智能体用的精编素材

用法：python3 backend/scripts/extract_raw_nce234.py [book...]
"""
import json
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(REPO, "backend", "data", "raw")
PARSED = os.path.join(REPO, "backend", "data", "parsed")
EXTRACT = os.path.join(REPO, "progress", "nce234-craft", "extract")

BOOKS = {"nce2": 96, "nce3": 60, "nce4": 48}
KIND = "课文 · 短文"

CJK = re.compile(r"[\u4e00-\u9fff]")
NUMONLY = re.compile(r"^\s*\d{1,3}\s*$")
RE_LESSON_LINE = re.compile(r"^\s*Lesson\s+(\d+)\s*$|^\s*Lesson\s+(\d+)\s+(.+)$")
RE_LISTEN_EN = re.compile(r"^\s*(First listen and then answer|Listen to the tape then answer)", re.I)
RE_ZH_LISTEN = re.compile(r"听录音，?然后回答以下问题")
RE_WORDS = re.compile(r"New\s*words?\s*(and\s*expressions?)?\s*生词和短语|^\s*【New words", re.I)
END_MARKERS = re.compile(r"^(New\s*words?|参考译文|Notes on the text|Notes on the Text|自学导读|"
                         r"生词和短语|【New words)", re.I)
RE_TITLE_HEAD = re.compile(r"[Ll]esson\s*(\d+)\s*[-—]?\s*([A-Za-z]*)\s*(.*)$")
WORD_ENTRY = re.compile(r"^([A-Za-z][A-Za-z\-']*(?:\s+[A-Za-z][A-Za-z\-']*)?)\s*"
                        r"(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|num\.|art\.|int\.|aux\.|"
                        r"vt\.|vi\.|abbr\.)\s*(.*)$")

ERR = lambda *a: None


def load_lines(path):
    out = []
    for ln in open(path, encoding="utf-8", errors="ignore").read().replace("\r", "").split("\n"):
        ln = ln.replace("\xa0", " ").strip()
        if not ln or NUMONLY.match(ln):
            continue
        out.append(ln)
    return out


def is_en(ln):
    """正文片段判定：不含汉字且含拉丁字母（导航/中文注释自然排除）。"""
    if CJK.search(ln):
        return False
    return sum(c.isalpha() and ord(c) < 128 for c in ln) > 0


def split_en_zh(s):
    s = s.strip().lstrip(":：").strip()
    m = CJK.search(s)
    if not m:
        return s, ""
    return s[:m.start()].strip(" -—–"), s[m.start():].strip()


def locate(lines):
    """定位各锚点：标题、听力提问、正文起点与终点、参考译文。"""
    info = {"titleEn": "", "titleZh": "", "listen": "", "start": -1, "end": -1, "tr": -1}

    for i, ln in enumerate(lines):
        m = re.match(r"^\s*(Lesson\s+\d+[A-Za-z\-]*)\s*(.*)$", ln)
        if not m or len(ln) > 200:
            continue
        rest = m.group(2).strip()
        if rest:
            info["titleEn"], info["titleZh"] = split_en_zh(rest)
            info["titleIdx"] = i
        else:                                    # 「Lesson 1」单独一行，标题在下一行
            for nxt in lines[i + 1:i + 4]:
                if nxt and is_en(nxt):
                    info["titleEn"], info["titleZh"] = split_en_zh(nxt)
                    info["titleIdx"] = i
                    break
        if info["titleEn"]:
            break
    for i, ln in enumerate(lines):
        if RE_ZH_LISTEN.search(ln):
            for nxt in lines[i + 1:i + 4]:
                if nxt and is_en(nxt) and not END_MARKERS.match(nxt):
                    info["listen"] = nxt.strip()
                    info["start"] = lines.index(nxt, i + 1, i + 4) + 1
                    break
            if info["start"] < 0:
                info["start"] = i + 1
            break
    if info["start"] < 0:
        for i, ln in enumerate(lines):
            if ln.startswith("课文内容"):
                info["start"] = i + 1
                break
    if info["start"] < 0:                            # 双语弹窗版：正文从第一条长英文行开始
        for i, ln in enumerate(lines):
            if len(ln.split()) >= 8 and is_en(ln):
                info["start"] = i
                break
    if not info["titleEn"]:                          # 双语弹窗版：标题取自页面 <title>
        title = page_title(lines)
        if title:
            info["titleEn"], info["titleZh"] = split_en_zh(title)
    if info["start"] < 0 and info.get("titleIdx") is not None:
        info["start"] = info["titleIdx"] + 1

    for i in range(info["start"], len(lines)):
        if END_MARKERS.match(lines[i]) and len(lines[i]) < 60:
            info["end"] = i
            break
    if info["end"] < 0:
        info["end"] = len(lines)
    for i, ln in enumerate(lines):
        if re.match(r"^\s*参考译文", ln) and len(ln) < 30:
            info["tr"] = i
            break
    return info


def page_title(lines):
    """'新概念英语第三册lesson 1-A Puma at large_在线...' -> 'A Puma at large'"""
    if not lines:
        return ""
    m = RE_TITLE_HEAD.search(lines[0])
    if not m:
        return ""
    return (m.group(3) or "").replace("_在线英语听力室_免费在线英语听力学习网站", "").strip(" _-")


def take_passage(lines, start, end):
    """取正文：跳过脚注编号与「单词弹窗 + 编号」组合，其余视为课文片段。"""
    seq = lines[start:end]
    body, k = [], 0
    while k < len(seq):
        ln = seq[k]
        if k + 1 < len(seq) and NUMONLY.match(seq[k + 1]) and len(ln.split()) <= 3:
            k += 2
            continue
        if is_en(ln):
            body.append(ln)
        k += 1
    return re.sub(r"\s+", " ", " ".join(body)).strip()


def take_tr(lines, tr_idx):
    if tr_idx < 0:
        return ""
    out = []
    for ln in lines[tr_idx + 1:]:
        if (any(ln.startswith(p) for p in ("自学导读", "Notes on the text", "Summary writing",
                                           "Exercises", "Multiple choice", "Key structures",
                                           "Composition", "购买", "上一篇", "下一篇",
                                           "新概念英语正版图书购买", "TAG标签"))):
            break
        if END_MARKERS.match(ln) and len(ln) < 60:
            break
        out.append(ln)
    return re.sub(r"\s+", "", "".join(out)).strip()


def take_section(lines, names, stop_names):
    idx = -1
    for k, ln in enumerate(lines):
        if any(ln.startswith(n) for n in names) and len(ln) < 80:
            idx = k
            break
    if idx < 0:
        return ""
    out = []
    for ln in lines[idx + 1:]:
        if any(ln.startswith(p) for p in stop_names) and len(ln) < 60:
            break
        out.append(ln)
    return "\n".join(out).strip()


def parse_words(lines):
    """官方生词：优先详细版【New words and expressions】块，其次简明版 'word n. 中文' 行。"""
    seen = set()

    def from_lines(block):
        out, i = [], 0
        while i < len(block):
            ln = block[i].strip().lstrip("★*").strip()
            if not ln:
                i += 1
                continue
            if ln.startswith("参考例句") or ln.startswith("人性化"):   # 词典区开始，停止收词
                break
            zh = block[i + 1].strip() if i + 1 < len(block) else ""
            m = WORD_ENTRY.match(ln)
            if (m and len(m.group(1)) <= 30 and zh and not WORD_ENTRY.match(zh)
                    and CJK.search(zh) and not JUNK_ZH.search(zh)
                    and m.group(1).strip().lower() not in STOP_WORDS):
                key = m.group(1).strip().lower()
                if key not in seen:
                    seen.add(key)
                    out.append({"word": m.group(1).strip(), "pos": m.group(2).strip("."),
                                "zh": re.sub(r"[\uff08(][^)）]*[)）]", "", zh).strip()[:60]})
                i += 2
                continue
            i += 1
        return out
    joined = "\n".join(lines)
    star = joined.find("【New words")
    if star >= 0:
        return from_lines(joined[star:].split("\n")[:400])
    return from_lines(lines)


ABBREV = ("Mr", "Mrs", "Ms", "Dr", "St", "Prof", "Sr", "Jr", "vs", "etc", "e.g", "i.e",
          "No", "Ltd", "Co", "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep",
          "Sept", "Oct", "Nov", "Dec")


def sent_split_en(text):
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\b(%s)\.\s" % "|".join(ABBREV), r"\1.<DOT> ", text)
    parts = re.split(r"(?<=[.!?])[\"'\)\]]?\s+", text)
    return [p.replace("<DOT>", ".").strip() for p in parts if p.strip()]


DICT_LINE = re.compile(r"参考例句|adj\.|adv\.|prep\.|conj\.|pron\.|英音|美音|人性化 adjacent")


CLOSERS = "”’』】）」"
JUNK_ZH = re.compile(r"参考例句|英音|美音|人性化|相关词条|柯林斯|来自\d+部分")
STOP_WORDS = {"ad", "ads", "etc", "eg", "ie"}


def sent_split_zh(text):
    """切中文句：只在 。！？ 处断，紧跟的右引号/右括号并入前一句。"""
    text = re.sub(r"\s+", "", text).strip()
    text = re.sub(r"(?<=[\u4e00-\u9fff”』】])[.．]", "。", text)
    raw, buf = [], ""
    for ch in text:
        buf += ch
        if ch in "。！？":
            raw.append(buf)
            buf = ""
    if buf:
        raw.append(buf)
    out = []
    for s in raw:
        s = s.strip()
        if not s:
            continue
        if out and len(s) == 1 and s[0] in CLOSERS:
            out[-1] += s
            continue
        if not DICT_LINE.search(s):
            out.append(s)
    return out


def group_by_ratio(item_len, target_len):
    """把 item_len 序列按 target_len 的比例切成 len(target_len) 段，返回 (起,止) 区间列表。

    每段至少 1 项，并保证剩余组也有至少 1 项。
    """
    n, m = len(item_len), len(target_len)
    if m == 0:
        return []
    if n <= m:
        return [(i, i + 1) if i < n else (n, n) for i in range(m)]
    total_i = sum(item_len) or 1
    total_t = sum(target_len) or 1
    centers = []
    acc = 0.0
    for w in item_len:
        centers.append(acc + w / 2.0)
        acc += w
    bounds, acc_t = [], 0.0
    for t in target_len:
        acc_t += t
        bounds.append(total_i * acc_t / total_t)
    out, i = [], 0
    for j in range(m):
        if j == m - 1:
            out.append((i, n))
            break
        left = n - i - (m - j - 1)          # 本组最多还能取几项
        cnt, k = 0, 0
        while k < left and centers[i + k] <= bounds[j]:
            k += 1
        cnt = max(1, min(k, left))
        out.append((i, i + cnt))
        i += cnt
    return out


def align_sentences(en_list, zh_list):
    """中英句对齐：句数相等时 1:1；否则按「英文词数 ↔ 汉字数」比例把多的一侧成组，
    保证每个单元双语全覆盖、无空行。
    """
    if not en_list:
        return []
    if not zh_list:
        return [(e, "") for e in en_list]
    if len(en_list) == len(zh_list):
        return list(zip(en_list, zh_list))
    ew = [max(1, len(e.split())) for e in en_list]
    zc = [len(CJK.findall(z)) or 1 for z in zh_list]
    if len(en_list) > len(zh_list):
        return [(" ".join(en_list[a:b]), zh_list[j])
                for j, (a, b) in enumerate(group_by_ratio(ew, zc))]
    return [(en_list[i], "".join(zh_list[a:b]))
            for i, (a, b) in enumerate(group_by_ratio(zc, ew))]


def first_line_lesson(lines):
    """页面标题行里的课号：'新概念英语第三册lesson 1-A Puma at large_...'"""
    if not lines:
        return None
    m = RE_TITLE_HEAD.search(lines[0])
    return int(m.group(1)) if m else None


def extract(book, unit_total):
    src = os.path.join(RAW, book)
    out_parsed = os.path.join(PARSED, book)
    out_extract = os.path.join(EXTRACT, book)
    os.makedirs(out_parsed, exist_ok=True)
    os.makedirs(out_extract, exist_ok=True)

    files = {}
    for fn in sorted(os.listdir(src)):
        if not fn.endswith(".txt"):
            continue
        path = os.path.join(src, fn)
        if os.path.getsize(path) < 3000:
            continue                                   # 评论/推荐片段页
        lines = load_lines(path)
        n = None
        for i, ln in enumerate(lines[:200]):           # 正文标题行优先
            m = re.match(r"^\s*Lesson\s+(\d+)\b", ln)
            if m:
                n = int(m.group(1))
                break
        if n is None:
            n = first_line_lesson(lines)
        if not n or n > unit_total:
            continue
        prev = files.get(n)
        if prev is None or len(lines) > len(prev[1]):
            files[n] = (fn, lines)

    report = {"book": book, "units": unit_total, "ok": 0, "noRaw": [], "short": [], "noTrans": []}
    for uid in range(1, unit_total + 1):
        us = "u%03d" % uid
        hit = files.get(uid)
        if not hit:
            report["noRaw"].append(us)
            continue
        fn, lines = hit
        info = locate(lines)
        passage = take_passage(lines, info["start"], info["end"])
        translation = take_tr(lines, info["tr"])
        words = parse_words(lines)
        notes = take_section(lines, ["自学导读"], STOP)
        grammar = (take_section(lines, ["语法 Grammar", "语法 Key structures", "Key structures"], STOP)
                   or take_section(lines, ["Notes on the text"], STOP))
        wordstudy = take_section(lines, ["词汇学习 Word study"], STOP)
        keys = take_section(lines, ["练习答案", "Key to written exercises"], STOP)

        titleish = info["titleEn"]
        en_list = sent_split_en(passage)
        zh_list = sent_split_zh(translation)
        if en_list and zh_list:
            pairs = align_sentences(en_list, zh_list)
        elif zh_list:
            pairs = [(en_list[0] if en_list else "", "".join(zh_list))]
        else:
            pairs = [(e, "") for e in en_list]
        lines_out = [{"en": e, "zh": z} for e, z in pairs]
        if lines_out and titleish and lines_out[0]["en"].startswith(titleish):   # 标题混入正文
            lines_out[0]["en"] = lines_out[0]["en"][len(titleish):].strip()

        parsed_obj = {
            "unit": us, "unitId": us,
            "lessons": [{"lesson": uid, "title": info["titleEn"], "kind": KIND, "lines": lines_out}],
            "question": {"en": info["listen"], "zh": ""},
            "words": words,
            "translation": zh_list,
        }
        json.dump(parsed_obj, open(os.path.join(out_parsed, us + ".json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)

        json.dump({
            "book": book, "unitId": us, "lesson": uid, "sourceFile": fn,
            "titleEn": info["titleEn"], "titleZh": info["titleZh"],
            "listenQuestion": info["listen"],
            "lines": lines_out,
            "translationJoined": "".join(zh_list),
            "words": words,
            "rawNotes": {"zixue": notes[:6000], "grammar": grammar[:4000],
                         "wordStudy": wordstudy[:3000], "keyAnswers": keys[:1500]},
        }, open(os.path.join(out_extract, us + ".json"), "w", encoding="utf-8"),
            ensure_ascii=False, indent=1)

        if len(passage) < 200:
            report["short"].append(us)
        elif not translation:
            report["noTrans"].append(us)
        else:
            report["ok"] += 1
    print(json.dumps(report, ensure_ascii=False))
    return report


STOP = ["自学导读", "Notes on the text", "Summary writing", "Exercises", "Multiple choice",
        "Key structures", "Composition", "词汇学习 Word study", "练习答案",
        "Key to written exercises", "【New words", "购买", "上一篇", "下一篇", "TAG标签",
        "语法 Grammar", "语法 Key structures"]


if __name__ == "__main__":
    for b in (sys.argv[1:] or list(BOOKS)):
        if b in BOOKS:
            extract(b, BOOKS[b])
