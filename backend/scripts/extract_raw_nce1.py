"""从 backend/data/raw/nce1/*.txt（听力室抓取的原文页）提取结构化底稿。

文件序号 184..255 依次对应 unit 1..72（unit i = Lesson 2i-1 & 2i）。
原文页常见版式（两种）：

  A. 干净版（184.txt）
     Lesson 1 Excuse me!
     对不起！
     Listen to the tape then answer this question. Whose handbag is it?
     听录音，然后回答问题，这是谁的手袋？
     Excuse me!            <- 课文
     ...
     New Word and expressions 生词和短语
     excuse / v. 原谅       <- 生词（词行 + 释义行）
     参考译文
     对不起                 <- 译文

  B. 网页噪声版（219.txt）：前面有导航栏，正文里混入页码数字（独立成行）、
     句子被硬换行切断、Lesson 标题被拆成两行。

产出 backend/data/parsed/nce1/<uid>.json：
  { unit, unitId, lessons:[{lesson,title,titleZh,kind,lines:[{speaker,en,zh}]}],
    question:{en,zh}, words:[{word,pos,zh}], translation:[zh...],
    rawNotes:[...]  /* 自学导读/语法/词汇学习等，供精编参考 */ }

用法：python3 backend/scripts/extract_raw_nce1.py
"""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "backend", "data", "raw", "nce1")
OUT = os.path.join(ROOT, "backend", "data", "parsed", "nce1")

FILE0 = 183  # 184.txt -> unit 1

# 区块起始标记
RE_LESSON = re.compile(r"^\s*Lesson\s+(\d+)\s*(.*)$")
RE_WORDS = re.compile(r"(New\s*Word|生词)")
RE_TRANS = re.compile(r"参考译文")
# 译文之后的附加栏目（自学导读 / 语法 / 词汇学习 / 听课笔记 / 练习答案…）
RE_TAIL = re.compile(r"(自学导读|语法\s*Grammar|Grammar\s*in\s*use|词汇学习|Word\s*study|"
                     r"听课笔记|关键句型|难点|补充|注解|练习答案|Special\s*difficulties)")
RE_Q_EN = re.compile(r"(answer this question|Listen to the tape)", re.I)
RE_Q_ZH = re.compile(r"听录音")
RE_SPEAKER = re.compile(r"^([A-Z][A-Za-z'’\. ]{0,14}?)\s*[::]\s*(.+)$")
RE_POS = re.compile(r"^((?:n|v|adj|adv|prep|pron|int|conj|num|art|possessive|interjection|"
                    r"exclamation|aux|pl|abbr)\b\.?.*)$", re.I)
RE_EN_WORD = re.compile(r"^[A-Za-z][A-Za-z'\-]*$")
RE_HAS_EN = re.compile(r"[A-Za-z]")
RE_HAS_ZH = re.compile(r"[\u4e00-\u9fff]")
RE_PAGE = re.compile(r"^\s*\d{1,3}\s*$")

# 导航 / UI 噪声词（整行等于这些就丢掉）
NOISE = set("""英语 日语 韩语 法语 德语 西班牙语 意大利语 阿拉伯语 葡萄牙语 越南语 俄语 芬兰语 泰语 丹麦语 对外汉语
收藏本站 手机版 首页 首     页 听力教程 VOA慢速英语 英语歌曲 外语歌曲 英语下载 英语小说 轻松背单词 英文阅读
英语听力论坛 韩语学习 听力专题 英语教材 VOA标准英语 英语动画 英语游戏 英语考试 资源技巧 在线背单词 英语词典
英语听力家园 德语学习 听力搜索 英语导航 口语陪练网 英语视频 英语QQ群 英语电台 英语导读 单词连连看 英语网刊
英语学习网站 时间: 来源: 提供网友: 字体： 大 中 小 特别声明 上一篇 下一篇 相关推荐 评论 打印 关闭
在线英语听力室 免费在线英语听力学习网站 双击或拖选 点击 收听单词发音 参考例句""".split())
NOISE |= {"", "|", ":", "：", "[", "]", "1", "2", "3", "4", "5"}


