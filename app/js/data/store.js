/* ===== 统一存储层 =====
   localStorage：偏好 / 学习进度 / 我的笔记 / 生词本（沿用旧 key，老数据不丢）
   IndexedDB  ：课程包 packages / 媒体缓存 media / 资源网站 sources / 元数据 meta
   库名 langstu（v1）。旧库 nce-courses(v1) 首次打开时自动迁移 packages。 */
window.AppStore = (function () {
  var PREF = 'app.pref.';
  /* 旧 key 映射：升级后用户已有数据继续可用 */
  var K = { done: 'nce_done_v1', notes: 'nce_mynote_v1' };

  function raw(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function setRaw(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function jsget(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }

  /* --- 通用偏好 --- */
  function pref(k, d) { return jsget(PREF + k, d); }
  function setPref(k, v) { try { localStorage.setItem(PREF + k, JSON.stringify(v)); } catch (e) { } }

  /* --- 学习进度：Set<"包id:单元id"> --- */
  function progress() {
    var s = new Set();
    (raw(K.done, '') || '').split(',').forEach(function (x) { if (x) s.add(x); });
    return s;
  }
  function saveProgress(set) { setRaw(K.done, Array.from(set).join(',')); }

  /* --- 我的笔记：{ "包id:单元id": 文本 } --- */
  function notes() { return jsget(K.notes, {}) || {}; }
  function saveNotes(o) { try { localStorage.setItem(K.notes, JSON.stringify(o)); } catch (e) { } }

  /* ===== IndexedDB ===== */
  var DB = null, DBNAME = 'langstu', DBVER = 1;
  var S_PKG = 'packages', S_MEDIA = 'media', S_SRC = 'sources', S_META = 'meta';
  var OLD_DB = 'nce-courses';

  function openDB(name, ver, upgrade) {
    return new Promise(function (res, rej) {
      if (typeof indexedDB === 'undefined') return rej(new Error('no-idb'));
      var r = indexedDB.open(name, ver);
      if (upgrade) r.onupgradeneeded = function (e) { upgrade(r.result, e); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('idb-blocked')); };
    });
  }
  function idb() {
    if (DB) return Promise.resolve(DB);
    return openDB(DBNAME, DBVER, function (db) {
      if (!db.objectStoreNames.contains(S_PKG)) db.createObjectStore(S_PKG, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(S_MEDIA)) {
        var os = db.createObjectStore(S_MEDIA, { keyPath: 'k' });
        /* 复合索引：按「包 + 类型」计数（只走索引，不加载 Blob） */
        os.createIndex('pkg_kind', ['pkg', 'kind'], { unique: false });
      }
      if (!db.objectStoreNames.contains(S_SRC)) db.createObjectStore(S_SRC, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(S_META)) db.createObjectStore(S_META, { keyPath: 'k' });
    }).then(function (db) { DB = db; return migrateOld(db); }).then(function () { return DB; });
  }
  /* 旧库（nce-courses/packages）→ 新库 packages，只跑一次 */
  function migrateOld(db) {
    return getMeta('migrated.oldCourses').then(function (done) {
      if (done) return;
      return openDB(OLD_DB, 1).then(function (old) {
        return new Promise(function (res) {
          try {
            var tx = old.transaction('packages', 'readonly');
            var rq = tx.objectStore('packages').getAll();
            rq.onsuccess = function () { res(rq.result || []); };
            rq.onerror = function () { res([]); };
          } catch (e) { res([]); }
        });
      }).catch(function () { return []; }).then(function (rows) {
        if (!rows.length) return setMeta('migrated.oldCourses', 1);
        var tx = db.transaction(S_PKG, 'readwrite'), st = tx.objectStore(S_PKG);
        rows.forEach(function (p) { if (p && p.id) st.put(p); });
        return new Promise(function (res) { tx.oncomplete = res; tx.onerror = res; })
          .then(function () { return setMeta('migrated.oldCourses', rows.length); });
      });
    }).catch(function () { });
  }
  function store(name, mode) {
    return idb().then(function (db) { return db.transaction(name, mode).objectStore(name); });
  }
  function wrap(req) {
    return new Promise(function (res, rej) { req.onsuccess = function () { res(req.result); }; req.onerror = function () { rej(req.error); }; });
  }
  function txDone(tx) { return new Promise(function (res, rej) { tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); }; tx.onabort = function () { rej(tx.error); }; }); }

  /* --- 课程包 --- */
  function putPkg(p) { return store(S_PKG, 'readwrite').then(function (s) { return wrap(s.put(p)); }); }
  function getPkg(id) { return store(S_PKG, 'readonly').then(function (s) { return wrap(s.get(id)); }).catch(function () { return null; }); }
  function allPkgs() { return store(S_PKG, 'readonly').then(function (s) { return wrap(s.getAll()); }).catch(function () { return []; }); }
  function delPkg(id) { return store(S_PKG, 'readwrite').then(function (s) { return wrap(s['delete'](id)); }); }

  /* --- 媒体缓存：{k,url,blob,type,bytes,at} k=媒体 key --- */
  function putMedia(m) { return store(S_MEDIA, 'readwrite').then(function (s) { return wrap(s.put(m)); }); }
  function getMedia(k) { return store(S_MEDIA, 'readonly').then(function (s) { return wrap(s.get(k)); }).catch(function () { return null; }); }
  function getMedias(ks) {
    return store(S_MEDIA, 'readonly').then(function (s) {
      return Promise.all((ks || []).map(function (k) { return wrap(s.get(k)).catch(function () { return null; }); }));
    }).catch(function () { return []; });
  }
  function allMedia() { return store(S_MEDIA, 'readonly').then(function (s) { return wrap(s.getAll()); }).catch(function () { return []; }); }
  function delMedia(k) { return store(S_MEDIA, 'readwrite').then(function (s) { return wrap(s['delete'](k)); }); }
  function clearMedia() { return store(S_MEDIA, 'readwrite').then(function (s) { return wrap(s.clear()); }); }
  /* 已缓存数量：只查索引，不把 Blob 读进内存（kind: content | lrc | audio） */
  function countMedia(pkgId, kind) {
    return store(S_MEDIA, 'readonly').then(function (s) {
      if (!s.indexNames || !s.indexNames.contains('pkg_kind')) return 0;
      var range = kind ? IDBKeyRange.only([pkgId, kind]) : IDBKeyRange.bound([pkgId, ''], [pkgId, '￿']);
      return wrap(s.index('pkg_kind').count(range));
    }).catch(function () { return 0; });
  }

  /* --- 资源网站 --- */
  function putSource(s) { return store(S_SRC, 'readwrite').then(function (s2) { return wrap(s2.put(s)); }); }
  function allSources() { return store(S_SRC, 'readonly').then(function (s) { return wrap(s.getAll()); }).catch(function () { return []; }); }
  function delSource(id) { return store(S_SRC, 'readwrite').then(function (s) { return wrap(s['delete'](id)); }); }

  /* --- 元数据 --- */
  function getMeta(k, d) {
    return store(S_META, 'readonly').then(function (s) { return wrap(s.get(k)); })
      .then(function (r) { return r && r.v !== undefined ? r.v : d; }).catch(function () { return d; });
  }
  function setMeta(k, v) { return store(S_META, 'readwrite').then(function (s) { return wrap(s.put({ k: k, v: v })); }); }

  /* --- 配额 --- */
  function estimate() {
    if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
    return Promise.resolve(null);
  }
  function persist() {
    if (navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(function () { return false; });
    return Promise.resolve(false);
  }

  /* ===== 我的知识：导出 / 导入（笔记 + 生词 + 进度 + 偏好）===== */
  function exportKnowledge() {
    return {
      specVersion: '1.0', type: 'langstu-knowledge', exportedAt: new Date().toISOString(),
      progress: Array.from(progress()), notes: notes(), vocab: pref('vocab', {}),
      prefs: (function () {
        var o = {};
        try {
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(PREF) === 0 && k !== PREF + 'vocab') o[k.slice(PREF.length)] = JSON.parse(localStorage.getItem(k));
          }
        } catch (e) { }
        return o;
      })()
    };
  }
  /* mode: 'merge'（默认，按 key 合并，同 key 以导入为准）| 'replace'（清空后写入） */
  function importKnowledge(obj, mode) {
    if (!obj || typeof obj !== 'object') throw new Error('不是合法的知识文件');
    if (obj.type && obj.type !== 'langstu-knowledge') throw new Error('文件类型不对：' + obj.type);
    if (mode === 'replace') {
      saveProgress(new Set(obj.progress || []));
      saveNotes(obj.notes || {});
      setPref('vocab', obj.vocab || {});
    } else {
      var d = progress(); (obj.progress || []).forEach(function (x) { d.add(x); }); saveProgress(d);
      var n = notes(), nn = obj.notes || {}; Object.keys(nn).forEach(function (k) { n[k] = nn[k]; }); saveNotes(n);
      var v = pref('vocab', {}), vv = obj.vocab || {}; Object.keys(vv).forEach(function (k) { v[k] = vv[k]; }); setPref('vocab', v);
    }
    var p = obj.prefs || {};
    Object.keys(p).forEach(function (k) { if (k !== 'vocab') setPref(k, p[k]); });
    return true;
  }

  return {
    pref: pref, setPref: setPref,
    progress: progress, saveProgress: saveProgress,
    notes: notes, saveNotes: saveNotes,
    putPkg: putPkg, getPkg: getPkg, allPkgs: allPkgs, delPkg: delPkg,
    putMedia: putMedia, getMedia: getMedia, getMedias: getMedias, allMedia: allMedia, delMedia: delMedia, clearMedia: clearMedia,
    countMedia: countMedia,
    putSource: putSource, allSources: allSources, delSource: delSource,
    getMeta: getMeta, setMeta: setMeta,
    estimate: estimate, persist: persist,
    exportKnowledge: exportKnowledge, importKnowledge: importKnowledge,
    PREF: PREF
  };
})();
