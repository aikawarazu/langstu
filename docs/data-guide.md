# 数据使用与补齐指引

> 课程数据统一走「课程包」格式，结构标准见 [course-package-spec.md](./course-package-spec.md)。
> 本文回答三件事：**数据现在在哪 / 怎么补齐缺的数据 / 怎么把外部资料提取成标准 JSON**。

---

## 1. 数据现在在哪

```
app/data/
  courses/                      ← 运行时唯一的数据源（前端只认这里）
    index.json                  ← 预设课程清单（{packages:[{id,title,kind,unitCount}]}）
    nce1.json ~ nce4.json       ← 4 个预设课程包（meta + units 索引 + groups + media）
    content/<pkg>/<unit>.json   ← 教材内容（276 份，打开课时按需懒加载）
  NCE1.js ~ NCE4.js             ← 旧格式「源数据」（单元/音频/视频映射），仅供生成脚本读取
  notes.js                      ← 手写精修笔记（源数据，优先级最高）
  notes/                        ← 参考仓库导入的笔记（源数据，中间产物）
```

**数据管线**（开发者视角）：

```
外部源                          脚本                             运行时
nce.mleo.site          → gen_books_data.py  → NCE*.js ─┐
aikawarazu/NCE notes   → import_nce_notes.py → notes/ ─┤→ build_course_packages.py → data/courses/*
手写精修               → (手写) notes.js ───────────────┘
用户上传课程包 JSON ───────────────────────────────────→ IndexedDB（运行时）
```

- **运行时**（前端 `js/data/registry.js`）只读 `data/courses/*` + IndexedDB 里用户导入的包。
- **源数据**（`NCE*.js` / `notes.js` / `notes/`）只在重新生成课程包时被脚本读取，不参与运行。

---

## 2. 补齐 / 更新数据的三条路径

### 路径 A：直接编辑课程包（最简单，适合小改）
`data/courses/content/<pkg>/<unit>.json` 就是最终数据，直接改即可（字段见 spec）。
改完记得把 `index.html` 里的 `?v=N` 版本号 +1，刷新 CDN 缓存。

### 路径 B：改源数据后重新生成（适合批量）
1. 编辑源数据：课文/音频映射改 `NCE*.js`，手写精修改 `notes.js`，导入笔记改 `notes/`。
2. 重新生成：
   ```bash
   python3 backend/scripts/build_course_packages.py
   ```
   会清空并重建 `data/courses/*`（276 份内容 + 4 个包 + index）。

### 路径 C：上传课程包（适合新课程 / 单课 / 用户自建）
前端顶栏「**＋ 导入课程**」按钮 → 选择符合 spec 的 JSON → 校验 → 存入 IndexedDB → 课程下拉里出现、可删除。
这是**不碰代码**就能加课程的方式。

### 路径 D：开发者自定义预设（内置新课程）
1. 把课程包文件放到 `app/data/courses/<id>.json`（内容放 `content/<id>/`）。
2. 在 `app/data/courses/index.json` 的 `packages` 数组里加一条 `{id,title,kind,unitCount}`。
3. 或运行时调 `AppData.register(pkg)`（控制台/插件）。

---

## 3. 缺数据的判定

打开一课，右侧教材锚点条会显示当前有哪些块（📌导学 / 🔤词汇 / 🗣短语 / 📐语法 / 💬句型 / ✏️练习）。缺的块不出按钮。要判断「缺什么数据」：

| 现象 | 缺 | 补法 |
|---|---|---|
| 没有 📌 导学 | `content.lead`（question/summary/tips） | 手动补或路径 B |
| 没有课文，只有音频 | `content.text` | 用 LRC 逐句渲染（自动），或补 `text` |
| 没有 🔤 词汇 | `content.words` | 路径 B/C |
| 没有 🗣 短语 | `content.phrases` | 路径 B/C |
| 没有 📐 语法 | `content.grammar` | 路径 B/C |
| 没有 💬 句型 | `content.patterns` | 路径 B/C |
| 没有 ✏️ 练习 | `content.exercises` | 手写补 |
| 音频点不了 | `unit.audio[].url/lrc` | 路径 B |

---

## 4. 用 LLM 把资料提取成标准 JSON（提示词）

下面两个提示词对应你手头最常见的两类资料：**听力室原文型**（英文原文 + 中文翻译）、**内容讲解型**（课文 + 生词 + 语法 + 讲解）。把资料粘贴进提示词的 `{{...}}` 处即可。

### 提示词 1：听力室原文（英文 + 翻译，如 tingroom / 在线英语听力室）

