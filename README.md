# 新概念英语点读 · 学习助手

一个纯静态的英语教材点读学习网站：左右分栏学习台、课文逐句点读、音频精听（A-B 复读 / 整段循环）、B 站讲解视频（防跳转）、教材与学习笔记、跨课笔记总览、课程管理（导入 / 导出 / 资源网站 / 我的知识）。无需后端服务器。

> **站点本身不含任何教材内容。** 数据由你自己从「资源网站」经 URL 添加（可托管在任意免费 CDN），存进本机浏览器，随时可导出或删除。URL 规范见 [docs/data-url-spec.md](./docs/data-url-spec.md)，版本与 tag 规范见 [docs/versioning.md](./docs/versioning.md)。

在线访问：**https://aikawarazu.github.io/langstu/**

## 功能总览

### 学习台（左右分栏）

- **左栏 · 🎧 音频精听 / 🎬 视频讲解**
  - 逐句字幕双语跟随（双语 / 中文 / 英文 / 模糊四种字幕模式）
  - 单句循环、A-B 复读、0.75~1.5x 倍速、**整段循环（默认开启）**
  - 讲解视频嵌入 B 站**简洁播放器 + iframe 沙箱**，点击播放器不会跳转到 B 站
- **右栏 · 📖 教材（整篇文档 + 锚点跳转）**
  - 顶栏「📚 教材目录」气泡弹窗：搜课号 / 标题、已学标记、定位当前课
  - 锚点按钮条（📌 导学 / 🔤 词汇 / 🗣 短语 / 📐 语法 / 💬 句型 / ✏️ 练习）平滑滚动到对应区块
  - 课文逐句中英对照，**点句子定位音频**；**点任意单词弹出释义**（自动还原单复数 / 时态，可朗读）
  - 「📝 我的笔记」弹出浮框，随课自动保存到本机
- **进度**：已学标记自动记录（听完自动打勾），存于本机浏览器

### 笔记总览（跨课汇总）

顶栏「🗂 笔记总览」切换到汇总页：全部课的生词 / 短语 / 语法 / 句型 / 练习 / 我的笔记按单元分组，支持按册筛选、按类型筛选、全文搜索，展开按需加载，点「去学习 →」回到对应课。

## 数据从哪来（站点不含数据）

```
用户浏览器 ──fetch──> 资源网站清单 URL（CDN，如 jsDelivr）
                        └── albums[] → 专辑（课程包）URL → 课程包 + 课文 + 音频 / 字幕
                              ↓ 落到本机 IndexedDB（可导出 .langstu.zip，可删除）
```

- 站点里只有一份 `app/data/sources.json`（资源网站地址，不含教材）；改这里的 URL 就能换数据源，**不用改一行代码**。
- 数据包放在仓库根 `data/courses/`：**不在 `app/` 目录下，因此不会被 GitHub Pages 发布**，只能经 CDN 域名访问。
- 音视频仍为外链不自托管：音频与 LRC 来自 `nce.mleo.site`，讲解视频来自 B 站。
- 缓存策略：课文与字幕后台全量预载（约 4 MB）；音频按课按需下载并缓存，可一键全量（约 216 MB）。

## 课程管理（导入 / 导出）

顶栏「📚 课程管理」四个页签：

| 页签 | 能做什么 |
|---|---|
| 我的课程 | 看来源 / 版本 / 单元数 / 已学 / 缓存统计；打开、缓存全部音频、导出压缩包、删除 |
| 资源网站 | 添加数据源 URL、刷新（列出新增 / 有更新 / 移除）、按专辑添加、删除站点 |
| 导入说明 | 三种 URL 形态、scheme 字段表、**示例 URL「试一试」**、**用 AI 生成课程数据的提示词** |
| 我的知识 | 笔记 / 生词 / 进度统计，一键导出导入 JSON（换设备迁移用） |

- 导入三条通道：**URL**、**JSON 文件**、**`.langstu.zip` 压缩包**（自导出自导入）。
- 导出可选「仅文本」（体积小）或「含音频」；音频缺失时播放会自动补下并缓存。
- 全流程幂等：同 id 覆盖写、同 URL 不重复下载、导出再导入结果一致。

数据格式：[课程包标准](./docs/course-package-spec.md) · [URL 规范](./docs/data-url-spec.md) · [数据制作指引](./docs/data-guide.md)

重新生成数据包（编辑源数据后）：

```bash
python3 backend/scripts/build_course_packages.py     # backend/data/* → data/courses/*（4 包 + 276 份课文 + index.json）
python3 backend/scripts/measure_media_sizes.py        # 可选：实测音频体积，供 UI 显示「约 xx MB」
```

## 项目结构

