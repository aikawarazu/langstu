/* ===== 单词即点即译（复用自站点 app.js）=====
   生词表里是原形，课文里可能是复数 / 过去式 / 进行时，做一层简单还原再查。 */
window.Lookup = (function () {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function normW(w) { return String(w == null ? '' : w).toLowerCase().replace(/[^a-z'’-]/g, ''); }

  /* 单课生词表 -> { normalized: [原词, 释义串] }（用于课文高亮与悬浮释义） */
  function buildDict(nt) {
    var m = {};
    ((nt && nt.words) || []).forEach(function (x) {
      var k = normW(x.word);
      if (k && !m[k]) m[k] = [x.word, meaningsText(x)];
    });
    return m;
  }
  function meaningsText(w) {
    return ((w && w.meanings) || []).map(function (mm) {
      return (mm.pos ? mm.pos + '. ' : '') + (mm.meaning || '') + (mm.usage ? '（' + mm.usage + '）' : '');
    }).join('；');
  }
  function findWord(dict, raw) {
    var w = normW(raw); if (!w || !dict) return null;
    var c = [w];
    if (/'s$/.test(w)) c.push(w.slice(0, -2));
    c.push(w.replace(/ies$/, 'y'), w.replace(/(es|s)$/, ''), w.replace(/(ed|d)$/, ''),
      w.replace(/ing$/, ''), w.replace(/s$/, ''));
    for (var i = 0; i < c.length; i++) if (dict[c[i]]) return dict[c[i]];
    return null;
  }
  /* 把英文文本里的词包成可点元素（命中生词加 hit 类） */
  function markWords(text, dict) {
    return esc(text).replace(/[A-Za-z][A-Za-z'’-]*/g, function (w) {
      return '<span class="tb-w' + (findWord(dict, w) ? ' hit' : '') + '" data-w="' + w + '">' + w + '</span>';
    });
  }
  return { esc: esc, normW: normW, buildDict: buildDict, meaningsText: meaningsText, findWord: findWord, markWords: markWords };
})();
