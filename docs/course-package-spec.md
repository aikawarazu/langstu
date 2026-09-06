# 课程包数据标准 · Course Package Spec

> 版本：schemaVersion = **1**
> 目标：一套结构同时支撑**单课程导入**、**系列课程导入（带分组）**、**内置预设**、**用户上传**、**开发者自定义**。
> 设计原则：**数据自描述**（不靠全局变量名猜）、**字段可读**（不用魔法下标）、**可选字段可渐进补齐**（缺哪块前端就少渲染哪块，不报错）。

---

## 1. 三层结构

```
CoursePackage（课程包 / 系列，如「新概念英语 第一册」）
 ├── Group[]          可选分组（册内篇章、主题、难度段…）
 ├── Unit[]           课 / 单元（学习的最小调度单位）
 │    ├── AudioTrack[]  音频（可多音轨：新版 / 1985 老版…）
 │    └── VideoRef      单元级视频（整课切片，可选）
 └── Content          教材内容（可内联，或 contentRef 外链懒加载）
```

- **系列课程**：`kind: "series"`，`units` 有多个。
- **单课程**：`kind: "single"`，`units` 只有一个，**或直接把 `content` 放在包级**（此时 `units` 可省略）。
- **分组**：`groups` 只对 `units` 做展示/导航分组，不改变学习顺序（顺序一律由 `units` 数组顺序决定）。

---

## 2. CoursePackage

