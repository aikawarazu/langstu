# 个人学习助手 · M1 需求与架构规格（Spec）

> 状态：M1 设计冻结（待实现）
> 更新：2026-09-03
> 范围：从「单账号、NCE1 重打基础、尽量本地免费」起步，先打通"内容可学 + 闭环自洽"的最小可用产品。

---

## 1. 产品定位与目标

做一个**个人英语学习助手**，定位"保姆级老师"：自动跟踪学习记录与任务完成情况、每日敦促、每课自动整理单词与语法、与复习系统无缝衔接。

最关键的设计原则（用户原话）：**成体系、全局思维、逻辑闭环**。系统不是一堆功能的堆砌，而是"规划 → 执行 → 复习 → 反馈 → 调整"一条完整闭环。

### 1.1 用户画像（已确认）
- **单人单账号**：仅自己用，MVP 免注册（数据模型预留多用户字段，但本期不做账号体系）。
- **起点**：NCE1 系统重打基础（多年未学/基础不牢，从第一册逐课攻起，配合胶学精讲）。
- **每日投入**：45–60 分钟，可拆早/晚两段。
- **智能程度**：尽量本地免费——全靠规则 + 本地模板 + 间隔重复，AI 能力以后再说。

### 1.2 M1 目标（验收基线）
- 页面全可点、内容真能学（不是空壳原型）。
- 学习闭环自洽：任务可生成、可勾选、可复习、可出战报、可据反馈调整次日计划。
- 跨端体验好：PC 宽屏三栏、手机单列底部 tab，均可用、可装（PWA）。
- 老师以模板消息敦促，无需模型调用。

### 1.3 体验主线（最高优先级原则，详见 `docs/UX-storyline.md`）

本 spec 是"系统如何运转"的工程视角；用户真实要的是"简单好用、进度透明"的体验视角。为此新增 UX 动线设计文档，并把以下 8 条定为 M1 验收的**硬约束（体验红线，优先级高于功能堆砌）**：

1. **首屏只有一个主任务**：今日任务包是唯一入口，主按钮写明精确下一步。
2. **零决策**：用户永不自选"复习还是新课"，系统给答案。
3. **界面结构恒定**：第 1 天到第 365 天核心界面不新增不重排，只有内容变。
4. **债封顶**：复习队列有上限；中断归来走降档 + 分批，不一次性砸债。
5. **进度处处透明**：UX 文档 §4 的 T1–T10 每一条必须实现；禁止只给百分比不给分子分母。
6. **每步即时反馈**：完成任何一步都有可见状态变化。
7. **无负罪感**：禁止"你欠了 / 落后了 / 连续中断"等制造焦虑的措辞。
8. **完成后不诱导**：今日任务做完即结束，不推"再来一课"。

> 核心原则：负担不应随天数累积。负担 = 决策数 + 信息量，不是功能数量。**复杂度藏进系统，确定性露给用户。**

---

## 2. 已锁定决策清单（持久化）

| 项 | 决策 | 说明 |
|---|---|---|
| UX 基线 | **融合原型 4** | 左侧/底部 Tab 导航 + 中间「今日一眼看全」概览 + 右侧常驻对话式老师。文件：`prototypes/hybrid/index.html`；选型台：`prototypes/index.html` |
| 技术栈 | Python FastAPI + SQLite + React PWA | 离线优先；Anki/爬虫/间隔重复生态最全 |
| 内容来源 | 自动获取全 144 课 | 落地方式 = 复用开源仓库 `github.com/iChochy/NCE` 的结构化课文数据 + schema 转换（比爬渲染页稳） |
| 生词/语法 | 半自动 | 生词用词典/频率规则派生并标 `is_new`；语法需少量种子 + 规则 |
| Anki | **M1 不做** | 仅系统内 FSRS 复习；后续再 genanki 导出 / AnkiConnect |
| 老师智能 | **纯模板消息** | 计划/提醒/战报由模板 + 真实数据拼装，无模型调用 |
| 通知通道 | PWA Web Push + 邮件为主，微信兜底 | 微信需公众号，放后续 |
| 资源策略 | **音视频不自托管** | 只存结构化文本 + 外链 URL，前端直连播放/嵌入（见 §4） |
| 部署 | CloudStudio / EdgeOne | 需 HTTPS；守护进程 + 定时任务生成每日计划 |

