/* ===== 统一存储层（扩展内复用自站点）=====
   偏好 / 进度 / 笔记 → localStorage（侧栏与弹窗同源 chrome-extension://<id>/，共享）
   用户导入的课程包    → IndexedDB（预留；扩展默认不含导入 UI） */
window.AppStore = (function () {
  var PREF = 'app.pref.';
  var K = { done: 'nce_done_v1', notes: 'nce_mynote_v1' };

  function raw(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function setRaw(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function jsget(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }

  function pref(k, d) { return jsget(PREF + k, d); }
  function setPref(k, v) { try { localStorage.setItem(PREF + k, JSON.stringify(v)); } catch (e) { } }

  function progress() {
    var s = new Set();
    (raw(K.done, '') || '').split(',').forEach(function (x) { if (x) s.add(x); });
    return s;
  }
  function saveProgress(set) { setRaw(K.done, Array.from(set).join(',')); }

  function notes() { return jsget(K.notes, {}) || {}; }
  function saveNotes(o) { try { localStorage.setItem(K.notes, JSON.stringify(o)); } catch (e) { } }

  var DB = null, DBNAME = 'nce-courses', STORE = 'packages';
  function idb() {
    return new Promise(function (res, rej) {
      if (DB) return res(DB);
      if (typeof indexedDB === 'undefined') return rej(new Error('no-idb'));
      var r = indexedDB.open(DBNAME, 1);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function () { DB = r.result; res(DB); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function store(mode) {
    return idb().then(function (db) { return db.transaction(STORE, mode).objectStore(STORE); });
  }
  function wrap(req) {
    return new Promise(function (res, rej) { req.onsuccess = function () { res(req.result); }; req.onerror = function () { rej(req.error); }; });
  }
  function putPkg(p) { return store('readwrite').then(function (s) { return wrap(s.put(p)); }); }
  function allPkgs() { return store('readonly').then(function (s) { return wrap(s.getAll()); }).catch(function () { return []; }); }
  function delPkg(id) { return store('readwrite').then(function (s) { return wrap(s['delete'](id)); }); }

  return {
    pref: pref, setPref: setPref,
    progress: progress, saveProgress: saveProgress,
    notes: notes, saveNotes: saveNotes,
    putPkg: putPkg, allPkgs: allPkgs, delPkg: delPkg,
    PREF: PREF
  };
})();
