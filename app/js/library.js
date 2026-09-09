/* ===== 课程管理面板 =====
   四个页签：我的课程 / 资源网站 / 导入说明 / 我的知识
   贯穿两条原则：
     · 数据全部来自 URL（站点自身不含教材），导入 = 把远端数据落到本机 IndexedDB
     · 全流程幂等：同一份数据重复导入、导出再导入、刷新后重下，都不会产生副本或重复下载 */
window.Library = (function () {
  var TABS = [['courses', '📚 我的课程'], ['sources', '🌐 资源网站'], ['guide', '📥 导入说明'], ['knowledge', '🧠 我的知识']];
  var tab = 'courses', probe = null, unsub = null;

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function toast(t) { if (typeof window.toast === 'function') window.toast(t); }
  /* 把技术错误翻成人能看懂的下一步 */
  function errHint(e) {
    var m = (e && e.message) || '';
    if (/HTTP 404/.test(m)) return '（404：地址不存在。用 CDN 的话需要先推送 data tag；本地预览请从仓库根起服务：python3 -m http.server → 访问 /app/）';
    if (/CORS|请求失败/.test(m)) return '（跨域被拒或断网：数据地址必须返回 Access-Control-Allow-Origin）';
    if (/规范 v/.test(m)) return '';   /* 版本提示本身已足够清楚 */
    return '';
  }
  function fmtB(n) {
    n = +n || 0;
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }
  function curBook() { return (window.S && window.S.book) || ''; }
  function doneCount(id) {
    var n = 0;
    try { (window.done || []).forEach(function (k) { if (String(k).indexOf(id + ':') === 0) n++; }); } catch (e) { }
    return n;
  }

  /* ---------- 骨架 ---------- */
  function box() {
    var r = $('#libModal');
    if (!r) { r = document.createElement('div'); r.className = 'nmodal'; r.id = 'libModal'; r.hidden = true; document.body.appendChild(r); }
    return r;
  }
  function open(t) { if (t) tab = t; render(); box().hidden = false; if (unsub) unsub(); unsub = window.AppCache.onProgress(onProg); }
  function close() { box().hidden = true; if (unsub) { unsub(); unsub = null; } }
  function isOpen() { return !box().hidden; }
  function onProg(s) {
    var bar = $('#libProg');
    if (!bar) return;
    if (!s.active && !s.queued) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = '↓ 正在缓存 ' + esc(s.label || '') + ' … ' + s.done + '/' + s.total +
      (s.failed ? '（失败 ' + s.failed + '）' : '') + ' · ' + fmtB(s.bytes);
  }

  function render() {
    var r = box();
    r.innerHTML =
      '<div class="nm-mask" data-act="close"></div>' +
      '<div class="nm-box lib-box" role="dialog" aria-modal="true" aria-label="课程管理">' +
      '<div class="nm-head"><div><div class="t">📚 课程管理</div><div class="s" id="libSub">数据来自你添加的来源，全部存于本机浏览器</div></div>' +
      '<button class="nm-x" data-act="close" title="关闭">✕</button></div>' +
      '<div class="lib-tabs">' + TABS.map(function (t) {
        return '<button class="lib-tab' + (t[0] === tab ? ' on' : '') + '" data-act="tab" data-v="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="lib-prog" id="libProg" hidden></div>' +
      '<div class="lib-body" id="libBody"></div>' +
      '<div class="nm-foot"><span class="st" id="libFoot"></span><span class="sp"></span><button class="nm-btn ok" data-act="close">完成</button></div>' +
      '</div>';
    var body = $('#libBody');
    if (tab === 'courses') renderCourses(body);
    else if (tab === 'sources') renderSources(body);
    else if (tab === 'guide') renderGuide(body);
    else renderKnowledge(body);
    r.onclick = onClick;
    onProg(window.AppCache.status());
  }

  /* ---------- 我的课程 ---------- */
  function renderCourses(body) {
    var list = window.AppData.list();
    body.innerHTML =
      '<div class="lib-bar">' +
      '<button class="nm-btn" data-act="url">🔗 从 URL 导入</button> ' +
      '<button class="nm-btn" data-act="file">📄 从 JSON 文件导入</button> ' +
      '<button class="nm-btn" data-act="zip">🗜 从压缩包导入</button>' +
      '<span class="sp"></span><button class="nm-btn" data-act="clear-cache">🧹 清空缓存</button>' +
      '</div>' +
      '<div id="libCards" class="lib-cards"><div class="lib-mut">读取中…</div></div>';
    if (!list.length) {
      $('#libCards').innerHTML = '<div class="lib-empty">还没有课程。<br>去「🌐 资源网站」添加教材，或用上面的按钮从 URL / 文件导入。</div>';
      return;
    }
    var html = '';
    list.forEach(function (c) {
      var src = c.sourceId ? (window.AppData.sources().filter(function (s) { return s.id === c.sourceId; })[0] || {}).name : '';
      html += '<div class="lib-card" data-id="' + esc(c.id) + '">' +
        '<div class="lc-top"><div class="lc-t">' + esc(c.title) + '</div><div class="lc-v">v' + esc(c.version || '0.0.0') + '</div></div>' +
        '<div class="lc-m">' + c.unitCount + ' 课 · ' + esc(c.level || '-') + ' · 已学 ' + doneCount(c.id) + ' · 来源：' + esc(src || c.origin || '本机') + '</div>' +
        '<div class="lc-c" data-cache="' + esc(c.id) + '">缓存统计读取中…</div>' +
        '<div class="lc-a">' +
        '<button class="nm-btn ok" data-act="open" data-v="' + esc(c.id) + '">打开</button>' +
        '<button class="nm-btn" data-act="audio" data-v="' + esc(c.id) + '">⬇ 缓存全部音频</button>' +
        '<button class="nm-btn" data-act="exp-text" data-v="' + esc(c.id) + '">📦 导出（仅文本）</button>' +
        '<button class="nm-btn" data-act="exp-all" data-v="' + esc(c.id) + '">📦 导出（含音频）</button>' +
        '<button class="nm-btn danger" data-act="del" data-v="' + esc(c.id) + '">删除</button>' +
        '</div></div>';
    });
    $('#libCards').innerHTML = html;
    list.forEach(function (c) { refreshCacheStat(c.id); });
  }
  function refreshCacheStat(id) {
    var box = document.querySelector('[data-cache="' + id + '"]');
    if (!box) return;
    Promise.all([
      window.AppStore.countMedia(id, 'content'), window.AppStore.countMedia(id, 'lrc'), window.AppStore.countMedia(id, 'audio'),
      window.AppData.get(id).catch(function () { return null; })
    ]).then(function (r) {
      /* 内联在包里的课文不需要缓存，单独标注，避免显示成 0 让人以为没下 */
      var inline = 0, total = 0;
      if (r[3]) {
        total = (r[3].units || []).length;
        inline = (r[3].units || []).filter(function (u) { return u.content; }).length;
      }
      box.textContent = '课文 ' + r[0] + (inline ? '（另 ' + inline + ' 课内联）' : '') +
        ' · 字幕 ' + r[1] + ' · 音频 ' + r[2] + (total ? ' / ' + total + ' 课' : '');
    });
  }

  /* ---------- 资源网站 ---------- */
  function renderSources(body) {
    var srcs = window.AppData.sources();
    body.innerHTML =
      '<div class="lib-bar">' +
      '<input id="srcUrl" class="lib-input" placeholder="粘贴资源网站清单 URL（返回 index.json，内含 albums）">' +
      '<button class="nm-btn ok" data-act="add-src">＋ 添加</button></div>' +
      '<div class="lib-mut">资源网站只登记地址，不含教材内容；添加后从它的专辑列表里挑教材装进本机。</div>' +
      '<div id="libSrcs"></div>';
    var host = $('#libSrcs');
    if (!srcs.length) { host.innerHTML = '<div class="lib-empty">还没有资源网站。</div>'; return; }
    host.innerHTML = srcs.map(function (s) {
      var inst = {};
      window.AppData.list().forEach(function (c) { if (c.sourceId === s.id) inst[c.id] = c; });
      return '<div class="lib-src">' +
        '<div class="ls-h"><div><b>' + esc(s.name) + '</b> <span class="mut">' + esc(s.homepage || '') + '</span></div>' +
        '<div class="ls-ha"><button class="nm-btn" data-act="refresh" data-v="' + esc(s.id) + '">🔄 刷新</button> ' +
        '<button class="nm-btn danger" data-act="del-src" data-v="' + esc(s.id) + '">删除</button></div></div>' +
        '<div class="ls-m">专辑 ' + (s.albums || []).length + ' · 清单版本 v' + esc(s.version || '-') +
        ' · 更新 ' + (s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : '未刷新') + '</div>' +
        '<div class="ls-al">' + (s.albums || []).map(function (a) {
          var ins = inst[a.id];
          var bytes = a.bytes ? (a.bytes.audio || 0) + (a.bytes.content || 0) + (a.bytes.pkg || 0) : 0;
          var btn = !ins
            ? '<button class="nm-btn ok" data-act="install" data-s="' + esc(s.id) + '" data-v="' + esc(a.id) + '">＋ 添加</button>'
            : (ins.version !== a.version
              ? '<button class="nm-btn ok" data-act="upd" data-s="' + esc(s.id) + '" data-v="' + esc(a.id) + '">更新到 v' + esc(a.version) + '</button>'
              : '<span class="lc-done">✓ 已添加</span>');
          return '<div class="ls-row"><div class="ls-t">' + esc(a.title) + '<span class="mut"> · ' + (a.unitCount || 0) + ' 课 · ' +
            esc(a.level || '') + ' · v' + esc(a.version || '0') + (bytes ? ' · 约 ' + fmtB(bytes) : '') + '</span></div>' + btn + '</div>';
        }).join('') + '</div></div>';
    }).join('');
  }

  /* ---------- 导入说明（含 AI 提示词） ---------- */
  function renderGuide(body) {
    var P = window.LS_PROMPT || {};
    body.innerHTML =
      '<div class="lib-sec"><div class="lib-h3">① 三种可导入的 URL</div>' +
      '<pre class="lib-pre">' + esc([
        'A 专辑（课程包）URL   → 返回一个 CoursePackage JSON',
        '  https://cdn.jsdelivr.net/gh/<user>/<repo>@data-v1.0.0/data/courses/nce1.json',
        '',
        'B 资源网站清单 URL     → 返回 { specVersion, type:"source-site", albums:[…] }',
        '  https://cdn.jsdelivr.net/gh/<user>/<repo>@data-v1.0.0/data/courses/index.json',
        '',
        'C 一键导入深链         → 打开站点并自动导入 A 或 B',
        '  ' + location.origin + location.pathname + '#import=' + encodeURIComponent('https://…/nce1.json')
      ].join('\n')) + '</pre></div>' +

      '<div class="lib-sec"><div class="lib-h3">② scheme 字段说明</div>' +
      '<table class="lib-tb"><tr><th>字段</th><th>说明</th></tr>' +
      '<tr><td>specVersion</td><td>规范版本（MAJOR.MINOR）。本站支持 v' + window.AppData.SPEC + '；主版本不同会拒绝导入。</td></tr>' +
      '<tr><td>schemaVersion</td><td>课程包结构版本，当前 1。</td></tr>' +
      '<tr><td>version</td><td>数据内容版本（SemVer），用于判断「有更新」。</td></tr>' +
      '<tr><td>minAppVersion</td><td>可选。要求的最低站点版本，高于当前版本时拒绝导入。</td></tr>' +
      '<tr><td>albums[].url</td><td>相对清单 URL 解析；mirrors / baseMirrors 为备源，主源失败自动切换。</td></tr>' +
      '<tr><td>units[].contentRef</td><td>相对「包文件」解析（如 content/nce1/u001.json）。</td></tr>' +
      '<tr><td>CORS</td><td>目标必须返回 JSON 且带 Access-Control-Allow-Origin，否则浏览器读不到。</td></tr>' +
      '</table></div>' +

      '<div class="lib-sec"><div class="lib-h3">③ 示例 URL（点「试一试」真的会去取数据）</div>' +
      '<div class="lib-bar"><input id="tryUrl" class="lib-input" value="data/demo/package.json">' +
      '<button class="nm-btn ok" data-act="try">试一试</button>' +
      '<button class="nm-btn" data-act="try-cdn">填入 CDN 示例</button></div>' +
      '<pre class="lib-pre" id="tryOut">点「试一试」后这里显示返回数据的摘要。</pre>' +
      '<div id="tryAct"></div></div>' +

      '<div class="lib-sec"><div class="lib-h3">④ 用 AI 生成课程数据（提示词）</div>' +
      '<div class="lib-mut">把教材原文（txt / html / OCR）连下面这段提示词一起发给模型，即可产出可直接导入的 JSON。</div>' +
      '<div class="lib-bar"><button class="nm-btn ok" data-act="copy-prompt">📋 复制提示词</button>' +
      '<button class="nm-btn" data-act="dl-sample">⬇ 下载示例 JSON</button>' +
      '<button class="nm-btn" data-act="toggle-prompt">显示 / 隐藏</button></div>' +
      '<pre class="lib-pre" id="promptBox" hidden>' + esc(P.MAIN || '') + '</pre></div>';
  }

  /* ---------- 我的知识 ---------- */
  function renderKnowledge(body) {
    var notes = window.AppStore.notes() || {}, vocab = window.AppStore.pref('vocab', {}) || {};
    var noteN = Object.keys(notes).filter(function (k) { return notes[k]; }).length;
    var doneN = 0; try { doneN = (window.done || new Set()).size; } catch (e) { }
    body.innerHTML =
      '<div class="lib-sec"><div class="lib-h3">本机知识资产</div>' +
      '<div class="lib-kv"><span>我的笔记</span><b>' + noteN + ' 条</b></div>' +
      '<div class="lib-kv"><span>生词本</span><b>' + Object.keys(vocab).length + ' 个</b></div>' +
      '<div class="lib-kv"><span>已学课程</span><b>' + doneN + ' 课</b></div>' +
      '<div class="lib-kv"><span>已装课程</span><b>' + window.AppData.list().length + ' 个</b></div>' +
      '<div class="lib-kv"><span>缓存占用</span><b id="kbCache">统计中…</b></div></div>' +
      '<div class="lib-bar"><button class="nm-btn ok" data-act="k-exp">⬇ 导出我的知识</button> ' +
      '<button class="nm-btn" data-act="k-imp">⬆ 导入我的知识</button> ' +
      '<button class="nm-btn danger" data-act="k-clear">清空笔记与生词</button></div>' +
      '<div class="lib-mut">笔记 / 生词 / 进度都存在本机浏览器（localStorage），换设备或清缓存前请先导出。</div>';
    window.AppCache.stats().then(function (s) { var e = $('#kbCache'); if (e) e.textContent = fmtB(s.bytes) + '（' + s.files + ' 个文件）'; });
  }

  /* ---------- 事件 ---------- */
  function onClick(e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var act = t.getAttribute('data-act'), v = t.getAttribute('data-v'), s = t.getAttribute('data-s');
    if (act === 'close') return close();
    if (act === 'tab') { tab = v; return render(); }
    if (act === 'open') return openCourse(v);
    if (act === 'del') return delCourse(v);
    if (act === 'audio') return cacheAudio(v);
    if (act === 'exp-text') return exportPkg(v, false);
    if (act === 'exp-all') return exportPkg(v, true);
    if (act === 'url') return importUrl();
    if (act === 'file') return pickFile('.json,application/json', importJsonFile);
    if (act === 'zip') return pickFile('.zip,application/zip', importZipFile);
    if (act === 'clear-cache') return clearCache();
    if (act === 'add-src') return addSource();
    if (act === 'refresh') return refreshSource(v);
    if (act === 'del-src') return delSource(v);
    if (act === 'install') return installAlbum(s, v);
    if (act === 'upd') return installAlbum(s, v);
    if (act === 'try') return tryUrl();
    if (act === 'try-cdn') { var i = $('#tryUrl'); if (i) i.value = 'https://cdn.jsdelivr.net/gh/aikawarazu/langstu@data-v1.0.0/data/courses/index.json'; return; }
    if (act === 'copy-prompt') return copyText((window.LS_PROMPT || {}).MAIN || '');
    if (act === 'dl-sample') return downloadJSON('course-sample.json', (window.LS_PROMPT || {}).SAMPLE || {});
    if (act === 'toggle-prompt') { var p = $('#promptBox'); if (p) p.hidden = !p.hidden; return; }
    if (act === 'k-exp') return exportKnowledge();
    if (act === 'k-imp') return pickFile('.json,application/json', importKnowledge);
    if (act === 'k-clear') return clearKnowledge();
  }
  function pickFile(accept, cb) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = function () { var f = inp.files && inp.files[0]; if (f) cb(f); };
    inp.click();
  }

  /* ---------- 动作：课程 ---------- */
  function openCourse(id) {
    close();
    if (typeof window.startCourse === 'function') {
      window.startCourse(id).catch(function (e) { toast('打开失败：' + e.message); });
      return;
    }
    if (id === curBook()) return;
    window.AppData.get(id).then(function (p) {
      window.DATA[id] = p;
      if (typeof window.setBook === 'function') window.setBook(id);
      if (typeof window.renderBookSel === 'function') window.renderBookSel();
    });
  }
  function delCourse(id) {
    if (!confirm('删除课程「' + id + '」？学习进度与笔记会按 id 保留，课程内容从本机移除（可随时重新添加）。')) return;
    window.AppData.remove(id).then(function () {
      toast('已删除 ' + id);
      if (id === curBook()) {
        var first = window.AppData.list()[0];
        if (first) window.AppData.get(first.id).then(function (p) {
          window.DATA[first.id] = p;
          if (typeof window.setBook === 'function') window.setBook(first.id);
          if (typeof window.renderBookSel === 'function') window.renderBookSel();
        });
        else if (typeof window.renderBookSel === 'function') window.renderBookSel();
      }
      render();
    });
  }
  function cacheAudio(id) {
    toast('开始后台缓存音频（可继续学习，进度见面板顶部）');
    window.AppCache.prefetch(id, { audio: true, content: false, lrc: false }).then(function () {
      toast('音频缓存完成'); refreshCacheStat(id);
    });
  }
  function clearCache() {
    if (!confirm('清空全部缓存（课文 / 字幕 / 音频）？课程本身保留，下次打开会重新下载。')) return;
    window.AppCache.clearAll().then(function () { toast('缓存已清空'); render(); });
  }

  /* ---------- 动作：导入 ---------- */
  function importUrl(url) {
    if (!url) url = prompt('输入课程包 JSON 的 URL，或资源网站清单的 URL：');
    if (!url) return;
    url = url.trim();
    toast('正在获取…');
    fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var c = window.AppData.checkSpec(j);
      if (!c.ok) return toast('导入失败：' + c.msg);
      if (j.albums) {
        return window.AppData.addSource(url).then(function (s) {
          toast('已添加资源网站「' + s.name + '」，共 ' + (s.albums || []).length + ' 个专辑');
          tab = 'sources'; render();
        });
      }
      var v = window.AppData.validate(j);
      if (!v.ok) return toast('校验失败：' + v.errors.join('；'));
      return window.AppData.importPkg(j, { url: url }).then(function () {
        toast('已导入「' + j.title + '」');
        afterInstall(j.id);
      });
    }).catch(function (e) { toast('获取失败：' + e.message + '（多为跨域或地址不可达）'); });
  }
  function importJsonFile(f) {
    var rd = new FileReader();
    rd.onload = function () {
      var j;
      try { j = JSON.parse(rd.result); } catch (e) { return toast('不是合法 JSON'); }
      var c = window.AppData.checkSpec(j);
      if (!c.ok) return toast('导入失败：' + c.msg);
      if (j.albums) return toast('这是资源网站清单，请用「从 URL 导入」添加，以便后续刷新');
      var v = window.AppData.validate(j);
      if (!v.ok) return toast('校验失败：' + v.errors.join('；'));
      window.AppData.importPkg(j, { url: '' }).then(function () { toast('已导入「' + j.title + '」'); afterInstall(j.id); })
        .catch(function (e) { toast('导入失败：' + e.message); });
    };
    rd.readAsText(f);
  }
  /* zip：manifest + packages/*.json + content/** + media/**，导入幂等（同 key 覆盖写） */
  function importZipFile(f) {
    toast('读取压缩包…');
    window.LSZip.read(f).then(function (z) {
      return z.json('manifest.json').then(function (m) {
        if (!m || m.type !== 'langstu-offline-bundle') throw new Error('不是 Langstu 课程压缩包');
        var c = window.AppData.checkSpec(m);
        if (!c.ok) throw new Error(c.msg);
        var ver = {};
        (m.packages || []).forEach(function (p) { ver[p.id] = p.version || '1.0.0'; });
        /* 1) 媒体：先写媒体，保证离线可读 */
        var jobs = (m.media || []).map(function (it) {
          var name = 'media/' + it.k.replace(/:/g, '_') + it.ext;
          return z.get(name).then(function (b) {
            if (!b) return null;
            return (it.kind === 'audio' ? b.blob().catch(function () { return b; }) : b.text()).then(function (data) {
              var rec = { k: it.k, url: it.url || '', pkg: it.pkg || '', kind: it.kind || 'audio', at: Date.now() };
              if (typeof data === 'string') { rec.text = data; rec.bytes = data.length; }
              else { rec.blob = data; rec.bytes = data.size || 0; }
              return window.AppStore.putMedia(rec);
            });
          }).catch(function () { return null; });
        });
        /* 2) 课文内容 */
        jobs = jobs.concat((m.contents || []).map(function (it) {
          return z.json(it.path).then(function (c2) {
            return window.AppStore.putMedia({
              k: 'c:' + it.pkg + ':' + it.unit + ':' + (ver[it.pkg] || '1.0.0'),
              url: '', json: c2, pkg: it.pkg, kind: 'content', at: Date.now()
            });
          }).catch(function () { return null; });
        }));
        return Promise.all(jobs).then(function () {
          /* 3) 课程包本体 */
          return Promise.all((m.packages || []).map(function (p) {
            return z.json(p.entry).then(function (pkg) { return window.AppData.importPkg(pkg, { url: '' }); });
          }));
        });
      });
    }).then(function (r) {
      toast('已导入 ' + (r || []).length + ' 个课程');
      afterInstall(r && r[0] ? r[0].id : null);
    }).catch(function (e) { toast('导入失败：' + e.message); console.error(e); });
  }
  function afterInstall(id) {
    if (typeof window.renderBookSel === 'function') window.renderBookSel();
    render();
    if (id) window.AppCache.prefetch(id, { audio: false });   /* 文本后台全量预载；音频按课按需 */
    window.AppCache.requestPersist();                          /* 首次落地时申请持久化存储 */
  }

  /* ---------- 动作：导出 ---------- */
  function exportPkg(id, withAudio) {
    if (!confirm(withAudio
      ? '导出含音频的完整压缩包（体积较大，缺失的音频会先下载）。继续？'
      : '导出「仅文本」压缩包（课文 + 字幕，体积小；音频留空，播放时按需下载）。继续？')) return;
    var foot = $('#libFoot'); if (foot) foot.textContent = '准备中…';
    window.AppData.get(id).then(function (pkg) {
      var files = [], media = [], contents = [];
      var units = pkg.units || [];
      var chain = Promise.resolve();
      units.forEach(function (u) {
        chain = chain.then(function () {
          if (!(u.contentRef || u.content)) return null;
          return window.AppData.content(pkg, u).then(function (c) {
            if (!c) return null;
            var path = 'content/' + pkg.id + '/' + u.id + '.json';
            contents.push({ pkg: pkg.id, unit: u.id, path: path });
            files.push({ path: path, data: JSON.stringify(c) });
            return null;
          });
        });
      });
      units.forEach(function (u) {
        window.AppData.mediaList(pkg, u).forEach(function (m) {
          if (m.kind === 'audio' && !withAudio) return;
          chain = chain.then(function () {
            return window.AppCache.ensure(m.url, m.kind, (m.kind === 'audio' ? '音频 ' : '字幕 ') + u.index, pkg.id)
              .then(function (r) {
                if (!r || !r.m) return null;
                var ext = m.kind === 'audio' ? extOf(m.url) : '.lrc';
                var k = m.kind === 'audio' ? window.AppCache.key(m.url) : window.AppCache.key(m.url);
                var name = 'media/' + k.replace(/:/g, '_') + ext;
                media.push({ k: k, url: m.url, ext: ext, kind: m.kind, pkg: pkg.id, bytes: r.m.bytes || 0 });
                files.push({ path: name, data: (m.kind === 'audio' ? r.m.blob : r.m.text) });
                return null;
              });
          });
        });
      });
      return chain.then(function () {
        var manifest = {
          specVersion: window.AppData.SPEC, type: 'langstu-offline-bundle',
          generator: { app: 'langstu', version: window.AppData.APP }, exportedAt: new Date().toISOString(),
          packages: [{ id: pkg.id, title: pkg.title, version: pkg.version || '1.0.0', unitCount: units.length, entry: 'packages/' + pkg.id + '.json' }],
          contents: contents, media: media,
          withAudio: !!withAudio
        };
        files.push({ path: 'packages/' + pkg.id + '.json', data: JSON.stringify(pkg) });
        files.unshift({ path: 'manifest.json', data: JSON.stringify(manifest) });
        if (foot) foot.textContent = '打包中…';
        return window.LSZip.create(files, function (i, n) { if (foot) foot.textContent = '打包中 ' + i + '/' + n; })
          .then(function (blob) {
            saveBlob(blob, pkg.id + '-v' + (pkg.version || '1') + (withAudio ? '-full' : '-text') + '.langstu.zip');
            if (foot) foot.textContent = '导出完成（' + fmtB(blob.size) + '）';
            toast('已导出 ' + fmtB(blob.size));
          });
      });
    }).catch(function (e) { toast('导出失败：' + e.message); console.error(e); });
  }

  /* ---------- 动作：资源网站 ---------- */
  function addSource() {
    var url = ($('#srcUrl') || {}).value || '';
    url = url.trim();
    if (!url) return toast('请填写清单 URL');
    toast('正在获取…');
    window.AppData.addSource(url).then(function (s) {
      toast('已添加「' + s.name + '」，共 ' + (s.albums || []).length + ' 个专辑');
      render();
    }).catch(function (e) { toast('添加失败：' + e.message + errHint(e)); });
  }
  function refreshSource(id) {
    toast('正在刷新…');
    window.AppData.refreshSource(id).then(function (d) {
      render();
      toast('刷新完成：新增 ' + d.added.length + '，有更新 ' + d.updated.length + '，移除 ' + d.removed.length);
      if (d.updated.length) {
        d.updated.forEach(function (a) {
          if (confirm('专辑「' + a.title + '」有新版本 v' + a.version + '，现在更新？')) installAlbum(id, a.id);
        });
      }
    }).catch(function (e) { toast('刷新失败：' + e.message + errHint(e)); });
  }
  function delSource(id) {
    if (!confirm('移除该资源网站？已添加到本机的课程不受影响。')) return;
    window.AppData.removeSource(id).then(function () { toast('已移除'); render(); });
  }
  function installAlbum(sourceId, albumId) {
    toast('正在添加…');
    window.AppData.installAlbum(sourceId, albumId).then(function (p) {
      toast('已添加「' + p.title + '」，后台预载课文中…');
      afterInstall(p.id);
    }).catch(function (e) { toast('添加失败：' + e.message + errHint(e)); console.error(e); });
  }

  /* ---------- 动作：示例 URL / 知识 ---------- */
  function tryUrl() {
    var url = (($('#tryUrl') || {}).value || '').trim();
    var out = $('#tryOut'), act = $('#tryAct');
    if (!url) return;
    out.textContent = '请求中…'; act.innerHTML = '';
    var t0 = Date.now();
    fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var c = window.AppData.checkSpec(j);
      if (!c.ok) throw new Error(c.msg);
      probe = { url: url, json: j };
      var summary = j.albums
        ? '资源网站清单：' + (j.name || '-') + '\nspecVersion=' + j.specVersion + ' version=' + (j.version || '-') +
        '\n专辑 ' + j.albums.length + ' 个：\n' + j.albums.map(function (a) {
          return '  · ' + a.id + '  ' + a.title + '  ' + (a.unitCount || 0) + ' 课  v' + (a.version || '-');
        }).join('\n')
        : '课程包：' + (j.title || '-') + '\nid=' + j.id + ' specVersion=' + j.specVersion +
        ' version=' + (j.version || '-') + ' kind=' + j.kind + ' 单元 ' + ((j.units || []).length) + ' 个';
      out.textContent = summary + '\n\n耗时 ' + (Date.now() - t0) + ' ms';
      act.innerHTML = j.albums
        ? '<button class="nm-btn ok" data-act="do-src">＋ 添加为资源网站</button>'
        : '<button class="nm-btn ok" data-act="do-pkg">＋ 添加到我的课程</button>';
    }).catch(function (e) {
      out.textContent = '请求失败：' + e.message + '\n\n常见原因：地址不存在 / 不是 JSON / 目标未开放 CORS（需 Access-Control-Allow-Origin）。';
    });
  }
  function installProbe() {
    if (!probe) return;
    if (probe.json.albums) {
      window.AppData.addSource(probe.url).then(function () { toast('已添加资源网站'); tab = 'sources'; render(); });
    } else {
      window.AppData.importPkg(probe.json, { url: probe.url }).then(function () { toast('已添加课程'); afterInstall(probe.json.id); });
    }
  }
  function exportKnowledge() {
    var k = window.AppStore.exportKnowledge();
    saveBlob(new Blob([JSON.stringify(k)], { type: 'application/json' }), 'langstu-knowledge-' + new Date().toISOString().slice(0, 10) + '.json');
    toast('已导出我的知识');
  }
  function importKnowledge(f) {
    var rd = new FileReader();
    rd.onload = function () {
      try {
        window.AppStore.importKnowledge(JSON.parse(rd.result), 'merge');
        toast('已导入（合并）');
        if (typeof window.refreshNotesView === 'function') window.refreshNotesView();
        render();
      } catch (e) { toast('导入失败：' + e.message); }
    };
    rd.readAsText(f);
  }
  function clearKnowledge() {
    if (!confirm('清空全部笔记与生词本？此操作不可恢复，建议先导出备份。')) return;
    window.AppStore.saveNotes({});
    window.AppStore.setPref('vocab', {});
    toast('已清空');
    render();
  }

  /* ---------- 工具 ---------- */
  function extOf(url) {
    var m = String(url).split('?')[0].match(/(\.[a-z0-9]{1,5})$/i);
    return m ? m[1].toLowerCase() : '.bin';
  }
  function saveBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function copyText(t) {
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast('提示词已复制'); },
      function () { fallbackCopy(t); });
    else fallbackCopy(t);
  }
  function fallbackCopy(t) {
    var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('提示词已复制'); } catch (e) { toast('复制失败，请手动选择'); }
    ta.remove();
  }
  function downloadJSON(name, obj) {
    saveBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), name);
  }

  /* 试一试结果区的两个安装按钮 */
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-act]');
    if (!t) return;
    var a = t.getAttribute('data-act');
    if (a === 'do-src' || a === 'do-pkg') installProbe();
  });

  return {
    open: open, close: close, isOpen: isOpen, render: render, TABS: TABS,
    importFromUrl: importUrl, importJsonFile: importJsonFile, importZipFile: importZipFile
  };
})();
