/* ===== 侧栏主控制器 ===== */
(function () {
  "use strict";
  var esc = Lookup.esc, normW = Lookup.normW, buildDict = Lookup.buildDict, findWord = Lookup.findWord, meaningsText = Lookup.meaningsText;

  var S = {
    book: 'nce1', ui: 1, tab: 'audio', ver: 'new',
    pkg: null, unit: null, content: null, dict: null,
    vocab: null, vocabLoading: null
  };
  var player = null;
  var done = AppStore.progress();

  function $(s) { return document.querySelector(s); }
  function speak(text) {
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.95;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { }
  }

  /* ---------- 初始化 ---------- */
  function init() {
    AppData.init().then(function (list) {
      renderBooks(list);
      player = new AudioPlayer($('#spPlayer'));
      player.onWordClick = function (word, el) { showWPop(word, el); };
      player.audio.addEventListener('ended', function () { markDone(true); });
      bindUI();
      selectBook(S.book);
      readPending();
    });
  }

  function renderBooks(list) {
    var box = $('#spBooks');
    box.innerHTML = list.map(function (b) {
      return '<button class="sp-book' + (b.id === S.book ? ' on' : '') + '" data-b="' + b.id + '">' + esc(b.title) + '</button>';
    }).join('');
    box.querySelectorAll('.sp-book').forEach(function (btn) {
      btn.onclick = function () { selectBook(btn.dataset.b); };
    });
  }

  function selectBook(id) {
    S.book = id; S.ui = 1; S.ver = 'new';
    document.querySelectorAll('.sp-book').forEach(function (b) { b.classList.toggle('on', b.dataset.b === id); });
    renderLessonSelect().then(loadUnit);
  }

  /* 上一课 / 下一课 */
  function goLesson(d) {
    if (!S.pkg) return;
    var n = S.pkg.units.length;
    var i = Math.max(1, Math.min(n, S.ui + d));
    if (i === S.ui) return;
    S.ui = i; S.ver = 'new';
    $('#spLesson').value = String(i - 1);
    renderVerBar(S.pkg.units[i - 1]);
    loadUnit();
    updateNav();
  }
  function updateNav() {
    var prev = $('#spPrevL'), next = $('#spNextL');
    if (!prev || !next) return;
    prev.disabled = !S.pkg || S.ui <= 1;
    next.disabled = !S.pkg || S.ui >= S.pkg.units.length;
  }

  function renderLessonSelect() {
    return AppData.get(S.book).then(function (pkg) {
      S.pkg = pkg;
      var sel = $('#spLesson');
      sel.innerHTML = pkg.units.map(function (u, i) {
        return '<option value="' + i + '">' + esc((u.lessonLabel || ('Lesson ' + u.index)) + '  ' + u.title) + '</option>';
      }).join('');
      sel.value = String(S.ui - 1);
      sel.onchange = function () { S.ui = (+sel.value) + 1; loadUnit(); };
      renderVerBar(pkg.units[S.ui - 1]);
    });
  }

  function renderVerBar(unit) {
    var bar = $('#spVer'); bar.innerHTML = '';
    if (AppData.hasVariant(unit, '1985')) {
      var mk = function (v, label) {
        var b = document.createElement('button');
        b.className = 'sp-ver' + (S.ver === v ? ' on' : '');
        b.textContent = label; b.dataset.v = v;
        b.onclick = function () { S.ver = v; document.querySelectorAll('.sp-ver').forEach(function (x) { x.classList.toggle('on', x.dataset.v === v); }); loadUnit(); };
        return b;
      };
      bar.appendChild(mk('new', '新版英音'));
      bar.appendChild(mk('1985', '1985 老版'));
    }
  }

  /* ---------- 加载一课 ---------- */
  function loadUnit() {
    if (!S.pkg) { renderLessonSelect(); return; }
    var unit = S.pkg.units[S.ui - 1];
    S.unit = unit;
    AppData.content(S.pkg, unit).then(function (nt) {
      S.content = nt || {};
      S.dict = buildDict(S.content);
      player.setDict(S.dict);
      Tb.render($('#tbk'), S.pkg, unit, S.content, null, null);
      bindTextbook();
      updateDoneBtn();
      updateNav();
    });
    // 音频 + 字幕
    var tr = AppData.audioOf(unit, S.ver === '1985' ? '1985' : 'new');
    if (tr && tr.lrc) {
      fetch(tr.lrc).then(function (r) { if (!r.ok) throw 0; return r.text(); })
        .then(function (txt) {
          var parsed = LrcUtil.parseLrc(txt);
          var seg = LrcUtil.buildSeg(AppData.lessonNums(unit), parsed);
          player.load(tr, seg);
        })
        .catch(function () { player.load(tr, { seg: [], divs: [] }); });
    } else if (tr) {
      player.load(tr, { seg: [], divs: [] });
    } else {
      player.load(null, { seg: [], divs: [] });
    }
  }

  /* ---------- 已学进度 ---------- */
  function doneKey() { return S.book + ':' + S.unit.index; }
  function markDone(on) {
    if (on) done.add(doneKey()); else done.delete(doneKey());
    AppStore.saveProgress(done); updateDoneBtn();
  }
  function updateDoneBtn() {
    var b = $('#spDone'); if (!b) return;
    var on = done.has(doneKey());
    b.classList.toggle('on', on);
    b.textContent = (on ? '●' : '○') + ' 已学';
  }

  /* ---------- 教材内单词浮框 ---------- */
  function bindTextbook() {
    // 事件委托在 bindUI 统一处理；此处无需重复
  }
  function showWPop(word, anchor) {
    var pop = $('#wpop'); if (!pop) return;
    var hit = findWord(S.dict, word);
    pop.innerHTML = '<div class="wp-row"><b>' + esc(word) + '</b>' +
      '<button class="wp-sp" id="wpSp" title="朗读">🔊</button></div>' +
      (hit ? '<div class="wp-zh">' + esc(hit[1]) + '</div>' +
        (normW(hit[0]) !== normW(word) ? '<div class="wp-mut">生词表原形：' + esc(hit[0]) + '</div>' : '')
        : '<div class="wp-zh no">本课生词表未收录</div>');
    pop.hidden = false;
    var r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    var top = r.bottom + 6; if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    var sp = $('#wpSp'); if (sp) sp.onclick = function () { speak(word); };
  }
  function hideWPop() { var p = $('#wpop'); if (p) p.hidden = true; }

  /* ---------- 词典 ---------- */
  function loadVocab() {
    if (S.vocab) return Promise.resolve(S.vocab);
    if (S.vocabLoading) return S.vocabLoading;
    S.vocabLoading = fetch(chrome.runtime.getURL('data/vocab.json')).then(function (r) { return r.json(); })
      .then(function (v) { S.vocab = v; return v; });
    return S.vocabLoading;
  }
  function dictSearch(q) {
    q = String(q || '').trim();
    var res = $('#dictRes');
    if (!q) { res.innerHTML = '<div class="dict-empty">输入英文单词或短语查询。跨 276 课汇总自新概念英语生词 / 短语表。</div>'; return; }
    loadVocab().then(function (v) {
      var cards = [];
      // 短语（含空格）
      var pk = q.toLowerCase().replace(/[^a-z ]/g, '').trim();
      if (pk && pk.indexOf(' ') >= 0 && v.phrases[pk]) {
        v.phrases[pk].forEach(function (e) { cards.push(phraseCard(e)); });
      }
      // 单词
      var wk = normW(q);
      var rec = v.words[wk] || v.words[v.aliases[wk]];
      if (rec) rec.entries.forEach(function (e) { cards.push(wordCard(e)); });
      // 全局词库未命中 → 回退到当前课文内容（覆盖更新后尚未进入词库的生词 / 短语）
      if (!cards.length) {
        var c = contentLookup(q);
        if (c) cards.push(c.type === 'phrase' ? phraseCard(c.entry) : wordCard(c.entry));
      }
      if (!cards.length) { res.innerHTML = '<div class="dict-empty">未在课程词库中命中「' + esc(q) + '」。本词典汇总自新概念英语生词 / 短语表，普通单词可能未收录。</div>'; return; }
      res.innerHTML = cards.join('');
      res.querySelectorAll('.dgo').forEach(function (b) {
        b.onclick = function () { gotoUnit(b.dataset.pkg, b.dataset.unit); };
      });
    });
  }
  /* 在当前课文的生词 / 短语里检索（供词典兜底） */
  function contentLookup(q) {
    if (!S.content) return null;
    q = String(q || '');
    var wk = normW(q);
    var words = (S.content.words || []);
    for (var i = 0; i < words.length; i++) {
      if (normW(words[i].word) === wk) {
        var w = words[i];
        return { type: 'word', entry: { word: w.word, phonetic: w.phonetic, meanings: w.meanings, examples: w.examples, pkg: S.book, unit: S.unit.id, lessonLabel: S.unit.lessonLabel || ('Lesson ' + (S.unit.lessons || []).join(' & ')) } };
      }
    }
    if (/\s/.test(q)) {
      var ph = q.toLowerCase().replace(/[^a-z ]/g, '').trim();
      var phr = (S.content.phrases || []);
      for (var j = 0; j < phr.length; j++) {
        if (String(phr[j].phrase).toLowerCase().replace(/[^a-z ]/g, '').trim() === ph) {
          var p = phr[j];
          return { type: 'phrase', entry: { phrase: p.phrase, usage: p.usage, examples: p.examples, pkg: S.book, unit: S.unit.id, lessonLabel: S.unit.lessonLabel || ('Lesson ' + (S.unit.lessons || []).join(' & ')) } };
        }
      }
    }
    return null;
  }
  function wordCard(e) {
    var ph = e.phonetic ? '<span class="ph">' + esc(e.phonetic) + '</span>' : '';
    var ex = (e.examples || []).slice(0, 2).map(function (x) {
      return '<div class="dex">' + esc(x.en || '') + (x.zh ? ' — ' + esc(x.zh) : '') + '</div>';
    }).join('');
    return '<div class="dict-card"><div class="dh"><b>' + esc(e.word) + '</b>' + ph + '</div>' +
      '<div class="dm">' + esc(meaningsText(e)) + '</div>' + ex +
      '<div class="dloc"><span>' + esc((S.vocab.packages[e.pkg] || e.pkg)) + ' · ' + esc(e.lessonLabel || '') + '</span>' +
      '<button class="dgo" data-pkg="' + e.pkg + '" data-unit="' + e.unit + '">去学习 →</button></div></div>';
  }
  function phraseCard(e) {
    var ex = (e.examples || []).slice(0, 2).map(function (x) {
      return '<div class="dex">' + esc(x.en || '') + (x.zh ? ' — ' + esc(x.zh) : '') + '</div>';
    }).join('');
    return '<div class="dict-card"><div class="dh"><b>' + esc(e.phrase) + '</b></div>' +
      (e.usage ? '<div class="dm">' + esc(e.usage) + '</div>' : '') + ex +
      '<div class="dloc"><span>' + esc((S.vocab.packages[e.pkg] || e.pkg)) + ' · ' + esc(e.lessonLabel || '') + '</span>' +
      '<button class="dgo" data-pkg="' + e.pkg + '" data-unit="' + e.unit + '">去学习 →</button></div></div>';
  }

  function gotoUnit(pkgId, unitId) {
    S.book = pkgId;
    document.querySelectorAll('.sp-book').forEach(function (b) { b.classList.toggle('on', b.dataset.b === pkgId); });
    AppData.get(pkgId).then(function (pkg) {
      S.pkg = pkg;
      var idx = pkg.units.findIndex(function (u) { return u.id === unitId; });
      if (idx < 0) idx = 0;
      S.ui = idx + 1; S.ver = 'new';
      renderLessonSelect().then(loadUnit);
      switchTab('audio');
    });
  }

  /* ---------- Tab / UI ---------- */
  function switchTab(t) {
    S.tab = t;
    document.querySelectorAll('.sp-tab').forEach(function (x) { x.classList.toggle('on', x.dataset.tab === t); });
    document.querySelectorAll('.sp-pane').forEach(function (x) { x.classList.toggle('on', x.id === 'pane' + t.charAt(0).toUpperCase() + t.slice(1)); });
  }
  function bindUI() {
    document.querySelectorAll('.sp-tab').forEach(function (x) { x.onclick = function () { switchTab(x.dataset.tab); }; });
    $('#spPrevL').onclick = function () { goLesson(-1); };
    $('#spNextL').onclick = function () { goLesson(1); };
    $('#spDone').onclick = function () { markDone(!done.has(doneKey())); };
    $('#dictBtn').onclick = function () { dictSearch($('#dictInput').value); };
    $('#dictInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') dictSearch(this.value); });

    // 教材内单词点击
    $('#tbk').addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('.tb-w') : null;
      if (el) { showWPop(el.dataset.w || el.textContent, el); return; }
      hideWPop();
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest && (e.target.closest('.tb-w') || e.target.closest('#wpop'))) return;
      hideWPop();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideWPop(); });
    window.addEventListener('scroll', hideWPop, true);
    window.addEventListener('resize', hideWPop);
  }

  /* ---------- 来自内容脚本 / 弹窗的跳转 ---------- */
  function applyGoto(m) { if (m && m.pkg && m.unit) gotoUnit(m.pkg, m.unit); }
  function readPending() {
    if (chrome.storage && chrome.storage.session) {
      chrome.storage.session.get(['pendingGoto', 'pendingQuery', 'pendingRandom'], function (r) {
        if (r.pendingGoto) { applyGoto(r.pendingGoto); chrome.storage.session.remove('pendingGoto'); }
        if (r.pendingQuery) {
          $('#dictInput').value = r.pendingQuery; dictSearch(r.pendingQuery);
          switchTab('dict'); chrome.storage.session.remove('pendingQuery');
        }
        if (r.pendingRandom) { doRandom(); chrome.storage.session.remove('pendingRandom'); }
      });
    }
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg) return;
      if (msg.type === 'goto') applyGoto(msg);
      else if (msg.type === 'query') { $('#dictInput').value = msg.q; dictSearch(msg.q); switchTab('dict'); }
      else if (msg.type === 'random') doRandom();
    });
  }

  function doRandom() {
    var list = AppData.list();
    if (!list.length) return;
    var b = list[Math.floor(Math.random() * list.length)];
    AppData.get(b.id).then(function (pkg) {
      var u = pkg.units[Math.floor(Math.random() * pkg.units.length)];
      gotoUnit(b.id, u.id);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
