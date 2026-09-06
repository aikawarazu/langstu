"""把外部整理的 nce_all.json（按课平的“原始”数据）合并进当前教材数据。

当前成品数据（app/data/courses/）是精修版：words 带音标/用法、phrases/patterns/exercises
都很完整。待合并文件是较低质量的按课抽取（text 只有 en、words 无音标/用法、lead 常有垃圾值），
且覆盖不全（nce1 仅 72/144 课、nce4 仅 40/48 课且有重复课号）。

因此本脚本只做「补充增强」，绝不覆盖/删除现有精修内容：
  * 把待合并文件里质量最高的整篇中文翻译 translation 写进对应 content 文件
    - 单课/单元的包（nce2/3/4）：content["translation"] = 字符串
    - 双课/单元的包（nce1）：content["translations"] = { "1": "...", "3": "..." } 按课号
  * 仅当某单元当前完全没有 grammar、且待合并文件该课带 grammar 时，补一份 grammar
    （title + definition=content），用于填补空缺；已有 grammar 不改动。

用法：python3 backend/scripts/merge_nce_all.py <path/to/nce_all.json>
"""
import json
import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "app", "data"))
COURSES = os.path.join(ROOT, "courses")

# 包 id -> 每单元课数映射方式由 units[].lessons 决定，这里只用来回退
BOOK_KEYS = ["nce1", "nce2", "nce3", "nce4"]


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def norm_title(t):
    return (t or "").strip().lower()


def build_dropped(path):
    """{book: {lesson: entry}}，重复课号保留信息更完整的那条。"""
    raw = load_json(path)
    out = {}
    for bk in BOOK_KEYS:
        arr = raw.get(bk, [])
        m = {}
        for e in arr:
            ln = e.get("lesson")
            if not isinstance(ln, int):
                continue
            prev = m.get(ln)
            # 选 translation 更长 / 字段更多的
            if prev is None or len(e.get("translation", "") or "") > len(prev.get("translation", "") or ""):
                m[ln] = e
        out[bk] = m
    return out


def main():
    if len(sys.argv) < 2:
        print("用法: merge_nce_all.py <nce_all.json>")
        sys.exit(1)
    src = sys.argv[1]
    dropped = build_dropped(src)

    stats = {"translation": 0, "translations": 0, "grammar_fill": 0, "units": 0}

    for bk in BOOK_KEYS:
        pkg = load_json(os.path.join(COURSES, bk + ".json"))
        cdir = os.path.join(COURSES, "content", bk)
        dmap = dropped.get(bk, {})
        for unit in pkg.get("units", []):
            uid = unit.get("id")
            lessons = unit.get("lessons") or []
            cpath = os.path.join(cdir, uid + ".json")
            if not os.path.exists(cpath):
                continue
            content = load_json(cpath)
            changed = False

            # 1) translation(s)
            tr = {}
            for L in lessons:
                e = dmap.get(L)
                t = (e or {}).get("translation")
                if t and t.strip():
                    tr[str(L)] = t.strip()
            if tr:
                if len(lessons) == 1 and str(lessons[0]) in tr:
                    content["translation"] = tr[str(lessons[0])]
                    stats["translation"] += 1
                else:
                    existing = content.get("translations") or {}
                    existing.update(tr)
                    content["translations"] = existing
                    stats["translations"] += 1
                changed = True

            # 2) grammar 填补（仅单课单元且当前无 grammar）
            if len(lessons) == 1 and "grammar" not in content:
                e = dmap.get(lessons[0])
                gs = (e or {}).get("grammar") or []
                if gs:
                    new_gs = []
                    for g in gs:
                        title = g.get("title") or "Grammar"
                        body = g.get("content") or g.get("definition") or ""
                        item = {"title": title}
                        if g.get("structure"):
                            item["structure"] = g["structure"]
                        item["definition"] = body.strip() if body else ""
                        new_gs.append(item)
                    if new_gs:
                        content["grammar"] = new_gs
                        stats["grammar_fill"] += 1
                        changed = True

            if changed:
                stats["units"] += 1
                with open(cpath, "w", encoding="utf-8") as f:
                    json.dump(content, f, ensure_ascii=False, separators=(",", ":"))

    print("合并完成：")
    print(f"  写入 translation（单课单元）: {stats['translation']}")
    print(f"  写入 translations（双课单元）: {stats['translations']}")
    print(f"  填补 grammar 空缺: {stats['grammar_fill']}")
    print(f"  受影响 content 文件总数: {stats['units']}")


if __name__ == "__main__":
    main()
