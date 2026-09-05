/* 学习助手原型 · 核心引擎（PROTOTYPE） */
var App = window.App = {};
App.pages = {};
var D = window.DATA;

/* ---------- 基础工具 ---------- */
var $ = function (s) { return document.querySelector(s); };
var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
function fmtTime(sec) {
  var m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
function totalSec() { var s = 0; D.lesson.lines.forEach(function (l) { s += l.dur; }); return s; }
function lessonMeta(l) { return 'Unit ' + (1 + Math.floor((l - 1) / 24)); }

/* ---------- 图标 ---------- */
var I = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  play: '<path fill="currentColor" stroke="none" d="M9 6.4v11.2l8.6-5.6z"/>',
  pause: '<path fill="currentColor" stroke="none" d="M9 6.2h2.5v11.6H9zM12.6 6.2h2.5v11.6h-2.5z"/>',
  prev: '<path fill="currentColor" stroke="none" d="M7.6 6.2H6v11.6h1.6zM18.4 6.4v11.2L9.4 12z"/>',
  next: '<path fill="currentColor" stroke="none" d="M16.4 6.2H18v11.6h-1.6zM5.6 6.4v11.2l9 5.6z"/>',
  home: '<path d="M4 10.6L12 3.4l8 7.2"/><path d="M6 9.4V20h12V9.4"/><path d="M10 20v-5h4v5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v16.5H6.5A2.5 2.5 0 004 22z"/><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>',
  repeat: '<path d="M4 7h12"/><path d="M12.5 4L16 7l-3.5 3"/><path d="M20 17H8"/><path d="M11.5 20L8 17l3.5-3"/>',
  chart: '<path d="M5 20v-9M10.5 20V4M16 20v-6"/><path d="M3 20h18"/>',
  user: '<circle cx="12" cy="7.6" r="3.5"/><path d="M5 20.5a7 7 0 0114 0"/>',
  theme: '<path d="M12 3a9 9 0 00-9 9 4.5 4.5 0 004.5 4.5h2.6a2.4 2.4 0 012.4 2.4c0 1.4 1.1 2.6 2.5 2.6A9 9 0 0012 3z"/><circle cx="8.2" cy="10.5" r="1.05"/><circle cx="12" cy="7" r="1.05"/><circle cx="15.9" cy="9.6" r="1.05"/>',
  mic: '<rect x="9" y="3" width="6" height="10.5" rx="3"/><path d="M5.4 11.5a6.6 6.6 0 0013.2 0"/><path d="M12 18v2.6"/>',
  ear: '<path d="M4 12a8 8 0 0116 0"/><rect x="3.6" y="12" width="4.4" height="7" rx="2.2"/><rect x="16" y="12" width="4.4" height="7" rx="2.2"/>',
  layers: '<path d="M12 3.2l8.6 4.8L12 12.8 3.4 8z"/><path d="M3.4 12.6l8.6 4.8 8.6-4.8"/><path d="M3.4 17.2l8.6 4.8 8.6-4.8"/>',
  braces: '<path d="M8.4 3.8c-2 0-2.4 1.8-2.4 3.2s0 2.8-2 2.8 2 1.4 2 2.8 0 3.2 2.4 3.2M15.6 3.8c2 0 2.4 1.8 2.4 3.2s0 2.8 2 2.8-2 1.4-2 2.8 0 3.2-2.4 3.2"/>',
  pen: '<path d="M4.5 19.5l1.2-4.2L16 5a2 2 0 012.9 2.9L8.6 18.2z"/><path d="M13.6 7.4l3.2 3.2"/>'
};
function ico(n, cls) {
  return '<svg' + (cls ? ' class="' + cls + '"' : '') +
    ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[n] || '') + '</svg>';
}

/* ---------- 状态（内存态，无持久化） ---------- */
var S = App.S = {
  theme: 'warm', lesson: 23,
  tasks: {},
  openUnits: { 1: true },
  vocab: { i: 0, done: false, flip: false, res: { y: 0, s: 0, a: 0 } },
  rev: { i: 0, done: false, flip: false, res: { y: 0, s: 0, a: 0, e: 0 }, filter: '全部' },
  reportSeg: '周',
  blind: false,
  msgOpen: null,
  msgRead: [4],
  chan: { budget: 60, am: true, pm: true, push: true, email: false, wechat: false }
};
var navStack = [];
var P = App.P = { playing: false, i: 0, off: 0 };
var T;