def clean_lines(s):
    """切成行，去掉噪声行、页码行、页眉装饰。"""
    out = []
    for ln in s.split("\n"):
        ln = ln.replace("\xa0", " ").replace("　", " ").strip()
        if not ln or ln in NOISE:
            continue
        if RE_PAGE.match(ln):
            continue
        if ln.startswith("新概念英语第一册") and "在线英语" in ln:
            continue
        if "在线英语听力室" in ln and len(ln) < 40:
            continue
        out.append(ln)
    return out


def strip_leading_num(ln):
    """'1  It is raining now.' -> 'It is raining now.'；'2 Please' -> 'Please'"""
    m = re.match(r"^\s*(\d{1,2})[\s\.、]+(\S.*)$", ln)
    if m and not re.match(r"^\d", m.group(2)):
        return m.group(2)
    return ln


def merge_broken(lines):
    """网页版把句子硬切断成多行：'How' / 'did' / 'Pauline answer...'，这里合并。

    合并条件：上一行不以句末标点（. ? ! :）结尾，且（上一行尾与下一行首都是英文字符）
    或（上一行纯英文残片）。中文行按句号/问号结尾判断。
    """
    out = []
    for ln in lines:
        ln = strip_leading_num(ln)
        if out:
            prev = out[-1]
            end_ok = re.search(r"[.!?:;。’\")\]]$", prev) or re.search(r"[。？！：；”’]$", prev)
            if not end_ok:
                p_en = re.search(r"[A-Za-z,]$", prev)
                n_en = re.match(r"[A-Za-z'\(\[]", ln)
                p_zh = re.search(r"[\u4e00-\u9fff，、]$", prev)
                n_zh = re.match(r"[\u4e00-\u9fff]", ln)
                if (p_en and n_en) or (p_zh and n_zh):
                    out[-1] = prev + ("" if p_zh else " ") + ln
                    continue
        out.append(ln)
    return out


RE_META = re.compile(r"(时间:|来源:|提供网友|字体：|特别声明|上一篇|下一篇)")


def find_body_start(lines):
    """定位正文开始。

    噪声版页眉里会重复出现 'Lesson N …_在线英语听力室'，正文前还有时间/来源等元信息块。
    判据：该 Lesson 行之后 40 行内出现提问标记，且不夹在元信息块里。
    """
    idx = [i for i, ln in enumerate(lines) if RE_LESSON.match(ln)]
    if not idx:
        return 0
    for i in idx:
        m = RE_LESSON.match(lines[i])
        if "在线英语" in m.group(2) or "听力室" in m.group(2):
            continue
        win = lines[i + 1:i + 41]
        if any(RE_META.search(x) for x in win):
            continue
        if any(RE_Q_ZH.search(x) or RE_Q_EN.search(x) or RE_WORDS.search(x) or RE_TRANS.search(x)
               for x in win):
            return i
    # 兜底：第一个不带网站后缀的
    for i in idx:
        if "在线英语" not in lines[i]:
            return i
    return idx[0]


def split_sections(lines, start):
    """把正文切成 [(lessonNo, title, [lines...]), ...]"""
    secs, cur = [], None
    for ln in lines[start:]:
        m = RE_LESSON.match(ln)
        if m and not RE_HAS_ZH.search(ln[:20]):
            if cur:
                secs.append(cur)
            cur = [int(m.group(1)), m.group(2).strip(), []]
            continue
        # 噪声版标题被拆成两行：Lesson 71 He’s / awful
        if cur and len(cur[2]) == 0 and RE_EN_WORD.match(ln) and len(ln) < 30:
            cur[1] = (cur[1] + " " + ln).strip()
            continue
        if cur:
            cur[2].append(ln)
    if cur:
        secs.append(cur)
    return secs


