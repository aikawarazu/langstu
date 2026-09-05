"""教材笔记导入器（第二步）：参照 github.com/aikawarazu/new-concept-english 生成教材数据。

数据源（该仓库的 notes/ 目录，276 课全量）：
  https://cdn.jsdelivr.net/gh/aikawarazu/new-concept-english@master/notes/<BOOK>/index.json
  https://cdn.jsdelivr.net/gh/aikawarazu/new-concept-english@master/notes/<BOOK>/<file>.json

源 schema（见其 doc/superpowers/specs/2026-04-18-study-notes-design.md）：
  { book, lesson, title,
    vocabulary:  [{word, phonetic, meanings:[{pos, meaning, usage}]}],
    phrases:     [{phrase, usage, examples:[{en,zh}]}],
    grammar:     [{title, definition, structure, usage, examples:[{en,zh}]}],
    sentencePatterns: [{pattern, original:{en,zh}, imitations:[{en,zh}]}] }

产出（前端可直接懒加载）：
  app/data/notes/<BOOK>/<file>.json   每课一份（转换为本项目 schema）
  app/data/notes-index.js             window.NOTES_IDX = 各课内容计数（供锚点按钮与笔记总览用）

本项目 schema（与 app/js/app.js 渲染器约定一致）：
  { unit, words:[[en, zh]], phrases:[[en, usage, [[en,zh],...]]],
    grammar:[{k,f,d,ex:[[en,zh],...]}], patterns:[{p,o:[en,zh],im:[[en,zh],...]}],
    lessons: []  # 课文正文由前端用 LRC 渲染，这里不落盘 }

用法：python3 backend/scripts/import_nce_notes.py
"""
import json
import os
import re
import subprocess
import time

SRC = "https://cdn.jsdelivr.net/gh/aikawarazu/new-concept-english@master/notes"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "app", "data")
BOOKS = ["NCE1", "NCE2", "NCE3", "NCE4"]


def fetch(url, tries=4):
    """该环境 python urllib 的 TLS 握手易超时，沿用 import_nce.py 的 curl 方案。"""
    last = None
    for i in range(tries):
        try:
            r = subprocess.run(["curl", "-sL", "--max-time", "40", url],
                               capture_output=True, text=True)
            if r.stdout.strip():
                return r.stdout
            last = r.stderr
        except Exception as e:  # noqa
            last = e
        time.sleep(1.2 * i + 0.8)
    raise RuntimeError(f"fetch failed after {tries} tries: {url} ({last})")


def fetch_json(url, tries=4):
    return json.loads(fetch(url, tries))


def lesson_label(lesson: str) -> str:
    """'001-002' -> 'Lesson 1 & 2'；'01' -> 'Lesson 1'。"""
    nums = re.findall(r"\d+", lesson)
    if len(nums) >= 2:
        return "Lesson %d & %d" % (int(nums[0]), int(nums[1]))
    if nums:
        return "Lesson %d" % int(nums[0])
    return "Lesson ?"


def word_zh(v: dict) -> str:
    """vocabulary -> 单行释义：/音标/ 词性. 释义（用法）；多个词义用；连接。"""
    parts = []
    if v.get("phonetic"):
        parts.append(v["phonetic"])
    for m in v.get("meanings", []):
        seg = ""
        if m.get("pos"):
            seg += m["pos"] + ". "
        seg += m.get("meaning", "")
        if m.get("usage"):
            seg += "（" + m["usage"] + "）"
        parts.append(seg)
    return " ".join(parts).strip()


def phrase_zh(p: dict):
    return p.get("usage", ""), [[e.get("en", ""), e.get("zh", "")]
                                for e in p.get("examples", []) if e.get("en")]


def conv_grammar(g: dict) -> dict:
    out = {"k": g.get("title", ""), "f": g.get("structure", ""),
           "d": " ".join(x for x in [g.get("definition", ""), g.get("usage", "")] if x)}
    ex = [[e.get("en", ""), e.get("zh", "")] for e in g.get("examples", []) if e.get("en")]
    if ex:
        out["ex"] = ex
    return out


def conv_pattern(p: dict) -> dict:
    o = p.get("original") or {}
    out = {"p": p.get("pattern", ""), "o": [o.get("en", ""), o.get("zh", "")]}
    im = [[e.get("en", ""), e.get("zh", "")] for e in p.get("imitations", []) if e.get("en")]
    if im:
        out["im"] = im
    return out


def convert(src: dict) -> dict:
    out = {"unit": lesson_label(src.get("lesson", "")), "lessons": []}
    words = [[v.get("word", ""), word_zh(v)] for v in src.get("vocabulary", []) if v.get("word")]
    if words:
        out["words"] = words
    phrases = []
    for p in src.get("phrases", []):
        if not p.get("phrase"):
            continue
        usage, ex = phrase_zh(p)
        phrases.append([p["phrase"], usage, ex])
    if phrases:
        out["phrases"] = phrases
    gram = [conv_grammar(g) for g in src.get("grammar", []) if g.get("title") or g.get("structure")]
    if gram:
        out["grammar"] = gram
    pats = [conv_pattern(p) for p in src.get("sentencePatterns", []) if p.get("pattern")]
    if pats:
        out["patterns"] = pats
    return out


def book_files(book: str):
    idx = fetch_json(f"{SRC}/{book}/index.json")
    files = [v for _, v in sorted(idx.items(), key=lambda kv: int(kv[0]))
             if isinstance(v, str) and v.endswith(".json") is False]
    return files


def main():
    idx_out = {}
    total = 0
    for book in BOOKS:
        files = book_files(book)
        idx_out[book] = {}
        outdir = os.path.normpath(os.path.join(OUT, "notes", book))
        os.makedirs(outdir, exist_ok=True)
        for i, name in enumerate(files, start=1):
            src = fetch_json(f"{SRC}/{book}/{name}.json")
            data = convert(src)
            with open(os.path.join(outdir, f"{name}.json"), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            idx_out[book][str(i)] = {"f": name,
                                     "w": len(data.get("words", [])),
                                     "ph": len(data.get("phrases", [])),
                                     "g": len(data.get("grammar", [])),
                                     "p": len(data.get("patterns", []))}
            total += 1
            print(f"[{book}] {i:>3}/{len(files)}  {name:<9} -> w{idx_out[book][str(i)]['w']}"
                  f" ph{idx_out[book][str(i)]['ph']} g{idx_out[book][str(i)]['g']} p{idx_out[book][str(i)]['p']}")
        # 温和限速，别打爆 CDN
        time.sleep(0.4)

    js = ("/* 教材笔记索引（由 backend/scripts/import_nce_notes.py 生成，勿手改）。\n"
          "   window.NOTES_IDX[册][单元序号] = {f:文件名, w:生词数, ph:短语数, g:语法数, p:句型数} */\n"
          "window.NOTES_IDX=" + json.dumps(idx_out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(os.path.join(OUT, "notes-index.js"), "w", encoding="utf-8") as f:
        f.write(js)
    print(f"\nDONE: {total} lessons written to {os.path.normpath(os.path.join(OUT, 'notes'))}")


if __name__ == "__main__":
    main()
