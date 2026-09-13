/* ===== PWA：注册 Service Worker + 安装引导 + 更新提示 =====
   只做三件事（失败全部静默，不影响正常使用）：
     1. 注册 ./sw.js（离线缓存，见 sw.js）
     2. 发现新版本 → 底部浮动条「点击更新」，确认后接管并刷新
     3. 支持「安装到桌面」时（beforeinstallprompt）→ 浮动条一键安装
   另：断网 / 恢复联网用全局 toast 轻提示。 */
window.PWA = (function () {
  var reg = null;                 /* ServiceWorkerRegistration */
  var waiting = null;             /* 已安装待接管的 SW */
  var deferredPrompt = null;      /* beforeinstallprompt 事件 */
  var reloading = false;
  var firstActivate = false;
  var bar = null, barMsg = null, barBtn = null;

  function toast(m) { if (typeof window.toast === 'function') try { window.toast(m); } catch (e) { } }

  /* ---------- 底部浮动条 ---------- */
  function buildBar() {
    bar = document.createElement('div');
    bar.className = 'pwabar';
    bar.hidden = true;
    barMsg = document.createElement('span');
    barMsg.className = 'pwabar-msg';
    barBtn = document.createElement('button');
    barBtn.className = 'pwabar-btn';
    barBtn.addEventListener('click', onBarBtn);
    var x = document.createElement('button');
    x.className = 'pwabar-x';
    x.textContent = '✕';
    x.title = '关闭';
    x.addEventListener('click', function () { bar.hidden = true; });
    bar.appendChild(barMsg);
    bar.appendChild(barBtn);
    bar.appendChild(x);
    document.body.appendChild(bar);
  }
  function showBar(msg, btn) {
    if (!bar) buildBar();
    barMsg.textContent = msg;
    barBtn.textContent = btn;
    barBtn.hidden = !btn;
    bar.hidden = false;
  }
  function hideBar() { if (bar) bar.hidden = true; }
  function onBarBtn() {
    if (deferredPrompt) {                      /* 安装到桌面 */
      var p = deferredPrompt;
      deferredPrompt = null;
      hideBar();
      p.prompt();
      p.userChoice.then(function (r) {
        if (r && r.outcome === 'accepted') toast('已安装到桌面');
      }).catch(function () { });
      return;
    }
    if (waiting) {                             /* 应用新版本 */
      showBar('正在更新…', '');
      waiting.postMessage('SKIP_WAITING');
    }
  }

  /* ---------- 新版本 ---------- */
  function foundNew(sw) {
    waiting = sw;
    showBar('发现新版本', '点击更新');
  }
  function watchUpdate() {
    if (!reg) return;
    /* 打开时就是「等待接管」状态（上次没点更新） */
    if (reg.waiting && navigator.serviceWorker.controller) foundNew(reg.waiting);
    reg.addEventListener('updatefound', function () {
      var nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', function () {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) foundNew(nw);
      });
    });
  }
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    /* 首次接管（首次安装）不刷新；点了「更新」后的接管才刷新 */
    if (waiting && !reloading) {
      reloading = true;
      location.reload();
    } else if (!waiting) {
      firstActivate = true;
    }
  });

  /* ---------- 安装引导 ---------- */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    /* 已安装的应用不会再触发；更新条在展示时不抢位置 */
    if ((!bar || bar.hidden) && !waiting) showBar('可安装到桌面 / 主屏，离线也能用', '安装');
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hideBar();
    toast('安装成功');
  });
  function installed() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
    } catch (e) { return false; }
  }

  /* ---------- 断网提示 ---------- */
  window.addEventListener('offline', function () { toast('已离线：课程与笔记仍在，可继续学习'); });
  window.addEventListener('online', function () { toast('已恢复联网'); });

  /* ---------- 注册 ---------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (r) {
      reg = r;
      watchUpdate();
      setInterval(function () { try { reg.update(); } catch (e) { } }, 60 * 60 * 1000);
      if (!navigator.serviceWorker.controller && !installed()) {
        /* 首次装好 SW 后轻提示（下次打开起可离线） */
        var once = function () {
          if (firstActivate) toast('已启用离线缓存，可安装到桌面');
          r.removeEventListener('updatefound', once);
        };
        r.addEventListener('updatefound', once);
      }
    }).catch(function (e) { console.warn('[pwa] SW 注册失败：', e); });
  }

  return {
    installed: installed,
    update: function () { try { reg && reg.update(); } catch (e) { } }
  };
})();
