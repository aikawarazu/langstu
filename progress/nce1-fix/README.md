# NCE1 遗留问题修复工程（多智能体协作）

## 背景（审计结论 2026-09-20）

| 编号 | 遗留问题 | 规模 | 严重度 |
|---|---|---|---|
| L1 | nce1 **对话体课文缺中文译文**（`text[].lines` 只有 `en`，`zh` 为空） | u003–u026 共 24 单元 331 行 + u027 缺 1 行 | 🔴 数据不可用 |
| L2 | nce1 **u001 无精编稿**（`craft/nce1/u001.json` 不存在）：`lead.warmup/goals` 空、`questions=1`、`exercises=5`、`quiz=0` | 1 单元 | 🔴 |
| L3 | **管线未固化**：nce1 译文合并不在构建脚本内，重建会再次丢失 | 工程 | 🟡 |
| L4 | `extension/build_data.py` 残留 PY2 `to_unicode`、未使用导入/变量、类型注解缺失 | 1 文件 | 🟢 |
| L5 | nce4 u017–u048 未生成（**已按用户指示排除**） | 32 单元 | ⏹ 范围外 |

## 目录协议（沿用分布式锁）

```
progress/nce1-fix/
├── README.md              本文件
├── payload/uXXX.json      补丁素材（prepare_nce1_zh.py 生成）   ← 只读
├── zh/uXXX.json           智能体产出的逐句译文 [{i,zh}]          ← AI 产物
├── units/nce1-uXXX.lock   领取中（agent + 时间戳）
├── units/nce1-uXXX.done   已应用（apply_nce1_zh.py 写出）
└── reports/               每阶段验收报告
```

## 数据流

```
backend/data/parsed/nce1/uXXX.json  (translation：按对话轮中文)
backend/data/raw/nce1/<page>.txt    (参考译文：同源逐轮中文)
data/courses/content/nce1/uXXX.json (text[].lines：仅 en)          ← 待修
        │  python3 backend/scripts/prepare_nce1_zh.py
        ▼
progress/nce1-fix/payload/uXXX.json                                ← 素材
        │  子智能体逐句对齐/翻译 → 主代理落盘
        ▼
progress/nce1-fix/zh/uXXX.json                                     ← AI 产物
        │  python3 backend/scripts/apply_nce1_zh.py（校验 + 写回 + .done）
        ▼
data/courses/content/nce1/uXXX.json（每行补齐 zh）
        │  python3 backend/scripts/build_course_packages.py
        ▼
data/courses/nce1.json + extension/data/courses（同步）
```

## 产出契约（zh/uXXX.json）

```json
{ "unitId": "u003", "zh": [ {"i": 0, "zh": "早上好。"}, {"i": 1, "zh": "早上好，布莱克先生。"} ] }
```

硬性要求：
1. **覆盖全部行**：`i` 必须与 payload 中 `lessons[].lines[].i` 一一对应，不重不漏。
2. 优先用 `reference`（raw 页「参考译文」，逐轮中文）对齐：一轮中文覆盖多行英文时，按中文标点拆分到各行。
3. `reference` 缺失（u009/u010）时，依据 `parsedTranslation` 与英文句意翻译。
4. 译文**不加说话人前缀**（speaker 已单列），使用简体中文，与英文语义严格对应。

## 验收标准

- `python3 backend/scripts/validate_courses.py nce1` → **NG = 0**
- 逐行自检：无空 `zh`；`zh` 中不含 6 个以上连续拉丁字母（防英文残留）
- `python3 backend/scripts/build_course_packages.py` 重建后译文仍在（防管线回退）
