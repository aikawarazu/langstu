#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数据管线：把站点课程数据打包进 Chrome 扩展，并生成跨课生词索引 vocab.json。

用法：
    python3 extension/build_data.py

产物：
    extension/data/courses/      <- 直接复制 app/data/courses/*（index.json + nce1~4.json + content/）
    extension/data/vocab.json    <- 跨 276 课的生词 / 短语索引，供 content script 即点即译
"""
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "app", "data", "courses")
DST = os.path.join(ROOT, "extension", "data")
PKGS = ["nce1", "nce2", "nce3", "nce4"]


def norm_w(w):
    """与站点 js/lookup.js 的 normW 保持一致：小写 + 只留字母与 ' - 。"""
    return re.sub(r"[^a-z'\\-]", "", str(w).to_unicode() if hasattr(str, "to_unicode") else str(w).lower())


def norm_phrase(p):
    """短语归一：小写、只留字母与空格（保留词间空格用于多词命中）。"""
    return re.sub(r"[^a-z ]", "", str(p).lower()).strip()


def variant_keys(key):
    """生成常见词形变体（复数 / 过去式 / 进行时），让即点即译无需在 JS 里还原。"""
    out = set()
    if key.endswith("'s"):
        out.add(key[:-2])
    if key.endswith("ies"):
        out.add(key[:-3] + "y")
    if key.endswith("es"):
        out.add(key[:-2])
    elif key.endswith("s"):
        out.add(key[:-1])
    if key.endswith("ing"):
        out.add(key[:-3])
    if key.endswith("ed"):
        out.add(key[:-2])
    elif key.endswith("d") and len(key) > 2:
        out.add(key[:-1])
    return out


def copy_courses():
    dst_courses = os.path.join(DST, "courses")
    # 增量覆盖：逐文件复制，不整目录删除（避免误删与批量删除保护）
    n = 0
    for root, _, files in os.walk(SRC):
        rel = os.path.relpath(root, SRC)
        target = os.path.join(dst_courses, rel) if rel != "." else dst_courses
        os.makedirs(target, exist_ok=True)
        for f in files:
            shutil.copy2(os.path.join(root, f), os.path.join(target, f))
            n += 1
    print("copied %d files into data/courses/" % n)


def build_vocab():
    idx = json.load(open(os.path.join(SRC, "index.json"), encoding="utf-8"))
    pkg_titles = {}
    for m in idx.get("packages", []):
        pkg_titles[m["id"]] = m.get("title", m["id"])

    words = {}        # canonical key -> {forms:set, entries:[...]}
    aliases = {}      # variant key -> canonical key
    phrases = {}      # normalized phrase -> [{phrase, usage, examples, pkg, unit, unitTitle, lessonLabel}]
    CAP = 12           # 每个词最多展示的课文出处

    for pkg_id in PKGS:
        pkg = json.load(open(os.path.join(SRC, pkg_id + ".json"), encoding="utf-8"))
        unit_meta = {u["id"]: u for u in pkg.get("units", [])}
        for u in pkg.get("units", []):
            uid = u["id"]
            cref = u.get("contentRef") or ("content/%s/%s.json" % (pkg_id, uid))
            # contentRef 形如 "data/courses/content/nce1/u001.json" 或 "content/nce1/u001.json"
            rel = cref.split("data/courses/", 1)[-1]
            cpath = os.path.join(DST, "courses", rel)
            try:
                c = json.load(open(cpath, encoding="utf-8"))
            except Exception:
                continue
            lesson_label = u.get("lessonLabel") or ("Lesson " + ",".join(map(str, u.get("lessons", []))))
            # 生词
            for w in (c.get("words") or []):
                key = norm_w(w.get("word", ""))
                if not key:
                    continue
                entry = {
                    "word": w.get("word"),
                    "phonetic": w.get("phonetic"),
                    "meanings": w.get("meanings"),
                    "examples": w.get("examples"),
                    "pkg": pkg_id, "unit": uid,
                    "unitTitle": u.get("title"),
                    "lessonLabel": lesson_label,
                }
                rec = words.setdefault(key, {"forms": set(), "entries": []})
                rec["forms"].add(w.get("word"))
                if len(rec["entries"]) < CAP:
                    rec["entries"].append(entry)
                for v in variant_keys(key):
                    aliases[v] = key
            # 短语（多词选择时命中）
            for p in (c.get("phrases") or []):
                ph = norm_phrase(p.get("phrase", ""))
                if not ph or " " not in ph:
                    continue
                phrases.setdefault(ph, []).append({
                    "phrase": p.get("phrase"),
                    "usage": p.get("usage"),
                    "examples": p.get("examples"),
                    "pkg": pkg_id, "unit": uid,
                    "unitTitle": u.get("title"),
                    "lessonLabel": lesson_label,
                })

    # 序列化：set -> list
    out_words = {}
    for k, rec in words.items():
        out_words[k] = {"forms": sorted(rec["forms"]), "entries": rec["entries"]}

    vocab = {
        "version": 1,
        "packages": pkg_titles,
        "count": len(out_words),
        "words": out_words,
        "aliases": aliases,
        "phrases": phrases,
    }
    out_path = os.path.join(DST, "vocab.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(vocab, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(out_path)
    print("vocab.json: %d words, %d aliases, %d phrases, %.0f KB"
          % (len(out_words), len(aliases), len(phrases), size / 1024))


if __name__ == "__main__":
    os.makedirs(DST, exist_ok=True)
    copy_courses()
    build_vocab()
    print("done.")
