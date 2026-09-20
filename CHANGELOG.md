# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。版本与 tag 规范见 [docs/versioning.md](./docs/versioning.md)。

## [Unreleased] - 2026-09-20

### 新增
- **第二册、第三册精编稿全量补齐**：nce2 96 课、nce3 60 课全部达到与第一册一致的精编标准（`lead` 导学 5 字段 / `questions` 5 条（首条听力）/ `exercises` 7 条 / `quiz` 6 条），并检出中英逐句对齐的课文 `text`。
  - nce2 中 7 课（u006/u008/u015/u016/u026/u059/u060）原站缺失课文，由智能体按教材补写 `text`。
  - 数据落点：`data/courses/content/nce2|nce3/*.json`；精编稿源：`backend/data/notes/craft/nce2|nce3/*.json`。
- **第四册精编稿前 16 课**（u001–u016），其余单元按需求变更暂不生成。
- **数据管线脚本**：`backend/scripts/extract_raw_nce234.py`（原文抽取 + 中英比例成组对齐）、`backend/scripts/assemble_craft.py`（增量稿 → 精编稿 + 完成标记 + 契约校验）、`backend/scripts/validate_courses.py`（全量字段齐备性与污染检查）。
- **协作进度目录** `progress/nce234-craft/`：`extract/`（只读素材）、`delta/`（AI 增量稿）、`units/`（`.lock` 领取 / `.done` 完成标记），支持多智能体并行且互不抢课。

### 变更
- `extension/build_data.py`：数据源路径由已失效的 `app/data/courses` 修正为 `data/courses`，同步恢复正常（281 文件 + `vocab.json` 重建）。
- `backend/scripts/validate_courses.py`：词典串污染规则收窄（`人性化` → `人性化 adjacent`），消除对合法释义的误报。

### 修复
- 抽取器兼容听力室两种页面模板（正文页 / 双语词典弹窗页），修复弹窗词条与脚注编号混入课文的问题。
- **第一册课文译文补齐**：nce1 对话体课文（Lesson 5 起）此前只有英文、缺中文，本次为 u003–u027 共 **25 个单元 / 337 行**补齐逐句译文，并删除 u006 中混入正文的说话人残片（`"DAVE:"`）。
  - 译稿固化在 `backend/data/notes/nce1_zh/*.json`，由 `build_course_packages.py` 的 `apply_zh_patch()` 在构建时应用——避免直接改构建产物导致重建后译文丢失。
  - 新增工具：`backend/scripts/prepare_nce1_zh.py`（汇总素材）、`backend/scripts/apply_nce1_zh.py`（校验+写回+标记）、`backend/scripts/freeze_nce1_zh.py`（固化为数据源）。
- **第一册 u001 精编稿补齐**：`craft/nce1/u001.json` 新增，补齐 `lead.warmup/goals`、`questions` 1→5、`exercises` 5→7、`quiz` 0→6。
- `extension/build_data.py` 移除 Python 2 遗留的 `str.to_unicode()` 调用及未使用的 `sys` 导入、`unit_meta` 变量，静态检查 error 归零。

### 数据
- 四册校验现状：`nce1` / `nce2` / `nce3` 全部 **NG=0**；`nce4` 已完成 u001–u016（其余 32 课按需求暂不生成）。

## [Unreleased] - 2026-09-13

### 新增
- **2 倍速播放**：音频精听的速度档位由 `0.75 / 1 / 1.25 / 1.5` 扩为 `0.75 / 1 / 1.25 / 1.5 / 2`。
  - `app/js/app.js`：档位抽成常量 `RATES`（原先写死在点击回调里），按钮 `title` 列出全部档位（0.75x / 1x / 1.25x / 1.5x / 2x），点一次进一档、到 2x 回到 0.75x。
  - 2x 由浏览器原生 `playbackRate` 实现（默认保音高，不会变调）。
  - 资源版本号 `v=60` → `v=61`（与 `sw.js` 的 `VERSION` / `PRECACHE` 同步）。
- **PWA 支持**：站点可安装到桌面 / 主屏（Android Chrome / Edge 桌面端安装提示，iOS「添加到主屏幕」），独立窗口运行。
  - `app/manifest.json`：PWA 清单（名称 / 图标 192·512·maskable / standalone / 主题色 `#4353ff`）。
  - `app/sw.js`：Service Worker——壳层（HTML/CSS/JS/图标）预缓存 cache-first；课程包 JSON / 课文 / LRC 字幕运行时 stale-while-revalidate（上限 400 条 LRU）；页面导航网络优先、离线回退缓存的 `index.html`；音频不进 Cache Storage（仍由 `js/data/cache.js` 走 IndexedDB，避免 216 MB 体积撑爆配额）。
  - `app/js/pwa.js`：注册 SW、发现新版本底部浮条「点击更新」（skipWaiting → 自动刷新）、`beforeinstallprompt` 安装引导、断网 / 联网 toast。
  - `app/icons/*`：新增图标（`backend/scripts/make_pwa_icons.py` 纯标准库生成）。
