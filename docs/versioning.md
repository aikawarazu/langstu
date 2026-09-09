# 版本与 tag 规范

> 全部遵循 `MAJOR.MINOR.PATCH`（[SemVer](https://semver.org/lang/zh-CN/)）。
> **核心约定：改动 scheme / 数据规范必须打 tag**，因为数据通过 CDN + tag 分发，tag 就是数据的"发布件"。

---

## 1. 三条版本线

| 版本 | 写在哪 | 含义 | 升版触发 |
|---|---|---|---|
| **APP** `app-vX.Y.Z` | `app/js/data/registry.js` 的 `APP` 常量 | 站点（代码）版本 | 功能变更 / 修复 / 破坏性改动 |
| **DATA** `data-vX.Y.Z` | 仓库根 `data/VERSION` 文件 | 数据内容版本 | 增补课文、修正内容、结构调整 |
| **SPEC** `spec-vX.Y` | 各 JSON 的 `specVersion` | URL / 清单 / 课程包 / 压缩包规范版本 | 字段语义变更、结构不兼容变更 |

站点启动时会比对 `APP` 与本机记录的 `app.version`：不一致 → 自动刷新内置资源网站，保证**官方数据跟着站点版本走**。

---

## 2. 什么时候升哪一级

### APP

- **MAJOR**：不兼容的交互/数据改动（例如旧版本导入的包无法再使用）
- **MINOR**：新增功能（本次「课程管理 / 导入导出 / 资源网站」属于 MINOR：1.3 → 1.4）
- **PATCH**：修 bug、文案、样式

### DATA

- **MAJOR**：数据结构升级（配合 SPEC MAJOR），或大范围重制
- **MINOR**：新增可选字段、新增专辑/课文
- **PATCH**：改错字、补缺失译文、调音频链接

### SPEC

- **MAJOR**：不兼容变更（改字段语义、删字段、改必填性、改相对路径解析规则）
- **MINOR**：新增可选字段（旧版站点可忽略）

---

## 3. tag 命名

```
app-v1.4.0        # 站点发布
data-v1.0.0       # 数据发布（jsDelivr 用它取数据）
spec-v1.0         # 规范定稿（打在规范文档定稿的提交上）
```

- 严禁对已发布的 tag 做 `git tag -f` 覆盖重写（CDN 缓存会不一致）。
- jsDelivr 地址里**只能写 tag**：`.../gh/<user>/<repo>@data-v1.0.0/...`；不要写 `@latest`、分支名。
- 每个 tag 都要在 `CHANGELOG.md` 留一条记录。

---

## 4. 发版流程

### 站点（代码）

1. 改 `app/js/data/registry.js` 里的 `APP`（如 `1.4.0`）。
2. `app/index.html` 的静态资源版本号 `?v=N` **全部 +1**（破 CDN 缓存）。
3. 本地起服务冒烟：`cd app && python3 -m http.server 8080`，至少验证启动、切课、导入导出。
4. 提交后打 tag：

```bash
git add -A && git commit -m "release: app v1.4.0"
git tag app-v1.4.0 && git push origin main --tags
```

### 数据

1. 改 `data/VERSION`（如 `1.0.0`）。
2. `python3 backend/scripts/build_course_packages.py`（写入 `specVersion`/`version`，重建 manifest）。
3. 需要更新体积预估时：`python3 backend/scripts/measure_media_sizes.py`。
4. 提交后打 tag：

```bash
git add -A && git commit -m "data: v1.0.0"
git tag data-v1.0.0 && git push origin main --tags
```

### **改 scheme（最重要）**

1. 先把改动写进 `docs/data-url-spec.md` / `docs/course-package-spec.md`，**SPEC 升 MAJOR**。
2. 站点 `SPEC` 常量与 `SUPPORTED_MAJORS` 同步更新；**保留旧 MAJOR 只读支持一个大版本**（能读旧数据，但不导入新 MAJOR）。
3. 数据侧同步重建（`specVersion` 写到每个包与 manifest），DATA 升 MAJOR。
4. 三个 tag 一起打：`spec-v2.0` → `data-v2.0.0` → `app-vX.0.0`。
5. `CHANGELOG.md` 写明**破坏性变更 + 迁移方式**；站点升级提示里给出"请升级站点 / 换用 v1 数据"的具体话术（见 `registry.checkSpec`）。

---

## 5. 兼容承诺

- 站点只接受 `specVersion` **主版本相同**的数据；不同主版本直接拒绝并给出明确提示，不会静默解析出错。
- 新 MAJOR 发布后，旧 MAJOR 的数据至少**只读支持 1 个大版本周期**。
- 数据里的可选字段可以渐进补齐：缺哪块前端就少渲染哪块，不报错（见课程包规范「全部区块可选」）。
