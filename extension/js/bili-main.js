/* ===== 主世界小脚本：掐掉播放器发起的 window.open =====
   内容脚本默认跑在「隔离世界」，在那儿覆盖 window.open 影响不到页面自身的代码；
   本文件用 manifest 的 world:"MAIN" 注入页面世界，只做一件事——把指向 B 站的
   弹窗跳转拦掉（站点有 sandbox 时浏览器本就拦得住，这里是不依赖沙box 的兜底）。
   不动其它任何行为。 */
(function () {
  "use strict";
  if (window.__nceOpenPatched) return;
  window.__nceOpenPatched = true;

  var nativeOpen = window.open;
  window.open = function (url) {
    if (/bilibili\.com|b23\.tv/i.test(String(url || ''))) return null;
    return nativeOpen.apply(window, arguments);
  };
})();