```
你是数据抽取助手。请把下面的《新概念英语》课文资料，提取成**严格合法的 JSON**，
只输出 JSON，不要任何解释、不要 markdown 代码块围栏。

资料内容：
{{ 在这里粘贴：课名 + 英文原文 + 中文翻译 }}

输出 schema（字段缺资料就省略，不要编造）：
{
  "schemaVersion": 1,
  "unitId": "u001",                       // 保持原样，后面我会改
  "title": "英文课名",
  "text": [{
    "lesson": 1,
    "title": "英文课名",
    "lines": [
      { "en": "英文一句", "zh": "对应中文一句" }
    ]
  }],
  "words": [
    { "word": "单词", "phonetic": "/音标/", "meanings": [ { "pos": "词性缩写", "meaning": "释义", "usage": "用法" } ] }
  ]
}

规则：
1. 英文原文与中文翻译**逐句对齐**，一句英文对应一句中文；对不上的句子单独成行、zh 留空。
2. 课名、纯标题、页码、广告、网站导航等无关内容不要放进 lines。
3. words 只收资料里**明确出现**的生词/难词；没有就省略整个 words 字段。
4. 中文保持原样，英文保持原文拼写与标点。
5. 输出必须是可被 JSON.parse 通过的对象。
```

### 提示词 2：内容讲解型（课文 + 生词 + 语法 + 句型，如「第 x 课内容讲解」）

```
你是数据抽取助手。请把下面这份《新概念英语》讲解资料，提取成**严格合法的 JSON**，
只输出 JSON，不要任何解释、不要 markdown 代码块围栏。

资料内容：
{{ 在这里粘贴：完整讲解，含课文、翻译、生词表、语法讲解、句型/仿写 }}

输出 schema（字段缺资料就省略，不要编造）：
{
  "schemaVersion": 1,
  "unitId": "u001",
  "title": "英文课名",
  "subtitle": "中文课名",
  "lead": {
    "question": "课前提问（若有）",
    "summary": "一两句话概括本课要点",
    "tips": "学习建议 / 易错点"
  },
  "text": [{
    "lesson": 1,
    "title": "英文课名",
    "kind": "课文 · 对话",
    "lines": [
      { "speaker": "A", "en": "英文", "zh": "中文", "note": "语气/连读等提示" }
    ]
  }],
  "words": [
    { "word": "excuse", "phonetic": "/ɪkˈskjuːz/",
      "meanings": [ { "pos": "verb", "meaning": "原谅；宽恕", "usage": "请求原谅或引起注意" } ] }
  ],
  "phrases": [
    { "phrase": "Excuse me", "usage": "引起注意、请求让路",
      "examples": [ { "en": "例句", "zh": "译文" } ] }
  ],
  "grammar": [
    { "title": "一般疑问句", "definition": "定义", "structure": "Be + 主语 …?",
      "usage": "用法", "examples": [ { "en": "例句", "zh": "译文" } ] }
  ],
  "patterns": [
    { "pattern": "Is this your + 名词?", "original": { "en": "课文原句", "zh": "译文" },
      "imitations": [ { "en": "仿写", "zh": "译文" } ] }
  ],
  "exercises": [
    { "q": "题目", "a": "答案", "note": "解析" }
  ]
}

规则：
1. 生词要带音标（资料没有就省略 phonetic）、词性、中文释义；一词多义拆成 meanings 数组。
2. 语法每个点一条：title 是名称，structure 是公式/结构，definition 与 usage 分别写定义和用法，
   examples 至少给一个中英对照例句。
3. 句型 patterns 只收可套用的句式：pattern 是模板，original 是课文原句，imitations 是仿写。
4. 对话课文保留 speaker（A/B）；叙述课文 speaker 省略。
5. 不要编造资料里没有的内容；字段缺就省略，保持 JSON 最小。
6. 输出必须是可被 JSON.parse 通过的对象。
```

### 提取后怎么办

1. 把 LLM 输出的 JSON 包成课程包：
   ```json
   { "schemaVersion": 1, "id": "my-xxx", "kind": "single", "title": "我的课程",
     "content": { <上面输出的 JSON> } }
   ```
2. 顶栏「＋ 导入课程」上传，或按路径 B 并入预设。

---

## 5. 常见问题

- **改了数据但页面没变** → 浏览器缓存，把 `index.html` 里 `?v=N` 的 N +1。
- **上传的包校验不过** → 看控制台 `[import]` 警告：`id` 非法、缺 `title`、`kind` 不是 series/single 是主要原因。
- **内容没显示、锚点有计数** → 内容懒加载失败（路径/网络），检查 `unit.contentRef`。
- **进度/笔记会丢吗** → 不会。进度 key=`包id:单元序号`、笔记 key=`包id:单元id`，删课程包不影响已存的进度与笔记记录。
