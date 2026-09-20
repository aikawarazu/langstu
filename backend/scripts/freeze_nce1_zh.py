#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 progress/nce1-fix 的译文补丁固化为**构建期数据源**。

为什么要固化：`data/courses/content/nce1/*.json` 是构建产物，直接改它会在下次
`build_course_packages.py` 时被覆盖（译文丢失）。因此把 AI 产出的译文与行下标
转存到 `backend/data/notes/nce1_zh/uXXX.json`，由构建脚本在生成内容时应用。

产物格式：
    {"unitId": "u003",
     "lessons": [{"lesson": 5, "zh": [{"i": 0, "zh": "早上好。"}, {"i": 7, "zh": null}]}]}
  - `zh` 字符串：写回该行译文；
  - `zh` 为 null：该行是混入 en 的说话人残片，构建时删除。

用法：python3 backend/scripts/freeze_nce1_zh.py
"""
import glob
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FIX = os.path.join(ROOT, "progress", "nce1-fix")
OUT = os.path.join(ROOT, "backend", "data", "notes", "nce1_zh")


def main():
    os.makedirs(OUT, exist_ok=True)
    n = 0
    for pz in sorted(glob.glob(os.path.join(FIX, "zh", "u*.json"))):
        u = os.path.basename(pz)[:-5]
        pp = os.path.join(FIX, "payload", u + ".json")
        if not os.path.exists(pp):
            print("%s  SKIP (缺 payload)" % u)
            continue
        payload = json.load(open(pp, encoding="utf-8"))
        obj = json.load(open(pz, encoding="utf-8"))
        got = {e["i"]: e.get("zh") for e in obj.get("zh") or []}
        lessons = []
        for L in payload.get("lessons") or []:
            items = [{"i": l["i"], "zh": got.get(l["i"])}
                     for l in L.get("lines") or [] if l["i"] in got]
            if items:
                lessons.append({"lesson": L["lesson"], "zh": items})
        out = {"unitId": u, "lessons": lessons}
        with open(os.path.join(OUT, u + ".json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        total = sum(len(L["zh"]) for L in lessons)
        drops = sum(1 for L in lessons for e in L["zh"] if e["zh"] is None)
        print("%s  lessons=%d  zh=%d  drop=%d" % (u, len(lessons), total, drops))
        n += 1
    print("frozen patches:", n, "->", os.path.relpath(OUT, ROOT))


if __name__ == "__main__":
    main()
