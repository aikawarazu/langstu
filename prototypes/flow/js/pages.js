/* 学习助手原型 · 10 个页面（PROTOTYPE） */
(function () {
  'use strict';
  var A = App, D = window.DATA, S = App.S;
  var H = App.helpers, ico = H.ico, esc = H.esc, ring = A.ring, eq = A.eq;
  var fmtTime = H.fmtTime, lessonMeta = H.lessonMeta;

  /* ---------- 通用小片段 ---------- */
  function taskRow(g, item, i) {
    var on = H.taskChecked(g, i);
    return '<button class="task' + (on ? ' done' : '') + '" data-action="task" data-task="' + g + '-' + i + '" style="width:100%;text-align:left">' +
      '<span class="checkbox">' + ico('check') + '</span>' +
      '<span class="grow"><span class="tt" style="display:block">' + esc(item.t) + '</span><span class="ts">' + esc(item.sub) + '</span></span>' +
      ico('chev') + '</button>';
  }
  function doneRing(acc) {
    return '<div class="ringwrap" style="width:96px;height:96px">' + ring(acc / 100, 96) +
      '<div class="ringtxt"><b style="font-size:20px">' + acc + '%</b><span>掌握率</span></div></div>';
  }
  function resultCard(title, rows, note, actionBtns) {
    return '<div class="card center col" style="align-items:center;padding:24px 16px">' + rows +
      '<b style="font-size:17px">' + title + '</b><div class="callout" style="width:100%">' + note + '</div>' +
      '<div class="row" style="gap:8px">' + actionBtns + '</div></div>';
  }

  /* ---------- 1 今日 ---------- */
  App.pages.today = function () {
    var meta = D.meta, t = D.today;
    var pct = meta.done / meta.lessons;
    var total = H.allTasks(), done = H.doneTasks();
    var mainMin = t.groups[0].min + t.groups[1].min;
    var msgHtml = '';
    var unread = D.messages.filter(function (m) { return S.msgRead.indexOf(m.id) < 0; })[0];
    if (unread) {
      msgHtml = '<button class="card row" data-go="#/messages" style="width:100%;text-align:left">' +
        '<span class="seico" style="background:var(--info-soft);color:var(--info)">' + ico('ear') + '</span>' +
        '<span class="grow"><span style="font-weight:800;font-size:14px">老师来信 · ' + esc(unread.title) + '</span>' +
        '<span class="ts" style="display:block;margin-top:2px">' + esc(unread.tag) + ' · ' + esc(unread.at) + '</span></span>' +
        '<span class="tag warn">' + H.unreadCount() + ' 条未读</span>' + ico('chev') + '</button>';
    }
    var groups = D.today.groups.map(function (g) {
      var gd = g.items.filter(function (_, ii) { return H.taskChecked(g.key, ii); }).length;
      return '<div class="card"><div class="row between"><span><b>' + esc(g.label) + '</b>' +
        '<span class="tiny muted" style="display:block;margin-top:2px">约 ' + g.min + ' 分钟</span></span>' +
        '<span class="chip">' + gd + '/' + g.items.length + ' 完成</span></div>' +
        '<div>' + g.items.map(function (it, ii) { return taskRow(g.key, it, ii); }).join('') + '</div></div>';
    }).join('');
    var hero = '<div class="hero card">' +
      '<div class="ringwrap">' + ring(pct, 88) + '<div class="ringtxt"><b>' + meta.done + '</b><span>/ ' + meta.lessons + ' 课</span></div></div>' +
      '<div class="grow col" style="gap:5px"><div class="tiny muted">' + t.date + ' · 主线 NCE1</div>' +
      '<div style="font-family:var(--font-head);font-size:17px;font-weight:800">嗨，' + esc(t.nickname) + '，今天也一起学</div>' +
      '<div class="row wrap"><span class="chip"><b style="color:var(--warn)">' + t.streak + ' 天</b>&nbsp;连续打卡</span>' +
      '<span class="chip">本周 5/7</span><span class="chip">正确率 82%</span></div></div></div>';
    var cta = '<div class="card col">' +
      '<div class="row between"><b>今日合计：约 ' + mainMin + ' 分钟</b><span class="tiny muted">可拆早 / 晚两段</span></div>' +
      '<div style="height:8px;border-radius:99px;background:var(--card2);overflow:hidden"><i style="display:block;height:100%;width:' + (100 * done / total) + '%;background:var(--ok);border-radius:99px;transition:width .3s"></i></div>' +
      '<button class="btn primary block" data-go="#/lesson/23">' + (done >= total ? '打开主课复盘' : '继续今日主课 · L23 Which glasses?') + '</button>' +
      (done >= total ? '<span class="tiny muted center">今日全部完成，剩下的交给明天。</span>' : '') + '</div>';
    return hero + msgHtml + groups + cta;
  };

  /* ---------- 2 课程地图 ---------- */
  App.pages.map = function () {
    var meta = D.meta;
    var units = D.units.map(function (u) {
      var open = S.openUnits[u.n], chips = [], l;
      var d0 = Math.min(Math.max(meta.done - u.range[0] + 1, 0), u.range[1] - u.range[0] + 1);
      for (l = u.range[0]; l <= u.range[1]; l++) {
        var st = l <= meta.done ? 'done' : (l === meta.current ? 'cur' : '');
        chips.push('<button class="lchip ' + st + '" data-go="#/lesson/' + l + '">' + l + '</button>');
      }
      return '<div class="card"><button class="uhead" data-action="unit" data-unit="' + u.n + '" style="width:100%;text-align:left">' +
        '<span><span class="ui">Unit ' + u.n + '</span><span class="tiny muted" style="display:block;margin-top:2px">L' + u.range[0] + '–' + u.range[1] + ' · ' + esc(u.title) + '</span></span>' +
        '<span class="row" style="gap:10px"><span class="chip">' + d0 + '/' + (u.range[1] - u.range[0] + 1) + '</span>' + ico('chev') + '</span></button>' +
        (open ? '<div class="uchips">' + chips.join('') + '</div>' : '') + '</div>';
    }).join('');
    var mile = '<div class="card"><b>里程碑</b><div class="tiny muted" style="margin:2px 0 10px">每 24 课一个小节 · 再完成 ' + (24 - meta.done) + ' 课通关 Unit 1</div>' +
      '<div class="row" style="justify-content:space-between">' + D.units.map(function (u) {
        var pass = meta.done >= u.range[1], now = meta.done >= u.range[0] && meta.done < u.range[1];
        return '<div class="col center" style="gap:4px;flex:1"><span class="mdot ' + (pass ? 'pass' : now ? 'now' : 'fut') + '">' + (pass ? 'OK' : 'U' + u.n) + '</span>' +
          '<span class="tiny muted">' + (pass ? '已通关' : now ? '进行中' : '待解锁') + '</span></div>';
      }).join('') + '</div></div>';
    return '<div class="card"><div class="row between"><div><b style="font-family:var(--font-head);font-size:16px">新概念英语 · 第一册</b>' +
      '<div class="tiny muted" style="margin-top:3px">已完成 ' + meta.done + ' / ' + meta.lessons + ' · 当前 Unit 1 · 按当前节奏约 5 个月完成</div></div>' +
      '<button class="btn sm soft" data-go="#/lesson/23">继续 L23</button></div></div>' +
      '<div class="callout">点任意一课可进入“本课聚合页”：预习、学习、复习随时回来。学完的课会自动进入间隔复习。</div>' +
      units + mile;
  };

  /* ---------- 3 课详情聚合页 ---------- */
  var STEPICON = { read: 'ear', vocab: 'layers', grammar: 'braces', listen: 'mic', dict: 'pen' };
  var STEPGO = { read: '#/read', vocab: '#/vocab', grammar: '#/grammar', listen: '#/read', dict: '#/vocab' };
  App.pages.lesson = function () {
    var l = S.lesson, L = D.lesson, doneAll = l <= D.meta.done;
    var steps = D.steps.map(function (s) {
      return '<button class="stepent' + (doneAll ? ' done' : '') + '" data-go="' + STEPGO[s.id] + '" style="width:100%;text-align:left">' +
        '<span class="seico">' + ico(STEPICON[s.id]) + '</span>' +
        '<span class="grow"><span class="tt" style="display:block">' + s.n + '. ' + s.t + '</span><span class="ts">' + esc(s.desc) + ' · 约 ' + s.min + ' 分钟</span></span>' +
        (doneAll ? '<span class="tag ok">已完成</span>' : '<span class="tag new">待学习</span>') + ico('chev') + '</button>';
    }).join('');
    var hero = '<div class="card"><div class="row"><span class="chip on">L' + l + '</span><span class="chip">' + lessonMeta(l) + '</span><span class="chip">音频 ' + fmtTime(L.audioSec) + '</span></div>' +
      '<div style="font-family:var(--font-head);font-size:24px;font-weight:800;margin-top:10px">' + esc(L.title) + '</div>' +
      '<div class="muted">' + esc(L.zh) + '</div>' +
      '<div class="row" style="margin-top:12px"><span class="tag old">生词 ' + L.vocab.length + '</span><span class="tag old">语法 ' + L.grammar.length + '</span>' +
      '<span class="tag ' + (doneAll ? 'ok">本课已完成，可复习' : 'new">今天的主课') + '</span></div></div>';
    var bindBtn = function (k, icon, tone, extra) {
      var b = D.lesson.bind[k];
      return '<button class="stepent" data-action="bind" data-k="' + k + '" style="width:100%;text-align:left">' +
        '<span class="seico" style="background:var(--' + tone + '-soft);color:var(--' + tone + ')">' + ico(icon) + '</span>' +
        '<span class="grow"><span class="tt" style="display:block">' + esc(b.name) + '</span><span class="ts">' + esc(b.desc) + '</span></span>' +
        (extra || '<span class="tag new">进入</span>') + ico('chev') + '</button>';
    };
    var binds = '<div class="card"><b>本课配套资源</b><div style="margin-top:4px">' +
      bindBtn('text', 'ear', 'accent') + bindBtn('jx', 'play', 'info', '<span class="tag new">打开视频</span>') +
      bindBtn('podcast', 'mic', 'warn', '<span class="tag old">可选</span>') + '</div></div>';
    var produce = '<div class="callout">学完本课，系统自动产出：<b>8 张生词卡 · 2 句型卡 · 2 张语法卡</b> → 挂入每日复习池，可一键导出 Anki 卡组。' +
      '<div class="row" style="margin-top:10px;gap:8px"><button class="btn sm soft" data-action="toast" data-msg="演示：已生成 NCE1-L23.apkg（正式版由 genanki 导出）">导出 Anki 卡组</button>' +
      '<button class="btn sm soft" data-action="toast" data-msg="演示：L23 知识包已整理完毕">查看知识包</button></div></div>';
    return hero +
      '<div class="card"><div class="row between"><b>本课学习步骤</b><span class="tiny muted">约 24 分钟</span></div>' + steps + '</div>' +
      binds + produce;
  };

  /* ---------- 4 课文精听 ---------- */
  App.pages.read = function () {
    var blind = S.blind, lines = D.lesson.lines;
    var list = lines.map(function (x, i) {
      var playing = (P.i === i && P.playing);
      return '<div class="readline' + (playing ? ' playing' : '') + '" data-action="playline" data-i="' + i + '">' +
        '<div class="row between"><span class="en">' + (blind ? '第 ' + (i + 1) + ' 句 · 约 ' + Math.round(x.dur) + ' 秒' : esc(x.en)) + '</span>' +
        (playing ? eq(true) : '') + '</div>' +
        (blind ? '' : '<span class="zh">' + esc(x.zh) + '</span>') + '</div>';
    }).join('');
    var spent = 0, i;
    for (i = 0; i < P.i; i++) spent += lines[i].dur;
    if (P.playing) spent += P.off;
    spent = Math.min(spent, totalSec());
    return '<div class="row between"><span class="seg">' +
      '<button class="' + (!blind ? 'on' : '') + '" data-action="blind" data-v="0">对照文本</button>' +
      '<button class="' + (blind ? 'on' : '') + '" data-action="blind" data-v="1">盲听</button></span>' +
      '<span class="row"><span class="chip on">1.0x</span><span class="chip">0.8x</span></span></div>' +
      '<div class="callout">' + (blind ? '盲听模式：只出声不显文。听清多少句？听毕点开“对照文本”核对。' : '逐句点读：点击任意一句从此处播放，边听边看释义。') + '</div>' +
      '<div class="card" style="padding:8px 6px">' + list + '</div>' +
      '<div class="audiobar"><button class="icon-btn" data-action="audioprev">' + ico('prev') + '</button>' +
      '<button class="icon-btn" data-action="audio">' + (P.playing ? ico('pause') : ico('play')) + '</button>' +
      '<button class="icon-btn" data-action="audionext">' + ico('next') + '</button>' +
      '<span class="aub tiny muted">' + fmtTime(spent) + ' / ' + fmtTime(totalSec()) + '</span>' +
      '<span class="tbar"><i style="width:' + (100 * spent / totalSec()) + '%"></i></span>' +
      '<button class="btn sm soft" data-action="toast" data-msg="打卡成功：课文精听完成（正式版写入学习记录）">学完了</button></div>';
  };

  /* ---------- 5 本课生词 ---------- */
  App.pages.vocab = function () {
    var v = S.vocab, list = D.lesson.vocab;
    if (v.done) {
      var tot = v.res.y + v.res.s + v.res.a;
      var acc = tot ? Math.round(100 * (v.res.y + v.res.s) / tot) : 100;
      var note = (v.res.a + v.res.s > 0)
        ? '有 <b>' + (v.res.a + v.res.s) + ' 个词</b>不够熟，已标记进入明日复习池与错词本。'
        : '本课生词全部掌握，课文学完后进入正常间隔复习。';
      return resultCard('本课 8 个生词过完了', doneRing(acc),
        note +
        '<div class="small muted center" style="margin-top:6px">认识 ' + v.res.y + ' · 模糊 ' + v.res.s + ' · 忘了 ' + v.res.a + '</div>',
        '<button class="btn sm" data-action="vreset">再学一遍</button><button class="btn primary sm" data-go="#/read">回课文</button>');
    }
    var cur = list[Math.min(v.i, list.length - 1)];
    var front = '<div class="fcface"><div class="fc-top"><span class="chip">正面 · 回忆释义</span><span class="tiny muted">点击翻面</span></div>' +
      '<div class="fc-word">' + esc(cur.w) + '</div><div class="fc-ipa">' + esc(cur.ipa) + ' · ' + esc(cur.pos) + '</div>' +
      '<div class="fc-foot"><div class="fc-ex"><b>课文语境</b><div>' + esc(cur.ex) + '</div><div class="small muted">' + esc(cur.exzh) + '</div></div></div></div>';
    var back = '<div class="fcface back"><div class="fc-top"><span class="chip">背面 · 答案</span><span class="tiny muted">' + (v.i + 1) + ' / ' + list.length + '</span></div>' +
      '<div class="fc-body"><b style="font-size:20px">' + esc(cur.w) + '</b> <span class="muted">' + esc(cur.ipa) + ' · ' + esc(cur.pos) + '</span>' +
      '<div style="margin-top:6px;font-size:15px">' + esc(cur.zh) + '</div>' +
      '<div class="fc-ex"><div>' + esc(cur.ex) + '</div><div class="small muted">' + esc(cur.exzh) + '</div></div>' +
      (cur.note ? '<div class="small muted" style="margin-top:6px">记忆点：' + esc(cur.note) + '</div>' : '') + '</div></div>';
    return '<div class="row between"><div><b>第 ' + (v.i + 1) + ' / ' + list.length + ' 张</b>' +
      '<div class="tiny muted">本课 8 词 · 新 3 · 已见 5（课文抽取 + 离线词典）</div></div>' +
      '<span class="tag ' + (cur.tag === '新' ? 'new' : 'old') + '">' + cur.tag + '</span></div>' +
      '<div class="flipwrap"><div class="flipcard' + (v.flip ? ' flipped' : '') + '" data-action="flip">' + front + back + '</div></div>' +
      '<div class="row" style="gap:8px"><button class="btn grow again" data-action="vrate" data-v="a">忘了</button>' +
      '<button class="btn grow hard" data-action="vrate" data-v="s">模糊</button>' +
      '<button class="btn grow good" data-action="vrate" data-v="y">认识</button></div>' +
      '<div class="hint-flip">先回忆再翻面。三个按钮决定这张卡多久后再次出现（FSRS 间隔重复）。</div>';
  };

  /* ---------- 6 语法讲解 ---------- */
  App.pages.grammar = function () {
    var cards = D.lesson.grammar.map(function (g) {
      var ex = g.ex.map(function (x) {
        return '<div class="row" style="gap:10px;padding:8px;border-radius:12px;background:var(--card2)"><span class="icon-btn" style="width:30px;height:30px" data-action="toast" data-msg="发音示范（正式版含课文音频）">' + ico('play') + '</span>' +
          '<span class="grow"><span style="font-weight:600">' + esc(x.en) + '</span><span class="tiny muted" style="display:block">' + esc(x.zh) + (x.note ? ' · ' + esc(x.note) : '') + '</span></span></div>';
      }).join('');
      var rel = g.relate.map(function (r) {
        return '<button class="chip" data-go="#/lesson/' + r.l + '">L' + r.l + ' · ' + esc(r.t) + '</button>';
      }).join('');
      return '<div class="card"><div class="row between"><span class="chip on">' + esc(g.key) + '</span><span class="tiny muted">本课语法点</span></div>' +
        '<b style="font-size:16px;margin-top:8px;display:block">' + esc(g.title) + '</b>' +
        '<p class="small" style="line-height:1.85;margin-top:6px">' + esc(g.rule) + '</p>' +
        '<div class="callout"><b>结构公式</b><div style="letter-spacing:.4px">' + esc(g.formula) + '</div></div>' +
        '<div class="col" style="gap:6px">' + ex + '</div>' +
        '<div class="callout" style="border-color:var(--warn);background:var(--warn-soft)"><b>易错提醒</b><div>' + esc(g.warn) + '</div></div>' +
        '<div class="row wrap" style="margin-top:8px"><span class="tiny muted">关联回顾 / 预告：</span>' + rel + '</div></div>';
    }).join('');
    return cards +
      '<div class="callout">读完后自动生成 <b>2 张句型卡 + 2 张语法卡</b>；语法卡到期时会带着课文例句再来问你一次。</div>' +
      '<div class="row" style="gap:8px"><button class="btn sm" data-go="#/lesson/23">返回本课</button><button class="btn primary sm" data-go="#/review">去看复习队列</button></div>';
  };

  /* ---------- 7 复习 ---------- */
  App.pages.review = function () {
    var r = S.rev;
    var list = r.filter === '全部' ? D.review : D.review.filter(function (x) { return x.type === r.filter; });
    if (!list.length) {
      return '<div class="card center"><b>' + r.filter + '暂无到期卡片</b>' +
        '<div class="small muted" style="margin:6px 0 12px">学完新课后就会产生到期卡</div>' +
        '<button class="btn sm" data-action="rfilter" data-v="全部">查看全部</button></div>';
    }
    if (r.done) {
      var tot = (r.res.y + r.res.s + r.res.a + r.res.e) || 1;
      var ok = r.res.y + r.res.e;
      return resultCard('本组复习完成', doneRing(Math.round(100 * ok / tot)),
        'FSRS 按你的回答重排每张卡：<b>忘了 / 模糊的卡最短 10 分钟回来</b>。复习数据已计入战报。' +
        '<div class="small muted center" style="margin-top:6px">简单 ' + r.res.e + ' · 想起 ' + r.res.y + ' · 模糊 ' + r.res.s + ' · 忘了 ' + r.res.a + '</div>',
        '<button class="btn sm" data-action="rreset">再来一组</button><button class="btn primary sm" data-go="#/today">回今日</button>');
    }
    var c = list[Math.min(r.i, list.length - 1)];
    var typeCls = { 生词: 'tb-v', 句型: 'tb-s', 语法: 'tb-g' };
    var dots = list.map(function (_, k) { return '<i class="' + (k <= r.i ? 'on' : '') + '"></i>'; }).join('');
    return '<div class="row between"><div class="dots">' + dots + '</div>' +
      '<div class="row"><span class="tag ok">到期 15 张</span><span class="tiny muted">预计 10 分钟</span></div></div>' +
      '<div class="flipwrap"><div class="flipcard' + (r.flip ? ' flipped' : '') + '" data-action="flip" style="min-height:272px">' +
      '<div class="fcface"><div class="fc-top"><span class="typebd ' + typeCls[c.type] + '">' + c.type + '</span><span class="tiny muted">练习 ' + (r.i + 1) + ' / ' + list.length + '</span></div>' +
      '<div class="fc-body" style="font-size:19px;line-height:1.9;text-align:center;margin-top:36px">' + esc(c.f).replace(/\n/g, '<br>') + '</div>' +
      '<div class="fc-foot"><div class="hint-flip">回想答案后点击卡片翻面</div></div></div>' +
      '<div class="fcface back"><div class="fc-top"><span class="typebd ' + typeCls[c.type] + '">' + c.type + '</span><span class="tiny muted">答案</span></div>' +
      '<div class="fc-body" style="font-size:16.5px">' + esc(c.b).replace(/\n/g, '<br>') + '</div>' +
      '<div class="fc-foot"><div class="hint-flip">如实回答，下次见面时间由它决定</div></div></div></div></div>' +
      '<div class="row" style="gap:7px"><button class="btn grow again" data-action="rrate" data-v="a">忘了</button>' +
      '<button class="btn grow hard" data-action="rrate" data-v="s">模糊</button>' +
      '<button class="btn grow good" data-action="rrate" data-v="y">想起</button>' +
      '<button class="btn grow easy" data-action="rrate" data-v="e">简单</button></div>' +
      '<div class="hint-flip">本队列为演示样例；真实队列来自 FSRS 记忆调度。</div>';
  };

  /* ---------- 8 学情报告 ---------- */
  function bars() {
    var max = 70;
    return '<div class="bars">' + D.weekMin.map(function (v, k) {
      return '<div class="bcol' + (k === 3 ? ' today' : '') + (v === 0 ? ' empty' : '') + '">' +
        '<span class="bv">' + v + '</span><div class="bar" style="height:' + Math.max(4, 100 * v / max) + '%"></div>' +
        '<span class="dl">' + D.weekdays[k].charAt(1) + '</span></div>';
    }).join('') + '</div>';
  }
  function wrongList() {
    var w = D.report.wrong.map(function (x) {
      return '<button class="row" data-go="#/review" style="width:100%;text-align:left;padding:8px 2px;border-bottom:1px dashed var(--line)">' +
        '<span class="tag warn">' + x.n + ' 次</span><span class="small" style="font-weight:600">' + esc(x.t) + '</span>' + ico('chev') + '</button>';
    }).join('');
    return '<div class="card"><div class="row between"><b>错词本 / 易错点</b><span class="tiny muted">点击进入复习</span></div>' + w +
      '<div class="callout" style="margin-top:8px"><b>老师的观察：</b>' + esc(D.report.insight) +
      '<div style="margin-top:8px"><button class="btn sm soft" data-go="#/review">安排一次回炉</button></div></div></div>';
  }
  App.pages.report = function () {
    var rp = D.report;
    var segEl = '<div class="row between"><span class="seg">' +
      '<button class="' + (S.reportSeg === '日' ? 'on' : '') + '" data-action="seg" data-v="日">日报</button>' +
      '<button class="' + (S.reportSeg === '周' ? 'on' : '') + '" data-action="seg" data-v="周">周报</button></span>' +
      '<span class="chip">连续打卡 12 天</span></div>';
    var daily = '<div class="card row" style="align-items:flex-start"><div class="col grow" style="gap:4px"><b>' + rp.daily.date + '</b>' +
      '<span class="tiny muted">有效学习时长</span><b style="font-size:25px">' + rp.daily.min + '<span class="small muted"> 分钟</span></b></div>' +
      '<div class="col grow"><div class="row between"><span class="small muted">复习卡片</span><b>' + rp.daily.cards + ' 张</b></div>' +
      '<div class="row between"><span class="small muted">平均正确率</span><b style="color:var(--ok)">' + rp.daily.acc + '%</b></div>' +
      '<div class="row between"><span class="small muted">新学单词</span><b>' + rp.daily.words + ' 个</b></div></div></div>';
    var weekly = '<div class="card"><div class="row between"><b>本周时长（分钟）</b><span class="chip">' + rp.weekly.done + ' / ' + rp.weekly.total + ' 天达标</span></div>' + bars() + '</div>' +
      '<div class="card"><b>本周累计</b><div class="row" style="justify-content:space-between;margin-top:10px;text-align:center">' +
      [['时长', rp.weekly.minutes], ['卡片', rp.weekly.cards + ' 张'], ['正确率', rp.weekly.acc + '%'], ['新词', rp.weekly.words]].map(function (x) {
        return '<div><div style="font-size:17px;font-weight:800">' + x[1] + '</div><div class="tiny muted">' + x[0] + '</div></div>';
      }).join('') + '</div></div>' +
      '<div class="card"><b>掌握度（按卡型）</b>' +
      '<div class="col" style="margin-top:10px">' + rp.mastery.map(function (m) {
        return '<div class="row"><span class="small muted" style="width:36px">' + m.k + '</span><span class="mbar"><i style="width:' + m.v + '%"></i></span><b class="small" style="width:38px;text-align:right">' + m.v + '%</b></div>';
      }).join('') + '</div></div>';
    return segEl + (S.reportSeg === '日' ? daily : weekly) + wrongList() +
      '<div class="row" style="gap:8px"><button class="btn grow sm" data-action="toast" data-msg="演示：已导出 学习档案.json">导出档案</button>' +
      '<button class="btn grow sm soft" data-action="toast" data-msg="演示：战报已同步到明晨的老师来信">同步给老师</button></div>';
  };

  /* ---------- 9 老师来信 ---------- */
  App.pages.messages = function () {
    var open = S.msgOpen;
    var items = D.messages.map(function (m) {
      if (open === m.id) {
        return '<div class="card msg"><div class="row between"><div><span class="chip on">' + esc(m.tag) + '</span>' +
          '<span class="tiny muted" style="margin-left:6px">' + esc(m.at) + '</span></div><button class="btn ghost sm" data-action="msgclose">收起</button></div>' +
          '<div style="font-family:var(--font-head);font-size:17px;font-weight:800;margin-top:8px">' + esc(m.title) + '</div>' +
          '<div class="mbody">' + esc(m.body) + '</div>' +
          '<div class="sig">—— 你的学习老师</div>' +
          '<button class="btn primary block" data-go="' + m.ctaGo + '">' + esc(m.cta) + '</button></div>';
      }
      var read = S.msgRead.indexOf(m.id) >= 0;
      return '<button class="card msg" data-action="msg" data-id="' + m.id + '" style="width:100%;text-align:left">' +
        '<div class="mhd"><span class="tag ' + (read ? 'old' : 'warn') + '">' + (read ? esc(m.tag) : '未读') + '</span>' +
        '<span class="tiny muted">' + esc(m.at) + '</span></div>' +
        '<div class="mtitle">' + esc(m.title) + '</div>' +
        '<div class="mex">' + esc(m.body.replace(/\n/g, ' ').slice(0, 40)) + '…</div>' + ico('chev') + '</button>';
    }).join('');
    var un = H.unreadCount();
    return '<div class="card row"><span class="seico" style="background:var(--info-soft);color:var(--info)">' + ico('ear') + '</span>' +
      '<div class="grow"><b>老师来信</b><div class="tiny muted">敦促 · 战报 · 里程碑 · 学习观察</div></div>' +
      (un ? '<span class="tag warn">' + un + ' 条未读</span>' : '<span class="tag ok">已全部读完</span>') + '</div>' +
      '<div class="callout">来信 = 模板 + 你的真实学习数据自动生成（非 AI）。每一条都在推动闭环：读到 → 去执行 → 数据回来。</div>' + items;
  };

  /* ---------- 10a 我的（入口页） ---------- */
  function entry(icon, title, sub, badge, goTo) {
    return '<button class="lirow" data-go="' + goTo + '" style="width:100%;text-align:left">' +
      '<span class="seico">' + ico(icon) + '</span><span class="grow"><span style="font-weight:700">' + title + '</span>' +
      (sub ? '<span class="ts" style="display:block">' + sub + '</span>' : '') + '</span>' +
      (badge ? '<span class="tag warn">' + badge + '</span>' : '') + ico('chev') + '</button>';
  }
  App.pages.me = function () {
    var un = H.unreadCount();
    var n = D.settings.nickname;
    return '<div class="card row" style="gap:14px">' +
      '<div style="width:58px;height:58px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800">' + esc(n.charAt(0)) + '</div>' +
      '<div class="grow"><b style="font-size:17px">' + esc(n) + '</b><div class="tiny muted">学习者 · NCE1 · 主线 ' + D.meta.done + '/144</div>' +
      '<div class="row" style="margin-top:6px"><span class="chip"><b style="color:var(--warn)">12</b>&nbsp;天连击</span><span class="chip">正确率 82%</span></div></div></div>' +
      '<div class="card" style="padding:6px 14px">' +
      entry('ear', '老师来信', '敦促与学习观察', un ? un + ' 未读' : '', '#/messages') +
      entry('book', '学习设置', '每日目标 · 提醒 · 节奏', '', '#/settings') +
      entry('theme', '主题与外观', '温暖 / 清爽 / 深色 / 笔记', '', '#/settings') +
      entry('chart', '数据与备份', '导出 Anki · 学习档案', '', '#/settings') + '</div>' +
      '<div class="card small muted" style="line-height:1.9">本页面为交互原型（PROTOTYPE）：演示信息流与交互方式，不含真实后端。10 页流程 + 4 套主题可在右上角随时切换。</div>';
  };

  /* ---------- 10b 设置 ---------- */
  var CH = { push: ['浏览器推送', 'PWA / 添加到主屏'], email: ['邮件提醒', '备用渠道'], wechat: ['微信提醒', 'Server酱（预留）'] };
  App.pages.settings = function () {
    var s = S.chan, st = D.settings;
    var th = D.themes.map(function (t) {
      return '<button class="thcell' + (S.theme === t.key ? ' sel' : '') + '" data-action="theme" data-k="' + t.key + '">' +
        '<div class="thsw ' + SW[t.key] + '"></div><b>' + t.name + '</b><span>' + t.desc + '</span></button>';
    }).join('');
    var chan = Object.keys(CH).map(function (k) {
      return '<div class="setrow"><div><div class="sl">' + CH[k][0] + '</div><div class="sd">' + CH[k][1] + '</div></div>' +
        '<button class="switch' + (s[k] ? ' on' : '') + '" data-action="chan" data-k="' + k + '"></button></div>';
    }).join('');
    var bud = st.budgetOpts.map(function (b) {
      return '<button class="chip' + (s.budget === b ? ' on' : '') + '" data-action="budget" data-v="' + b + '">' + b + ' 分钟</button>';
    }).join('');
    return '<div class="card"><b>基本信息</b>' +
      '<div class="setrow"><div class="sl">昵称</div><input class="inp" style="width:150px" value="' + esc(st.nickname) + '"></div>' +
      '<div class="setrow"><div class="sl">每日时间预算</div><div class="sd">决定任务包大小与督促强度</div></div>' +
      '<div class="row wrap">' + bud + '</div></div>' +
      '<div class="card"><b>提醒与敦促</b>' +
      '<div class="setrow"><div><div class="sl">晨间来信</div><div class="sd">今天学什么、先提醒你</div></div>' +
      '<button class="switch' + (s.am ? ' on' : '') + '" data-action="time" data-k="am"></button></div>' +
      '<div class="setrow"><div><div class="sl">晚间督促</div><div class="sd">未完成时 20:00 / 21:00 两轮</div></div>' +
      '<button class="switch' + (s.pm ? ' on' : '') + '" data-action="time" data-k="pm"></button></div>' +
      chan + '</div>' +
      '<div class="card"><b>学习节奏</b>' +
      '<div class="setrow"><div><div class="sl">新词上限</div><div class="sd">单日新课最多纳入的生词数</div></div><span class="chip on">10 个</span></div>' +
      '<div class="setrow"><div><div class="sl">主线进度</div><div class="sd">当前按“每天 1 课 + 到期复习”</div></div><span class="tag ok">自适应中</span></div>' +
      '<div class="setrow"><div><div class="sl">复习算法</div><div class="sd">FSRS 记忆调度（本地计算，免费）</div></div><span class="chip on">FSRS</span></div>' +
      '<div class="setrow"><div><div class="sl">错词回炉</div><div class="sd">连续答错的词自动进明日复习</div></div><button class="switch on"></button></div></div>' +
      '<div class="card"><b>主题与外观</b><div style="margin-top:10px" class="thgrid">' + th + '</div></div>' +
      '<div class="card"><b>数据</b>' +
      '<div class="row" style="gap:8px;margin-top:10px">' +
      '<button class="btn grow sm" data-action="toast" data-msg="演示：已完成 SQLite 备份（每日自动）">立即备份</button>' +
      '<button class="btn grow sm" data-action="toast" data-msg="演示：已导出全部课程卡组 .apkg">导出 Anki</button></div>' +
      '<div class="tiny muted" style="margin-top:10px">本地单库 · 每日自动备份 · 无账号体系（单用户模式）</div></div>' +
      '<button class="btn primary block" data-action="toast" data-msg="演示：设置已保存（原型不落盘）">保存设置</button>';
  };
})();
