# 开发与部署手册

面向开发者的日常操作：本地预览、数据再生成、提交推送、缓存约定。面向使用者的说明见 [README.md](../README.md)，数据格式见 [course-package-spec.md](./course-package-spec.md)，数据补齐见 [data-guide.md](./data-guide.md)。

---

## 1. 本地预览

```bash
cd app && python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

> 需通过 HTTP 访问（课文 LRC、教材内容为运行时 fetch），直接双击 `index.html` 部分内容无法加载。

---

## 2. 数据再生成

前端只读 `app/data/courses/*`（标准课程包）。改完「源数据」后重新生成：

```bash
python3 backend/scripts/build_course_packages.py
# 读取 NCE*.js + notes.js + notes/ → 重建 data/courses/*（4 包 + 276 份内容 + index.json）
```

参考仓库笔记 → 中间产物（一般不需要手动跑，`build_course_packages.py` 直接用现成的 `notes/`）：

```bash
python3 backend/scripts/import_nce_notes.py   # aikawarazu/NCE notes/ → data/notes/
```

---

## 3. 提交与推送

### 3.1 当前环境（沙箱）

```bash
# 1. 查看改动
git status

# 2. 暂存并提交（环境未配全局 git 身份，需用 -c 临时指定）
git add -A
git -c user.name="deploy" -c user.email="deploy@local" commit -m "说明本次改动"

# 3. 推送（push 后自动触发 Actions 发布到 Pages）
git push git@github.com:aikawarazu/langstu.git main
```

> **为什么用 SSH 地址而不是 `git push origin main`**：本仓库 `origin` 是 HTTPS
> （`https://github.com/aikawarazu/langstu.git`），当前环境被 CNB credential helper 拦截，
> `git push origin main` 会报 `unknown host: github.com` / 无法读取用户名。
> 故统一用 SSH（`~/.ssh/id_rsa` 已配好 GitHub 认证）。

### 3.2 你自己的电脑

若 `origin` 已配成 SSH、或已配置 GitHub 凭据，则：

```bash
git add -A
git commit -m "说明本次改动"
git push origin main
```

---

## 4. 缓存版本号约定

`app/index.html` 里所有静态资源带 `?v=N`。**改了 `css/`、`js/`、`data/courses/` 里的文件后，要把 N 加 1**，否则 CDN/浏览器缓存会继续用旧资源。

```bash
sed -i 's/?v=25/?v=26/g' app/index.html   # 示例：25 → 26
```

---

## 5. 常用坑

- **提交报 `Author identity unknown`**：环境没配 `user.name/user.email`，用 `-c user.name=... -c user.email=...` 临时指定（见 §3.1）。
- **`git push origin main` 报 `unknown host: github.com`**：见 §3.1，改用 SSH 地址。
- **改了数据页面没变**：忘了 bump `?v=N`（见 §4）。
- **导入课程包校验不过**：看控制台 `[import]` 日志，常见是 `id` 非法 / 缺 `title` / `kind` 不是 series|single。
- **`build_course_packages.py` 会清空 `data/courses/`**：它会 `shutil.rmtree` 再重建，别往里面手放会被覆盖的文件；自定义内容走「源数据 → 重新生成」或「上传课程包」。
