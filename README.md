# 新概念英语点读 · 学习助手

一个纯静态的新概念英语点读学习网站：教材目录、课文点读、音频跟读、生词/笔记。
数据以 JS 形式内嵌（`app/data/*.js`），无需后端服务器，可直接静态托管。

## 本地预览

直接用浏览器打开 `app/index.html` 即可，或使用任意静态服务器：

```bash
cd app && python3 -m http.server 8080
```

## 项目结构

```
app/
  index.html        # 入口页
  css/              # 样式（app / textbook / v12 / v13）
  js/app.js         # 主逻辑
  data/             # 内嵌教材数据（NCE1-4 + notes）
backend/            # 数据派生脚本（可选，非运行期依赖）
docs/               # 需求/UX 文档
```

## 部署：Tencent CloudBase 静态托管

- 环境：`lang-d0gao3klp18bb9898`（别名 `lang`，ap-shanghai，体验版）
- 静态托管：已开通，`index.html` 为首页
- 访问地址：`https://lang-d0gao3klp18bb9898-1301753443.tcloudbaseapp.com/`

### 部署方式（一键重传）

将 `app/` 目录整体上传到静态托管根目录（忽略无关文件）：

```
manageHosting(action=upload, localPath=<项目>/app, cloudPath=/, ignore=["**/.DS_Store","**/*.map"])
```

更新资源后，浏览器侧 `index.html` 通过 `?v=N` 版本号强制刷新 CDN 缓存。

## CloudBase 资源

- Static Hosting（静态托管）：存放全部前端静态资源
- 无需云函数 / 云托管 / 数据库（M1 阶段为纯前端）