```jsonc
{
  "schemaVersion": 1,
  "id": "nce1",                       // ✓ 包唯一 id，^[a-z0-9][a-z0-9_-]*$
  "kind": "series",                   // ✓ "series" | "single"
  "title": "新概念英语 第一册",        // ✓ 显示名
  "subtitle": "FIRST THINGS FIRST",   // 副标题
  "lang": { "from": "en", "to": "zh" },// 学习语言 / 释义语言
  "level": "A1",                      // CEFR 或自定义难度
  "tags": ["英语", "教材"],
  "source": {                          // 来源声明（推荐，便于追溯与合规）
    "text": "nce.mleo.site",
    "notes": "aikawarazu/new-concept-english",
    "audio": "外链，不自托管",
    "license": "仅供个人学习"
  },
  "media": {
    "video": {                         // 包级视频（B 站合集，按分P定位）
      "provider": "bilibili",
      "bvid": "BV1xa411J7jJ",
      "title": "胶学 x 刘羽Leo",
      "embed": "https://player.bilibili.com/player.html?bvid=BV1xa411J7jJ&high_quality=1&autoplay=0&p={p}",
      "watch": "https://www.bilibili.com/video/BV1xa411J7jJ/?p={p}",
      "pages": [ { "p": 1, "part": "开篇" } ]
    },
    "lessonVideoMap": { "1": [3, 4] }  // 课号 → 该课涉及的分P（字符串 key）
  },
  "groups": [ { "id": "g1", "title": "Unit 1 - 24", "range": [1, 24] } ],
  "units": [ /* 见 §3 */ ],
  "content": { /* 见 §4，仅 kind=single 且不想建 units 时用 */ }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| schemaVersion | number | ✓ | 当前固定 `1` |
| id | string | ✓ | 包内/全局唯一，用于内容目录名与存储 key |
| kind | `"series"` \| `"single"` | ✓ | |
| title | string | ✓ | |
| subtitle / level / tags | string / string / string[] | | 展示与筛选 |
| lang | `{from,to}` | | 默认 `{from:"en",to:"zh"}` |
| source | object | | 自由键值，仅用于展示与溯源 |
| media.video | VideoRef | | 包级合集视频（`{p}` 为分P占位符） |
| media.lessonVideoMap | object | | 课号(字符串) → 分P数组 |
| groups | Group[] | | `{id,title,range?}`，`range=[起,止]`（按 unit.index） |
| units | Unit[] | series 必填 | |
| content | Content | single 可选 | |

---

## 3. Unit（课 / 单元）

```jsonc
{
  "id": "u001",               // ✓ 包内唯一；同时是内容文件名（contentRef 默认取它）
  "index": 1,                 // ✓ 显示序号（学习顺序以数组顺序为准，index 仅展示）
  "title": "Excuse Me",       // ✓
  "lessons": [1, 2],          // 覆盖的课号；单课册为 [1]
  "lessonLabel": "Lesson 1 & 2",
  "group": "g1",
  "audio": [                  // 多音轨，第一个为默认
    { "variant": "new",  "label": "新版英音", "url": "https://…/001.mp3", "lrc": "https://…/001.lrc" },
    { "variant": "1985", "label": "1985 老版", "url": "https://…/85.mp3", "lrc": "https://…/85.lrc" }
  ],
  "video": {                  // 单元级视频（整课切片），优先于包级合集
    "provider": "bilibili", "bvid": "BV1uV4y1L7md",
    "embed": "https://player.bilibili.com/player.html?bvid=BV1uV4y1L7md&high_quality=1&autoplay=0",
    "watch": "https://www.bilibili.com/video/BV1uV4y1L7md"
  },
  "content":   { /* Content，小包可内联 */ },
  "contentRef": "content/nce1/u001.json"   // 大包外链，前端打开该课时懒加载
}
```

**VideoRef**：`{ provider:"bilibili", bvid, page?, embed, watch, title? }`
**AudioTrack**：`{ variant:"new"|"1985"|自定义, label?, url, lrc? }`

> 优先级：`unit.video` > 包级 `media.video` + `lessonVideoMap[课号]`。
> 音频：`audio[0]` 为默认音轨；存在 `variant:"1985"` 时前端显示「切 85 老版」。

---

## 4. Content（教材内容）

```jsonc
{
  "schemaVersion": 1,
  "unitId": "u001",
  "title": "Excuse me! / Is this your …?",
  "subtitle": "打扰一下！/ 这是你的……吗？",
  "lead": {                    // 导学（都可缺省）
    "question": "Whose handbag is it?（这是谁的手提包？）",
    "summary": "入门第一关，核心只有一句 Is this your …?",
    "tips": "把 10 个名词挨个填进句型，肯定否定各来一次。"
  },
  "text": [                    // 课文；一个单元可含多课
    {
      "lesson": 1, "title": "Excuse me!", "kind": "课文 · 对话",
      "lines": [
        { "speaker": "A", "en": "Excuse me!", "zh": "打扰一下！", "note": "引起注意，读升调" }
      ],
      "drill": {               // 句型操练（可选）
        "q": "Is this your ___?", "zh": "这是你的……吗？",
        "slots": [ { "en": "pen", "zh": "钢笔" } ],
        "answers": ["Yes, it is.", "No, it isn't."]
      }
    }
  ],
  "words": [
    { "word": "excuse", "phonetic": "/ɪkˈskjuːz/",
      "meanings": [ { "pos": "verb", "meaning": "原谅；宽恕", "usage": "请求原谅或引起注意" } ] }
  ],
  "phrases": [
    { "phrase": "Excuse me", "usage": "引起注意、请求让路",
      "examples": [ { "en": "Excuse me, is this your handbag?", "zh": "打扰一下，这是你的手提包吗？" } ] }
  ],
  "grammar": [
    { "title": "一般疑问句 (Yes/No Question)", "definition": "可用 yes/no 回答，通常升调",
      "structure": "Be(Am/Is/Are) + 主语 + ...?", "usage": "询问是否属实",
      "examples": [ { "en": "Is this your handbag?", "zh": "这是你的手提包吗？" } ] }
  ],
  "patterns": [
    { "pattern": "Is this your + 名词?", "original": { "en": "Is this your handbag?", "zh": "这是你的手提包吗？" },
      "imitations": [ { "en": "Is this your pen?", "zh": "这是你的钢笔吗？" } ] }
  ],
  "exercises": [
    { "q": "把 This is my handbag. 改成一般疑问句。", "a": "Is this your handbag?", "note": "be 动词提前，my 换 your" }
  ]
}
```

**复用类型**

| 类型 | 结构 |
|---|---|
| BilingualText | `{ en, zh }` |
| Line | `{ speaker?, en, zh?, note? }` |
| WordEntry | `{ word, phonetic?, meanings:[{pos?, meaning, usage?}] }` |
| PhraseEntry | `{ phrase, usage?, examples:[BilingualText] }` |
| GrammarEntry | `{ title, definition?, structure?, usage?, examples:[BilingualText] }` |
| PatternEntry | `{ pattern, original?:BilingualText, imitations:[BilingualText] }` |
| ExerciseEntry | `{ q, a, note? }` |

**全部区块可选**：缺 `words` 就不显示生词块（锚点按钮也自动隐藏），缺 `text` 就只显示音频；**渐进补齐数据不会打断学习**。

---

## 5. 为什么这样定（与旧格式对比）

| 旧实现 | 问题 | 新标准 |
|---|---|---|
| `window.NCE1 = {...}` + `globals:['NCE1','N1']` 嗅探 | 数据契约靠猜 | 包自描述 `id`，注册表统一加载 |
| `words:[[w,zh]]` 与 `phrases` 混用，靠 `/\s/` 判断单词/短语 | 语义靠正则猜 | `words` 严格单词（含音标/词性/多义），`phrases` 独立 |
| `patterns` 两种形态 `[en,zh]` 与 `{p,o,im}` | 双形态兼容代码 | 统一 `{pattern,original,imitations}` |
| `grammar:{k,f,d}` | 缩写不可读 | `{title,definition,structure,usage,examples}` |
| `lines:[[sp,en,zh,note]]` | 魔法下标 | `{speaker,en,zh,note}` |
| `u.audio` / `u.audio85` 平铺 | 加音轨要加字段 | `audio:[{variant,url,lrc}]` 可扩展 |
| `u.ve/u.vw` 与 `bk.video + bk.v` 两套视频机制 | 判断分支多 | 统一 `video` + `lessonVideoMap`，优先级明确 |
| 无分组 | 长课程没法分篇章 | `groups` |

---

## 6. 最小可导入示例（单课程）

```json
{
  "schemaVersion": 1, "id": "my-lesson-1", "kind": "single", "title": "我的第一课",
  "content": {
    "schemaVersion": 1, "unitId": "u1", "title": "Hello",
    "text": [{ "lesson": 1, "lines": [
      { "en": "Hello, world!", "zh": "你好，世界！" }
    ]}],
    "words": [{ "word": "hello", "meanings": [{ "pos": "int.", "meaning": "你好" }] }]
  }
}
```

系列课程只要把 `kind` 改成 `"series"`、把内容放进 `units[].content` 即可。
