/* ===== 统一存储层 =====
   偏好 / 进度 / 笔记 → localStorage（沿用旧 key，保证老数据不丢）
   用户导入的课程包    → IndexedDB（体积大，localStorage 放不下） */
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

  /* --- 课程包（IndexedDB） --- */
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
