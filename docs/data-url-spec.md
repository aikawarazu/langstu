# 数据 URL 规范 · Data URL Spec

> 规范版本：**specVersion = 1.0**
> 一句话：**站点不含任何教材数据**，只登记「资源网站」的地址；数据一律经 URL 加载并落到用户本机浏览器。

---

## 1. 三种可导入的 URL

| 类型 | 返回内容 | 用途 |
|---|---|---|
| **A 专辑（课程包）URL** | 一个 `CoursePackage` JSON | 直接装一门课 |
| **B 资源网站清单 URL** | `{ type:"source-site", albums:[…] }` | 一个站点提供多门课，供挑选 |
| **C 一键导入深链** | （页面参数） | 分享给他人，打开站点即导入 A 或 B |

### A 专辑 URL

```
https://cdn.jsdelivr.net/gh/<user>/<repo>@data-v1.0.0/data/courses/nce1.json
```

返回（节选，完整结构见 [course-package-spec.md](./course-package-spec.md)）：

```jsonc
{
  "schemaVersion": 1, "specVersion": "1.0", "version": "1.0.0",
  "id": "nce1", "kind": "series", "title": "新概念英语 第一册",
  "units": [ { "id":"u001", "title":"Excuse Me",
               "audio":[{"variant":"new","url":"https://…/001.mp3","lrc":"https://…/001.lrc"}],
               "contentRef":"content/nce1/u001.json" } ]
}
```

### B 资源网站清单 URL

```
https://cdn.jsdelivr.net/gh/<user>/<repo>@data-v1.0.0/data/courses/index.json
```

```jsonc
{
  "schemaVersion": 1, "specVersion": "1.0", "type": "source-site",
  "id": "langstu-official", "name": "Langstu 教材数据",
  "homepage": "https://github.com/aikawarazu/langstu",
  "license": "教材内容版权归原作者，仅作个人学习用途",
  "version": "1.0.0", "updatedAt": "2026-09-09",
  "baseMirrors": ["https://cdn.statically.io/gh/<user>/<repo>/data-v1.0.0/data/courses/"],
  "albums": [
    { "id":"nce1", "title":"新概念英语 第一册", "level":"A1", "unitCount":72,
      "version":"1.0.0", "url":"nce1.json",
      "bytes": { "pkg":47180, "content":1432680, "audio":47500000 } }
  ]
}
```

### C 一键导入深链

```
https://<站点>/#import=<encodeURIComponent(A 或 B 的 URL)>
```

例：`https://aikawarazu.github.io/langstu/#import=https%3A%2F%2Fcdn.jsdelivr.net%2Fgh%2F...%2Fnce1.json`

> 站点启动时解析 `location.hash` 的 `import=` 参数并自动导入；参数必须 `encodeURIComponent`，否则 `&` 会截断。
> 另有一个语义化别名 `langstu://import?url=<encoded>` 便于识别与分享，但浏览器默认未注册该协议，实际落地请用上面的 HTTPS 形式。

---

## 2. 字段说明

| 字段 | 位置 | 说明 |
|---|---|---|
| `specVersion` | 清单 / 课程包 / zip manifest | **规范版本** `MAJOR.MINOR`。本站只接受主版本相同的（当前 `1`），不同则拒绝导入并提示。 |
| `schemaVersion` | 课程包 | 课程包结构版本，当前 `1`。 |
| `version` | 清单 / 专辑 / 课程包 | **数据内容版本**（SemVer）。用于判断「有更新」；升级只下差量。 |
| `minAppVersion` | 可选 | 要求的最低站点版本；高于当前站点版本时拒绝导入并提示升级。 |
| `type` | 清单 | 固定 `"source-site"`；有 `albums` 字段即视为清单，否则视为课程包（无需用户选类型）。 |
| `albums[].url` | 清单 | **相对清单 URL 解析**；`mirrors` / `baseMirrors` 为备源。 |
| `albums[].bytes` | 清单 | 体积预估（构建脚本生成），用于在 UI 显示「约 xx MB」。 |
| `units[].contentRef` | 课程包 | **相对课程包文件解析**，如 `content/nce1/u001.json`。 |
| `units[].audio[].url / .lrc` | 课程包 | 可以是绝对 URL，也可以相对包文件解析。 |

---

