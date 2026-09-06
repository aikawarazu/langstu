/* ===== 课程注册表（扩展内适配版）=====
   与站点 js/data/registry.js 同构，但所有 bundled 资源走 chrome.runtime.getURL，
   这样侧栏页面（来源 chrome-extension://<id>/）能正确加载 data/courses/*。 */
window.AppData = (function () {
  function asset(p) { return chrome.runtime.getURL(p); }

  var INDEX_URL = asset('data/courses/index.json');
  var presets = [];
  var userPkgs = [];
  var pkgCache = {};
  var contentCache = {};
  var extra = {};
  var ready = false;

  function fetchJSON(url) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('no-fetch'));
    return fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(url + ' ' + r.status)); });
  }

  function validate(p) {
    var errs = [], warns = [];
    if (!p || typeof p !== 'object') return { ok: false, errors: ['不是合法的 JSON 对象'], warnings: [] };
    if (p.schemaVersion !== 1) warns.push('schemaVersion 不是 1，按 1 解析');
    if (!p.id || !/^[a-z0-9][a-z0-9_-]*$/i.test(p.id)) errs.push('id 缺失或非法');
    if (!p.title) errs.push('title 缺失');
    if (p.kind !== 'series' && p.kind !== 'single') errs.push('kind 必须是 "series" 或 "single"');
    var units = p.units || [];
    if (!units.length && !p.content) errs.push('既没有 units 也没有 content');
    units.forEach(function (u, i) {
      if (!u.id) errs.push('units[' + i + '].id 缺失');
      if (u.audio && !Array.isArray(u.audio)) errs.push('units[' + i + '].audio 必须是数组');
    });
    return { ok: !errs.length, errors: errs, warnings: warns };
  }

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
      if (!u.contentRef && !u.content) u.contentRef = 'data/courses/content/' + p.id + '/' + u.id + '.json';
    });
    p.units = units;
    return p;
  }

  function entry(p, origin) {
    return {
      id: p.id, title: p.title, kind: p.kind, subtitle: p.subtitle || '',
      unitCount: (p.units || []).length, origin: origin,
      level: p.level || '', tags: p.tags || []
    };
  }
  function indexOfUser(p) { return entry(normalize(p), 'user'); }

  function init() {
    if (ready) return Promise.resolve(list());
    return fetchJSON(INDEX_URL)
      .then(function (idx) {
        presets = (idx.packages || idx || []).map(function (m) {
          return {
            id: m.id, title: m.title, kind: m.kind || 'series', subtitle: m.subtitle || '',
            unitCount: m.unitCount || 0, origin: 'preset', level: m.level || '', tags: m.tags || []
          };
        });
      })
      .catch(function () { presets = []; })
      .then(function () { return window.AppStore.allPkgs(); })
      .then(function (ps) {
        userPkgs = (ps || []).map(indexOfUser);
        ready = true;
        return list();
      });
  }
  function list() {
    var all = presets.concat(userPkgs, Object.keys(extra).map(function (k) { return entry(normalize(extra[k]), 'extra'); }));
    var seen = {}, out = [];
    all.forEach(function (e) { if (e.id && !seen[e.id]) { seen[e.id] = 1; out.push(e); } });
    return out;
  }

  function get(id) {
    if (pkgCache[id]) return Promise.resolve(pkgCache[id]);
    if (extra[id]) { pkgCache[id] = normalize(extra[id]); return Promise.resolve(pkgCache[id]); }
    var isUser = userPkgs.some(function (u) { return u.id === id; });
    if (isUser) {
      return window.AppStore.allPkgs().then(function (ps) {
        var p = (ps || []).filter(function (x) { return x.id === id; })[0];
        if (!p) throw new Error('包不存在：' + id);
        pkgCache[id] = normalize(p);
        return pkgCache[id];
      });
    }
    return fetchJSON(asset('data/courses/' + id + '.json')).then(function (p) {
      pkgCache[id] = normalize(p);
      return pkgCache[id];
    });
  }

  function content(pkg, unit) {
    var key = pkg.id + ':' + unit.id;
    if (contentCache[key] !== undefined) return Promise.resolve(contentCache[key]);
    if (unit.content) { contentCache[key] = unit.content; return Promise.resolve(unit.content); }
    if (!unit.contentRef) { contentCache[key] = null; return Promise.resolve(null); }
    return fetchJSON(asset(unit.contentRef)).then(function (c) { contentCache[key] = c || null; return c || null; },
      function () { contentCache[key] = null; return null; });
  }

  function register(p) {
    var v = validate(p);
    if (!v.ok) throw new Error(v.errors.join('；'));
    normalize(p);
    extra[p.id] = p;
    return p.id;
  }
  function importPkg(p) {
    var v = validate(p);
    if (!v.ok) throw new Error(v.errors.join('；'));
    normalize(p);
    return window.AppStore.putPkg(p).then(function () {
      delete extra[p.id];
      userPkgs = userPkgs.filter(function (u) { return u.id !== p.id; });
      userPkgs.push(indexOfUser(p));
      pkgCache[p.id] = p;
      return p.id;
    });
  }
  function remove(id) {
    delete pkgCache[id]; delete extra[id];
    userPkgs = userPkgs.filter(function (u) { return u.id !== id; });
    return window.AppStore.delPkg(id).catch(function () { });
  }

  function audioOf(unit, variant) {
    var a = unit.audio || [];
    if (!a.length) return null;
    if (variant) { var m = a.filter(function (x) { return x.variant === variant; })[0]; if (m) return m; }
    return a[0];
  }
  function hasVariant(unit, variant) { return (unit.audio || []).some(function (x) { return x.variant === variant; }); }
  function lessonNums(unit) { return unit.lessons && unit.lessons.length ? unit.lessons : [unit.index]; }

  return {
    init: init, list: list, get: get, content: content,
    validate: validate, register: register, importPkg: importPkg, remove: remove,
    audioOf: audioOf, hasVariant: hasVariant, lessonNums: lessonNums
  };
})();
