# 数据使用与补齐指引

> 课程数据统一走「课程包」格式，结构标准见 [course-package-spec.md](./course-package-spec.md)；
> URL / 清单 / 压缩包的规范见 [data-url-spec.md](./data-url-spec.md)；版本与 tag 见 [versioning.md](./versioning.md)。
> 本文回答：**数据在哪 / 怎么补缺 / 怎么把外部资料提取成标准 JSON（含针对你手头两类资料的提示词）**。
>
> 提示：站点「课程管理 → 📥 导入说明」页签里内置了同一套提示词（含完整示例），可直接复制使用，源码在 `app/js/data/prompt.js`。

---

## 1. 数据现在在哪

```
data/courses/                        ← 数据包（仓库根；不在 app/ 下，所以不会被 Pages 发布）
  index.json                         ← source manifest：专辑清单 + 版本 + 体积预估
  nce1.json ~ nce4.json              ← 4 个课程包（meta + units + groups + media）
  content/<pkg>/<unit>.json          ← 教材内容（276 份，按课懒加载）
data/VERSION                         ← 数据内容版本（发 data tag 时手动 +1）
backend/data/                        ← 源数据（仅供生成脚本读取）
  NCE1.js ~ NCE4.js / notes.js / notes/ / raw / parsed
app/data/sources.json                ← 站点内的资源网站清单（只有 URL，零教材内容）
app/data/demo/package.json           ← 自创示例教材（零版权，用于「试一试」）
```

**数据管线**：

```
外部源                          脚本                              产出
nce.mleo.site      → gen_books_data.py    → NCE*.js ─┐
aikawarazu/NCE     → import_nce_notes.py  → notes/  ─┤→ build_course_packages.py → data/courses/*
手写精修           → (手写) notes.js ────────────────┘        ↓ 打 data tag
                                                        CDN（jsDelivr 等）
                                                              ↓
用户浏览器：sources.json → 清单 URL → 专辑 URL → 课程包 + content + 音频/LRC → IndexedDB
用户导入的课程包 JSON / .langstu.zip ────────────────────────────────────→ IndexedDB
```

---

## 2. 补齐 / 更新数据的四条路径

