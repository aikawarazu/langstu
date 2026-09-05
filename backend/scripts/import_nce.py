"""内容导入器：从 nce.mleo.site 接口拉取 NCE 课文并解析为结构化数据。

数据源（实测 2026-09-03）：
  <BOOK_PATH>/book.json  -> 单元列表（每单元 filename 覆盖 2 课）
  <BOOK_PATH>/<filename>.lrc -> 逐句 [mm:ss.xx]英文 | 中文，含 "Lesson N | 第N课" 分段
  <BOOK_PATH>/<filename>.mp3 -> 单元音频（仅记录外链，不下载）

开发期落地为本地 JSON 快照 backend/data/<BOOK>.json（模拟 EdgeOne KV）。
部署期改为写入 EdgeOne KV（store 适配器替换即可，逻辑不变）。
"""
import json
import os
import re
import subprocess
import time
import urllib.parse

BASE = "https://nce.mleo.site"
BOOKS = {"NCE1": f"{BASE}/NCE1"}  # 后续加 NCE2/3/4

LRC_LINE = re.compile(r"^\[(\d+):(\d+(?:\.\d+)?)\](.*)$")
LESSON_MARK = re.compile(r"^Lesson\s+(\d+)\s*\|", re.IGNORECASE)


def fetch(url: str, tries: int = 3) -> str:
    # 环境内 python urllib 的 TLS 握手易超时，统一走 curl；并对不稳网络加重试。
    # 该环境 curl -w 偶发 http_code=000 且 returncode 不稳，故以 stdout 非空为成功判据。
    last = None
    for i in range(tries):
        try:
            r = subprocess.run(["curl", "-sL", "--max-time", "30", url],
                               capture_output=True, text=True)
            if r.stdout.strip():
                return r.stdout
            last = r.stderr
        except Exception as e:  # noqa
            last = e
        time.sleep(1.5 * i + 1)
    raise RuntimeError(f"fetch failed after {tries} tries: {url} ({last})")


def parse_lrc(text: str):
    """返回 [(sec, raw)]，raw 为 '|' 之前可能含 Lesson 标记。"""
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = LRC_LINE.match(line)
        if not m:
            continue
        mm, ss, content = int(m.group(1)), float(m.group(2)), m.group(3).strip()
        if not content:
            continue
        out.append((mm * 60 + ss, content))
    return out


def split_lessons(entries):
    """按 'Lesson N |' 标记把单元拆成多课；返回 [{idx, lines:[{ts,en,zh}]}]。"""
    lessons, cur = [], None
    for sec, raw in entries:
        lm = LESSON_MARK.match(raw)
        if lm:
            cur = {"idx": int(lm.group(1)), "lines": []}
            lessons.append(cur)
            continue
        if cur is None:
            continue  # 课标记前的书头（标题等）丢弃
        if " | " in raw:
            en, zh = raw.split(" | ", 1)
        else:
            en, zh = raw, ""
        cur["lines"].append({"ts": round(sec, 2), "en": en.strip(), "zh": zh.strip()})
    return lessons


def import_book(book_key: str, book_path: str, out_dir: str, only_units=None):
    book = json.loads(fetch(f"{book_path}/book.json"))
    units = book.get("units", [])
    lessons_out = []
    done = 0
    for u in units:
        fn, title = u.get("filename", ""), u.get("title", "")
        if not fn:
            continue
        if only_units is not None and done >= only_units:
            break
        lrc_url = f"{book_path}/{urllib.parse.quote(fn)}.lrc"
        try:
            lrc = fetch(lrc_url)
        except Exception as e:  # 单单元失败不影响整体
            print(f"  ! 跳过 {lrc_url}: {e}")
            continue
        for les in split_lessons(parse_lrc(lrc)):
            lessons_out.append({
                "book": book_key,
                "lesson": les["idx"],
                "unit_title": title,
                "audio_url": f"{book_path}/{urllib.parse.quote(fn)}.mp3",
                "lines": les["lines"],
            })
        done += 1
        time.sleep(0.05)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{book_key}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"book": book_key, "book_name": book.get("name", ""),
                   "units": len(units), "lessons": lessons_out},
                  f, ensure_ascii=False, indent=1)
    return {"book": book_key, "units": len(units), "lessons": len(lessons_out), "path": path}


if __name__ == "__main__":
    import sys
    out = os.path.join(os.path.dirname(__file__), "..", "data")
    # 冒烟测试：先只拉前 3 单元，确认解析正确再全量
    smoke = "--smoke" in sys.argv
    if smoke:
        r = import_book("NCE1", BOOKS["NCE1"], out, only_units=3)
        print("SMOKE:", r)
    else:
        r = import_book("NCE1", BOOKS["NCE1"], out)
        print("IMPORTED:", r)
    data = json.load(open(r["path"], encoding="utf-8"))
    print("sample lesson 1 lines:", data["lessons"][0]["lines"][:3])
