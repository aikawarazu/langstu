"""把「智能体产出的增量稿」合成标准精编稿，并做契约校验。

输入：
  progress/nce234-craft/delta/<book>/<uid>.json     智能体增量（lead/questions/exercises/quiz，缺原文时还含 text）
  progress/nce234-craft/extract/<book>/<uid>.json   原文抽取底稿（标题/听力提问/对齐课文）
  data/courses/<book>.json                          包内单元标题兜底

输出：
  backend/data/notes/craft/<book>/<uid>.json        标准精编稿
  progress/nce234-craft/units/<book>-<uid>.done     完成标记（含校验结论）
  progress/nce234-craft/status.json                 总览

用法：python3 backend/scripts/assemble_craft.py [--book nce2]
"""
import glob
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROG = os.path.join(REPO, "progress", "nce234-craft")
DELTA = os.path.join(PROG, "delta")
EXTRACT = os.path.join(PROG, "extract")
UNITS = os.path.join(PROG, "units")
CRAFT = os.path.join(REPO, "backend", "data", "notes", "craft")
COURSES = os.path.join(REPO, "data", "courses")
BOOKS = {"nce2": 96, "nce3": 60, "nce4": 48}

REQUIRED_LEAD = ["question", "warmup", "goals", "summary", "tips"]


def load(p):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return None


def title_of(book, uid, ext):
    pkg = load(os.path.join(COURSES, book + ".json")) or {}
    built = ""
    for u in pkg.get("units", []):
        if u.get("id") == uid:
            built = u.get("title", "")
            break
    return (ext or {}).get("titleEn") or built


def check(obj, need_text):
    errs = []
    lead = obj.get("lead") or {}
    for k in REQUIRED_LEAD:
        if not lead.get(k):
            errs.append("lead.%s 为空" % k)
    if lead.get("goals") and not (3 <= len(lead["goals"]) <= 6):
        errs.append("goals 数量 %d 超出 3-6" % len(lead["goals"]))
    qs = obj.get("questions") or []
    if len(qs) < 4:
        errs.append("questions 少于 4 条")
    if qs and qs[0].get("kind") != "listen":
        errs.append("questions[0].kind 不是 listen")
    for i, q in enumerate(qs):
        if not q.get("q") or not q.get("a"):
            errs.append("question[%d] 缺 q/a" % i)
    exs = obj.get("exercises") or []
    if len(exs) < 7:
        errs.append("exercises=%d（应为 7）" % len(exs))
    elif len(exs) > 7:
        obj["exercises"] = exs[:7]
    for i, e in enumerate(exs):
        if not e.get("q") or not e.get("a"):
            errs.append("exercise[%d] 缺 q/a" % i)
    qz = obj.get("quiz") or []
    if len(qz) < 6:
        errs.append("quiz=%d（应为 6）" % len(qz))
    elif len(qz) > 6:
        obj["quiz"] = qz[:6]
    for i, q in enumerate(qz):
        opts = q.get("options") or []
        ans = q.get("answer")
        if len(opts) != 4:
            errs.append("quiz[%d] 选项=%d（应为 4）" % (i, len(opts)))
        if not isinstance(ans, int) or not (0 <= ans < len(opts)):
            errs.append("quiz[%d].answer 非法" % i)
        if len(set(opts)) != len(opts):
            errs.append("quiz[%d] 选项重复" % i)
    if need_text:
        tx = obj.get("text") or []
        if len(tx) < 1:
            errs.append("text 为空")
        for i, t in enumerate(tx):
            ls = t.get("lines") or []
            if len(ls) < 4:
                errs.append("text[%d] 句子数不足（%d）" % (i, len(ls)))
            for l in ls:
                if not l.get("en") or not l.get("zh"):
                    errs.append("text[%d] 句子缺 en/zh" % i)
                    break
    return errs


def assemble(book, unit_total):
    os.makedirs(os.path.join(CRAFT, book), exist_ok=True)
    os.makedirs(UNITS, exist_ok=True)
    rows = []
    for i in range(1, unit_total + 1):
        uid = "u%03d" % i
        dp = os.path.join(DELTA, book, uid + ".json")
        d = load(dp)
        key = "%s-%s" % (book, uid)
        if not d:
            rows.append({"unit": key, "state": "missing", "errors": ["无增量稿"]})
            continue
        ext = load(os.path.join(EXTRACT, book, uid + ".json"))
        need_text = not ext or not (ext.get("lines") or [])
        obj = {"unitId": uid}
        t = d.get("title") or title_of(book, uid, ext)
        st = d.get("subtitle") or ((ext or {}).get("titleZh") or "")
        if t:
            obj["title"] = t
        if st:
            obj["subtitle"] = st
        if need_text and d.get("text"):
            obj["text"] = d["text"]
        for k in ("lead", "questions", "exercises", "quiz"):
            if d.get(k):
                obj[k] = d[k]
        if d.get("wordsExtra"):
            obj["wordsExtra"] = d["wordsExtra"]

        errs = check(obj, need_text)
        if errs:
            rows.append({"unit": key, "state": "invalid", "errors": errs})
            continue
        out = os.path.join(CRAFT, book, uid + ".json")
        json.dump(obj, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        done = os.path.join(UNITS, key + ".done")
        json.dump({
            "unit": key, "book": book, "unitId": uid,
            "title": obj.get("title", ""), "subtitle": obj.get("subtitle", ""),
            "hasText": need_text, "lines": len((ext or {}).get("lines") or []),
            "questions": len(obj["questions"]), "exercises": len(obj["exercises"]),
            "quiz": len(obj["quiz"]),
            "sha1": hashlib.sha1(open(out, "rb").read()).hexdigest()[:12],
            "finishedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        }, open(done, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        lock = os.path.join(UNITS, key + ".lock")
        if os.path.exists(lock):
            os.remove(lock)
        rows.append({"unit": key, "state": "ok", "lines": len((ext or {}).get("lines") or [])})
    return rows


def main():
    books = [a for a in sys.argv[1:] if not a.startswith("-")] or list(BOOKS)
    summary = {}
    for b in books:
        rows = assemble(b, BOOKS[b])
        ok = sum(1 for r in rows if r["state"] == "ok")
        summary[b] = {"total": BOOKS[b], "ok": ok,
                      "invalid": [r for r in rows if r["state"] == "invalid"][:20],
                      "missing": [r["unit"] for r in rows if r["state"] == "missing"]}
        bad = [r for r in rows if r["state"] != "ok"]
        print("%s ok=%d/%d" % (b, ok, BOOKS[b]))
        for r in bad[:12]:
            print("   ", r["unit"], r["state"], r.get("errors", "")[:120])
        if len(bad) > 12:
            print("    ...共 %d 项待补" % len(bad))
    json.dump(summary, open(os.path.join(PROG, "status.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
