# NCE 学习助手 · Chrome 扩展（在线阅读参考）

在**任意网页**学习英文时，双击单词 / 选中短语即可浮出释义；侧栏可展开《新概念英语》四册的**音频精听**与**教材讲解**，把在线阅读与课程资料打通。

复用自站点 `app/` 的：音频外链 + LRC 字幕、课程包教材内容（生词 / 短语 / 语法 / 句型 / 练习 / 导学）。数据由 `build_data.py` 从 `app/data/courses/` 打包进 `extension/data/`。

## 功能

- **即点即译（内容脚本）**：在任意网页双击英文单词或选中短语，页面内浮出释义（音标 / 词性 / 释义 / 例句）与出处；提供「🔊 朗读」与「在侧栏查看本课」。命中来自跨 276 课的聚合词库 `data/vocab.json`。
- **B 站嵌入播放器增强（内容脚本 `bili.js`）**：注入到站点里那个播放器 iframe 的**内部**（`player.bilibili.com` / `html5mobileplayer`），所以能做到站点自己做不到的事：
  - **倍速遥控**：站点视频面板上的 0.75~2x 档位经 `postMessage` 发过来，这里直接改 `<video>.playbackRate`（跨域下父页面无解，只有内容脚本能做到）。
  - **倍速记忆**：B 站播放器在切课 / 切分 P 后会把倍速打回 1，这里会夺回来。
  - **简洁模式也有倍速**：`html5mobileplayer` 自身连倍速按钮都没有，装了扩展一样能调。
  - **去推广**：隐藏「进入哔哩哔哩，观看更高清」、顶部栏（logo / 点赞 / 评论 / 分享 / +关注）、弹幕输入条、结束卡等，选择器在 `bili.css`。
  - **拦跳转**：捕获阶段掐掉指向 B 站的点击；`js/bili-main.js` 再在页面世界拦一次 `window.open`。
- **侧栏学习台**：
  - 🎧 音频精听：LRC 逐句字幕（双语 / 中文 / 英文 / 模糊）、上一句 / 下一句、单句循环、整段循环、A-B 复读、0.75~1.5x 倍速、点句定位、新版 / 1985 老版音轨切换。
  - 📖 教材：导学 / 课文 / 生词 / 短语 / 语法 / 重点句 / 自测练习；点单词浮出释义并可朗读。
  - 🔍 词典：跨课查询单词 / 短语，点击「去学习 →」直达对应课。
  - 已学进度、我的笔记沿用站点存储（localStorage / IndexedDB，不上传）。
- **工具栏弹窗**：打开侧栏、随机一课、查词跳转。
- **右键菜单**：「打开 NCE 学习侧栏」「在 NCE 词库中查询选中内容」。

## 与站点配合：postMessage 协议

站点（`app/`）在父页面，扩展的内容脚本在播放器 iframe 内部，两者只能发消息：

```
站点 → iframe   { nce:'player', op:'ping' }                      握手（用 '*' 发，iframe 刚换 src 时文档还是 about:blank）
站点 → iframe   { nce:'player', op:'set', rate: 1.5 }            设倍速
站点 → iframe   { nce:'player', op:'get' }                       取状态
iframe → 站点   { nce:'player', op:'pong' }                      扩展在
iframe → 站点   { nce:'player', op:'state', rate, duration, currentTime, paused }
```

站点侧会校验 `event.origin` 必须是 `https://player.bilibili.com` 或 `https://www.bilibili.com`。
没装扩展时 ping 无人应答，档位置灰并提示安装；装了扩展则自动握手、恢复上次的倍速。

## 安装（开发者模式）

1. Chrome 114+（支持 `sidePanel`）。
2. 打开 `chrome://extensions`，开启「开发者模式」。
3. 「加载已解压的扩展程序」→ 选择本目录 `extension/`。
4. 固定扩展图标；在任意网页双击英文单词体验即点即译；点工具栏图标打开侧栏。

> 音频 / 字幕为外链资源，首次播放需联网；词库与教材为本地打包，离线可用。

## 重新生成数据

源数据（`app/data/courses/`）更新后，重新打包：

```bash
python3 extension/build_data.py   # 复制课程数据 + 重建 data/vocab.json
python3 extension/make_icon.py    # （可选）重新生成图标
```

## 文件结构

```
extension/
  manifest.json            MV3 清单（side_panel / content_scripts / web_accessible_resources）
  background.js            后台：上下文菜单、侧栏打开与跳转消息
  content.js / content.css 任意网页即点即译浮框
  bili.js / bili.css       B 站嵌入播放器增强（倍速遥控 / 去推广 / 拦跳转）
  js/bili-main.js          主世界脚本：拦掉播放器发起的 window.open
  sidepanel.html / .css / .js  侧栏学习台（音频 + 教材 + 词典）
  popup.html / .css / .js  工具栏弹窗
  js/
    store.js   统一存储（偏好 / 进度 / 笔记 / 课程包）
    registry.js 课程注册表（资源走 chrome.runtime.getURL）
    lrc.js      LRC 解析（复用自 app.js）
    lookup.js   单词归一 / 词形还原 / 即点即译（复用自 app.js）
    tb.js       教材渲染（复用自 app.js）
    player.js   音频精听播放器（复用自 app.js 的字幕驱动逻辑）
  data/
    courses/    index.json + nce1~4.json + content/<pkg>/<unit>.json（复制自站点）
    vocab.json  跨课生词 / 短语索引（build_data.py 生成）
  icons/        图标（make_icon.py 生成）
  build_data.py / make_icon.py  数据管线与图标生成
```

## 说明

- 课文 / 音频 / 教材内容版权归原作者所有，仅作个人学习用途。
- 扩展不收集、不上传任何数据；课程包与进度均存于本地浏览器。
