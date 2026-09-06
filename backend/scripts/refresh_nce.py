#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合并 raw 解析结果到现有课程包 content/*.json。

策略（合并保留）：
- text：仅当现有 text 缺失时，用 raw 重建（EN 句子）。保留已有精修 text。
- lead：仅当现有 lead 缺失时生成；已有则保留。
- words：保留现有（含音标/用法）；把 raw 中缺失的词补进来。
- translation：nce1 等缺失时，用 raw 参考译文补。
- grammar/patterns/exercises/phrases：保留现有，不覆盖。

用法：
  python3 refresh_nce.py --dry            # 试跑，不写盘
  python3 refresh_nce.py --dry --limit 8  # 仅前 8 个单元
  python3 refresh_nce.py                  # 全量写盘
"""
import os, re, sys, json, glob, argparse, shutil

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
from parse_nce_raw import build_index, BOOKS

ROOT = os.path.join(HERE, "..", "..", "app", "data", "courses", "content")
BACKUP = os.path.join(HERE, "..", "data", "content_backup")
UNIT_RE = re.compile(r"u(\d+)\.json$")


def unit_lessons(book, i):
    """unit 序号 i(1-based) -> 课号列表。nce1 每册 2 课，其余 1 课。"""
    if book == "nce1":
        return [2 * i - 1, 2 * i]
    return [i]


def build_text_from_raw(raw_lessons):
    """raw_lessons: {lesson: parsed} -> text 数组（按课号顺序）。"""
    out = []
    for ln in sorted(raw_lessons):
        p = raw_lessons[ln]
        if not p.get("text_en"):
            continue
        kind = "课文 · 对话" if len(p["text_en"]) <= 14 and p["book"] == "nce1" else "课文"
        title = re.sub(r"^Lesson\s+\d+\s*[\u2014:：\-]?\s*", "", p.get("title", "")).strip()
        lines = [{"en": s} for s in p["text_en"]]
        out.append({"lesson": ln, "title": title or f"Lesson {ln}", "kind": kind, "lines": lines})
    return out


def extract_grammar_focus(grammar_raw, selfstudy):
    """从语法块(Grammar in use)抽取语法要点标题。优先用 grammar_raw。"""
    points = []
    blob = (grammar_raw or "") + "\n" + (selfstudy or "")
    for line in blob.splitlines():
        s = line.strip()
        m = re.match(r"^\d+[.\uFF0E\u3002\u3001、]\s*(.+)$", s)
        if not m:
            continue
        t = m.group(1).strip()
        if not t or len(t) > 24:
            continue
        # 语法主题：含语法类关键词，或以英文开头（如 used to do）
        if re.search(r"(时|语态|句|语|法|结构|用法|分词|不定式|从句|语气|格|数|比较|被动|进行|完成|虚拟|使役|情态|冠词|介词|代词|连词)", t) or re.match(r"^[a-z]", t):
            if t not in points:
                points.append(t)
        if len(points) >= 3:
            break
    return points[:3]


def compose_summary(title, translation, grammar_points, book):
    """生成中文导学 summary（单行、自然）。"""
    zh_title = ""
    m = re.search(r"([\u4e00-\u9fff].*)", title)
    if m:
        zh_title = m.group(1).strip(" \u2014:：")
    gist = ""
    if translation:
        flat = re.sub(r"\s+", " ", translation.strip())
        sent = re.split(r"(?<=[。！？])", flat)
        gist = "".join(sent[:2]).strip()
        gist = gist[:130]
    parts = []
    if zh_title:
        parts.append(f"《{zh_title}》")
    if gist:
        parts.append(gist)
    if grammar_points:
        parts.append("语法聚焦：" + "、".join(grammar_points) + "。")
    return "".join(parts).strip()


def compose_tips(grammar_points, words, book):
    """生成中文导学 tips。"""
    tips = []
    if grammar_points:
        tips.append("语法重点：" + "；".join(grammar_points) + "。")
    if words:
        top = [w["word"] for w in words[:3]]
        tips.append("重点词汇：" + "、".join(top) + " 等，结合课文例句记忆。")
    tips.append("练法：先盲听跟读，再对照参考译文理解，最后尝试复述课文。")
    return "".join(tips).strip()


def generate_lead(raw_lessons, book):
    """为缺导学的单元生成 lead。"""
    q = ""
    first_ln = sorted(raw_lessons)[0] if raw_lessons else None
    if first_ln is not None:
        q = raw_lessons[first_ln].get("listen_q", "")
    translations = [p.get("translation", "") for p in raw_lessons.values() if p.get("translation")]
    grammar_raw = "\n".join(p.get("grammar_raw", "") for p in raw_lessons.values())
    selfstudy = "\n".join(p.get("selfstudy", "") for p in raw_lessons.values())
    words_all = []
    for p in raw_lessons.values():
        words_all.extend(p.get("words", []))
    gpoints = extract_grammar_focus(grammar_raw, selfstudy)
    title = raw_lessons[first_ln].get("title", "") if first_ln else ""
    summary = compose_summary(title, " ".join(translations), gpoints, book)
    tips = compose_tips(gpoints, words_all, book)
    lead = {"summary": summary, "tips": tips}
    if q:
        lead["question"] = q
    return lead


def generate_lead_from_translation(content, book):
    """无 raw 时，用现有 translation / words 生成兜底导学。"""
    trans = content.get("translation", "")
    title = content.get("title", "") or ""
    words = content.get("words", [])
    if trans:
        flat = re.sub(r"\s+", " ", trans.strip())
        sent = re.split(r"(?<=[。！？])", flat)
        gist = "".join(sent[:2]).strip()[:140]
        parts = []
        if title and re.search(r"[\u4e00-\u9fff]", title):
            parts.append(f"《{title}》")
        if gist:
            parts.append(gist)
        summary = "".join(parts).strip() or gist
        tips = "练法：先盲听跟读，再对照参考译文理解，最后尝试复述课文。"
        return {"summary": summary, "tips": tips}
    # 无 translation：用标题 + 重点词汇兜底
    if words:
        top = [w.get("word", "") for w in words[:4] if w.get("word")]
        wstr = "、".join(top)
        summary = f"本课重点词汇：{wstr} 等，建议结合课文录音与词汇表学习。"
        tips = "练法：先盲听跟读，再对照词汇表理解，最后尝试复述课文。"
        if title and re.search(r"[\u4e00-\u9fff]", title):
            summary = f"《{title}》" + summary
        return {"summary": summary, "tips": tips}
    return None


def merge_unit(book, path, raw_idx, dry):
    unit = UNIT_RE.search(path).group(1)
    i = int(unit)
    lessons = unit_lessons(book, i)
    raw_lessons = {ln: raw_idx[book][ln] for ln in lessons if ln in raw_idx.get(book, {})}
    content = json.load(open(path, encoding="utf-8"))
    changed = []
    # 1) text（仅 raw 可用时）
    if not content.get("text") and raw_lessons:
        txt = build_text_from_raw(raw_lessons)
        if txt:
            content["text"] = txt
            changed.append(f"text(+{len(txt)}课/{sum(len(t['lines']) for t in txt)}行)")
    # 2) lead（缺则生成：优先 raw，兜底 translation/words）
    if not content.get("lead"):
        lead = generate_lead(raw_lessons, book) if raw_lessons else None
        if not (lead and lead.get("summary")):
            lead = generate_lead_from_translation(content, book)
        if lead and lead.get("summary"):
            content["lead"] = lead
            changed.append("lead(+)")
    # 3) words 补全
    existing_words = {w.get("word", "").lower() for w in content.get("words", [])}
    added_words = 0
    if "words" not in content:
        content["words"] = []
    for p in raw_lessons.values():
        for rw in p.get("words", []):
            if rw["word"].lower() not in existing_words and rw.get("meaning"):
                content["words"].append({"word": rw["word"], "meanings": [{"meaning": rw["meaning"]}]})
                existing_words.add(rw["word"].lower())
                added_words += 1
    if added_words:
        changed.append(f"words(+{added_words})")
    # 4) translation（nce1 等缺失）
    if not content.get("translation"):
        trans = [p.get("translation", "") for p in raw_lessons.values() if p.get("translation")]
        if trans:
            content["translation"] = "\n".join(trans)
            changed.append("translation(+)")
    if not changed:
        return None
    if not dry:
        os.makedirs(BACKUP, exist_ok=True)
        shutil.copy2(path, os.path.join(BACKUP, os.path.basename(path)))
        with open(path, "w", encoding="utf-8") as f:
            json.dump(content, f, ensure_ascii=False, separators=(",", ":"))
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    raw_idx = build_index()
    total_changed = 0
    done = 0
    for book in BOOKS:
        files = sorted(glob.glob(os.path.join(ROOT, book, "u*.json")))
        for path in files:
            ch = merge_unit(book, path, raw_idx, args.dry)
            done += 1
            if ch:
                total_changed += 1
                print(f"[{'DRY' if args.dry else 'WRITE'}] {os.path.relpath(path)} -> {', '.join(ch)}")
            if args.limit and done >= args.limit:
                break
        if args.limit and done >= args.limit:
            break
    print(f"\n=== {'DRY' if args.dry else 'DONE'} : {total_changed} units changed / {done} scanned ===")


if __name__ == "__main__":
    main()
