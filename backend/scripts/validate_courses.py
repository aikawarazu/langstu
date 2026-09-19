"""校验已构建课程包 data/courses/content/<book>/uXXX.json 的精编稿契约。

用法：python3 backend/scripts/validate_courses.py [book...]
退出码 0 表示全绿。
"""
import json
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(REPO, "data", "courses")
BOOKS = {"nce1": 72, "nce2": 96, "nce3": 60, "nce4": 48}
POLLUTE = re.compile(r"参考例句|英音|美音|人性化|相关词条|柯林斯|来自\d+部分")

LEAD = ["question", "warmup", "goals", "summary", "tips"]


def check_unit(book, uid, c):
    errs = []
    lead = c.get("lead") or {}
    for k in LEAD:
        if not lead.get(k):
            errs.append("lead.%s" % k)
    tx = c.get("text") or []
    if not tx:
        errs.append("no-text")
    else:
        for i, t in enumerate(tx):
            for l in t.get("lines") or []:
                if not l.get("en") or not l.get("zh"):
                    errs.append("text[%d].line 无译文" % i)
                    break
    qs = c.get("questions") or []
    if len(qs) < 4:
        errs.append("questions=%d" % len(qs))
    if qs and qs[0].get("kind") != "listen":
        errs.append("q0 not listen")
    if len(c.get("exercises") or []) != 7:
        errs.append("exercises=%d" % len(c.get("exercises") or []))
    qz = c.get("quiz") or []
    if len(qz) != 6:
        errs.append("quiz=%d" % len(qz))
    for i, q in enumerate(qz):
        o = q.get("options") or []
        if len(o) != 4 or len(set(o)) != len(o):
            errs.append("quiz[%d].options" % i)
        if not isinstance(q.get("answer"), int) or not (0 <= q.get("answer", -1) < len(o)):
            errs.append("quiz[%d].answer" % i)
    body = json.dumps(c, ensure_ascii=False)
    if POLLUTE.search(body):
        errs.append("词典串污染")
    return errs


def main():
    bad_total = 0
    for b, n in ((x, BOOKS[x]) for x in (sys.argv[1:] or list(BOOKS))):
        bad = []
        stats = {"units": 0, "lead": 0, "text": 0, "lines": 0, "ex": 0, "qz": 0, "q": 0}
        for i in range(1, n + 1):
            uid = "u%03d" % i
            p = os.path.join(OUT, "content", b, uid + ".json")
            if not os.path.exists(p):
                bad.append((uid, ["缺 content"]))
                continue
            c = json.load(open(p, encoding="utf-8"))
            stats["units"] += 1
            if c.get("lead"):
                stats["lead"] += 1
            if c.get("text"):
                stats["text"] += 1
                stats["lines"] += sum(len(t.get("lines") or []) for t in c["text"])
            stats["ex"] += len(c.get("exercises") or [])
            stats["qz"] += len(c.get("quiz") or [])
            stats["q"] += len(c.get("questions") or [])
            e = check_unit(b, uid, c)
            if e:
                bad.append((uid, e))
        print("%-5s units=%d lead=%d text=%d lines=%d ex=%d qz=%d q=%d  NG=%d"
              % (b, stats["units"], stats["lead"], stats["text"], stats["lines"],
                 stats["ex"], stats["qz"], stats["q"], len(bad)))
        for uid, e in bad[:15]:
            print("    ", uid, ",".join(e[:6]))
        bad_total += len(bad)
    print("TOTAL NG =", bad_total)
    return 1 if bad_total else 0


if __name__ == "__main__":
    sys.exit(main())
