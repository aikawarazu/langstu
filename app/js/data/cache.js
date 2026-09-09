/* ===== 缓存引擎 =====
   策略（可按需调整）：
     · 课文 / LRC / 字幕等文本：默认后台全量预载（全四册仅 ~4MB）
     · 音频：默认按课按需加载（播放时下并缓存），可一键「全量缓存」
   所有下载走同一队列（文本并发 4 / 音频并发 2），按 URL 去重 → 重复导入、断网重来都不会重复下载。
   缓存落在 IndexedDB（AppStore.media），播放时自动优先用本地 Blob。 */
window.AppCache = (function () {
  var CONC_TEXT = 4, CONC_AUDIO = 2, RETRY = 2, LRU_MAX = 12;
  var queue = [], act = { text: 0, audio: 0 }, paused = false;
  var stat = { total: 0, done: 0, failed: 0, bytes: 0, active: 0, queued: 0, label: '', pkgId: '' };
  var listeners = [];
  var objUrl = {}, objLru = [];

  function emit() { stat.queued = queue.length; listeners.forEach(function (f) { try { f(stat); } catch (e) { } }); }
  function onProgress(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; }

  /* 稳定 key：FNV-1a + 长度，URL 去重用 */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + '-' + s.length.toString(36);
  }
  function key(url) { return 'm:' + hash(url); }

  function record(url) { return window.AppStore.getMedia(key(url)); }
  function has(url) { return record(url).then(function (m) { return !!(m && (m.blob || m.text != null)); }); }

  /* ---------- 队列 ---------- */
  function enqueue(job) {
    return new Promise(function (res) {
      queue.push({ kind: job.kind, run: job.run, label: job.label || '', pkgId: job.pkgId || '', retry: 0, res: res });
      stat.total++; emit(); pump();
    });
  }
  function pump() {
    if (paused) return;
    for (var i = 0; i < queue.length;) {
      var t = queue[i];
      var limit = t.kind === 'audio' ? CONC_AUDIO : CONC_TEXT;
      if ((act[t.kind] || 0) >= limit) { i++; continue; }
      queue.splice(i, 1); act[t.kind] = (act[t.kind] || 0) + 1; stat.active++; runTask(t);
    }
    emit();
  }
  function runTask(t) {
    stat.label = t.label; emit();
    t.run().then(function (r) {
      act[t.kind]--; stat.active--; stat.done++;
      if (r && r.bytes) stat.bytes += r.bytes;
      t.res(r); emit(); pump();
    }, function (e) {
      act[t.kind]--; stat.active--;
      if (t.retry < RETRY) { t.retry++; setTimeout(function () { queue.push(t); pump(); }, 1200 * t.retry); emit(); }
      else { stat.failed++; t.res(null); emit(); pump(); }
    });
  }
  function pause() { paused = true; emit(); }
  function resume() { paused = false; pump(); }
  function isPaused() { return paused; }
  function cancelPending() { queue.forEach(function (t) { t.res(null); }); queue = []; stat.total = stat.done + stat.failed; emit(); }

  /* ---------- 下载（幂等：已有缓存直接返回） ---------- */
  function download(url, kind, pkgId) {
    return new Promise(function (res, rej) {
      if (typeof fetch !== 'function') return rej(new Error('no-fetch'));
      fetch(url, { credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return kind === 'audio' ? r.blob() : r.text();
      }).then(function (data) {
        var rec = { k: key(url), url: url, pkg: pkgId || '', kind: kind, at: Date.now() };
        if (typeof data === 'string') { rec.text = data; rec.bytes = data.length; }
        else { rec.blob = data; rec.bytes = data.size || 0; }
        return window.AppStore.putMedia(rec).then(function () { return rec; }, function () { return rec; });
      }).then(res, rej);
    });
  }
  /* 立即执行版：查缓存 → 没有就直接下（**不再入队**，避免「队列任务里再入队」造成死锁） */
  function ensure(url, kind, label, pkgId) {
    if (!url) return Promise.resolve(null);
    return record(url).then(function (m) {
      if (m && (m.blob || m.text != null)) return { cached: true, m: m, bytes: 0 };
      return download(url, kind, pkgId).then(function (rec) { return { cached: false, m: rec, bytes: rec.bytes || 0 }; });
    });
  }
  /* 排队版：交给队列调度（后台预载用） */
  function enqueueEnsure(url, kind, label, pkgId) {
    return enqueue({
      kind: kind === 'audio' ? 'audio' : 'text',
      label: label || (kind === 'audio' ? '音频' : '文本'),
      pkgId: pkgId || '',
      run: function () { return ensure(url, kind, label, pkgId); }
    });
  }
  /* 文本：缓存优先，缺失则下载后返回文本 */
  function text(url, label, pkgId) {
    if (!url) return Promise.resolve(null);
    return record(url).then(function (m) {
      if (m && m.text != null) return m.text;
      return ensure(url, 'text', label, pkgId).then(function (r) { return r && r.m ? r.m.text : null; });
    }).catch(function () { return null; });
  }

  /* ---------- 播放：本地 Blob 优先 ---------- */
  function objUrlFor(url, blob) {
    if (objUrl[url]) {
      objLru = objLru.filter(function (u) { return u !== url; }); objLru.push(url);
      return objUrl[url];
    }
    var u = URL.createObjectURL(blob);
    objUrl[url] = u; objLru.push(url);
    while (objLru.length > LRU_MAX) {
      var old = objLru.shift();
      try { URL.revokeObjectURL(objUrl[old]); } catch (e) { }
      delete objUrl[old];
    }
    return u;
  }
  /* 返回可直接赋值给 audio.src 的地址：本地缓存 → blob:；否则原 URL（并按 warm 后台补下） */
  function resolve(url, opt) {
    opt = opt || {};
    if (!url) return Promise.resolve('');
    return record(url).then(function (m) {
      if (m && m.blob) return objUrlFor(url, m.blob);
      /* 后台补下（弱网/省流时不自动下，用户点「缓存全部音频」时由 prefetch 显式触发） */
      if (opt.warm !== false && !lowNet()) enqueueEnsure(url, 'audio', opt.label, opt.pkgId);
      return url;
    }).catch(function () { return url; });
  }

  /* ---------- 预热 / 预载 ---------- */
  /* 打开一课：课文 + 当前音轨字幕后台补（音频在 resolve 里按需下） */
  function warmUnit(pkg, unit, variant) {
    if (!pkg || !unit) return Promise.resolve();
    var jobs = [];
    if (unit.contentRef || unit.content) {
      jobs.push(enqueue({
        kind: 'text', pkgId: pkg.id, label: '课文 ' + unit.index,
        run: function () { return window.AppData.content(pkg, unit).then(function () { return { bytes: 0 }; }); }
      }));
    }
    window.AppData.mediaList(pkg, unit).forEach(function (m) {
      if (m.kind === 'lrc' && (!variant || m.variant === variant)) {
        jobs.push(enqueue({ kind: 'text', pkgId: pkg.id, label: '字幕 ' + unit.index, run: function () { return ensure(m.url, 'lrc', '字幕 ' + unit.index, pkg.id); } }));
      }
    });
    return Promise.all(jobs);
  }
  /* 全量预载：opt={audio:true} 时连音频一起下 */
  function prefetch(pkgId, opt) {
    opt = opt || {};
    return window.AppData.get(pkgId).then(function (pkg) {
      var jobs = [];
      pkg.units.forEach(function (u) {
        if (opt.content !== false && (u.contentRef || u.content)) {
          jobs.push(enqueue({
            kind: 'text', pkgId: pkgId, label: pkg.title + ' 课文 ' + u.index,
            run: function () { return window.AppData.content(pkg, u).then(function () { return { bytes: 0 }; }); }
          }));
        }
        window.AppData.mediaList(pkg, u).forEach(function (m) {
          if (m.kind === 'lrc' && opt.lrc !== false) {
            jobs.push(enqueue({ kind: 'text', pkgId: pkgId, label: '字幕 ' + u.index, run: function () { return ensure(m.url, 'lrc', '字幕 ' + u.index, pkgId); } }));
          } else if (m.kind === 'audio' && opt.audio) {
            jobs.push(enqueue({ kind: 'audio', pkgId: pkgId, label: '音频 ' + u.index, run: function () { return ensure(m.url, 'audio', '音频 ' + u.index, pkgId); } }));
          }
        });
      });
      return Promise.all(jobs);
    });
  }
  /* 只下某一课的音频（「缓存本课音频」按钮） */
  function prefetchUnitAudio(pkg, unit) {
    var jobs = window.AppData.mediaList(pkg, unit).filter(function (m) { return m.kind === 'audio'; })
      .map(function (m) {
        return enqueue({ kind: 'audio', pkgId: pkg.id, label: '音频 ' + unit.index, run: function () { return ensure(m.url, 'audio', '音频 ' + unit.index, pkg.id); } });
      });
    return Promise.all(jobs);
  }

  /* ---------- 存储策略 ---------- */
  /* 弱网 / 省流模式：不自动后台补音频（用户显式点「缓存全部音频」不受影响） */
  function lowNet() {
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return !!(c && (c.saveData || /^(slow-)?2g$|^3g$/.test(c.effectiveType || '')));
    } catch (e) { return false; }
  }
  /* 首次有数据落地时申请持久化存储，避免浏览器（尤其 Safari/iOS）在空闲时回收 */
  function requestPersist() {
    return window.AppStore.getMeta('storage.persist', 0).then(function (v) {
      if (v) return v === 1;
      return window.AppStore.persist().then(function (ok) {
        return window.AppStore.setMeta('storage.persist', ok ? 1 : 2).then(function () { return ok; });
      });
    }).catch(function () { return false; });
  }

  /* ---------- 统计 / 清理 ---------- */
  function stats() {
    return window.AppStore.allMedia().then(function (rows) {
      var bytes = 0, audio = 0, files = 0;
      rows.forEach(function (m) {
        files++; bytes += m.bytes || 0;
        if (m.blob) audio++;
      });
      return { files: files, audio: audio, bytes: bytes };
    });
  }
  function clearAll() {
    Object.keys(objUrl).forEach(function (u) { try { URL.revokeObjectURL(objUrl[u]); } catch (e) { } });
    objUrl = {}; objLru = [];
    return window.AppStore.clearMedia().catch(function () { });
  }
  return {
    key: key, has: has, ensure: ensure, enqueueEnsure: enqueueEnsure, text: text, resolve: resolve,
    warmUnit: warmUnit, prefetch: prefetch, prefetchUnitAudio: prefetchUnitAudio,
    onProgress: onProgress, pause: pause, resume: resume, isPaused: isPaused, cancelPending: cancelPending,
    stats: stats, clearAll: clearAll, status: function () { return stat; },
    requestPersist: requestPersist, lowNet: lowNet
  };
})();
