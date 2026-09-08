/* ===== 教材渲染（复用自站点 app.js 的卡片/课文渲染）=====
   纯渲染：把 Content 渲染成 HTML 字符串放入给定容器；单词点击 / 句子定位由调用方绑定。 */
window.Tb = (function () {
  var esc = Lookup.esc, markWords = Lookup.markWords, meaningsText = Lookup.meaningsText;

  function exLine(e, dict) {
    return '<div class="tb-ex-line"><span class="en">' + markWords(e.en, dict) + '</span>' +
      (e.zh ? '<span class="zh">' + esc(e.zh) + '</span>' : '') + '</div>';
  }
  function exLines(list, dict, label) {
    var h = (list || []).map(function (e) { return exLine(e, dict); }).join('');
    return h ? ('<div class="tb-exs-mini">' + (label ? '<div class="t">' + esc(label) + '</div>' : '') + h + '</div>') : '';
  }
  function tbWordCard(w) {
    return '<div class="tb-word"><div class="tb-whead"><b>' + esc(w.word) + '</b>' +
      (w.phonetic ? '<i class="ph">' + esc(w.phonetic) + '</i>' : '') + '</div>' +
      '<span>' + esc(meaningsText(w)) + '</span>' +
      exLines(w.examples, null) + '</div>';
  }
  function tbPhraseCard(p, dict) {
    return '<div class="tb-word phrase"><div class="tb-whead"><b>' + esc(p.phrase) + '</b></div>' +
      (p.usage ? '<span>' + esc(p.usage) + '</span>' : '') +
      exLines(p.examples, dict) + '</div>';
  }
  function grCardRich(g, dict) {
    var d = (g.definition || '') + (g.usage ? (g.definition ? ' ' : '') + g.usage : '');
    return '<div class="tb-gr"><div class="k">' + esc(g.title) + '</div>' +
      (g.structure ? '<div class="f">' + esc(g.structure) + '</div>' : '') +
      (d ? '<div class="d">' + esc(d) + '</div>' : '') +
      exLines(g.examples, dict) + '</div>';
  }
  function patCard(p, i, dict) {
    var im = exLines(p.imitations, dict, '仿写');
    return '<div class="tb-pat"><span class="no">' + (i + 1) + '</span><div>' +
      '<div class="en">' + markWords(p.pattern, dict) + '</div>' +
      (p.original && p.original.en
        ? '<div class="zh">课文原句：' + esc(p.original.en) + (p.original.zh ? '（' + esc(p.original.zh) + '）' : '') + '</div>'
        : '') +
      im + '</div></div>';
  }
  function exCard(e) {
    return '<details class="tb-ex"><summary>' + esc(e.q) + '</summary>' +
      '<div class="tb-ex-body"><div class="a">答：' + esc(e.a) + '</div>' +
      (e.note ? '<div class="n">💡 ' + esc(e.note) + '</div>' : '') + '</div></details>';
  }
  function tbLesson(L, dict) {
    var h = '<div class="tbk-sec"><h5>' + (L.lesson ? ('Lesson ' + esc(L.lesson)) : '课文') +
      (L.title ? ' · ' + esc(L.title) : '') + (L.kind ? ' <i>' + esc(L.kind) + '</i>' : '') + '</h5>';
    if (L.lines && L.lines.length) {
      h += '<div class="tbk-text">' + L.lines.map(function (l) {
        var sp = l.speaker || '', cls = (sp === 'B' || sp === '2') ? 'b' : '';
        return '<div class="tb-line"><span class="tb-sp ' + cls + '">' + esc(sp || '·') + '</span>' +
          '<div class="tb-l"><div class="tb-en">' + markWords(l.en, dict) + '</div>' +
          (l.zh ? '<div class="tb-zh">' + esc(l.zh) + '</div>' : '') +
          (l.note ? '<div class="tb-note">' + esc(l.note) + '</div>' : '') + '</div></div>';
      }).join('') + '</div>';
    }
    var d = L.drill;
    if (d) {
      h += '<div class="tb-drill"><div class="q">' + esc(d.q).replace('___', '<em>___</em>') + '</div>' +
        (d.zh ? '<div class="zh">' + esc(d.zh) + '</div>' : '') +
        (d.slots && d.slots.length ? '<div class="tb-slots">' + d.slots.map(function (s) {
          return '<span class="tb-slot">' + esc(s.en) + '<small>' + esc(s.zh || '') + '</small></span>'; }).join('') + '</div>' : '') +
        (d.answers && d.answers.length ? '<div class="tb-ans">' + d.answers.map(function (a, i) {
          return '<span' + (i ? ' class="no"' : '') + '>' + esc(a) + '</span>'; }).join('') + '</div>' : '') +
        '</div>';
    }
    return h + '</div>';
  }
  function lessonTextHTML(nt, dict, seg, divs) {
    var lessons = (nt && nt.text) || [];
    var inner = '';
    if (lessons.length) {
      inner = lessons.map(function (L) { return tbLesson(L, dict); }).join('');
    } else if (seg && seg.length) {
      var h = '', di = 0;
      seg.forEach(function (r, i) {
        if (di < divs.length && divs[di].at === i) { h += '<div class="tb-ldiv">Lesson ' + divs[di].lsn + '</div>'; di++; }
        h += '<button class="tb-line tb-sline" data-si="' + i + '"><span class="tb-sp">' + (i + 1) + '</span>' +
          '<div class="tb-l"><div class="tb-en">' + markWords(r.en, dict) + '</div>' +
          (r.zh ? '<div class="tb-zh">' + esc(r.zh) + '</div>' : '') + '</div></button>';
      });
      inner = '<div class="tbk-text">' + h + '</div>';
    } else {
      inner = '<div class="tbk-empty">课文需联网加载字幕；生词 / 讲解见下方区块。</div>';
    }
    return '<section class="tbk-sec" id="sec-text"><h5>课文 <i>TEXT</i></h5>' + inner + '</section>';
  }
  function secId(id, title, en, inner) {
    return '<section class="tbk-sec" id="' + id + '"><h5>' + esc(title) + ' <i>' + esc(en) + '</i></h5>' + inner + '</section>';
  }

  /* 主渲染：把教材内容填进 box */
  function render(box, pkg, unit, content, seg, divs) {
    if (!box) return;
    /* 提问卡：先自己想，再看提示与参考答案 */
    var Q_KIND = { listen: '🎧 听前提问', detail: '🔍 抓细节', think: '💭 想一想', drill: '🗣 操练' };
    function qCard(x, i) {
      var kind = x.kind || 'detail';
      var h = '<div class="tb-q k-' + kind + '">';
      h += '<div class="tb-q-h"><span class="tb-q-k">' + (Q_KIND[kind] || '❓ 提问') + '</span><span class="tb-q-no">' + (i + 1) + '</span></div>';
      h += '<div class="tb-q-t">' + esc(x.q) + (x.zh ? '<i>' + esc(x.zh) + '</i>' : '') + '</div>';
      if (x.hint) h += '<details class="tb-q-hint"><summary>答不上来看提示</summary><div>' + esc(x.hint) + '</div></details>';
      if (x.a || x.aZh) h += '<details class="tb-q-a"><summary>参考答案</summary><div>' + esc(x.a || '') +
        (x.aZh ? '<i>' + esc(x.aZh) + '</i>' : '') + '</div></details>';
      return h + '</div>';
    }
    var nt = content || {};
    var dict = Lookup.buildDict(nt);
    var nums = AppData.lessonNums(unit);
    var h = '<div class="tbk-paper">';
    h += '<div class="tbk-head"><span class="tbk-lesson">' + esc(unit.lessonLabel || ('Lesson ' + nums.join(' & ')) ) + '</span>' +
      '<div><h3>' + esc(nt.title || unit.title) + '</h3>' +
      (nt.subtitle ? '<div class="zh">' + esc(nt.subtitle) + '</div>' : '') + '</div></div>';
    h += '<div class="tbk-body">';
    var lead = nt.lead || {};
    var intro = '';
    if (lead.question) intro += '<div class="tbk-q">🎧 <b>听录音前先想</b>：' + esc(lead.question) + '</div>';
    if (lead.warmup) intro += '<div class="tb-warm">' + esc(lead.warmup) + '</div>';
    if (lead.summary) intro += '<div style="font-size:13px;line-height:1.95;color:#5f5a4c">' + esc(lead.summary) + '</div>';
    if (lead.goals && lead.goals.length) intro += '<div class="tb-goals"><b>🎯 这一课结束时要能做到</b><ul>' +
      lead.goals.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>';
    if (lead.tips) intro += '<div class="tb-tip"><b>💡</b><div>' + esc(lead.tips) + '</div></div>';
    h += secId('sec-intro', '导学', 'STUDY', intro || '<div class="tbk-empty">本课没有单独的导学内容，直接从课文开始。</div>');
    var qs = nt.questions || [];
    if (qs.length) h += secId('sec-q', '提问', 'QUESTIONS', '<div class="tb-qs">' + qs.map(qCard).join('') + '</div>');
    var quiz = nt.quiz || [];
    h += '<div id="sec-text-wrap">' + lessonTextHTML(nt, dict, seg, divs) + '</div>';
    var words = nt.words || [];
    if (words.length) h += secId('sec-words', '生词', 'WORDS', '<div class="tb-words">' + words.map(tbWordCard).join('') + '</div>');
    var phrases = nt.phrases || [];
    if (phrases.length) h += secId('sec-phrases', '短语', 'PHRASES', '<div class="tb-words">' + phrases.map(function (p) { return tbPhraseCard(p, dict); }).join('') + '</div>');
    if (nt.grammar && nt.grammar.length) h += secId('sec-gram', '语法要点', 'GRAMMAR', nt.grammar.map(function (g) { return grCardRich(g, dict); }).join(''));
    if (nt.patterns && nt.patterns.length) h += secId('sec-pat', '重点句', 'PATTERNS', '<div class="tb-pats">' + nt.patterns.map(function (p, i) { return patCard(p, i, dict); }).join('') + '</div>');
    if (nt.exercises && nt.exercises.length) h += secId('sec-ex', '自测练习', 'PRACTICE', '<div class="tb-exs">' + nt.exercises.map(exCard).join('') + '</div>');
    if (quiz && quiz.length) h += secId('sec-quiz', '选择题', 'QUIZ', '<div class="tb-quizs">' + quiz.map(quizCard).join('') + '<div class="tb-quiz-sum" id="quizSum"></div></div>');
    h += '</div></div>';
    box.innerHTML = h;
    bindQuiz(nt, box);
  }

  /* ===== 选择题：点选项即时判分 ===== */
  var QZ_ABCD = 'ABCDEFGH';
  function quizCard(x, i) {
    var h = '<div class="tb-quiz" data-qi="' + i + '">';
    h += '<div class="tb-quiz-t"><span class="no">' + (i + 1) + '</span>' + esc(x.q) +
      (x.zh ? '<i>' + esc(x.zh) + '</i>' : '') + '</div>';
    h += '<div class="tb-quiz-opts">' + (x.options || []).map(function (o, j) {
      return '<button class="tb-opt" data-oj="' + j + '"><span class="k">' + (QZ_ABCD[j] || (j + 1)) +
        '</span><span class="v">' + esc(o) + '</span></button>';
    }).join('') + '</div>';
    h += '<div class="tb-quiz-fb" hidden></div>';
    return h + '</div>';
  }
  function bindQuiz(nt, box) {
    var quiz = nt.quiz || [];
    window.__quiz = quiz;
    if (box.__quizBound) { updateQuizSum(); return; }
    box.__quizBound = true;
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tb-opt') : null;
      if (!b) return;
      var wrap = b.closest('.tb-quiz');
      if (!wrap) return;
      var i = +wrap.dataset.qi, j = +b.dataset.oj;
      var x = (window.__quiz || [])[i];
      if (!x) return;
      if (wrap.dataset.done === '1' && wrap.dataset.last === String(j)) return;
      [].forEach.call(wrap.querySelectorAll('.tb-opt'), function (o) {
        var oj = +o.dataset.oj;
        o.classList.remove('right', 'wrong');
        if (oj === x.answer) o.classList.add('right');
        else if (oj === j) o.classList.add('wrong');
        o.disabled = true;
      });
      wrap.dataset.done = '1';
      wrap.dataset.last = String(j);
      var ok = j === x.answer;
      var fb = wrap.querySelector('.tb-quiz-fb');
      fb.hidden = false;
      fb.className = 'tb-quiz-fb ' + (ok ? 'ok' : 'no');
      fb.innerHTML = (ok ? '✅ 答对了' : '❌ 正确答案 ' + (QZ_ABCD[x.answer] || (x.answer + 1)) + '：' + esc(x.options[x.answer] || '')) +
        (x.note ? '<div class="why">' + esc(x.note) + '</div>' : '');
      updateQuizSum();
    });
    updateQuizSum();
  }
  function updateQuizSum() {
    var el = document.getElementById('quizSum');
    if (!el) return;
    var all = document.querySelectorAll('#tbk .tb-quiz');
    if (!all.length) { el.hidden = true; return; }
    var done = 0, right = 0;
    [].forEach.call(all, function (w) {
      if (w.dataset.done !== '1') return;
      done++;
      var x = (window.__quiz || [])[+w.dataset.qi];
      if (x && +w.dataset.last === x.answer) right++;
    });
    el.hidden = false;
    el.innerHTML = '已答 <b>' + done + '</b> / ' + all.length + '　答对 <b>' + right + '</b>';
  }

  return { render: render, wordCard: tbWordCard, phraseCard: tbPhraseCard, lessonTextHTML: lessonTextHTML };
})();
