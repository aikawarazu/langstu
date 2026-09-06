/* ===== 内容脚本：在任意网页即点即译 =====
   双击单词 / 选中短语 → 在页面内浮出释义（取自新概念英语跨课词库），
   并提供「朗读」与「在侧栏查看本课」两个动作，把在线阅读与课程资料打通。 */
(function () {
  "use strict";

  var VOCAB_URL = chrome.runtime.getURL('data/vocab.json');
  var vocab = null, vocabLoading = null;
  var bubble = null, lastKey = '';

  function normW(w) { return String(w == null ? '' : w).toLowerCase().replace(/[^a-z'’-]/g, ''); }
  function meaningsText(w) {
    return ((w && w.meanings) || []).map(function (m) {
      return (m.pos ? m.pos + '. ' : '') + (m.meaning || '') + (m.usage ? '（' + m.usage + '）' : '');
    }).join('；');
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function loadVocab() {
    if (vocab) return Promise.resolve(vocab);
    if (vocabLoading) return vocabLoading;
    vocabLoading = fetch(VOCAB_URL).then(function (r) { return r.json(); }).then(function (v) { vocab = v; return v; });
    return vocabLoading;
  }

  function lookup(q) {
    q = String(q || '').trim();
    if (!q || !vocab) return null;
    if (/\s/.test(q)) {
      var pk = q.toLowerCase().replace(/[^a-z ]/g, '').trim();
      var arr = vocab.phrases[pk];
      if (arr && arr.length) return { type: 'phrase', entry: arr[0] };
      return null;
    }
    var wk = normW(q);
    var rec = vocab.words[wk] || vocab.words[vocab.aliases[wk]];
    if (rec && rec.entries.length) return { type: 'word', entry: rec.entries[0] };
    return null;
  }

  /* 从选区提取可查的词 / 短语（最多 4 词，且非可编辑区） */
  function extract() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
    var node = sel.anchorNode;
    if (node && node.nodeType === 3) {
      var p = node.parentElement;
      if (p && (p.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(p.tagName))) return null;
    }
    var text = sel.toString().replace(/[\u00a0]/g, ' ').trim();
    var cleans = text.replace(/^[^\w]+|[^\w]+$/g, ''); // 去首尾标点
    if (!cleans) return null;
    var words = cleans.split(/\s+/);
    if (words.length > 4) return null;
    if (!/^[A-Za-z][A-Za-z'’\-\s]*$/.test(cleans)) return null;
    return cleans;
  }

  function showBubble(text, rect) {
    loadVocab().then(function () {
      var hit = lookup(text);
      if (!hit) { hideBubble(); return; }
      var e = hit.entry;
      var title = hit.type === 'phrase' ? e.phrase : e.word;
      var ph = e.phonetic ? '<span class="ph">' + esc(e.phonetic) + '</span>' : '';
      var ex = (e.examples || []).slice(0, 1).map(function (x) {
        return '<div class="ex">' + esc(x.en || '') + (x.zh ? ' — ' + esc(x.zh) : '') + '</div>';
      }).join('');
      ensureBubble();
      bubble.innerHTML =
        '<div class="nce-h"><b>' + esc(title) + '</b>' + ph +
        '<button class="nce-sp" title="朗读">🔊</button>' +
        '<button class="nce-x" title="关闭">✕</button></div>' +
        '<div class="nce-m">' + esc(meaningsText(e)) + '</div>' + ex +
        '<div class="nce-f">📚 ' + esc((vocab.packages[e.pkg] || e.pkg)) + ' · ' + esc(e.lessonLabel || '') + '</div>' +
        '<div class="nce-acts"><button class="nce-go" data-pkg="' + e.pkg + '" data-unit="' + e.unit + '">在侧栏查看本课 →</button></div>';
      bubble.hidden = false;
      var bw = bubble.offsetWidth, bh = bubble.offsetHeight;
      var left = Math.max(8, Math.min(rect.left, window.innerWidth - bw - 8));
      var top = rect.bottom + 8; if (top + bh > window.innerHeight - 8) top = Math.max(8, rect.top - bh - 8);
      bubble.style.left = left + 'px'; bubble.style.top = top + 'px';

      bubble.querySelector('.nce-sp').onclick = function (ev) { ev.stopPropagation(); speak(title); };
      bubble.querySelector('.nce-x').onclick = function (ev) { ev.stopPropagation(); hideBubble(); };
      bubble.querySelector('.nce-go').onclick = function (ev) {
        ev.stopPropagation();
        chrome.runtime.sendMessage({ type: 'openLesson', pkg: e.pkg, unit: e.unit });
        hideBubble();
      };
    });
  }

  function ensureBubble() {
    if (bubble) return;
    bubble = document.createElement('div');
    bubble.className = 'nce-bubble';
    bubble.setAttribute('hidden', '');
    bubble.addEventListener('mousedown', function (ev) { ev.stopPropagation(); ev.preventDefault(); });
    document.body.appendChild(bubble);
  }
  function hideBubble() { if (bubble) bubble.hidden = true; }

  function speak(text) {
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.95;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { }
  }

  function onSelect() {
    var text = extract();
    if (!text) { hideBubble(); return; }
    var key = text.toLowerCase();
    if (key === lastKey && bubble && !bubble.hidden) return;
    lastKey = key;
    var sel = window.getSelection();
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    showBubble(text, rect);
  }

  document.addEventListener('mouseup', function () { setTimeout(onSelect, 0); });
  document.addEventListener('dblclick', function () { setTimeout(onSelect, 0); });
  document.addEventListener('mousedown', function (e) {
    if (bubble && !bubble.hidden && !(e.target.closest && e.target.closest('.nce-bubble'))) hideBubble();
  });
  document.addEventListener('scroll', hideBubble, true);
  window.addEventListener('resize', hideBubble);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideBubble(); });
})();
