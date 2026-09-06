/* ===== LRC 解析（复用自站点 app.js）=====
   解析 [mm:ss.xx]英文 | 中文 行，并按课文 Lesson 标记切分到连续字幕。 */
window.LrcUtil = (function () {
  function parseLrc(text) {
    var seq = [], cur = null;
    text.split(/\r?\n/).forEach(function (raw) {
      raw = raw.trim(); if (!raw) return;
      var m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/); if (!m) return;
      var t = +m[1] * 60 + +m[2], b = m[3].split('|');
      var en = (b[0] || '').trim(), zh = (b[1] || '').trim();
      if (/^lesson\s*\d+$/i.test(en) || /^第\s*\d+\s*课$/.test(zh)) {
        cur = parseInt(en.replace(/\D/g, ''), 10) || parseInt(zh.replace(/\D/g, ''), 10);
        seq.push({ mk: cur, t: t }); return;
      }
      if (en) seq.push({ t: t, en: en, zh: zh });
    });
    var by = {}, rowsAll = [], mk = null, noMarker = true;
    seq.forEach(function (r) {
      if (r.mk) { mk = r.mk; noMarker = false; by[mk] = by[mk] || { lines: [] }; return; }
      rowsAll.push(r); by[mk] = (by[mk] || { lines: [] });
      by[mk].lines.push(r);
    });
    return { by: by, rowsAll: rowsAll, noMarker: noMarker };
  }
  /* 把单元内各课句子合并成连续字幕；返回 {seg, divs} */
  function buildSeg(lessonNums, parsed) {
    var out = [], divs = [];
    if (parsed.noMarker) {
      parsed.rowsAll.forEach(function (r) { out.push(r); });
      return { seg: out, divs: [] };
    }
    lessonNums.forEach(function (k) {
      var L = parsed.by[k]; if (!L) return;
      if (out.length) divs.push({ at: out.length, lsn: k });
      L.lines.forEach(function (r) { out.push({ t: r.t, en: r.en, zh: r.zh }); });
    });
    return { seg: out, divs: divs };
  }
  function fmt(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function clampT(t, dur) { if (!isFinite(t)) return 0; dur = +dur || 0; if (dur > 0 && t > dur - 0.05) t = dur - 0.05; return Math.max(0, t); }

  return { parseLrc: parseLrc, buildSeg: buildSeg, fmt: fmt, clampT: clampT };
})();
