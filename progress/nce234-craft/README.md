# NCE 第二/三/四册精编稿补齐工程（多智能体协作）

## 目标
把 `data/courses/content/nce2|nce3|nce4` 的 204 个单元，从「只有单词/短语/语法/句型」
补到与第一册相同的精编稿标准：**导学 lead / 提问 questions / 练习 exercises / 选择题 quiz**，
并把缺失的**课文中英对照 text** 补齐（有原文的一律用原文，无原文的由智能体按教材补写）。

## 目录协议（分布式锁 / 完成标记）

```
progress/nce234-craft/
├── README.md                 本文件
├── checklist.md              Round 0 检查清单（退出条件之一）
├── extract/<book>/uXXX.json  确定性抽取底稿（标题/听力提问/对齐课文/讲义原文）  ← 只读
├── delta/<book>/uXXX.json    智能体产出的增量稿（lead/questions/exercises/quiz） ← 唯一人工/AI 产物
├── units/<book>-uXXX.lock    领取中（含 agent + 时间戳，防止两个智能体抢同一课）
├── units/<book>-uXXX.done    已完成（含 sha1 + 字段计数 + 完成时间）
├── reports/round-NN-*.md     每轮观察报告（反思循环）
└── status.json               总览：ok / invalid / missing
```

**领取规则**：一次任务只派 n 课 → 先写 `.lock`（含 agent 名），完成后汇编脚本写出 `.done`
并自动删除 `.lock`。`.done` 存在即视为该课已完成，不再重复生成。

## 数据流

```
backend/data/raw/<book>/*.txt        （听力室抓取原文页）
        │  python3 backend/scripts/extract_raw_nce234.py
        ▼
backend/data/parsed/<book>/uXXX.json       → build_course_packages.from_parsed 提供 text/translation/官方生词
progress/nce234-craft/extract/<book>/uXXX.json → 智能体素材
        │  子智能体（只读）产出增量 → 主代理写 delta
        ▼
progress/nce234-craft/delta/<book>/uXXX.json
        │  python3 backend/scripts/assemble_craft.py
        ▼
backend/data/notes/craft/<book>/uXXX.json  → 精编稿（build 时优先级最高）
        │  python3 backend/scripts/build_course_packages.py
        ▼
data/courses/content/<book>/uXXX.json
        │  python3 backend/scripts/build_data.py（extension 侧同步，可选）
        ▼
extension/data/courses/...
```

## 常用命令

```bash
# 1) 抽取原文（幂等）
python3 backend/scripts/extract_raw_nce234.py nce2 nce3 nce4
# 2) 增量稿 → 精编稿 + 完成标记
python3 backend/scripts/assemble_craft.py
# 3) 构建课程包
python3 backend/scripts/build_course_packages.py
# 4) 全量校验（每册每个单元字段齐备性）
python3 backend/scripts/validate_courses.py
```

## 契约（每单元）

| 字段 | 要求 | 来源 |
|---|---|---|
| `lead` | question / warmup / goals[3-6] / summary / tips 均非空 | 智能体 |
| `questions` | ≥4 条，首条 `kind=listen`，每条有 q/a | 智能体 |
| `exercises` | 恰好 7 条，每条 q/a | 智能体 |
| `quiz` | 恰好 6 条，4 选项、`answer` 为 0 起下标、选项不重复 | 智能体 |
| `text` | 一句 `en` + 一句 `zh` 对齐 | 原文抽取；15 课无原文时由智能体补 |
| `title` / `subtitle` | 英文标题 / 中文标题 | 包标题 + 抽取；缺失由智能体补 |

## 现状快照（2026-09-20）

| 册 | 单元 | 已完成 | 校验 | 状态 |
|---|---|---|---|---|
| nce1 | 72 | 72 | NG=0 | ✅ 完成（含遗留修复：译文补齐 + u001 精编稿） |
| nce2 | 96 | 96 | NG=0 | ✅ 完成 |
| nce3 | 60 | 60 | NG=0 | ✅ 完成 |
| nce4 | 48 | 16（u001–u016） | NG=32 | ⏹ 按用户指示停止，素材与产物均保留 |

> nce1 的遗留修复（25 单元译文 + u001 精编稿 + 管线固化）见 `progress/nce1-fix/` 与
> `progress/nce1-fix/reports/round-P0.md`；译文数据源为 `backend/data/notes/nce1_zh/`。

- 完成判定：`validate_courses.py <book>` 全绿（NG=0）。
- 缺失 `text`、由智能体按教材补写的 nce2 单元：u006/u008/u015/u016/u026/u059/u060。
- nce4 尚未生成的 u017–u048，其素材 `extract/nce4/u0xx.json` 已就绪，随时可续做。
- 收尾报告见 `reports/round-final.md`。
- extension 侧已同步：`extension/data/courses/`（281 文件）+ `extension/data/vocab.json`。