---

## 3. 全局闭环（系统主动脉）

```
规划 ──▶ 执行 ──▶ 复习 ──▶ 反馈 ──▶ 调整 ──┐
  ▲                                      └──────┘
```

| 阶段 | 系统职责 | 关键数据 | 产出 |
|---|---|---|---|
| **规划** | 按主线进度 + FSRS 到期量 + 每日预算，规则生成"今日任务包" | `daily_plan` / `plan_item` | 早复习 + 主课 + 灵活补足的有序包 |
| **执行** | 每课走五步学习法，每步自动产出结构化内容 | `lesson_line` / `vocab` / `grammar` / `step_log` | 课文、生词、语法、跟读、听写记录 |
| **复习** | FSRS 间隔重复，到期队列翻卡四档评分 | `card`（FSRS 状态）/ `review_log` | 下次出现时间、掌握度 |
| **反馈** | 每日/每周战报：时长、掌握度（按卡型）、错词本 | `report` | 可视化战报 + 老师观察 |
| **调整** | 老师据此回炉弱项（如 a/the 连错→加 L17），改次日计划 | 回到"规划" | 闭环自洽 |

**核心认知**：复习卡（`card`）不是孤立创建的，它由"执行"阶段自动派生——生词卡 / 句型卡 / 语法卡 / 听写卡。所以"每课自动整理单词和语法"本质是**执行阶段的产出直接喂给复习阶段**，这是闭环的主动脉。

---

## 4. 资源策略（外链，不自托管）——重要

**原则**：我们的服务器只存**结构化文本数据 + 外链 URL**，绝不下载/托管音频与视频。音频视频流量由源头承担，我们的带宽仅剩"文本 + 网页壳"。

| 资源 | 来源 | 存储方式 | 前端呈现 |
|---|---|---|---|
| 课文逐句音频 | nce 站（`iChochy/NCE` 自带音频引用） | 音频 URL 字段 | `<audio>` 直连播放 / 单句点读 |
| 胶学精讲视频 | B 站（`ml2191602156` 列表） | BV 号 / 视频 URL | 嵌入播放器或"打开原链"兜底 |
| Coffee Break 泛听 | 官方/播客外链 | URL | 嵌入/跳原链 |
| 课文文本、生词、语法 | 开源仓库导入（见 §5） | 入库文本 | 直接渲染 |

**离线权衡**：PWA 离线时缓存的是应用壳 + 文本数据（复习/浏览照常）；音频视频需联网时再从外链拉取。这完全可接受。

**外链风险与兜底**：
- B 站 iframe 跨域/防盗链可能限制第三方嵌入 → 兜底为"打开原链接"（深链到 B 站 App/网页）。
- 外链失效监测：定期探活，失效则标记并在 UI 提示。

---

## 5. 内容来源与导入方案（已实测 2026-09-03）

### 5.1 真实数据源（非 GitHub 内嵌）
`github.com/iChochy/NCE` 的 `data.json` 仅列书目，`path` 指向运行时接口 `https://nce.mleo.site/<BOOK>`。实际取数：
- `<path>/book.json`：单元列表（72 单元/册，每单元 `filename` 覆盖 2 课，如 `001&002.Excuse Me`）。
- `<path>/<filename>.lrc`：逐句 LRC，格式 `[mm:ss.xx]英文 | 中文`，含 `Lesson N | 第N课` 分段标记 → 可拆 144 课。
- `<path>/<filename>.mp3`：单元音频（外链，不下载，符合 §4 资源策略）。
- **源站不含结构化生词/语法** → 由派生层生成（见 §5.3）。