/* ---------- 主题 ---------- */
var SW = { warm: 'ts-warm', clean: 'ts-clean', dark: 'ts-dark', retro: 'ts-retro' };
App.setTheme = function (k) {
  S.theme = k;
  document.documentElement.setAttribute('data-theme', k);
  try {
    var u = location.href.split('#')[0];
    history.replaceState(null, '', u + '?theme=' + k + location.hash);
  } catch (e) { }
};

/* ---------- 导航 ---------- */
App.go = function (h) {
  if (!h || h === '#') { App.toast('演示数据：正式版将跳转到对应外部资源'); return; }
  if (h === location.hash) { App.render(); } else { navStack.push(location.hash || '#/today'); location.hash = h; }
};
App.back = function () { location.hash = navStack.length ? navStack.pop() : '#/today'; };

/* ---------- 提示 ---------- */
App.toast = function (m) {
  var el = $('#toast');
  if (T) clearTimeout(T);
  el.textContent = m;
  el.classList.remove('hide'); el.classList.add('show');
  T = setTimeout(function () { el.classList.remove('show'); el.classList.add('hide'); }, 2200);
};

/* ---------- 学习统计小工具 ---------- */
function taskChecked(g, i) { return !!S.tasks[g + '-' + i]; }
function doneTasks() {
  var c = 0;
  D.today.groups.forEach(function (g, gi) {
    g.items.forEach(function (_, ii) { if (taskChecked(g.key, ii)) c++; });
  });
  return c;
}
function allTasks() { var c = 0; D.today.groups.forEach(function (g) { c += g.items.length; }); return c; }
function unreadCount() { return D.messages.filter(function (m) { return S.msgRead.indexOf(m.id) < 0; }).length; }
App.helpers = {
  esc: esc, ico: ico, fmtTime: fmtTime, totalSec: totalSec, lessonMeta: lessonMeta,
  taskChecked: taskChecked, doneTasks: doneTasks, allTasks: allTasks, unreadCount: unreadCount
};

function ring(pct, size, color) {
  var r = size / 2 - 6, c = 2 * Math.PI * r;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke="var(--line)" stroke-width="7" fill="none"/>' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke="' + (color || 'var(--accent)') + '"' +
    ' stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="' + c + '"' +
    ' stroke-dashoffset="' + (c * (1 - pct)) + '" style="transition:stroke-dashoffset .6s"/></svg>';
}
App.ring = ring;
function eq(on) { return '<span class="eq' + (on ? '' : ' static-eq') + '"><i></i><i></i><i></i><i></i></span>'; }
App.eq = eq;

/* ---------- 页眉标题配置 ---------- */
var TITLE = {
  today: ['今日', '9月3日 · 周四 · 主线课程'],
  map: ['课程地图', '新概念英语 · 第一册'],
  lesson: ['第 23 课', 'Unit 1 · 本课聚合页'],
  read: ['课文精听', 'L23 Which glasses?'],
  vocab: ['本课生词', 'L23 · 8 个单词'],
  grammar: ['语法讲解', 'L23 · 2 个语法点'],
  review: ['今日复习', '到期 15 张 · 预计 10 分钟'],
  report: ['学情报告', '每日 / 每周战报'],
  messages: ['老师来信', '来自你的学习老师'],
  me: ['我的', '设置与数据'],
  settings: ['设置', '偏好 · 外观 · 数据']
};