- **A 直接改**：编辑 `data/courses/content/<pkg>/<unit>.json`（最终数据），改完升 `data/VERSION`、重新构建并打新的 `data` tag。
- **B 改源重生成**：改 `backend/data/` 下的 `NCE*.js` / `notes.js` / `notes/` 后跑 `python3 backend/scripts/build_course_packages.py`。
- **C 导入到本机**：课程管理 →「我的课程」→ 从 URL / JSON 文件 / 压缩包导入（不碰代码，立刻生效）。
- **D 自建数据站**：把数据包放自己的仓库 + 打 tag，在「资源网站」里填清单 URL（见 [data-url-spec.md §8](./data-url-spec.md#8-自建数据站)）。

---

## 3. 缺数据的判定

| 现象 | 缺 | 补法 |
|---|---|---|
| 没有 📌 导学 | `content.lead` | B/C |
| 没有课文 | `content.text` | 用 LRC 自动渲染，或 B/C |
| 没有 🔤 词汇 | `content.words` | B/C |
| 没有 🗣 短语 | `content.phrases` | B/C |
| 没有 📐 语法 | `content.grammar` | B/C |
| 没有 💬 句型 | `content.patterns` | B/C |
| 没有 ✏️ 练习 | `content.exercises` | 手写补 |
| 音频点不了 | `unit.audio[].url/lrc` | B |

---

## 4. 两类资料的真实格式（已实测你的两份数据）

### 类型 A：内容讲解型（NCE1/2/3，如「第 33-34 课内容讲解」「第 103-104 课」）

```
Lesson 103 The French test 法语考试
Listen to the tape then answer this question. …      ← 导学问题
Gary: How was the examination, Richard?              ← 对话：冒号前是 speaker
　　加里：考试考得怎样，理查德?
New words and Expressions 生词和短语                 ← 词 + 词性 + 释义（一行一词）
　　exam  n. 考试
Notes on the text 课文注释                           ← 编号条目：原句 + 中文 + 讲解
Lesson 103-104 自学导读 First things first
  课文详注 Further notes on the text                 ← 逐条语法/用法讲解
  语法 Grammar in use                                 ← 语法点：定义 + 结构 + 例句
  词汇学习 Word study                                 ← 词的多义 + 例句
```

**归类建议**：`Listen to...answer this question` → `lead.question`；对话 → `text[].lines`（带 `speaker`）；生词表 → `words`；课文注释 + 课文详注 → `grammar[].usage` 或 `text[].lines[].note`；语法 → `grammar`（title/structure/examples）；词汇学习 → 并入对应 `words[].meanings[].usage` + `examples`。

### 类型 B：听力室原文型（NCE4，如 tingroom 的「Lesson 9 Royal espionage」）

```
Lesson 9 Royal espionage 王室谍报活动
First listen and then answer the following question.  ← 导学问题
（英文正文，多段，生词带超链接）
New words and expressions 生词和短语                  ← 词 + 词性 + 释义
参考译文                                               ← 段落级中文（需按句对齐英文）
（页面底部单词表：词 + 释义 + 参考例句）               ← 例句吸收进 words[].examples
```

**归类建议**：英文段落 + 段落译文 → **逐句对齐**后写入 `text[].lines`；生词表 → `words`；底部单词表的「参考例句」→ `words[].examples`；无独立语法/句型则省略这两块。

> 完整提取结果范例见 [`docs/inbox/royal-espionage.example.json`](./inbox/royal-espionage.example.json)，可直接「＋ 导入课程」测试。

---

## 5. 端到端爬取提示词（推荐：爬网页 → 清洗 → 结构化一次到位）

> 你的目标场景是「智能体自己爬网站 → 自己总结各章 → 交出 JSON」，用下面这**一个**提示词即可，
> 不必先人工把资料分成「讲解型 / 听力室型」。智能体会自己识别类型、去掉广告/导航/表格噪声、逐句对齐。
> 目标格式与 §6 的两个分形态提示词**完全一样**（同一个 `schemaVersion: 1` 标准）。

```
你是课程数据采集与结构化助手。输入是一段网页 HTML 或正文文本（可能含导航、广告、超链接、
表格、OCR/排版错字）。请清洗后总结成**严格合法的 JSON**。只输出 JSON，不要任何解释，
不要 markdown 代码块围栏。

【输入】
{{ 网页 URL，或抓下来的 HTML / 正文文本 }}

【第 1 步 · 识别】
- 判断课程（新概念英语第几册）、课号、英文/中文课名、学习语言（英→中）。
- 判断资料类型：① 对话讲解型（"Lesson N …" + 对话 + 生词表 + 注释/语法/词汇学习）；
  ② 原文译文型（英文正文 + 段落译文 + 生词表）；③ 混合型。据此决定下面哪些字段有值。

【第 2 步 · 清洗】
- 丢弃：导航、页眉页脚、广告、购买/分享链接、图片地址、脚本样式、词典站超链接与多余锚点。
- 纠正明显 OCR/排版错字（如「坚琴」→竖琴、「变搜」→变馊、「未极格」→不及格、「其作」→其余）；
  拿不准的保留原文，禁止臆测。

【第 3 步 · 结构化】输出如下 schema（字段缺资料就省略，禁止编造）：
{
  "schemaVersion": 1, "unitId": "u001",
  "title": "英文课名", "subtitle": "中文课名",
  "lead": { "question": "听录音回答问题的那句（若有）" },
  "text": [ { "lesson": 9, "title": "英文课名", "kind": "课文 · 对话",
    "lines": [ { "speaker": "A", "en": "英文", "zh": "中文", "note": "注释" } ] } ],
  "words": [ { "word": "espionage", "phonetic": "/音标/",
    "meanings": [ { "pos": "n.", "meaning": "释义", "usage": "用法" } ],
    "examples": [ { "en": "例句", "zh": "译文" } ] } ],
  "phrases": [ { "phrase": "短语", "usage": "说明", "examples": [ { "en": "…", "zh": "…" } ] } ],
  "grammar": [ { "title": "语法点", "definition": "定义", "structure": "结构/公式",
    "usage": "用法", "examples": [ { "en": "…", "zh": "…" } ] } ],
  "patterns": [ { "pattern": "模板", "original": { "en": "原句", "zh": "译文" },
    "imitations": [ { "en": "仿写", "zh": "译文" } ] } ],
  "exercises": [ { "q": "题目", "a": "答案", "note": "解析" } ]
}

【对齐规则】
1. 对话：冒号前的英文人名 → lines[].speaker；叙述课文省略 speaker。
2. 英文与中文**逐句对齐**：一段英文配一段译文时按句拆开一一对应；对不上的句 zh 留空。
3. 生词表 "word  词性  释义" → word / meanings[].pos / meanings[].meaning；有音标补 phonetic。
4. 页面单词表 / 词汇学习里的例句 → 对应词的 examples[]（中英对照）。
5. 课文注释 / 课文详注对某句的讲解 → 该句 lines[].note；对语法/用法的讲解 → grammar。
6. 语法章节（Grammar in use 等）→ 每个语法点一条 grammar（title/definition/structure/examples）。
7. 固定搭配、词组 → phrases（从原文取例句，不凭空造）。

【硬性约束】
1. 只输出 JSON 对象，必须可被 JSON.parse 通过；不要 ``` 围栏、不要 "```json"、不要解释。
2. 只写资料里真实存在的内容，禁止编造生词/语法/例句。
3. 一个「单元」对应一个 unitId；资料含两课（如 Lesson 103-104）时，text 里放两个 lesson 条目。
4. 中文保持原意，英文保持原拼写与标点。
```

### 使用方式

- 能访问网页的智能体：`请按 data-guide.md §5 的提示词处理这个 URL：https://...`
- 只拿到 HTML / 文本：`请按 data-guide.md §5 的提示词处理这段 HTML：` + 粘贴内容
- 拿到结果 JSON 后：包一层课程包壳即可导入（见 §6 末尾「提取后怎么办」）。

---

## 6. 分形态精简提示词（备用：资料已是干净文本、或要精确控制时）

> 目标格式与 §5 完全一致，区别只在**源文本形态不同 → 清洗/对齐规则不同**。
> 若你已把网页洗成干净的「讲解型」或「原文译文型」文本，用下面对应的一条即可。

### 提示词 A：内容讲解型（对话课文 + 生词 + 注释 + 语法）

```
你是数据抽取助手。把下面这份《新概念英语》讲解资料提取成**严格合法的 JSON**，
只输出 JSON，不要解释、不要 markdown 代码块围栏。

资料：
{{ 粘贴讲解全文 }}

输出 schema（字段缺资料就省略，禁止编造）：
{
  "schemaVersion": 1, "unitId": "u001",
  "title": "英文课名", "subtitle": "中文课名",
  "lead": { "question": "Listen to... 那句的中文问题" },
  "text": [ { "lesson": 103, "title": "英文课名", "kind": "课文 · 对话",
    "lines": [ { "speaker": "Gary", "en": "英文", "zh": "中文", "note": "语气/连读提示" } ] } ],
  "words": [ { "word": "exam", "phonetic": "/音标/",
    "meanings": [ { "pos": "n.", "meaning": "考试", "usage": "用法" } ],
    "examples": [ { "en": "例句", "zh": "译文" } ] } ],
  "phrases": [ { "phrase": "短语", "usage": "说明", "examples": [ { "en": "…", "zh": "…" } ] } ],
  "grammar": [ { "title": "语法点", "definition": "定义", "structure": "结构/公式",
    "usage": "用法", "examples": [ { "en": "…", "zh": "…" } ] } ],
  "patterns": [ { "pattern": "模板", "original": { "en": "原句", "zh": "译文" },
    "imitations": [ { "en": "仿写", "zh": "译文" } ] } ],
  "exercises": [ { "q": "题目", "a": "答案", "note": "解析" } ]
}

规则：
1. 对话课文：冒号前的英文人名作 speaker；叙述课文省略 speaker。
2. 生词表「exam  n. 考试」三要素拆成 word / meanings[0].pos / meanings[0].meaning；无音标就省略 phonetic。
3. 课文注释、课文详注里对某句的讲解，写成该句 lines[].note；对某个语法/用法的讲解并入 grammar。
4. 词汇学习(Word study)里词的多义与例句，拆进对应 words[] 的多 meanings + examples。
5. 语法(Grammar in use)：每个语法点一条 grammar，structure 写公式，examples 至少一个中英对照。
6. 不要编造；字段缺就省略。输出必须是可 JSON.parse 的对象。
```

### 提示词 B：听力室原文型（英文正文 + 段落译文 + 生词 + 单词表例句）

```
你是数据抽取助手。把下面这份《新概念英语》课文资料提取成**严格合法的 JSON**，
只输出 JSON，不要解释、不要 markdown 代码块围栏。

资料：
{{ 粘贴：课名 + 英文原文 + 段落译文 + 生词表 + 单词表(含例句) }}

输出 schema（字段缺资料就省略，禁止编造）：
{
  "schemaVersion": 1, "unitId": "u001",
  "title": "英文课名", "subtitle": "中文课名",
  "lead": { "question": "听录音回答问题的那句中文" },
  "text": [ { "lesson": 9, "title": "英文课名",
    "lines": [ { "en": "英文一句", "zh": "对应中文一句" } ] } ],
  "words": [ { "word": "espionage", "meanings": [ { "pos": "n.", "meaning": "间谍活动" } ],
    "examples": [ { "en": "参考例句英文", "zh": "参考例句中文" } ] } ],
  "phrases": [ { "phrase": "act as one's own spy", "usage": "亲自充当间谍",
    "examples": [ { "en": "…", "zh": "…" } ] } ]
}

规则：
1. 英文正文与段落译文**逐句对齐**：一句英文配一句中文；对不上的句 zh 留空。课名、页码、导航、广告去掉。
2. 生词表「espionage  n. 间谍活动」拆成 word / pos / meaning；无音标省略 phonetic。
3. 页面底部单词表的「参考例句」放进对应 words[].examples（中英对照）。
4. 若正文有明显的固定搭配/词组，提炼到 phrases（从原文找例句），不要凭空造。
5. 没有语法/句型就整块省略。输出必须是可 JSON.parse 的对象。
```

### 提取后怎么办

把输出 JSON 包一层课程包壳即可导入：

```json
{ "schemaVersion": 1, "id": "nce1-u052", "kind": "single",
  "title": "Lesson 103-104 The French test", "content": { <上面输出的 JSON> } }
```

然后在「课程管理 → 我的课程 → 📄 从 JSON 文件导入」上传；或按路径 B 把 `content` 覆盖到 `data/courses/content/<pkg>/<unit>.json` 后重新构建数据。

---

## 7. 常见问题

- **改了数据页面没变** → 数据走 CDN：升 `data/VERSION` → 重新构建 → 打新 `data` tag → 用户端「资源网站 → 🔄 刷新」；只改界面才需要 `index.html` 的 `?v=N` +1。
- **导入被拒绝「数据规范 vX 不受支持」** → `specVersion` 主版本与站点不一致，升级站点或换兼容版本的数据（见 [versioning.md](./versioning.md)）。
- **示例 URL 取不到数据** → 先试 `data/demo/package.json`（站点自带，一定能取到）；CDN 地址需要 tag 已推送（`@data-v1.0.0`）。
- **上传校验不过** → 看控制台：`id` 非法、缺 `title`、`kind` 不是 series/single。
- **内容没显示但锚点有计数** → 内容懒加载失败，查 `unit.contentRef`（相对包文件解析，如 `content/nce1/u001.json`）。
- **缓存 / 音频** → 课文与字幕后台自动全量预载；音频按课按需下载，或在课程管理里「⬇ 缓存全部音频」。
- **进度/笔记会丢吗** → 不会。进度 key=`包id:单元序号`、笔记 key=`包id:单元id`，删课程包不影响已存记录；换设备用「我的知识 → 导出」。