## 3. 解析规则

1. 相对路径统一用 `new URL(ref, 当前文档 URL)` 解析：
   `content/nce1/u001.json` + `https://x/y/nce1.json` → `https://x/y/content/nce1/u001.json`
2. **镜像 fallback**：主 URL 失败后依次尝试 `mirrors` → `baseMirrors + 相对路径`。
3. **CORS 必需**：目标必须返回 `application/json`（或音频/字幕二进制）并带 `Access-Control-Allow-Origin: *`，否则浏览器读不到。jsDelivr / GitHub Raw / statically 均满足。
4. **幂等**：课程按 `id` 覆盖写；媒体按 `URL` 去重；同一份数据重复导入、刷新后重下都不会产生副本。

---

## 4. 真实可用的示例 URL

| 用途 | URL | 说明 |
|---|---|---|
| 本地示例（一定可用） | `data/demo/package.json` | 站点自带，自创的三课小教材，零版权，用于验证链路 |
| CDN 清单（需先打 tag） | `https://cdn.jsdelivr.net/gh/aikawarazu/langstu@data-v1.0.0/data/courses/index.json` | 四册专辑清单 |
| CDN 单册 | `https://cdn.jsdelivr.net/gh/aikawarazu/langstu@data-v1.0.0/data/courses/nce1.json` | 第一册课程包 |

课程管理 →「📥 导入说明」里有「试一试」按钮，会真的去取这些 URL 并显示返回摘要。

---

## 5. 离线压缩包 `.langstu.zip`（导出 / 导入）

导出的是标准 zip（store 模式，无依赖即可解），结构：

```
manifest.json              { specVersion, type:"langstu-offline-bundle", generator, exportedAt,
                             packages:[{id,title,version,unitCount,entry}], contents:[…], media:[…], withAudio }
packages/<id>.json         课程包本体
content/<id>/<unit>.json   课文内容
media/<key>.mp3|.lrc       音频 / 字幕（key = 内容寻址的缓存 key）
```

- `media[].key` 与本机缓存 key 一致，导入回本机后**立刻可被识别**，不需要重新下载。
- 可只导文本（不含音频）：音频留空，播放时按需下载并缓存。
- 导入顺序：先写媒体 → 再写课文 → 最后写课程包；中途失败重来不会产生重复数据。

---

## 6. 缓存策略

| 数据 | 默认行为 |
|---|---|
| 课文 JSON / LRC 字幕 | **后台全量预载**（全四册约 4 MB） |
| 音频 | **按课按需**下载并缓存；课程管理里可一键「缓存全部音频」（约 216 MB） |
| 播放 | 本地有缓存走 `blob:`，没有则播远端并在后台补下 |

配额：Chrome/Edge 约为磁盘剩余 60%，Firefox 约 10 GB；Safari/iOS 偏紧且可能回收，站点会申请持久化存储（`navigator.storage.persist()`），省流/弱网模式自动降级为「只下文本」。

---

## 7. 错误对照

| 提示 | 原因 | 处理 |
|---|---|---|
| 数据规范 v2 不受支持 | `specVersion` 主版本不兼容 | 升级站点，或换用 v1 数据 |
| 该数据要求站点版本 ≥ x | `minAppVersion` 更高 | 升级站点 |
| HTTP 404 | 地址不存在（常见于 tag 未推送） | 检查 tag / 路径 |
| 请求失败（CORS/断网） | 目标未开放跨域或本地断网 | 换支持 CORS 的 CDN |
| 返回的不是合法 JSON | 目标不是 JSON（如 HTML 页面） | 检查 URL 是否指向 `.json` |

---

## 8. 自建数据站

1. 建一个公开仓库，按上面的结构放 `index.json` + 各专辑 `<id>.json` + `content/<id>/<unit>.json`。
2. 打 tag：`git tag data-v1.0.0 && git push origin data-v1.0.0`（**jsDelivr 只认 tag，不要用 `@latest` 或分支名**，否则缓存不可控）。
3. 在站点「资源网站」里填入：
   `https://cdn.jsdelivr.net/gh/<user>/<repo>@data-v1.0.0/index.json`
4. 用「🔄 刷新」检查是否能读到专辑列表；数据更新后升 `version` 并打新 tag，用户刷新即可看到「有更新」。