def cut_block(body, *res):
    """按标记切块：返回 {name: [lines]}，name 依次对应 res，最后一段命名为 'text'"""
    marks = []
    for i, ln in enumerate(body):
        for name, r in res:
            if r.search(ln) and len(ln) < 60:
                marks.append((i, name))
                break
    marks.sort()
    out, prev_i, prev_name = {}, 0, "text"
    for i, name in marks:
        seg = body[prev_i:i]
        if seg:
            out.setdefault(prev_name, []).extend(seg)
        prev_i, prev_name = i + 1, name
    seg = body[prev_i:]
    if seg:
        out.setdefault(prev_name, []).extend(seg)
    return out


def parse_question(lines):
    """取官方听力提问：'Listen to the tape then answer this question. Whose handbag is it?'"""
    en, zh = "", ""
    for i, ln in enumerate(lines[:12]):
        if RE_Q_ZH.search(ln) and not zh:
            zh = ln
            # 中文行常把英文提问也带进来
            if RE_HAS_EN.search(ln) and not RE_Q_EN.search(ln):
                m = re.search(r"([A-Z][^。？]*\?)", ln)
                if m:
                    en, zh = m.group(1).strip(), ln[:m.start()].strip() or ln
                    continue
            continue
        if RE_Q_EN.search(ln) and not en:
            mm = re.search(r"(?:question\.?\s*)(.+)$", ln, re.I)
            en = (mm.group(1) if mm else ln).strip()
    if en:
        en = re.sub(r"^Listen to the tape then answer this question\.?\s*", "", en, flags=re.I).strip()
    if zh:
        zh = re.sub(r"^听录音[，,]?\s*然后回答问题[。\.？?]?\s*", "", zh).strip()
        # 中文里若还夹着英文提问，剥掉
        zh = re.sub(r"[A-Za-z][^。]*\?", "", zh).strip(" 。，?？")
    return {"en": en, "zh": zh}


RE_EN_ENTRY = re.compile(r"^[A-Za-z][A-Za-z'\- ]{0,20}$")
# 只会作为词性说明出现、不应单独成条的词
POS_NOISE = {"adjective", "adverb", "noun", "verb", "possessive", "interjection", "exclamation",
             "preposition", "conjunction", "pronoun", "numeral", "article"}


def parse_words(lines):
    """生词表：单词行（全英文）后跟一或多行释义；释义可能跨行（'possessive'/'adjective'/'我的'）。"""
    out, cur = [], None

    def flush():
        if not cur:
            return
        s = " ".join(cur.pop("_buf"))
        m = re.match(r"^((?:n|v|adj|adv|prep|pron|int|conj|num|art|possessive|interjection|"
                     r"exclamation|aux|pl|abbr)\w*\.?)\s*(.*)$", s, re.I)
        if m and m.group(2).strip():
            cur["pos"] = m.group(1).rstrip(".")
            cur["zh"] = m.group(2).strip()
        else:
            cur["zh"] = s.strip()
        w = cur["word"].lower()
        if (cur["zh"] or cur["pos"]) and "expressions" not in w and "new word" not in w:
            out.append(cur)

    for ln in lines:
        ln = strip_leading_num(ln)
        is_en = bool(RE_EN_ENTRY.match(ln))
        if cur is None:
            if is_en and ln.lower() not in POS_NOISE:
                cur = {"word": ln, "pos": "", "zh": "", "_buf": []}
            continue
        if RE_HAS_ZH.search(ln):
            cur["_buf"].append(ln)
            flush()
            cur = None
        elif is_en and ln.lower() in POS_NOISE:
            cur["_buf"].append(ln)                            # 词性说明跨行，如 possessive / adjective
        elif is_en and not cur["_buf"]:
            cur["word"] = (cur["word"] + " " + ln).strip()   # 多词词条，如 thank you
        else:
            cur["_buf"].append(ln)
    flush()
    return out