/* ---------- 渲染调度 ---------- */
function parts() { return (location.hash || '#/today').replace(/^#\//, '').split('/'); }
App.render = function () {
  App.stopPlayer();
  var p = parts(), base = p[0];
  if (base === 'lesson' && p[1]) S.lesson = parseInt(p[1], 10) || 23;
  var html;
  if (App.pages[base]) { html = App.pages[base](); }
  else { base = 'today'; html = App.pages.today(); }
  $('#view').innerHTML = html;
  if (App.keepScroll) { App.keepScroll = false; } else { window.scrollTo(0, 0); }

  var t = TITLE[base] || TITLE.today;
  $('#title').textContent = t[0];
  var sub = t[1];
  if (base === 'lesson') sub = lessonMeta(S.lesson) + ' · L' + S.lesson;
  if (base === 'read') sub = 'L' + S.lesson + ' · ' + D.lesson.title;
  if (base === 'vocab') sub = 'L' + S.lesson + ' · ' + D.lesson.vocab.length + ' 个单词';
  if (base === 'grammar') sub = 'L' + S.lesson + ' · ' + D.lesson.grammar.length + ' 个语法点';
  $('#subtitle').textContent = sub;

  var tabIds = ['today', 'map', 'review', 'report', 'me'];
  $('#backBtn').classList.toggle('hidden', tabIds.indexOf(base) >= 0);
  var tabEls = document.querySelectorAll('#tabbar button');
  for (var i = 0; i < tabEls.length; i++) {
    tabEls[i].classList.toggle('on', tabIds.indexOf(base) >= 0 && tabEls[i].getAttribute('data-nav') === base);
  }
  if (base === 'settings' || base === 'messages') $('#palette').classList.add('hidden');
};

/* ---------- 音频引擎（课文点读演示） ---------- */
function spent() {
  var s = 0, i;
  for (i = 0; i < P.i; i++) s += D.lesson.lines[i].dur;
  if (P.playing) s += P.off;
  return Math.min(s, totalSec());
}
function paintUI() {
  if (!$('#view').querySelector('.audiobar')) return;
  var lines = $('#view').querySelectorAll('.readline');
  for (var i = 0; i < lines.length; i++) lines[i].classList.remove('playing');
  var cur = $('#view').querySelector('.readline[data-i="' + P.i + '"]');
  if (cur) cur.classList.add('playing');
  var bar = $('#view').querySelector('.audiobar .tbar i');
  if (bar) bar.style.width = (100 * spent() / totalSec()) + '%';
  var lab = $('#view').querySelector('.aub');
  if (lab) lab.textContent = fmtTime(spent()) + ' / ' + fmtTime(totalSec());
  var btn = $('#view').querySelector('[data-action="audio"]');
  if (btn) btn.innerHTML = P.playing ? ico('pause') : ico('play');
}
App.stopPlayer = function () { P.playing = false; P.i = 0; P.off = 0; };
App.startPlay = function (i) { P.i = Math.max(0, Math.min(i, D.lesson.lines.length - 1)); P.off = 0; P.playing = true; paintUI(); };
App.togglePlay = function () { P.playing = !P.playing; if (!P.playing) P.off = 0; paintUI(); };
App.playNext = function () { App.startPlay(P.i >= D.lesson.lines.length - 1 ? 0 : P.i + 1); };
App.playPrev = function () { App.startPlay(Math.max(0, P.i - 1)); };
setInterval(function () {
  if (!P.playing) return;
  var d = D.lesson.lines[P.i].dur;
  P.off += 0.25;
  if (P.off >= d) {
    P.off = 0; P.i++;
    if (P.i >= D.lesson.lines.length) { App.stopPlayer(); }
  }
  paintUI();
}, 250);

/* ---------- 初始化 ---------- */
App.init = function () {
  var q = (location.search.match(/theme=(\w+)/) || [])[1];
  App.setTheme(D.themes.some(function (t) { return t.key === q; }) ? q : 'warm');
  $('#backBtn').innerHTML = ico('back');
  $('#themeBtn').innerHTML = ico('theme');
  var tabs = $('#tabbar');
  D.tabs.forEach(function (t) {
    var b = document.createElement('button');
    b.setAttribute('data-nav', t.id);
    b.setAttribute('data-go', '#/' + t.id);
    b.innerHTML = ico(t.icon) + '<span>' + t.label + '</span>';
    tabs.appendChild(b);
  });
  var pal = $('#palette');
  D.themes.forEach(function (t) {
    var b = document.createElement('button');
    b.className = (S.theme === t.key ? 'sel' : '');
    b.setAttribute('data-action', 'theme');
    b.setAttribute('data-k', t.key);
    b.innerHTML = '<span class="sw ' + SW[t.key] + '"></span><span class="grow"><span class="pname" style="display:block">' + t.name + '</span><span class="pdesc">' + t.desc + '</span></span>';
    pal.appendChild(b);
  });
  window.addEventListener('hashchange', App.render);
  document.addEventListener('click', App.onClick);
  App.render();
};
