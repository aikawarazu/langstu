# Round Final —— 收尾观察报告

日期：2026-09-20　　执行：主代理 + code-explorer 子代理（批量并行）

## 1. 交付结果

| 册 | 单元总数 | 已完成 | 建议校验 | 状态 |
|---|---|---|---|---|
| nce2 第二册 | 96 | 96 | NG=0 | ✅ 完成 |
| nce3 第三册 | 60 | 60 | NG=0 | ✅ 完成 |
| nce4 第四册 | 48 | 16 | NG=32（剩余） | ⏹ 用户决定不再继续 |

构建产物：`data/courses/`（index.json + nce1~4.json + content/），
extension 同步：`extension/data/courses/`（281 文件）+ `extension/data/vocab.json`（2953 词 / 471 别名 / 1921 短语）。

## 2. 本工程新增/使用的确定性工具

- `backend/scripts/extract_raw_nce234.py` —— 抓取页 → 结构化底稿（标题 / 听力提问 / 中英逐句对齐 / 讲义原文）。
  关键算法：`group_by_ratio` 按「英文词数 ↔ 汉字数」比例把多的一侧成组，**保证每行都有 en 与 zh**。
- `backend/scripts/assemble_craft.py` —— 增量稿 → 精编稿 + `.done` 完成标记 + `.lock` 清理；含契约校验（lead 5 字段 / exercises=7 / quiz=6 / questions=5）。
- `backend/scripts/validate_courses.py` —— 全量字段齐备性 + 词典串污染 + quiz 合法性。
- `backend/scripts/build_course_packages.py` —— 输出课程包（合并精编稿，优先级最高）。
- `extension/build_data.py` —— 同步到扩展并重建 `vocab.json`（已把 SRC 从失效的 `app/data/courses` 修正为 `data/courses`）。

## 3. 协作协议（分布式锁 / 完成标记）

```
progress/nce234-craft/
├── extract/<book>/uXXX.json   确定性抽取底稿（只读素材）
├── delta/<book>/uXXX.json     主代理落盘的增量稿（唯一 AI 产物）
├── units/<book>-uXXX.lock     领取中（含 agent + 时间戳）
├── units/<book>-uXXX.done     已完成（assemble 写出，含 sha1 + 字段计数）
└── reports/                   每轮观察报告
```

实际编排：**每批 8 课** 并行派发 `code-explorer`（只读素材 → 返回裸 JSON），主代理统一 `write_to_file`，随后 `assemble_craft.py` 汇编并刷新 `.done`。nce2 用 12 批、nce3 用 8 批完成。

## 4. 本轮新发现（不复述历史）

1. **抽取器的两种页面模板**：听力室既有「^Lesson N 正文标题行」的干净页，也有「双语词典弹窗版」（正文混入词条与脚注编号）。抽取器用文件大小 + `find_lesson` 命中情况区分 A/B 模板，B 模板需另行剔除「弹窗词条 + 脚注编号」组合，否则正文会被词典串污染。
2. **子代理返回偶尔夹带解释文字**：个别子代理在裸 JSON 前后附「补充说明」。主代理落盘时只截取 JSON 段，避免污染 delta 文件。
3. **中文引号导致的 JSON 语法错误**：子代理返回 ``"q": ""谋生"用…"`` 时 JSON 非法，需改为全角引号「“谋生”」。此类错误会让该课在汇编时被判 `missing`，而非报语法错——排查时应先对 delta 目录做一次 `json.load` 全量预检。
4. **validate 误报**：POLLUTE 规则原含「人性化」，会把合法释义（“具有先进性和人性化”）误判为词典串污染。已收窄为「人性化 adjacent」，nce3 随即 NG=0。
5. **死路径**：`extension/build_data.py` 的 `SRC` 仍指向已迁移的 `app/data/courses`，运行只拷 0 个文件并抛 `FileNotFoundError`。修正为 `data/courses` 后同步 281 文件成功。

## 5. 遗留 / 建议

- **nce1 历史遗留 26 项 NG**：u001 缺 lead 子字段与 quiz；u003–u016 等 `text[0].lines` 的 `zh` 全为空（早期数据只有英文）。不在本次任务范围，建议后续单独补齐译文与精编稿。
- **nce4 u017–u048 未生成**：按用户指示停止。已生成的 u001–u016 与素材（`extract/nce4/`）完整保留，随时可续做。
- **锁文件**：已清理全部 `.lock`，目录内仅余 `.done` 完成标记。
