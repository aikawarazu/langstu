/* ===== 内容脚本：B 站嵌入播放器增强（倍速遥控 / 去推广 / 拦截跳转）=====
   运行位置：站点里那个 iframe 的内部（player.bilibili.com 或 html5mobileplayer）。

   为什么只有扩展能做到：内容脚本由扩展注入，不受页面同源策略约束，所以这里能直接
   操作播放器的 <video>；而站点（父页面，GitHub Pages）永远拿不到它。站点与这里之间
   只能靠 postMessage 说话，协议如下：

     站点 → iframe   { nce:'player', op:'ping' }                      握手
     站点 → iframe   { nce:'player', op:'set', rate: 1.5 }            设倍速
     站点 → iframe   { nce:'player', op:'get' }                       取状态
     iframe → 站点   { nce:'player', op:'pong' }                      扩展在
     iframe → 站点   { nce:'player', op:'state', rate, duration, currentTime, paused }

   另外三件事注入即生效，不需要站点配合：
   - 去掉推广与跳转入口（选择器在 bili.css）
   - 捕获阶段掐掉指向 B 站的点击（父页面的 sandbox 只能挡新窗口 / 顶层跳转，挡不住这个）
   - 倍速记忆：切课 / 切分 P 后播放器会把倍速重置回 1，这里夺回来
*/
(function () {
  "use strict";

  var TAG = 'player';
  var KEY = 'biliRate';
  var IN_FRAME = window.parent !== window;

  var video = null;
  var rate = 1;
  var guardUntil = 0;   /* 这段时间内的 ratechange 视为「播放器重置」，一律夺回 */

  /* ---------- 与站点通信 ---------- */
  function post(op, extra) {
    if (!IN_FRAME) return;
    var msg = { nce: TAG, op: op, rate: rate };
    if (extra) { for (var k in extra) msg[k] = extra[k]; }
    try { window.parent.postMessage(msg, '*'); } catch (e) { }
  }

  function pick() {
    if (!video || !video.isConnected) video = document.querySelector('video');
    return video;
  }

  function state() {
    var v = pick();
    return {
      rate: rate,
      duration: v && isFinite(v.duration) ? v.duration : 0,
      currentTime: v ? v.currentTime : 0,
      paused: v ? v.paused : true
    };
  }

  /* ---------- 倍速 ---------- */
  function clamp(n) {
    n = Number(n);
    if (!isFinite(n)) return 1;
    return Math.min(4, Math.max(0.25, Math.round(n * 100) / 100));
  }

  function save(v) {
    try {
      var o = {};
      o[KEY] = v;
      chrome.storage.local.set(o);
    } catch (e) { }
  }

  function apply(v, quiet) {
    rate = clamp(v);
    var el = pick();
    if (el) {
      guardUntil = Date.now() + 1500;
      try { el.playbackRate = rate; } catch (e) { }
    }
    save(rate);
    if (!quiet) post('state', state());
  }

  /* 新视频加载 / 切分 P 后播放器会把倍速打回 1，这里再按一次 */
  function reassert() {
    var el = pick();
    if (!el) return;
    if (Math.abs(el.playbackRate - rate) > 0.001) {
      guardUntil = Date.now() + 1200;
      try { el.playbackRate = rate; } catch (e) { }
    }
  }

  function hookVideo() {
    var el = pick();
    if (!el || el.__nceHooked) return;
    el.__nceHooked = true;

    var events = ['loadedmetadata', 'canplay', 'play', 'seeked', 'ended'];
    for (var i = 0; i < events.length; i++) {
      el.addEventListener(events[i], function () { setTimeout(reassert, 0); });
    }

    /* 用户如果在播放器自带的菜单里改了倍速 → 采信他的选择；
       但「刚加载完被打回 1」这一下不算，否则记忆就丢了 */
    el.addEventListener('ratechange', function () {
      if (Date.now() < guardUntil) { reassert(); return; }
      var cur = clamp(el.playbackRate);
      if (Math.abs(cur - rate) > 0.001) { rate = cur; save(rate); post('state', state()); }
    });
  }

  /* ---------- 去跳转：捕获阶段掐掉指向 B 站的点击 ---------- */
  function isBiliAnchor(el) {
    for (var n = el; n && n !== document; n = n.parentNode) {
      if (n.tagName === 'A') {
        /* 若这个 <a> 把播放器整个包住（含 video 或控制栏），不能拦，否则播放器就废了 */
        if (n.querySelector && n.querySelector('video')) return false;
        var h = n.getAttribute('href') || '';
        return /bilibili\.com|b23\.tv/i.test(h);
      }
    }
    return false;
  }
  function blockNav(e) {
    if (isBiliAnchor(e.target)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
    }
  }
  document.addEventListener('click', blockNav, true);
  document.addEventListener('auxclick', blockNav, true);

  /* ---------- 站点消息 ---------- */
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.nce !== TAG) return;
    if (d.op === 'ping') { post('pong'); post('state', state()); }
    else if (d.op === 'set') { apply(d.rate); }
    else if (d.op === 'get') { post('state', state()); }
  });

  /* ---------- 启动 ---------- */
  function boot() {
    hookVideo();
    try {
      chrome.storage.local.get(KEY, function (o) {
        var v = o && o[KEY];
        rate = clamp(v == null ? 1 : v);
        if (rate !== 1) apply(rate, true);
        post('pong');   /* 告诉站点「扩展在」 */
      });
    } catch (e) {
      post('pong');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 播放器是异步渲染的，<video> 可能晚于本脚本出现 */
  var mo = new MutationObserver(function () { hookVideo(); });
  try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) { }
  setTimeout(function () { mo.disconnect(); }, 60000);

  /* 播放心跳：让站点能显示进度 */
  setInterval(function () {
    var v = pick();
    if (IN_FRAME && v && !v.paused) post('state', state());
  }, 2000);
})();
