#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把智能体产出的逐句译文写回 NCE1 内容包，并落 `.done` 标记。

用法：
    python3 backend/scripts/apply_nce1_zh.py            # 处理 progress/nce1-fix/zh/ 下全部
    python3 backend/scripts/apply_nce1_zh.py u003 u004  # 只处理指定单元

契约（progress/nce1-fix/zh/uXXX.json）：
    {"unitId": "u003", "zh": [{"i": 0, "zh": "早上好。"}, {"i": 7, "zh": null}]}
  - `zh` 为字符串：写回该行译文；
  - `zh` 为 null：该行是混入 en 的说话人残片（如 "DAVE:"），从 text 中删除。

校验（任一失败则该单元跳过并报错）：
    1. zh 条目覆盖 payload 中全部行的下标（字符串 + null 合计），不重不漏；
    2. 字符串条目非空、无 6+ 连续拉丁字母（防英文残留）；
    3. 写回后 content 中该单元无空 zh。
"""
import glob
import hashlib
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FIX = os.path.join(ROOT, "progress", "nce1-fix")
CONTENT = os.path.join(ROOT, "data", "courses", "content", "nce1")
LATIN = re.compile(r"[A-Za-z]{6,}")


def check(payload, obj):
    """返回 (errs, got, drop)。"""
    errs = []
    want = []
    for L in payload["lessons"]:
        want += [l["i"] for l in L["lines"]]
    got, drop = {}, set()
    for e in obj.get("zh") or []:
        i = e.get("i")
        if not isinstance(i, int):
            errs.append("bad index: %r" % (i,))
            continue
        if e.get("zh") is None:
            drop.add(i)
            continue
        z = str(e.get("zh")).strip()
        if not z:
            errs.append("empty zh at i=%d" % i)
        elif LATIN.search(z):
            errs.append("latin residue at i=%d: %s" % (i, z[:40]))
        got[i] = z
    miss = [i for i in want if i not in got and i not in drop]
    extra = [i for i in list(got) + list(drop) if i not in want]
    if miss:
        errs.append("missing i=%s" % miss[:12])
    if extra:
        errs.append("unexpected i=%s" % extra[:12])
    return errs, got, drop


def main():
    units = sys.argv[1:]
    if not units:
        units = sorted(os.path.basename(p)[:-5]
                       for p in glob.glob(os.path.join(FIX, "zh", "u*.json")))
    ok = bad = 0
    for u in units:
        pz = os.path.join(FIX, "zh", u + ".json")
        pp = os.path.join(FIX, "payload", u + ".json")
        if not (os.path.exists(pz) and os.path.exists(pp)):
            print("%s  SKIP (缺 payload/zh)" % u)
            bad += 1
            continue
        payload = json.load(open(pp, encoding="utf-8"))
        obj = json.load(open(pz, encoding="utf-8"))
        errs, got, drop = check(payload, obj)
        if errs:
            print("%s  INVALID: %s" % (u, "; ".join(errs)))
            bad += 1
            continue
        cp = os.path.join(CONTENT, u + ".json")
        c = json.load(open(cp, encoding="utf-8"))
        for t in c.get("text") or []:
            lines = t.get("lines") or []
            for i, l in enumerate(lines):
                if i in got:
                    l["zh"] = got[i]
            for i in sorted(drop, reverse=True):     # 残片行删除（降序防下标错位）
                if i < len(lines):
                    del lines[i]
            t["lines"] = lines
        left = sum(1 for t in c.get("text") or []
                   for l in (t.get("lines") or []) if not (l.get("zh") or "").strip())
        if left:
            print("%s  INVALID: 写回后仍有 %d 行无译文" % (u, left))
            bad += 1
            continue
        with open(cp, "w", encoding="utf-8") as f:
            json.dump(c, f, ensure_ascii=False, indent=1)
            f.write("\n")
        sha = hashlib.sha1(open(cp, "rb").read()).hexdigest()[:12]
        done = os.path.join(FIX, "units", "nce1-%s.done" % u)
        os.makedirs(os.path.dirname(done), exist_ok=True)
        with open(done, "w", encoding="utf-8") as f:
            json.dump({"unit": u, "applied": len(got), "dropped": sorted(drop),
                       "sha1": sha, "source": "progress/nce1-fix/zh/%s.json" % u},
                      f, ensure_ascii=False, indent=1)
        lock = os.path.join(FIX, "units", "nce1-%s.lock" % u)
        if os.path.exists(lock):
            os.remove(lock)
        print("%s  OK  applied=%d dropped=%s sha1=%s" % (u, len(got), sorted(drop), sha))
        ok += 1
    print("applied %d, failed %d" % (ok, bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
