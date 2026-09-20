# 检查清单（NCE1–NCE4 精编稿）

退出条件之一：**下列检查项全部打勾**。

> 范围说明（2026-09-20）：用户决定 **第四册剩余未完成部分不再生成**，保留已完成的前 16 课。
> 同日完成第一册遗留修复（译文补齐 + u001 精编稿 + 管线固化），见 `progress/nce1-fix/`。

## 数据完整性
- [x] nce1 72 单元：`lead` 5 字段齐、`questions` 5 条、`exercises` 7 条、`quiz` 6 条（u001 于本次补齐）
- [x] nce1 72 单元 `text` 每行都有 `en` 与 `zh`（u003–u027 于本次补齐 337 行译文）
- [x] nce2 96 单元同上（u006 无原文，由智能体补写 `text`）
- [x] nce3 60 单元同上
- [x] nce4 16 单元同上（u001–u016）
- [ ] nce4 u017–u048（**已取消**，不纳入验收）

## 数据一致性
- [x] 所有 `title`/`subtitle` 非空
- [x] 无中英句数错位（nce2/3 比例成组对齐；nce1 由 AI 逐行对齐 + 脚本核验下标全覆盖）
- [x] 无字典/词典串污染（POLLUTE 规则收窄后 nce1/2/3 命中 0）
- [x] nce1 无混入 en 的说话人残片（u006 `"DAVE:"` 已按 `zh: null` 语义删除）
- [x] quiz 选项无重复、answer 下标在范围内（assemble 契约校验 + validate 双检）
- [x] 精编稿不覆盖既有 words/phrases/grammar/patterns 字段
- [x] `data/courses/index.json` bytes/unitCount 与实际一致（构建自动生成）

## 管线
- [x] `extract_raw_nce234.py` 幂等重跑结果稳定
- [x] `assemble_craft.py` 契约校验覆盖上述约束
- [x] `prepare_nce1_zh.py` → `apply_nce1_zh.py` → `freeze_nce1_zh.py` 形成可复现链路
- [x] nce1 译文补丁固化为构建期数据源（`backend/data/notes/nce1_zh/`），重建后译文不丢失
- [x] `validate_courses.py` nce1 / nce2 / nce3 全绿（NG=0）
- [x] extension 侧 `data/courses` 已同步（281 文件）+ `vocab.json` 重建

## 反模式防护
- [x] 不复读既有 nce1 句式、不生成机械模板习语（每课针对本课内容）
- [x] 不在反思轮里复述历史发现
- [x] 不直接长期编辑构建产物（nce1 译文改为「补丁 + 构建期应用」）
