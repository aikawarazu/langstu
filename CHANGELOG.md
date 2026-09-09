# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。版本与 tag 规范见 [docs/versioning.md](./docs/versioning.md)。

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
