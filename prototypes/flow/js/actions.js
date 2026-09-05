/* 学习助手原型 · 交互动作（PROTOTYPE） */
(function () {
  'use strict';
  var A = App, D = window.DATA, S = App.S;

  /* ---------- 主题切换 ---------- */
  function pick(k) {
    A.setTheme(k);
    var els = document.querySelectorAll('#palette button');
    for (var i = 0; i < els.length; i++) els[i].classList.toggle('sel', els[i].getAttribute('data-k') === k);
  }

  /* ---------- 学习页顶部标题条联动（供标题 update） ---------- */
  function updateTitle() {
    var base = (location.hash || '#/today').replace(/^#\//, '').split('/')[0];
    var map = {
      today: ['今日', '9月3日 · 周四 · 主线课程'],
      map: ['课程地图', '新概念英语 · 第一册'],
      lesson: ['第 ' + S.lesson + ' 课', 'Unit ' + (1 + Math.floor((S.lesson - 1) / 24)) + ' · 本课聚合页'],
      read: ['课文精听', 'L' + S.lesson + ' · ' + D.lesson.title],
      vocab: ['本课生词', 'L' + S.lesson + ' · ' + D.lesson.vocab.length + ' 个单词'],
      grammar: ['语法讲解', 'L' + S.lesson + ' · ' + D.lesson.grammar.length + ' 个语法点'],
      review: ['今日复习', '到期 15 张 · 预计 10 分钟'],
      report: ['学情报告', '每日 / 每周战报'],
      messages: ['老师来信', '来自你的学习老师'],
      me: ['我的', '设置与数据'],
      settings: ['设置', '偏好 · 外观 · 数据']
    };
    var t = map[base] || map.today;
    var el = document.getElementById('title');
    var el2 = document.getElementById('subtitle');
    if (el) el.textContent = t[0];
    if (el2) el2.textContent = t[1];
  }
  A.updateTitle = updateTitle;

  /* ---------- 动作分发 ---------- */
  function handle(e) {
    var t = e.target.closest('[data-action], [data-go]');
    if (!t) return;

    var go = t.getAttribute('data-go');
    if (go) {
      A.go(go);
      return;
    }
    var act = t.getAttribute('data-action');

    if (act === 'back') { A.back(); return; }
    if (act === 'toggle-theme') {
      $('#palette').classList.toggle('hidden');
      return;
    }
    if (act === 'theme') { pick(t.getAttribute('data-k')); return; }

    if (act === 'task') {
      var k = t.getAttribute('data-task');
      S.tasks[k] = !S.tasks[k];
      A.render();
      return;
    }
    if (act === 'unit') {
      var un = t.getAttribute('data-unit');
      S.openUnits[un] = !S.openUnits[un];
      A.render();
      return;
    }
    if (act === 'flip') {
      var base = (location.hash || '#').replace(/^#\//, '').split('/')[0];
      if (base === 'vocab') { S.vocab.flip = !S.vocab.flip; }
      if (base === 'review') { S.rev.flip = !S.rev.flip; }
      A.render();
      return;
    }
    if (act === 'vrate' || act === 'rrate') {
      var isV = act === 'vrate';
      var key = isV ? 'vocab' : 'rev';
      var val = t.getAttribute('data-v');
      S[key].res[val]++;
      if (isV) {
        S.vocab.i++;
        if (S.vocab.i >= D.lesson.vocab.length) S.vocab.done = true;
      } else {
        var list = S.rev.filter === '全部' ? D.review : D.review.filter(function (x) { return x.type === S.rev.filter; });
        S.rev.i++;
        if (S.rev.i >= list.length) S.rev.done = true;
      }
      S[key].flip = false;
      A.render();
      return;
    }
    if (act === 'vreset') {
      S.vocab = { i: 0, done: false, flip: false, res: { y: 0, s: 0, a: 0 } };
      A.render();
      return;
    }
    if (act === 'rreset') {
      S.rev = { i: 0, done: false, flip: false, res: { y: 0, s: 0, a: 0, e: 0 }, filter: S.rev.filter };
      A.render();
      return;
    }
    if (act === 'rfilter') {
      S.rev.filter = t.getAttribute('data-v');
      S.rev = { i: 0, done: false, flip: false, res: { y: 0, s: 0, a: 0, e: 0 }, filter: S.rev.filter };
      A.render();
      return;
    }
    if (act === 'blind') {
      S.blind = t.getAttribute('data-v') === '1';
      A.render();
      return;
    }
    if (act === 'audio') { A.togglePlay(); return; }
    if (act === 'audioprev') { A.playPrev(); return; }
    if (act === 'audionext') { A.playNext(); return; }
    if (act === 'playline') {
      var li = t.getAttribute('data-i');
      A.startPlay(parseInt(li, 10));
      return;
    }
    if (act === 'bind') {
      var bk = t.getAttribute('data-k');
      var b = D.lesson.bind[bk];
      if (bk === 'text') {
        var cur = (location.hash || '').replace(/^#\//, '');
        A.go(cur === 'read' ? '#/read' : '#/read');
      } else {
        A.toast('演示：' + b.name + '（正式版打开外链：' + b.desc + '）');
      }
      return;
    }
    if (act === 'toast') { A.toast(t.getAttribute('data-msg')); return; }
    if (act === 'seg') {
      S.reportSeg = t.getAttribute('data-v');
      A.render();
      return;
    }
    if (act === 'msg') {
      var id = parseInt(t.getAttribute('data-id'), 10);
      if (S.msgRead.indexOf(id) < 0) S.msgRead.push(id);
      S.msgOpen = id;
      A.render();
      return;
    }
    if (act === 'msgclose') {
      S.msgOpen = null;
      A.render();
      return;
    }
    if (act === 'chan') {
      var ck = t.getAttribute('data-k');
      S.chan[ck] = !S.chan[ck];
      A.render();
      return;
    }
    if (act === 'budget') {
      S.chan.budget = parseInt(t.getAttribute('data-v'), 10);
      A.render();
      return;
    }
    if (act === 'time') {
      var tk = t.getAttribute('data-k');
      S.chan[tk] = !S.chan[tk];
      A.render();
      return;
    }
  }

  A.onClick = handle;
})();
