# Round P0–P3 验收报告（NCE1 遗留修复）

日期：2026-09-20　　编排：主代理 + 9/8/9 三批 code-explorer 子代理

## 1. 执行结果

| 阶段 | 目标 | 结果 |
|---|---|---|
| P0 | nce1 对话体课文补译文（u003–u027，25 单元 / 337 行） | ✅ 全部 apply，0 失败 |
| P1 | nce1 u001 精编稿补齐（lead 补 warmup/goals、questions 1→5、exercises 5→7、quiz 0→6） | ✅ 写入 `craft/nce1/u001.json` |
| P2 | 译文与管线固化（防重建回退） | ✅ `backend/data/notes/nce1_zh/`（25 份）+ 构建脚本应用 |
| P3 | 工程清理（`extension/build_data.py`） | ✅ 去除 PY2 `to_unicode`、未使用 `sys`/`unit_meta`，lint error = 0 |

## 2. 关键验证（验收标准逐条）

```
python3 backend/scripts/validate_courses.py nce1   →  units=72 lead=72 text=72 lines=853 NG=0
python3 backend/scripts/validate_courses.py nce2   →  NG=0
python3 backend/scripts/validate_courses.py nce3   →  NG=0
python3 backend/scripts/validate_courses.py         →  TOTAL NG=32（全部为 nce4 u017–u048，范围外）
```

- **可复现性验证**：运行 `build_course_packages.py` 重建后，u003/u006/u027 的 `no-zh` 仍为 **0**
  （对比修复前：重建会把译文全部清空 —— 这正是 L3 固化的原因）。
- **数据质量**：译文条目经脚本三重校验（覆盖全部下标 / 非空 / 无 6+ 连续拉丁字母），
  25 份补丁全部一次通过。
- **extension 同步**：`copied 281 files`，`vocab.json` 2953 words / 471 aliases / 1921 phrases。

## 3. 过程中发现（新信息）

1. **nce1 的译文形态与 nce2/3/4 不同**：`parsed/nce1` 的 `translation` 是「按对话轮」的中文
   （u003：20 行英文 ↔ 13 条中文），无法直接 zip；而 `raw/nce1/<page>.txt` 的「参考译文」
   同源同粒度。因此逐行对齐必须由语言模型完成，脚本只能做素材汇总与结果校验。
2. **speaker-run 对齐假设不成立**：以「连续相同 speaker 归一轮」自动对齐，72 单元中仅 5 个成立
   （u011 起多为独白，speaker 为空）。放弃纯脚本路线，改为 AI 逐句对齐 + 脚本强校验。
3. **u006 存在说话人残片**：`en` 中混入 `"DAVE:"` 一行（原页面把说话人标签写进了正文）。
   为 `zh: null` 引入「删除该行」语义，行数 17 → 16。
4. **u009/u010 无参考译文**：raw 页缺「参考译文」段落，由子代理直接依英文翻译，质量经校验通过。
5. **构建产物被直接编辑会被覆盖**：首次修复后直接改 `data/courses/content/nce1/*.json`，
   重建即丢失 —— 印证了必须把补丁固化为构建期数据源（现由 `apply_zh_patch()` 应用）。

## 4. 剩余事项

- **L5（范围外）**：nce4 u017–u048 共 32 课未生成。素材 `progress/nce234-craft/extract/nce4/` 已就绪，
  按既有协议 4 批 × 8 课即可完成；如需开展，仅需用户确认。
