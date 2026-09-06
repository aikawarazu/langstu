# 新概念英语点读 · 学习助手

一个纯静态的《新概念英语》全四册点读学习网站：左右分栏学习台、课文逐句点读、音频精听（A-B 复读 / 整段循环）、B 站讲解视频（防跳转）、参照开源数据生成的教材与学习笔记、跨课笔记总览。数据以静态文件内嵌 + 按课懒加载，无需后端服务器。

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

## 数据来源与生成

| 内容 | 来源 | 说明 |
|---|---|---|
| 单元 / 音频 / 视频映射 | `nce.mleo.site`（iChochy/NCE） | LRC 逐句字幕 + 单元音频外链 + B 站分P |
| 课文逐句 | LRC 字幕（运行时加载） | 前端解析 `[mm:ss.xx]英文 \| 中文` |
| 教材笔记（生词/短语/语法/句型） | `aikawarazu/new-concept-english` 的 `notes/` | 276 课全量，脚本转换 |
| 手写精修课文 | `app/data/notes.js` | 个别课人工精修，优先级最高 |

音视频不自托管，前端直连外链；教材内容按课懒加载（首次打开该课时请求一次）。

## 课程包与数据

数据统一走「课程包」格式（标准见 [`docs/course-package-spec.md`](./docs/course-package-spec.md)），一套结构同时支撑：

- **单课程导入** / **系列课程导入（带分组）**（`kind: single|series`）
- **内置预设**（`nce1~nce4`）
- **用户上传课程包**（顶栏「＋ 导入课程」按钮，校验后存 IndexedDB，可删除）
- **开发者自定义预设**（放 `data/courses/` + 注册到 `index.json`，或运行时 `AppData.register()`）

补齐 / 更新数据、用 LLM 从资料提取 JSON 的完整指引见 [`docs/data-guide.md`](./docs/data-guide.md)。

重新生成内置课程包（编辑源数据后）：

```bash
python3 backend/scripts/build_course_packages.py
# 读取 NCE*.js + notes.js + notes/ → 生成 data/courses/*（4 包 + 276 份内容 + index.json）
```

## 项目结构

```
app/                      # 站点根目录（GitHub Pages 直接发布）
  index.html              # 入口页（学习台 / 笔记总览 / 目录气泡 / 记笔记浮框 / 导入）
  css/                    # app(基础) / v12(字幕·单元) / textbook(纸页) / split(分栏·气泡·总览)
  js/
    app.js                # 主逻辑（渲染 / 播放 / 交互）
    data/store.js         # 统一存储：偏好·进度·笔记(localStorage) + 课程包(IndexedDB)
    data/registry.js      # 课程注册表：预设 / 用户导入 / 手动注册，唯一数据入口
  data/
    courses/              # ★ 运行时数据源：index.json + nce1~4.json + content/<pkg>/<unit>.json
    NCE1~4.js             # 源数据：单元 / 音频 / 视频映射（仅供生成脚本读取）
    notes.js              # 源数据：手写精修笔记
    notes/                # 源数据：参考仓库导入的笔记（中间产物）
backend/scripts/          # 数据管线（开发期使用，非运行期依赖）
  build_course_packages.py  # 源数据 → 标准课程包
  import_nce_notes.py       # 参考仓库笔记 → notes/
  import_nce.py / gen_* 等  # 课文 / 音视频映射派生
docs/                     # 需求 / UX / M1 spec / 课程包标准 / 数据指引
```

## 本地预览

```bash
cd app && python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

> 需通过 HTTP 访问（课文 LRC、教材笔记为运行时 fetch），直接双击 `index.html` 部分内容无法加载。
> 课文音频 / 讲解视频需联网访问外链资源站。

## 技术说明

- 纯静态 HTML + CSS + JavaScript，无框架、无构建步骤、无后端
- 音频播放：`<audio>` + LRC 解析，逐句时间轴驱动字幕与 A-B 复读
- 视频防跳转：B 站移动版嵌入地址（`html5mobileplayer`）+ `sandbox`（不给 `allow-popups` / `allow-top-navigation`），做法参照 [PerryKum 的 iframe 嵌入 B 站笔记](https://perrykum.github.io/rtcls/study/bliframe/bliframe.html)
- 单词即点即译：本地生词表匹配 + 简单词形还原（复数 / 过去式 / -ing），离线可用
- 数据层解耦：课程一律经 `js/data/registry.js` 注册表获取（预设 / 用户导入 / 手动注册三源同构），不再嗅探全局变量
- 个人数据分存：已学标记、我的笔记、偏好存 `localStorage`；用户导入的课程包存 `IndexedDB`，均不上传

## 部署：GitHub Pages

- 仓库：`aikawarazu/langstu`（默认分支 `main`）
- 访问地址：`https://aikawarazu.github.io/langstu/`
- 部署方式：GitHub Actions 工作流 `.github/workflows/pages.yml`，push `main` 时自动把 `app/` 目录发布到 Pages（Source = GitHub Actions）
- 站点已启用 HTTPS（`https_enforced: true`）

### 重新部署

```bash
git push origin main   # 自动触发 Actions 发布
```

> 注意：`app/` 为站点根目录；`index.html` 通过 `?v=N` 版本号刷新 CDN 缓存。

## 版权与致谢

- 课文 / 音频 / 教材内容版权归原作者所有，仅作个人学习用途，请支持正版
- [iChochy/NCE](https://github.com/iChochy/NCE) 及 [nce.mleo.site](https://nce.mleo.site)：课文音频与 LRC 字幕
- [aikawarazu/new-concept-english](https://github.com/aikawarazu/new-concept-english)：276 课教材笔记数据（生词 / 短语 / 语法 / 句型）
- [胶学](https://space.bilibili.com/)（B 站）：课文讲解视频切片
