#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""解析 backend/data/raw/ 下各册 NCE 网页抓取纯文本，提取标准化中间结构。

输出：每课 {lesson, book, title, text_en, words, translation, listen_q,
            selfstudy, grammar_raw, wordstudy_raw}

设计要点：
- 课号定位：以「听录音 / Listen to the tape」为锚点，向前回溯最近的 "Lesson N" 行。
- 课文块：锚点之后 到 "New words and expressions / 生词和短语" 之前。
- 生词块：生词标记 到 参考译文 / 课文详注 之前。
- 参考译文块：参考译文 到 自学导读 / 课文讲解 之前（段落级翻译）。
- 听录音问题：锚点所在行及其紧跟的中文翻译行。
- 自学导读 / 语法：用于导学生成。
"""
import os, re, glob, json

TMP = os.path.join(os.path.dirname(__file__), "..", "data", "raw")

BOOKS = ["nce1", "nce2", "nce3", "nce4"]

# 文本块结束标记（出现即认为课文结束）
TEXT_END = ["New words and expressions", "New Word and expressions", "生词和短语", "词汇学习"]
# 生词块开始标记
WORD_START = ["New words and expressions", "New Word and expressions", "生词和短语"]
# 参考译文开始
TRANS_START = ["参考译文", "参考翻译"]
# 自学导读 / 课文讲解 开始
SELF_START = ["自学导读", "课文讲解", "课文详注", "学习导读"]
# 语法开始
GRAM_START = ["语法", "Grammar in use"]
# 听录音锚点
LISTEN_ANCHOR = ["听录音", "Listen to the tape", "Listen to the tape then"]


def read(txt_path):
    return open(txt_path, encoding="utf-8", errors="ignore").read()


def split_lines(t):
    return t.splitlines()


def find_anchor(lines, keywords):
    for i, l in enumerate(lines):
        if any(k in l for k in keywords):
            return i
    return None


def detect_lesson(lines):
    """以听录音锚点向前回溯找 Lesson N；退路：生词标记前回溯；再退路：全文件首个标题化 Lesson N。"""
    anchor = find_anchor(lines, LISTEN_ANCHOR)
    search_to = anchor if anchor is not None else find_anchor(lines, WORD_START)
    pool = lines[:search_to] if search_to is not None else lines
    # 优先找带标题形态的行（含大写单词）
    for l in reversed(pool):
        m = re.search(r"\bLesson\s+(\d{1,3})\b", l, re.I)
        if m and re.search(r"[A-Za-z]{3,}", l):
            return int(m.group(1))
    for l in reversed(pool):
        m = re.search(r"\bLesson\s+(\d{1,3})\b", l, re.I)
        if m:
            return int(m.group(1))
    return None


def clean_text_block(raw_lines):
    """去除音频单词序号(孤立数字行)、合并断行、按句切分。"""
    out = []
    for l in raw_lines:
        s = l.strip()
        if not s:
            continue
        # 孤立的数字行（音频序号 1/2/3...）丢弃
        if re.fullmatch(r"\d{1,3}", s):
            continue
        out.append(s)
    if not out:
        return []
    joined = " ".join(out)
    # 英文句末标点后切句（保留 ? ! .）
    parts = re.split(r"(?<=[.?!”’])\s+(?=[A-Z(（\u4e00-\u9fff])", joined)
    sentences = [p.strip() for p in parts if p.strip()]
    return sentences


def looks_like_question_line(l):
    """判断是否为听录音提问行（英文疑问词 + 问号，或纯中文问句）。"""
    s = l.strip()
    if re.search(r"\b(Why|What|When|Where|Who|How)\b.*\?", s):
        return True
    if re.fullmatch(r"[\u4e00-\u9fff，。？！、：；\s]+.*\?$", s):
        return True
    return False


def extract_qblock(lines, anchor):
    """返回听录音问题块（锚点行起到课文起始前）的行列表，及其起始行号 text_start。"""
    if anchor is None:
        return [], 0
    j = anchor + 1
    seen_q = "?" in lines[anchor]
    while j < len(lines):
        l = lines[j].strip()
        if not l:
            j += 1
            continue
        if re.search(r"[\u4e00-\u9fff]", l) and not re.search(r"[A-Za-z]", l):
            # 纯中文行（问题中文翻译）
            j += 1
            continue
        if not seen_q:
            if "?" in l:
                seen_q = True
            j += 1
            continue
        break
    return lines[anchor:j], j


def build_listen_q(qblock):
    """从问题块中抽取英文问题 + 中文翻译。"""
    en, zh = [], []
    for l in qblock:
        s = l.strip()
        if not s:
            continue
        if re.fullmatch(r"\d{1,3}", s):  # 音频序号
            continue
        if re.search(r"[\u4e00-\u9fff]", s) and not re.search(r"[A-Za-z]", s):
            zh.append(s)
        else:
            en.append(s)
    eq = " ".join(en).strip()
    zq = " ".join(zh).strip()
    # 去除引导语 boilerplate（先英文后中文，避免顺序导致残留）
    eq = re.sub(r"^Listen to the tape then answer (this|the) question[\.\s:：]*", "", eq, flags=re.I).strip()
    eq = re.sub(r"^below[\.\s]*", "", eq, flags=re.I).strip()
    eq = re.sub(r"^听录音[，,。]?\s*然后回答(以下问题|问题)[。：: ]*", "", eq, flags=re.I).strip()
    zq = re.sub(r"^听录音[，,。]?\s*然后回答(以下问题|问题)[。：: ]*", "", zq, flags=re.I).strip()
    return (eq + (" " + zq if zq else "")).strip()


def text_block_start(lines, anchor, content_marker=None):
    """返回课文起始行号。nce1/3/4 用听录音锚点；nce2 用『课文内容』标记。"""
    if anchor is not None:
        _, ts = extract_qblock(lines, anchor)
        return ts
    if content_marker is not None:
        cm = find_anchor(lines, [content_marker])
        if cm is not None:
            return cm + 1
    return 0


def strip_text_prefix(line):
    """剥掉课文首行可能混入的『课文内容/课文』标签与『Lesson N—Title』前缀。"""
    s = line
    s = re.sub(r"^(课文内容|课文讲解|课文|正文)\s*", "", s)
    # 形如 "Lesson 13—The Greenwood Boys 课文内容 ..." 已在上面剥离课文内容；
    # 形如 "Lesson 13—The Greenwood Boys The Greenwood Boys are..." 保留作标题提取
    return s.strip()


def parse_words(word_lines):
    """生词块：word 行 / pos+释义 行 交替。剥离音频序号与 参考例句 垃圾。"""
    words = []
    buf = []
    for l in word_lines:
        s = l.strip()
        if not s:
            continue
        if re.fullmatch(r"\d{1,3}", s):  # 音频序号
            continue
        if s in ("New words and expressions", "New Word and expressions", "生词和短语", "生词和短语", "词汇学习", "Word study", "New words and expressions 生词和短语"):
            continue
        if s.startswith("参考例句") or s.startswith("参考翻译"):
            continue
        buf.append(s)
    # 合并相邻：若上一行是纯英文单词(可能含括号变形)，当前行是 pos+释义
    i = 0
    cur = None
    while i < len(buf):
        line = buf[i]
        # 释义行通常含 pos 标记（n. v. adj. adv. prep. conj. 等）或中文
        is_meaning = bool(re.search(r"\b(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|num\.|int\.|vt\.|vi\.|art\.)\b", line)) or (bool(re.search(r"[\u4e00-\u9fff]", line)) and not re.search(r"^[A-Za-z]", line))
        if cur is None:
            cur = {"word": line, "meanings": []}
        else:
            # 当前行是释义
            cur["meanings"].append(line)
            # 下一个词？看下一个 buf 是否像新词（纯英文且短）
            if i + 1 < len(buf):
                nxt = buf[i + 1]
                looks_word = bool(re.fullmatch(r"[A-Za-z][A-Za-z'\.\-\s\(\)]{0,30}", nxt)) and not re.search(r"[\u4e00-\u9fff]", nxt) and not re.search(r"\b(n\.|v\.|adj\.|adv\.|prep\.|conj\.)\b", nxt)
                if looks_word:
                    words.append(cur)
                    cur = {"word": nxt, "meanings": []}
                    i += 1
                    continue
        i += 1
    if cur and cur.get("word"):
        words.append(cur)
    # 整理：把 meanings 合成字符串，抽取 pos
    result = []
    for w in words:
        meaning_str = "；".join(w["meanings"]).strip()
        result.append({"word": w["word"].strip(), "meaning": meaning_str})
    return result


def extract_block(lines, start_markers, end_markers, start_idx=None):
    """返回 start_markers 之后、end_markers 之前的内容行（不含标记行）。"""
    if start_idx is None:
        s = find_anchor(lines, start_markers)
        if s is None:
            return []
    else:
        s = start_idx
    # 从标记下一行开始
    j = s + 1
    end = len(lines)
    for k in range(j, len(lines)):
        if any(m in lines[k] for m in end_markers):
            end = k
            break
    return [l for l in lines[j:end]]


def parse_file(txt_path, book):
    lines = split_lines(read(txt_path))
    lesson = detect_lesson(lines)
    if lesson is None:
        return None
    # 听录音锚点（nce1/3/4）；nce2 用『课文内容』标记
    anchor = find_anchor(lines, LISTEN_ANCHOR)
    content_marker = None
    if anchor is None and book == "nce2":
        content_marker = "课文内容"
    # 课文块起始
    text_start = text_block_start(lines, anchor, content_marker)
    # 听录音问题
    if anchor is not None:
        qblock, _ = extract_qblock(lines, anchor)
        listen_q = build_listen_q(qblock)
    else:
        listen_q = ""
    te = find_anchor(lines[text_start:], WORD_START)
    text_end = (text_start + te) if te is not None else len(lines)
    text_raw = lines[text_start:text_end]
    text_en = clean_text_block(text_raw)
    # 标题：优先从课文首行提取 "Lesson N—Title"；否则从锚点前/课文内容前回溯
    title = ""
    if text_en and re.match(r"^Lesson\s+\d{1,3}", text_en[0]):
        head = strip_text_prefix(text_en[0])
        m = re.match(r"^(Lesson\s+\d{1,3}[\u2014:：\-]\s*[^\.]*?)\s+([A-Z][a-z].*)$", head)
        if m:
            title = m.group(1).strip()
            text_en[0] = m.group(2).strip()
        else:
            m2 = re.match(r"^(Lesson\s+\d{1,3}[\u2014:：\-]?\s*.*)$", head)
            if m2 and len(head) < 90:
                title = head
                text_en = text_en[1:]
    if not title and anchor is not None:
        for l in reversed(lines[:anchor]):
            m = re.search(r"\bLesson\s+\d{1,3}\b\s*(.*)", l)
            if m:
                title = l.strip()
                break
    if not title and content_marker is not None:
        cm = find_anchor(lines, [content_marker])
        if cm is not None:
            # 标题在『课文内容』之前的一行
            for l in reversed(lines[:cm]):
                if re.search(r"\bLesson\s+\d{1,3}\b", l):
                    title = l.strip()
                    break
    # 生词块
    ws = find_anchor(lines, WORD_START)
    we = find_anchor(lines[ws + 1:] if ws is not None else [], TRANS_START + SELF_START + ["参考译文"])
    word_lines = lines[ws + 1: (ws + 1 + we)] if (ws is not None and we is not None) else []
    words = parse_words(word_lines) if word_lines else []
    # 参考译文块
    ts = find_anchor(lines, TRANS_START)
    trans_lines = extract_block(lines, None, SELF_START + ["自学导读", "课文讲解", "课文详注"], start_idx=ts) if ts is not None else []
    translation = "\n".join(l.strip() for l in trans_lines if l.strip())
    # 自学导读
    ss = find_anchor(lines, SELF_START)
    selfstudy = extract_block(lines, None, GRAM_START + ["语法"], start_idx=ss) if ss is not None else []
    selfstudy = "\n".join(l.strip() for l in selfstudy if l.strip())
    # 语法块（Grammar in use）—— 真实语法要点所在
    gs = find_anchor(lines, GRAM_START)
    grammar_raw = extract_block(lines, None, ["练习答案", "Key to", "词汇学习", "Word study"], start_idx=gs) if gs is not None else []
    grammar_raw = "\n".join(l.strip() for l in grammar_raw if l.strip())
    return {
        "book": book,
        "lesson": lesson,
        "title": title,
        "text_en": text_en,
        "words": words,
        "translation": translation,
        "listen_q": listen_q,
        "selfstudy": selfstudy,
        "grammar_raw": grammar_raw,
        "n_text_lines": len(text_en),
        "n_words": len(words),
    }


def build_index():
    """返回 {book: {lesson: [parsed,...]}}，每个 lesson 可能多个文件，取文本最长者。"""
    idx = {b: {} for b in BOOKS}
    for b in BOOKS:
        for f in sorted(glob.glob(os.path.join(TMP, b, "*.txt"))):
            try:
                p = parse_file(f, b)
            except Exception as e:
                print(f"  [ERR] {f}: {e}")
                continue
            if not p or p["lesson"] is None:
                continue
            idx[b].setdefault(p["lesson"], []).append(p)
    # 去重：每 lesson 保留 text 最长的
    best = {b: {} for b in BOOKS}
    for b in BOOKS:
        for ln, lst in idx[b].items():
            lst2 = sorted(lst, key=lambda x: x["n_text_lines"], reverse=True)
            best[b][ln] = lst2[0]
    return best


if __name__ == "__main__":
    idx = build_index()
    for b in BOOKS:
        print(f"{b}: lessons={len(idx[b])} -> {sorted(idx[b].keys())}")