### 5.2 导入器 `scripts/import_nce.py`
1. 取 `book.json` → 72 单元。
2. 逐单元取 `.lrc`，按 `Lesson N` 标记拆课，解析 `[time] EN | ZH` 得到 `lesson_line`（en+zh+时间戳）。
3. 音频 URL 记单元 mp3（句级播放用 LRC 时间戳定位）。
4. **生词派生层**：课文分词 → 查本地英汉词典/频率 → 标 `is_new`（是否前序课出现过）。
5. **语法派生层**：少量种子 + 规则（指示代词、some 请求等）。
6. 写入 KV（开发期落地为本地 JSON 快照 `backend/data/<BOOK>.json`）。

### 5.3 字段对齐结论（实测）
课文逐句 en+zh + 音频 ✅ 已验证可得；生词/语法 ❌ 源站无，必须派生（半自动，符合 spec 设计）。

---

## 6. 技术选型详述

| 层 | 选型 | 理由 |
|---|---|---|
| 后端 | **FastAPI** | 异步、自带 OpenAPI、Python 生态（FSRS、genanki、爬虫）最全 |
| 存储 | **SQLite** | 单用户 MVP 零运维；后期可换 Postgres 不改模型 |
| ORM | SQLAlchemy / aiosqlite | 结构化 + 轻量 |
| 前端 | **React + Vite + PWA** | 组件化、PWA 插件成熟（离线壳、Web Push） |
| 复习算法 | **FSRS** | 现代间隔重复，四档评分，开源实现 |
| 定时任务 | 系统 cron / 守护进程 | 每日生成计划包、推送提醒 |
| 部署 | CloudStudio / EdgeOne | 公网 + HTTPS + 静态托管 |

### 6.1 为什么 PWA（用户问）
PWA 用网页技术做出接近原生 App 的体验：可"添加到主屏幕"像 App 图标、可离线打开（Service Worker 缓存壳与文本）、可收系统推送（Web Push）。对"公网访问 + PC/手机体验好 + 老师敦促"三刚需一次满足，且免应用商店上架。

### 6.2 部署架构（EdgeOne 可行性，已核实 2026-09-03）
目标：免费 + EdgeOne 一站式。核实结论（EdgeOne Makers 官方文档）：
- **EdgeOne Makers = 原 EdgeOne Pages**，免费层提供「静态托管 + Cloud Functions + 存储」全栈。
- **前端 PWA** → Makers 静态托管 ✅（免费、全球加速、自带 HTTPS，满足 PWA 安装与 Web Push）。
- **后端 FastAPI** → Makers **Cloud Functions（Python 运行时）** ✅，官方明确支持 ASGI（FastAPI/Sanic）、WSGI（Flask/Django），零配置：`cloud-functions/` 目录自动映射路由、依赖自动扫描。
- **边缘函数 Edge Functions** 仅 JS、短时长（CPU 200ms / 包 5MB），只作边缘/CDN 前置层，**不用于后端**。
- **持久化**：Edge Functions 无文件系统；Cloud Functions 本地文件系统不可靠（serverless 临时盘，冷启动可能丢）。平台提供 **KV（键值）+ Blob（对象）存储** 及 Supabase 等数据库集成。

**因此 M1 数据层：SQLite 文件 → 改为 EdgeOne KV/Blob 存储**（单用户、数据量极小，KV 以 `card:<id>` / `lesson:<id>` / `plan:<date>` 为键即可；Blob 存备份/导出）。
- 推荐拓扑：`浏览器(PWA) ─HTTPS─▶ EdgeOne Makers ┬静态托管(React PWA) ┬Cloud Functions(Python/FastAPI) └KV/Blob(替代 SQLite)`。
- Web Push：Makers 提供 HTTPS + 自定义域名，满足 VAPID 推送。

**备选（若坚持 SQLite 文件）**：后端放到有持久磁盘的免费平台（CloudStudio 免费空间 / Fly.io / Render 免费层），EdgeOne 仅作前端 CDN/加速前置；代价是跨两家服务商。
**待部署时复核**：免费层具体配额（调用/CPU/存储）、Cloud Functions 是否确无持久盘、KV/Blob 免费额度。

---

## 7. 数据模型（逻辑模型；M1 持久层用 EdgeOne KV/Blob，非本地 SQLite 文件）