def parse_text(lines):
    """课文：英文行 + 可选说话人；先合并被硬换行切断的句子，再剥题号。"""
    out = []
    for ln in merge_broken(lines):
        if not RE_HAS_EN.search(ln):
            continue
        if RE_HAS_ZH.search(ln) and not RE_HAS_EN.search(re.sub(r"[A-Za-z]+", "", ln)):
            # 纯中文行（可能是提示语），跳过
            continue
        m = RE_SPEAKER.match(ln)
        if m and len(m.group(1)) <= 16:
            sp, rest = m.group(1).strip().rstrip("."), m.group(2).strip()
            if out and out[-1].get("speaker") == sp and not out[-1].get("zh"):
                out[-1]["en"] += " " + rest
            else:
                out.append({"speaker": sp, "en": rest})
        else:
            out.append({"en": ln})
    return out


def attach_translation(text, zh_lines):
    """参考译文逐句对齐到课文行。

    只有句数完全一致才对齐——否则错配的译文比没有译文更糟（交给精编阶段手写）。
    """
    zh = [l for l in zh_lines if RE_HAS_ZH.search(l) and not RE_HAS_EN.search(l)]
    if not zh or len(zh) != len(text):
        return
    for t, z in zip(text, zh):
        t["zh"] = z


def parse_file(path, uid, unit):
    raw = open(path, encoding="utf-8", errors="replace").read()
    lines = clean_lines(raw)
    start = find_body_start(lines)
    secs = split_sections(lines, start)

    lessons, question, words, trans, tails = [], {"en": "", "zh": ""}, [], [], []
    for no, title, body in secs:
        blocks = cut_block(body, ("words", RE_WORDS), ("trans", RE_TRANS), ("tail", RE_TAIL))
        text_raw = merge_broken(blocks.get("text", []))   # 先合并被硬换行切断的句子
        # 提问通常在课文最前面
        q = parse_question(text_raw)
        if q["en"] or q["zh"]:
            if not question["en"]:
                question = q
            # 把提问行从课文中剔除
            text_raw = [l for l in text_raw
                        if not (RE_Q_EN.search(l) or (RE_Q_ZH.search(l) and "回答问题" in l))]
        text = parse_text(text_raw)
        if not question["en"] and not question["zh"]:
            question = q
        if blocks.get("trans"):
            zh = [l for l in blocks["trans"] if RE_HAS_ZH.search(l)]
            attach_translation(text, zh)
            trans.extend(zh)
        if blocks.get("words"):
            words.extend(parse_words(blocks["words"]))
        if blocks.get("tail"):
            tails.extend(blocks["tail"][:200])
        lessons.append({
            "lesson": no,
            "title": re.sub(r"\s*_\s*在线.*$", "", title).strip(),
            "kind": "课文 · 对话" if text else "句型操练 · 无课文",
            "lines": text,
        })
    if not question["en"] and not question["zh"]:
        question = None
    return {
        "unitId": uid,
        "unit": unit,
        "lessons": lessons,
        "question": question,
        "words": words,
        "translation": trans,
        "notes": tails[:120],
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(os.listdir(SRC), key=lambda f: int(f[:-4]))
    n_ok = n_q = 0
    for f in files:
        unit = int(f[:-4]) - FILE0
        if not (1 <= unit <= 72):
            continue
        uid = "u%03d" % unit
        d = parse_file(os.path.join(SRC, f), uid, unit)
        with open(os.path.join(OUT, uid + ".json"), "w", encoding="utf-8") as fp:
            json.dump(d, fp, ensure_ascii=False, indent=1)
        n_ok += 1
        if d["question"]:
            n_q += 1
    print("parsed %d units, with question %d -> %s" % (n_ok, n_q, OUT))


if __name__ == "__main__":
    main()
