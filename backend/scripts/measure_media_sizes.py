"""测量课程包里所有外链媒体（音频 / LRC）的体积，写入 data/media-sizes.json。

用途：构建 source manifest 时给每个专辑标注 audio 体积，供前端显示「约 xx MB」与全量缓存决策。
只发 HEAD 请求（拿不到 Content-Length 时退回 Range: bytes=0-0），并发 8，失败记 0（不阻塞构建）。

用法：python3 backend/scripts/measure_media_sizes.py [--concurrency 8]
"""
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
COURSES = os.path.join(REPO, "data", "courses")
OUT = os.path.join(REPO, "data", "media-sizes.json")
UA = "langstu-media-measure/1.0"


def collect():
    urls = set()
    for name in sorted(os.listdir(COURSES)):
        if not name.endswith(".json") or name == "index.json":
            continue
        pkg = json.load(open(os.path.join(COURSES, name), encoding="utf-8"))
        for u in pkg.get("units", []):
            for a in (u.get("audio") or []):
                for k in ("url", "lrc"):
                    if a.get(k):
                        urls.add(a[k])
    return sorted(urls)


def head_size(url):
    for method, headers in (("HEAD", {}), ("GET", {"Range": "bytes=0-0"})):
        try:
            req = urllib.request.Request(url, method=method, headers=dict({"User-Agent": UA}, **headers))
            with urllib.request.urlopen(req, timeout=30) as r:
                cl = r.headers.get("Content-Length")
                if cl and cl.isdigit():
                    return int(cl)
                cr = r.headers.get("Content-Range") or ""
                if "/" in cr:
                    total = cr.rsplit("/", 1)[-1]
                    if total.isdigit():
                        return int(total)
        except Exception as e:
            last = e
            continue
    print(f"[warn] 无法获取体积：{url}", file=sys.stderr)
    return 0


def main():
    conc = 8
    if "--concurrency" in sys.argv:
        conc = int(sys.argv[sys.argv.index("--concurrency") + 1])
    urls = collect()
    print(f"共 {len(urls)} 个媒体，并发 {conc}…")
    with ThreadPoolExecutor(max_workers=conc) as ex:
        sizes = list(ex.map(head_size, urls))
    data = {u: s for u, s in zip(urls, sizes)}
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    total = sum(sizes)
    print(f"DONE -> {OUT}  总计 {total / 1048576:.1f} MB（{len(urls)} 个）")


if __name__ == "__main__":
    main()
