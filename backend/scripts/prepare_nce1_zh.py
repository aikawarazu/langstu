#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 NCE1 缺译文单元的补丁素材（payload）。

背景：`data/courses/content/nce1/*.json` 中 Lesson 5 及之后多为对话体，
`text[].lines` 只有 `en`（+speaker）而缺 `zh`；`backend/data/parsed/nce1/*.json`
的 `translation` 是「按对话轮」的中文，`backend/data/raw/nce1/<page>.txt` 的
「参考译文」为同源的逐轮中文。本脚本把三类信息汇总成单文件素材，供智能体
逐句对齐/翻译，再由 `apply_nce1_zh.py` 写回。

产物：progress/nce1-fix/payload/uXXX.json
    {
      "unitId": "u003",
      "lessons": [ {"lesson":5,"title":"Nice to meet you","kind":"课文 · 对话",
                    "lines":[{"i":0,"speaker":"MR. BLAKE","en":"Good morning."}]} ],
      "reference": {"5": ["布莱克先生：早上好。", ...]},
      "parsedTranslation": ["布莱克先生：早上好。", ...],
      "rawPage": "186.txt"
    }

用法：python3 backend/scripts/prepare_nce1_zh.py [u003 u004 ...]
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONTENT = os.path.join(ROOT, "data", "courses", "content", "nce1")
PARSED = os.path.join(ROOT, "backend", "data", "parsed", "nce1")
RAW = os.path.join(ROOT, "backend", "data", "raw", "nce1")
OUT = os.path.join(ROOT, "progress", "nce1-fix", "payload")

RE_STOP = ("自学导读", "Notes on the text", "语法", "词汇", "练习答案",
           "Key to", "Summary", "Exercises", "新概念英语", "上一篇", "下一篇")


def raw_ref_by_lesson():
    """{'5': {'file': '186.txt', 'ref': [...]}} —— 从 raw 页抽「参考译文」逐轮中文。"""
    pat = re.compile(r"[Ll]esson\s*(\d+)")
    out = {}
    for fn in sorted(os.listdir(RAW)):
        p = os.path.join(RAW, fn)
        s = open(p, encoding="utf-8", errors="ignore").read().replace("\r", "")
        m = pat.search(s[:800])
        if not m:
            continue
        lesson = int(m.group(1))
        i = s.find("参考译文")
        if i < 0:
            continue
        seg = []
        for ln in s[i + len("参考译文"):].split("\n"):
            ln = ln.replace("\xa0", " ").strip()
            if not ln:
                continue
            if any(ln.startswith(x) for x in RE_STOP):
                break
            seg.append(ln)
        if seg:
            out[str(lesson)] = {"file": fn, "ref": seg}
    return out


def need_lines(unit):
    """返回该单元缺 zh 的行（按课分组）。"""
    p = os.path.join(CONTENT, unit + ".json")
    c = json.load(open(p, encoding="utf-8"))
    out = []
    for t in c.get("text") or []:
        lines = t.get("lines") or []
        miss = [{"i": i, "speaker": l.get("speaker"), "en": l.get("en")}
                for i, l in enumerate(lines) if not (l.get("zh") or "").strip()]
        if miss:
            out.append({"lesson": t.get("lesson"), "title": t.get("title"),
                        "kind": t.get("kind"), "lines": miss})
    return out


def build(unit):
    ref = raw_ref_by_lesson()
    parsed = json.load(open(os.path.join(PARSED, unit + ".json"), encoding="utf-8"))
    lessons = need_lines(unit)
    if not lessons:
        return None
    return {
        "unitId": unit,
        "lessons": lessons,
        "reference": {str(L["lesson"]): ref[str(L["lesson"])]["ref"]
                      for L in lessons if str(L["lesson"]) in ref},
        "rawPage": {str(L["lesson"]): ref[str(L["lesson"])]["file"]
                    for L in lessons if str(L["lesson"]) in ref},
        "parsedTranslation": parsed.get("translation") or [],
    }


def main():
    units = sys.argv[1:]
    if not units:
        units = ["u%03d" % i for i in range(1, 73)]
    os.makedirs(OUT, exist_ok=True)
    n = 0
    for u in units:
        if not os.path.exists(os.path.join(CONTENT, u + ".json")):
            continue
        d = build(u)
        if not d:
            continue
        with open(os.path.join(OUT, u + ".json"), "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        total = sum(len(L["lines"]) for L in d["lessons"])
        print("%s  lessons=%d  missing_lines=%d  ref=%s"
              % (u, len(d["lessons"]), total, sorted(d["reference"])))
        n += 1
    print("payload written:", n)


if __name__ == "__main__":
    main()