```
app/                      # 站点根目录（GitHub Pages 只发布这里：只有代码）
  index.html              # 入口页（学习台 / 笔记总览 / 目录气泡 / 记笔记 / 课程管理）
  css/                    # app / v12 / textbook / split / library(管理面板)
  js/
    app.js                # 主逻辑（渲染 / 播放 / 交互）
    library.js            # 课程管理面板（导入导出 / 资源网站 / 说明 / 知识）
    zip.js                # 最小 ZIP 读写（导出导入压缩包，无依赖）
    data/store.js         # 存储：偏好·进度·笔记(localStorage) + 包/媒体/资源站(IndexedDB)
    data/registry.js      # 数据层：远程加载 · 相对解析 · 版本校验 · 资源站管理
    data/cache.js         # 缓存引擎：文本全量预载 · 音频按需 · 播放走本地
    data/prompt.js        # AI 生成课程数据的提示词与示例
  data/
    sources.json          # ★ 资源网站清单（只有 URL，零教材内容）
    demo/package.json     # 自创示例教材（零版权，给「试一试」用）
data/courses/             # ★ 数据包（不在 app/ 下，故不会被 Pages 发布；经 CDN 访问）
  index.json              # source manifest：专辑清单 + 版本 + 体积
  nce1~4.json             # 课程包（meta + units）
  content/<pkg>/<unit>.json
data/VERSION              # 数据内容版本（发 data tag 时手动 +1）
backend/data/             # 源数据：NCE1~4.js / notes.js / notes/ / raw / parsed（仅供脚本）
backend/scripts/          # 数据管线（开发期使用，非运行期依赖）
  build_course_packages.py  # 源数据 → 标准课程包 + manifest
  measure_media_sizes.py    # 实测外链媒体体积
docs/                     # 课程包标准 / 数据 URL 规范 / 版本 tag 规范 / 数据指引
CHANGELOG.md
```

## 本地预览

**推荐从仓库根起服务**（这样页面能顺带读到 `data/courses/`，可在没有 CDN 时验证官方数据源）：

```bash
python3 -m http.server 8080     # 在仓库根执行
# 浏览器打开 http://localhost:8080/app/
```

也可以只发布目录（`cd app && python3 -m http.server 8080` → http://localhost:8080），此时内置数据源会走 CDN，需要 tag 已推送；离线验证请用「课程管理 → 导入说明」里的示例 `data/demo/package.json`。

> 需通过 HTTP 访问（课文 LRC、教材笔记为运行时 fetch），直接双击 `index.html` 部分内容无法加载。
> 课文音频 / 讲解视频需联网访问外链资源站。

## 技术说明

- 纯静态 HTML + CSS + JavaScript，无框架、无构建步骤、无后端
- 音频播放：`<audio>` + LRC 解析，逐句时间轴驱动字幕与 A-B 复读
- 视频防跳转：B 站移动版嵌入地址（`html5mobileplayer`）+ `sandbox`（不给 `allow-popups` / `allow-top-navigation`），做法参照 [PerryKum 的 iframe 嵌入 B 站笔记](https://perrykum.github.io/rtcls/study/bliframe/bliframe.html)
- 单词即点即译：本地生词表匹配 + 简单词形还原（复数 / 过去式 / -ing），离线可用
- 数据与站点解耦：站点只登记来源 URL，课程一律经 `js/data/registry.js` 远程加载（相对 URL 按包 base 解析 + 镜像 fallback + 版本校验），不再嗅探全局变量
- 个人数据分存：已学标记、我的笔记、生词、偏好存 `localStorage`；课程包、缓存的音频/字幕、资源网站存 `IndexedDB`，均不上传
- 缓存：`js/data/cache.js` 后台全量预载课文与字幕（约 4 MB），音频按课按需下载并缓存，播放优先用本地 `blob:`
- 版本：`specVersion` 主版本不同或 `minAppVersion` 高于当前站点版本时拒绝导入并提示；站点升级会自动刷新内置资源网站

## 部署：GitHub Pages

- 仓库：`aikawarazu/langstu`（默认分支 `main`）
- 访问地址：`https://aikawarazu.github.io/langstu/`
- 部署方式：GitHub Actions 工作流 `.github/workflows/pages.yml`，push `main` 时自动把 `app/` 目录发布到 Pages（Source = GitHub Actions）
- 站点已启用 HTTPS（`https_enforced: true`）

### 重新部署

push `main` 即自动触发 Actions 发布到 Pages。提交、推送、数据再生成的完整操作见 [docs/development.md](./docs/development.md)。

> 注意：`app/` 为站点根目录；`index.html` 通过 `?v=N` 版本号刷新 CDN 缓存（改完记得 N +1）。

## 版权与致谢

- **本站不托管、不分发任何教材内容**：仓库的 `app/`（对外发布的站点）里只有代码与数据来源地址。教材数据由用户自行选择来源、自行导入，存于用户本机。
- 若你是权利人，不希望某数据源被本站索引，可直接修改 `app/data/sources.json` 移除该来源；数据包位于 `data/courses/`（不随站点发布）。
- 课文 / 音频 / 教材内容版权归原作者所有，仅作个人学习用途，请支持正版
- [iChochy/NCE](https://github.com/iChochy/NCE) 及 [nce.mleo.site](https://nce.mleo.site)：课文音频与 LRC 字幕
- [aikawarazu/new-concept-english](https://github.com/aikawarazu/new-concept-english)：276 课教材笔记数据（生词 / 短语 / 语法 / 句型）
- [胶学](https://space.bilibili.com/)（B 站）：课文讲解视频切片