> 下表为逻辑结构（实体与字段）。M1 实现时以 **KV 键**承载：`card:<id>` / `lesson:<id>` / `plan:<date>` / `vocab:<id>` / `grammar:<id>` 等；Blob 存备份与批量导出。详见 §6.2。开发期用本地 JSON 文件适配器模拟 KV，部署时换 EdgeOne KV 适配器，业务代码不变。

```text
user(id, name, settings_json)                 # 单用户，预留多用户
course(id, book, title)                        # NCE1
unit(id, course_id, idx, title)
lesson(id, unit_id, idx, title_en, title_zh, audio_url, order)
lesson_line(id, lesson_id, idx, en, zh, audio_url)
vocab(id, lesson_id, word, ipa, pos, zh, is_new, source)
grammar(id, lesson_id, title, formula, explanation)
card(id, lesson_id, type[vocab|pattern|grammar|dictation], ref_id,
     due, stability, difficulty, reps, lapses, state, last_review)   # FSRS 字段
review_log(id, card_id, rating, reviewed_at)
daily_plan(id, date, generated_at, budget_min)
plan_item(id, daily_plan_id, kind[review|lesson|listen], ref_id, order, est_min, done)
step_log(id, lesson_id, step, done_at)
message(id, channel, kind, title, body, sent_at, read)   # 老师来信
report(id, date, type[daily|weekly], payload_json)
setting(key, value)
```

---

## 8. 模块划分

1. **内容导入器** `import_nce.py`：开源数据 → 入库 + 生词/语法派生。
2. **调度器** `scheduler.py`：规则生成每日任务包（FSRS 到期 + 下一课 + 预算）。
3. **复习引擎** `review.py`：到期队列 + 四档评分 → 更新 `card`（FSRS）。
4. **老师/消息** `teacher.py`：模板引擎产出计划/提醒/战报消息。
5. **战报聚合** `reports.py`：时长、掌握度、错词本。
6. **API 层** `api/`：前端调用的 REST 接口。
7. **前端 PWA** `web/`：融合原型 4 的真实化（Tab 导航 + 今日概览 + 对话老师）。

---

## 9. 老师 / 通知（模板消息）

- **消息即模板 + 真实数据拼装**，无模型调用（符合本地免费）。
- 消息类型：每日计划、复习提醒、周末战报、弱项回炉提示。
- 通道优先级：PWA Web Push（主）/ 邮件（备）/ 微信（兜底，需公众号，后续）。
- 对话式老师（原型 3/4 的交互）在 M1 = 模板消息流 + 快捷按钮驱动下一步，不是 AI 聊天。

---

## 10. M1 范围与排除项

**做**：课程树 + 课详情五步可学、复习队列翻卡打分(FSRS)、规则生成每日任务包、战报、PWA 可装、老师模板消息、外链资源播放。

**不做（后续阶段）**：
- Anki 集成（系统内复习已满足 M1）
- AI 讲解 / 语音评测 / 自适应调整
- 微信通道（需公众号）
- 144 课全自动抓取管线（改为导入开源数据，更稳）
- 多用户/账号体系

---

## 11. 风险与未决

1. **开源数据结构待复核**：导入第一步需确认字段（尤其生词/语法是否结构化）。
2. **语法半自动**：语法点需种子 + 规则，非纯自动，需少量人工。
3. **外链稳定性**：B 站嵌入限制、URL 失效 → 兜底"打开原链" + 探活。
4. **微信通道前置条件**：公众号资质，放后续。

---

## 12. 原型结论（已体验）

- 原型 1 `flow/`：移动清单流（10 页 × 4 主题），验证"任务勾选 + 翻卡"基础交互。
- 原型 2 `desk/`：桌面三栏督学台，验证"一眼看全"的概览价值。
- 原型 3 `chat/`：对话式老师，验证"聊天即入口"的新意。
- **原型 4 `hybrid/`（选定）**：融合三者——Tab 导航 + 今日概览 + 常驻对话老师，PC/手机双排版。

---

## 13. 后续阶段路线（M1 之后）

- **M2**：Anki 导出/同步、弱项自适应微调。
- **M3**：AI 老师（讲解生成、语音评测）、微信通道。
- **长期**：多资源体系（更多成体系课程）、多用户。