- `index.html` 资源版本号统一升至 `v=38`（与 `sw.js` 的 `VERSION` / `PRECACHE` 同步）。

### 变更
- **禁用页面缩放（整页 + 双击）**：原先只用 `touch-action:manipulation`（仅关双击、双指仍可缩放），现四条途径一起上：
  - 视口加 `maximum-scale=1,user-scalable=no`（Android / 桌面生效）。
  - `app/css/app.css`：`html`、`.vframe/.vframe iframe` 改为 `touch-action:pan-x pan-y`，连双指捏合一起关掉，只保留滚动。
  - `app/index.html` 顶部内联脚本兜底：拦截 iOS `gesturestart/gesturechange/gestureend` 与多指 `touchmove`（Safari 忽略 `user-scalable=no`）；双击缩放按 300ms 内第二次抬手 `preventDefault`（不影响单击）；桌面拦 `Ctrl/⌘ + 滚轮`（触控板捏合）与 `Ctrl/⌘ + +/-/0`。
  - 资源版本号 `v=59` → `v=60`（与 `sw.js` 的 `VERSION` / `PRECACHE` 同步，避免旧缓存继续命中 `app.css?v=59`）。

## [data-v1.0.0] - 2026-09-09

### 变更
- 数据目录从 `app/data/courses/` 迁到仓库根 `data/courses/`：**GitHub Pages 只发布 `app/`，教材数据不再出现在站点域名下**。
- 课程包新增 `specVersion`、`version` 字段；`units[].contentRef` 改为相对包文件（`content/<pkg>/<unit>.json`），便于按 base URL 解析。
- `index.json` 升级为 **source manifest**（`type:"source-site"` + `albums[]`），含每册 `version` 与 `bytes` 体积预估。
- 新增 `data/VERSION`（数据版本）与 `backend/scripts/measure_media_sizes.py`（实测媒体体积，供 UI 显示）。

## [app-v1.4.0] - 2026-09-09

### 新增
- **数据与站点解耦**：站点不含任何教材内容，只保留 `app/data/sources.json`（资源网站地址）。数据全部经 URL 从 CDN 加载。
- **课程管理面板**（顶栏「📚 课程管理」）：我的课程 / 资源网站 / 导入说明 / 我的知识 四个页签。
  - 我的课程：来源、版本、单元数、已学进度、缓存统计；打开 / 缓存全部音频 / 导出 / 删除
  - 资源网站：添加、刷新（diff 新增·更新·移除）、按专辑添加、删除
  - 导入说明：三种 URL 形态、scheme 字段表、示例 URL「试一试」、**AI 生成课程数据的提示词**
  - 我的知识：笔记 / 生词 / 进度统计，一键导出导入 JSON
- **导入导出**：URL / JSON 文件 / `.langstu.zip` 压缩包三条通道；导出可选「仅文本」或「含音频」，导入幂等（同 key 覆盖，不产生副本）。
- **缓存引擎**（`js/data/cache.js`）：课文与字幕后台全量预载，音频按课按需下载并缓存，播放优先走本地 `blob:`；下载队列支持并发控制、失败重试、进度展示。
- **版本与兼容**：`specVersion` / `minAppVersion` 校验，不兼容直接拒绝并提示；站点升级后自动刷新内置资源网站。
- **空态引导**：首次打开没有教材时给出「打开课程管理 / 添加官方教材」引导；分享链接 `#import=<url>` 打开即导入。
- 站点自带自创示例教材 `app/data/demo/package.json`（零版权，示例 URL 一定可用）。

### 变更
- `AppStore` 升级：IndexedDB 库 `langstu`（packages / media / sources / meta 四个 store），自动迁移旧库 `nce-courses`。
- 相对路径解析统一以**实际取到的地址**为基准（`absUrl`），支持 CDN 备源与本地相对路径镜像。
- 缓存队列修复「队列任务内部再次入队」的死锁：`ensure` 拆为「立即执行」与「排队」两个版本。
- 文件导入框按扩展名自动分派：`.zip` 走压缩包通道，其余按 JSON 处理。
- 首次有数据落地时申请持久化存储（`navigator.storage.persist()`）；弱网 / 省流模式不自动后台补音频。
- `AppData`（registry）重写：远程加载、相对 URL 解析、镜像 fallback、版本校验、资源站管理、更新检查。
- 音频与字幕读取改走缓存层。

### 注意
- 老数据（旧 IndexedDB 课程包）会在首次打开时自动迁移，无需手工处理。
- `app/index.html` 资源版本号升至 `v=31`。
