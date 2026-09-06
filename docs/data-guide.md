# 数据使用与补齐指引

> 课程数据统一走「课程包」格式，结构标准见 [course-package-spec.md](./course-package-spec.md)。
> 本文回答：**数据在哪 / 怎么补缺 / 怎么把外部资料提取成标准 JSON（含针对你手头两类资料的提示词）**。

---

## 1. 数据现在在哪

```
app/data/
  courses/                      ← 运行时唯一的数据源（前端只认这里）
    index.json                  ← 预设课程清单
    nce1.json ~ nce4.json       ← 4 个预设课程包（meta + units + groups + media）
    content/<pkg>/<unit>.json   ← 教材内容（276 份，按课懒加载）
  NCE1.js ~ NCE4.js             ← 旧格式「源数据」，仅供生成脚本读取
  notes.js                      ← 手写精修笔记（源数据，优先级最高）
  notes/                        ← 参考仓库导入的笔记（中间产物）
```

**数据管线**：

```
外部源                          脚本                             运行时
nce.mleo.site          → gen_books_data.py  → NCE*.js ─┐
aikawarazu/NCE notes   → import_nce_notes.py → notes/ ─┤→ build_course_packages.py → data/courses/*
手写精修               → (手写) notes.js ───────────────┘
用户上传课程包 JSON ───────────────────────────────────→ IndexedDB（运行时）
```

---

## 2. 补齐 / 更新数据的四条路径

- **A 直接改**：编辑 `data/courses/content/<pkg>/<unit>.json`（最终数据），改完 `index.html` 的 `?v=N` +1。
- **B 改源重生成**：改 `NCE*.js` / `notes.js` / `notes/` 后跑 `python3 backend/scripts/build_course_packages.py`。
- **C 上传课程包**：顶栏「＋ 导入课程」上传符合 spec 的 JSON（不碰代码）。
- **D 自定义预设**：包文件放 `data/courses/<id>.json` 并注册到 `index.json`，或运行时 `AppData.register()`。

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

## 5. 提取提示词（升级版）

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

然后顶栏「＋ 导入课程」上传；或按路径 B 把 `content` 覆盖到 `data/courses/content/<pkg>/<unit>.json`。

---

## 6. 常见问题

- **改了数据页面没变** → `index.html` 的 `?v=N` +1 刷缓存。
- **上传校验不过** → 看控制台 `[import]`：`id` 非法、缺 `title`、`kind` 不是 series/single。
- **内容没显示但锚点有计数** → 内容懒加载失败，查 `unit.contentRef` 路径。
- **进度/笔记会丢吗** → 不会。进度 key=`包id:单元序号`、笔记 key=`包id:单元id`，删课程包不影响已存记录。
