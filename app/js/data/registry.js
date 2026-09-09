/* ===== 课程注册表 =====
   站点本身不含任何教材数据，数据一律经 URL 从「资源网站」加载（见 docs/data-url-spec.md）。
   数据来源只有三处，全部收敛在这里：
     1) 已安装课程  IndexedDB packages（来自资源网站 / 文件 / zip 导入 / 手动注册）
     2) 资源网站    IndexedDB sources（内置 seed: data/sources.json + 用户添加）
     3) 手动注册    AppData.register(包对象)（调试用）
   取包顺序：IndexedDB 缓存 → 远程（相对 URL 按包 base 解析 + 镜像 fallback）→ 校验 → 写回缓存。
   对外只暴露标准结构（docs/course-package-spec.md），app.js 不再碰全局变量。 */
window.AppData = (function () {
  var SPEC = '1.0';                 /* 本站支持的规范版本（MAJOR.MINOR） */
  var APP = '1.4.0';                /* 站点版本：升级后会自动刷新内置资源网站 */
  var SUPPORTED_MAJORS = [1];
  var SEED_URL = 'data/sources.json';

  var pkgIdx = [];                  /* 已安装课程索引 [{id,title,kind,unitCount,origin,version,sourceId}] */
  var srcIdx = [];                  /* 资源网站索引 */
  var pkgCache = {};                /* id -> 包对象 */
  var contentCache = {};            /* "id:unitId" -> content | null */
  var extra = {};                   /* 手动注册的包 */
  var ready = false;

  /* ---------- 小工具 ---------- */
  function majorOf(v) { return parseInt(String(v || '1').split('.')[0], 10) || 1; }
  function cmpVer(a, b) {
    var x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
    for (var i = 0; i < 3; i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  }
  /* 相对 URL → 绝对（以当前页面为基准）：存库或当作解析基准前都要先过一遍 */
  function absUrl(u) {
    if (!u) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
    try { return new URL(u, location.href).href; } catch (e) { return u; }
  }
  function resolveUrl(ref, base) {
    if (!ref) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return ref;      /* 绝对 URL（含 idb: 等内部 scheme） */
    if (!base) return ref;
    try { return new URL(ref, absUrl(base)).href; } catch (e) { return ref; }
  }
  function fetchJSON(url, ms) {
    if (typeof fetch !== 'function') return Promise.reject(err('network', '当前环境不支持 fetch'));
    var ac = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ac) ac.abort(); }, ms || 20000);
    return fetch(url, ac ? { signal: ac.signal, credentials: 'omit' } : { credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) return Promise.reject(err('http', url + ' → HTTP ' + r.status, r.status));
        return r.json().catch(function () { return Promise.reject(err('json', url + ' 返回的不是合法 JSON')); });
      })
      .catch(function (e) {
        if (e && e.__ls) return Promise.reject(e);
        return Promise.reject(err('cors', url + ' 请求失败（可能是跨域/CORS 或断网）'));
      })
      .then(function (j) { clearTimeout(timer); return j; }, function (e) { clearTimeout(timer); return Promise.reject(e); });
  }
  function err(kind, msg, status) { var e = new Error(msg); e.__ls = kind; e.status = status; return e; }
  /* 依次尝试主 URL + 镜像；返回 {url, data}，url 是**实际成功**的那个（相对路径要以它为基准解析） */
  function fetchFirst(urls, ms) {
    var list = (urls || []).filter(Boolean);
    var i = 0;
    function next() {
      if (i >= list.length) return Promise.reject(err('network', '全部地址都不可用'));
      var u = list[i++];
      return fetchJSON(u, ms).then(function (j) { return { url: absUrl(u), data: j }; },
        function (e) { if (i >= list.length) return Promise.reject(e); return next(); });
    }
    return next();
  }

  /* ---------- 规范校验：版本不兼容直接拒绝 ---------- */
  function checkSpec(o) {
    if (!o || typeof o !== 'object') return { ok: false, msg: '不是合法的 JSON 对象' };
    var sv = o.specVersion != null ? String(o.specVersion) : '1.0';
    if (SUPPORTED_MAJORS.indexOf(majorOf(sv)) < 0) {
      return { ok: false, msg: '数据规范 v' + sv + ' 不受支持（本站支持 v' + SPEC + '），请升级站点或换用兼容版本的数据' };
    }
    if (o.minAppVersion && cmpVer(o.minAppVersion, APP) > 0) {
      return { ok: false, msg: '该数据要求站点版本 ≥ ' + o.minAppVersion + '（当前 ' + APP + '），请先升级站点' };
    }
    return { ok: true };
  }

  /* ---------- 课程包结构校验：缺字段只警告，不阻断（渐进补齐） ---------- */
  function validate(p) {
    var errs = [], warns = [];
    if (!p || typeof p !== 'object') return { ok: false, errors: ['不是合法的 JSON 对象'], warnings: [] };
    if (p.schemaVersion !== 1) warns.push('schemaVersion 不是 1（当前 ' + p.schemaVersion + '），按 1 解析');
    if (!p.id || !/^[a-z0-9][a-z0-9_-]*$/i.test(p.id)) errs.push('id 缺失或非法（只允许字母数字 - _）');
    if (!p.title) errs.push('title 缺失');
    if (p.kind !== 'series' && p.kind !== 'single') errs.push('kind 必须是 "series" 或 "single"');
    var units = p.units || [];
    if (!units.length && !p.content) errs.push('既没有 units 也没有 content');
    units.forEach(function (u, i) {
      if (!u.id) errs.push('units[' + i + '].id 缺失');
      if (!u.title) warns.push('units[' + i + '].title 缺失');
      if (u.audio && !Array.isArray(u.audio)) errs.push('units[' + i + '].audio 必须是数组');
    });
    var ids = {};
    units.forEach(function (u) { if (ids[u.id]) errs.push('units.id 重复：' + u.id); ids[u.id] = 1; });
    return { ok: !errs.length, errors: errs, warnings: warns };
  }

  /* ---------- 归一：补齐默认值 ---------- */
  function normalize(p) {
    p.lang = p.lang || { from: 'en', to: 'zh' };
    p.groups = p.groups || [];
    p.media = p.media || {};
    var units = (p.units || []).slice();
    if (!units.length && p.content) {
      units = [{ id: (p.content.unitId || 'u1'), index: 1, title: p.title, content: p.content }];
    }
    units.forEach(function (u, i) {
      u.index = u.index || (i + 1);
      u.lessons = u.lessons || [];
      u.audio = u.audio || [];
      if (!u.lessonLabel) {
        u.lessonLabel = u.lessons.length > 1
          ? ('Lesson ' + u.lessons.join(' & '))
          : (u.lessons.length === 1 ? ('Lesson ' + u.lessons[0]) : '');
      }
      if (!u.content && !u.contentRef) u.contentRef = 'content/' + p.id + '/' + u.id + '.json';
    });
    p.units = units;
    p.version = p.version || '0.0.0';
    return p;
  }
  function entry(p, meta) {
    return {
      id: p.id, title: p.title, kind: p.kind, subtitle: p.subtitle || '',
      unitCount: (p.units || []).length, level: p.level || '', tags: p.tags || [],
      version: p.version || '0.0.0', origin: (meta && meta.origin) || 'user',
      sourceId: (meta && meta.sourceId) || '', srcUrl: (meta && meta.url) || '',
      installedAt: (meta && meta.installedAt) || 0, updatedAt: (meta && meta.updatedAt) || 0
    };
  }

  /* ---------- 启动 ---------- */
  function init() {
    if (ready) return Promise.resolve(list());
    return seedSources()
      .then(function () { return window.AppStore.allSources(); })
      .then(function (rows) { srcIdx = rows || []; })
      .then(function () { return window.AppStore.allPkgs(); })
      .then(function (rows) {
        pkgIdx = (rows || []).map(function (p) { return entry(p, p.__src); });
        ready = true;
        return list();
      });
  }
  /* 本地预览时可用的候选地址（仓库内 data/courses），放在主 URL 之前，避免先撞 CDN 的 404。
     从「仓库根」起服务（python3 -m http.server → 访问 /app/）时生效。 */
  function localCandidates() {
    try {
      var h = location.hostname || '';
      if (location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '0.0.0.0') {
        return ['../data/courses/index.json', 'data/courses/index.json'];
      }
    } catch (e) { }
    return [];
  }
  /* 内置资源网站（只有 URL，不含教材）：首次运行写入 IDB；已存在则只更新 URL/名称，不清空已装课程 */
  function seedSources() {
    if (typeof fetch !== 'function') return Promise.resolve();
    return fetchJSON(SEED_URL, 8000).catch(function () { return null; }).then(function (j) {
      var seeds = (j && j.sources) || [];
      return Promise.all(seeds.map(function (s) {
        return window.AppStore.allSources().then(function (rows) {
          var old = (rows || []).filter(function (x) { return x.id === s.id; })[0];
          /* 本地预览时把仓库内数据排在最前（本地 → 用户镜像 → CDN），避免先吃 CDN 的 404 */
          var loc = localCandidates();
          var manifest = loc.length ? loc[0] : s.manifest;
          var mirrors = loc.slice(1).concat(s.manifestMirrors || [], [s.manifest]);
          if (old) {
            old.manifest = manifest; old.name = s.name || old.name; old.homepage = s.homepage || old.homepage;
            old.manifestMirrors = mirrors; old.baseMirrors = s.baseMirrors || [];
            return window.AppStore.putSource(old);
          }
          return window.AppStore.putSource({
            id: s.id, name: s.name || s.id, homepage: s.homepage || '', license: s.license || '',
            manifest: manifest, manifestMirrors: mirrors, baseMirrors: s.baseMirrors || [],
            builtin: true, enabled: s.enabled !== false, autoInstall: !!s.autoInstall,
            addedAt: Date.now(), updatedAt: 0, albums: []
          });
        });
      }));
    });
  }

  /* ---------- 列表 ---------- */
  function list() {
    var out = [], seen = {};
    pkgIdx.forEach(function (e) { if (e.id && !seen[e.id]) { seen[e.id] = 1; out.push(e); } });
    Object.keys(extra).forEach(function (k) {
      var p = normalize(extra[k]);
      if (!seen[p.id]) { seen[p.id] = 1; out.push(entry(p, { origin: 'extra' })); }
    });
    return out;
  }
  function sources() { return srcIdx.slice(); }

  /* ---------- 取包：缓存优先，否则远程 ---------- */
  function get(id) {
    if (pkgCache[id]) return Promise.resolve(pkgCache[id]);
    if (extra[id]) { pkgCache[id] = normalize(extra[id]); return Promise.resolve(pkgCache[id]); }
    return window.AppStore.getPkg(id).then(function (p) {
      if (p) return install(p);
      var meta = pkgIdx.filter(function (x) { return x.id === id; })[0];
      if (meta && meta.srcUrl) return fetchPkg(meta.srcUrl, meta.mirrors || []).then(install);
      throw new Error('课程不存在且没有可用的下载地址：' + id);
    });
  }
  function install(p) {
    normalize(p);
    pkgCache[p.id] = p;
    return p;
  }
  function fetchPkg(url, mirrors) {
    return fetchFirst([url].concat(mirrors || [])).then(function (r) {
      var j = r.data, c = checkSpec(j);
      if (!c.ok) throw new Error(c.msg);
      var v = validate(j);
      if (!v.ok) throw new Error(v.errors.join('；'));
      j.__src = j.__src || {};
      j.__base = r.url;      /* 实际取到的地址：包内相对路径按它解析 */
      return j;
    });
  }

  /* ---------- 教材内容：缓存 → 远程（相对包 base 解析） ---------- */
  function content(pkg, unit) {
    var key = pkg.id + ':' + unit.id;
    if (contentCache[key] !== undefined) return Promise.resolve(contentCache[key]);
    if (unit.content) { contentCache[key] = unit.content; return Promise.resolve(unit.content); }
    if (!unit.contentRef) { contentCache[key] = null; return Promise.resolve(null); }
    var ck = 'c:' + pkg.id + ':' + unit.id + ':' + (pkg.version || '0');   /* 版本变了缓存自动失效 */
    var url = resolveUrl(unit.contentRef, pkg.__base || '');
    return window.AppStore.getMedia(ck).then(function (m) {
      if (m && m.json) { contentCache[key] = m.json; return m.json; }
      if (!url) { contentCache[key] = null; return null; }
      return fetchJSON(url).then(function (c) {
        contentCache[key] = c || null;
        return window.AppStore.putMedia({ k: ck, url: url, json: c, pkg: pkg.id, kind: 'content', at: Date.now() })
          .then(function () { return c; }, function () { return c; });
      }, function () { contentCache[key] = null; return null; });
    });
  }

  /* ---------- 资源网站：添加 / 刷新 / 删除 ---------- */
  function addSource(url) {
    return fetchJSON(url).then(function (j) {
      var c = checkSpec(j);
      if (!c.ok) throw new Error(c.msg);
      if (j.albums) return addSiteManifest(url, j);
      /* 直接给的是课程包 URL：包成一个「单专辑站点」 */
      var v = validate(j);
      if (!v.ok) throw new Error(v.errors.join('；'));
      return addSiteManifest(url, {
        specVersion: j.specVersion || SPEC, type: 'source-site',
        id: 'site-' + (j.id || Date.now()), name: j.title || '单个课程', homepage: url,
        version: j.version || '0.0.0', albums: [{
          id: j.id, title: j.title, level: j.level, unitCount: (j.units || []).length,
          version: j.version || '0.0.0', url: ''
        }], __inline: j, __inlineUrl: url
      });
    });
  }
  function addSiteManifest(url, m) {
    var s = {
      id: m.id || ('site-' + Date.now()), name: m.name || m.id || '未命名数据源',
      homepage: m.homepage || '', license: m.license || '',
      manifest: url, manifestMirrors: [], baseMirrors: m.baseMirrors || [],
      version: m.version || '0.0.0', updatedAt: Date.now(), addedAt: Date.now(),
      albums: (m.albums || []).map(function (a) {
        return {
          id: a.id, title: a.title, subtitle: a.subtitle || '', kind: a.kind || 'series',
          level: a.level || '', tags: a.tags || [], unitCount: a.unitCount || 0,
          version: a.version || m.version || '0.0.0', url: a.url || '', mirrors: a.mirrors || [],
          bytes: a.bytes || null
        };
      }),
      builtin: false, enabled: true
    };
    /* 幂等：同 id 覆盖（保留 addedAt 与已装状态） */
    return window.AppStore.allSources().then(function (rows) {
      var old = (rows || []).filter(function (x) { return x.id === s.id; })[0];
      if (old) { s.addedAt = old.addedAt || s.addedAt; s.builtin = old.builtin; s.enabled = old.enabled !== false; }
      return window.AppStore.putSource(s);
    }).then(function () { srcIdx = srcIdx.filter(function (x) { return x.id !== s.id; }).concat(s); return s; });
  }
  function refreshSource(id, opt) {
    var s = srcIdx.filter(function (x) { return x.id === id; })[0];
    if (!s) return Promise.reject(new Error('资源网站不存在：' + id));
    var urls = [s.manifest].concat(s.manifestMirrors || []);
    return fetchFirst(urls).then(function (r) {
      var j = r.data, c = checkSpec(j);
      if (!c.ok) throw new Error(c.msg);
      var base = r.url;      /* 镜像命中时用镜像地址，保证专辑相对路径可解析 */
      var albums = (j.albums || []).map(function (a) {
        return {
          id: a.id, title: a.title, subtitle: a.subtitle || '', kind: a.kind || 'series',
          level: a.level || '', tags: a.tags || [], unitCount: a.unitCount || 0,
          version: a.version || j.version || '0.0.0', url: a.url || '', mirrors: a.mirrors || [],
          bytes: a.bytes || null
        };
      });
      /* 清单本身就是课程包（没有 albums）：保持成一个单专辑站点，否则刷新后专辑会消失 */
      if (!j.albums && (j.units || j.content)) {
        albums = [{
          id: j.id, title: j.title || s.name, kind: j.kind || 'series', level: j.level || '',
          unitCount: (j.units || []).length, version: j.version || '0.0.0', url: '', mirrors: [], bytes: null
        }];
      }
      var diff = { added: [], updated: [], same: [], removed: [] };
      var oldMap = {}; (s.albums || []).forEach(function (a) { oldMap[a.id] = a; });
      albums.forEach(function (a) {
        var o = oldMap[a.id];
        if (!o) diff.added.push(a);
        else if (cmpVer(a.version, o.version || '0') > 0) diff.updated.push(a);
        else diff.same.push(a);
        delete oldMap[a.id];
      });
      Object.keys(oldMap).forEach(function (k) { diff.removed.push(oldMap[k]); });
      s.albums = albums; s.version = j.version || s.version; s.updatedAt = Date.now();
      s.baseMirrors = j.baseMirrors || s.baseMirrors;
      s._base = base;
      return window.AppStore.putSource(s).then(function () { return diff; });
    });
  }
  function removeSource(id) {
    srcIdx = srcIdx.filter(function (x) { return x.id !== id; });
    return window.AppStore.delSource(id).catch(function () { });
  }
  function albumsOf(sourceId) {
    var s = srcIdx.filter(function (x) { return x.id === sourceId; })[0];
    return s ? s.albums || [] : [];
  }

  /* ---------- 安装 / 更新课程（幂等：同 id 覆盖写） ---------- */
  function albumUrls(s, a) {
    var base = s._base || s.manifest;
    /* url 为空 = 清单本身就是课程包（单专辑站点） */
    var main = a.url ? resolveUrl(a.url, base) : base;
    var mirrors = (a.mirrors || []).slice();
    (s.baseMirrors || []).forEach(function (b) { mirrors.push(resolveUrl(a.url, b)); });
    return { url: main, mirrors: mirrors };
  }
  function installAlbum(sourceId, albumId, opt) {
    var s = srcIdx.filter(function (x) { return x.id === sourceId; })[0];
    if (!s) return Promise.reject(new Error('资源网站不存在：' + sourceId));
    var a = (s.albums || []).filter(function (x) { return x.id === albumId; })[0];
    if (!a) return Promise.reject(new Error('专辑不存在：' + albumId));
    var u = albumUrls(s, a);
    return fetchPkg(u.url, u.mirrors).then(function (p) {
      return savePkg(p, { sourceId: sourceId, url: u.url, mirrors: u.mirrors, version: a.version });
    });
  }
  function savePkg(p, meta) {
    var now = Date.now();
    var oldMeta = pkgIdx.filter(function (x) { return x.id === p.id; })[0];
    p.__src = {
      sourceId: meta.sourceId || '', url: meta.url || '', mirrors: meta.mirrors || [],
      version: meta.version || p.version || '0.0.0',
      installedAt: (oldMeta && oldMeta.installedAt) || now, updatedAt: now
    };
    p.version = p.__src.version;
    p.__base = meta.url || p.__base || '';
    normalize(p);
    return window.AppStore.putPkg(p).then(function () {
      delete extra[p.id];
      pkgCache[p.id] = p;
      contentCache = {};                 /* 版本可能变化：清内存内容缓存（磁盘缓存按 version 分 key，自动失效） */
      pkgIdx = pkgIdx.filter(function (x) { return x.id !== p.id; }).concat(entry(p, p.__src));
      window.AppData._onChange && window.AppData._onChange();
      return p;
    });
  }
  /* 文件 / zip 导入：与远程走同一条落库路径，保证幂等 */
  function importPkg(p, meta) {
    var c = checkSpec(p);
    if (!c.ok) throw new Error(c.msg);
    var v = validate(p);
    if (!v.ok) throw new Error(v.errors.join('；'));
    return savePkg(p, meta || {});
  }
  function register(p) {
    var v = validate(p);
    if (!v.ok) throw new Error(v.errors.join('；'));
    normalize(p);
    extra[p.id] = p;
    pkgIdx = pkgIdx.filter(function (x) { return x.id !== p.id; });
    return p.id;
  }
  function remove(id) {
    delete pkgCache[id]; delete extra[id];
    pkgIdx = pkgIdx.filter(function (x) { return x.id !== id; });
    contentCache = {};
    window.AppData._onChange && window.AppData._onChange();
    return window.AppStore.delPkg(id).catch(function () { });
  }
  /* 检查全部已装课程是否有新版本（返回 [{id,from,to,url,mirrors}]） */
  function checkUpdates() {
    var jobs = pkgIdx.filter(function (x) { return x.srcUrl; }).map(function (x) {
      var s = srcIdx.filter(function (y) { return y.id === x.sourceId; })[0];
      var a = s ? (s.albums || []).filter(function (y) { return y.id === x.id; })[0] : null;
      if (!a) return Promise.resolve(null);
      if (cmpVer(a.version, x.version || '0') <= 0) return Promise.resolve(null);
      return Promise.resolve({ id: x.id, from: x.version, to: a.version, title: a.title || x.title, sourceId: x.sourceId });
    });
    return Promise.all(jobs).then(function (r) { return r.filter(Boolean); });
  }
  /* 站点升级后：自动刷新内置资源网站（保证官方数据跟着更新） */
  function autoRefreshBuiltin() {
    return window.AppStore.getMeta('app.version', '').then(function (v) {
      var builtin = srcIdx.filter(function (s) { return s.builtin; });
      if (v === APP || !builtin.length) return window.AppStore.setMeta('app.version', APP).then(function () { return []; });
      return Promise.all(builtin.map(function (s) {
        return refreshSource(s.id).catch(function (e) { return { error: e.message }; });
      })).then(function (r) { return window.AppStore.setMeta('app.version', APP).then(function () { return r; }); });
    });
  }

  /* ---------- 取值小工具 ---------- */
  function audioOf(unit, variant) {
    var a = unit.audio || [];
    if (!a.length) return null;
    if (variant) { var m = a.filter(function (x) { return x.variant === variant; })[0]; if (m) return m; }
    return a[0];
  }
  function hasVariant(unit, variant) { return (unit.audio || []).some(function (x) { return x.variant === variant; }); }
  function lessonNums(unit) { return unit.lessons && unit.lessons.length ? unit.lessons : [unit.index]; }
  /* 单元的媒体清单（供缓存引擎使用）：[{kind:'audio'|'lrc', url}] */
  function mediaList(pkg, unit) {
    var out = [], base = pkg.__base || '';
    (unit.audio || []).forEach(function (a) {
      if (a.url) out.push({ kind: 'audio', url: resolveUrl(a.url, base), variant: a.variant || 'new' });
      if (a.lrc) out.push({ kind: 'lrc', url: resolveUrl(a.lrc, base), variant: a.variant || 'new' });
    });
    return out;
  }
  function contentUrl(pkg, unit) {
    if (unit.content) return '';
    return unit.contentRef ? resolveUrl(unit.contentRef, pkg.__base || '') : '';
  }

  return {
    init: init, list: list, get: get, content: content,
    validate: validate, checkSpec: checkSpec, register: register, importPkg: importPkg, remove: remove,
    audioOf: audioOf, hasVariant: hasVariant, lessonNums: lessonNums,
    sources: sources, addSource: addSource, refreshSource: refreshSource, removeSource: removeSource,
    albumsOf: albumsOf, installAlbum: installAlbum, checkUpdates: checkUpdates, autoRefreshBuiltin: autoRefreshBuiltin,
    mediaList: mediaList, contentUrl: contentUrl, resolveUrl: resolveUrl,
    SPEC: SPEC, APP: APP, _onChange: null
  };
})();
