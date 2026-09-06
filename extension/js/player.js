/* ===== 音频精听播放器（复用站点 LRC 字幕驱动逻辑）=====
   自包含：在 mount 元素内构建字幕框 + 控制条 + 进度条，驱动 <audio> 播放。
   支持：双语/中文/英文/模糊四种字幕、上一句/下一句、单句循环、整段循环、A-B 复读、0.75~1.5x 倍速、点句定位。 */
window.AudioPlayer = (function () {
  var fmt = LrcUtil.fmt, clampT = LrcUtil.clampT;
  var MODES = ['show', 'zh', 'en', 'blur'];
  var MODE_TXT = { show: '字幕：双语', zh: '字幕：中文', en: '字幕：英文', blur: '字幕：模糊' };
  var RATES = [0.75, 0.9, 1, 1.15, 1.3, 1.5];

  function AudioPlayer(mount) {
    this.mount = mount;
    this.seg = [];
    this.divs = [];
    this.cur = -1;
    this.mode = 0;
    this.rate = 1;
    this.loop = false;
    this.loopAll = true;
    this.abA = null;
    this.abB = null;
    this.dict = null;        // 当前课文生词表，用于字幕点词即查
    this.onWordClick = null; // (word, el) => void
    this._build();
  }

  AudioPlayer.prototype._build = function () {
    var self = this;
    this.mount.innerHTML =
      '<div class="scard">' +
        '<div class="sub" id="spSub"><div class="loading">选择课程后加载音频…</div></div>' +
        '<div class="pbar-wrap">' +
          '<button class="pbtn" id="spPlay">▶</button>' +
          '<div class="pmeta"><div class="t" id="spMeta">准备</div><div class="s" id="spState"></div>' +
            '<div class="seek" id="spSeek"><div class="sa" id="spAB" style="display:none"></div>' +
              '<div class="sf" id="spFill"></div><div class="kn" id="spKn" style="left:0"></div></div>' +
            '<div class="sm" style="text-align:right;margin-top:2px"><span id="spCur">0:00</span> / <span id="spAll">0:00</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="ctrls" style="padding:0 12px 12px">' +
          '<button class="cbtn" id="spPrev">⏮ 上一句</button>' +
          '<button class="cbtn" id="spNext">⏭ 下一句</button>' +
          '<button class="cbtn" id="spLoop">🔂 单句循环</button>' +
          '<button class="cbtn" id="spLoopAll">🔁 整段循环</button>' +
          '<button class="cbtn" id="spAB">⭯ A-B 复读</button>' +
          '<button class="cbtn" id="spRate">1.0x</button>' +
          '<button class="cbtn" id="spMode">字幕：双语</button>' +
        '</div>' +
      '</div>';

    this.audio = document.createElement('audio');
    this.audio.preload = 'none';
    this.mount.appendChild(this.audio);

    this.sub = this.mount.querySelector('#spSub');
    this.playBtn = this.mount.querySelector('#spPlay');
    this.meta = this.mount.querySelector('#spMeta');
    this.state = this.mount.querySelector('#spState');
    this.seek = this.mount.querySelector('#spSeek');
    this.fill = this.mount.querySelector('#spFill');
    this.kn = this.mount.querySelector('#spKn');
    this.abEl = this.mount.querySelector('#spAB');
    this.curEl = this.mount.querySelector('#spCur');
    this.allEl = this.mount.querySelector('#spAll');

    this.playBtn.onclick = function () { self.toggle(); };
    this.mount.querySelector('#spPrev').onclick = function () { self.step(-1); };
    this.mount.querySelector('#spNext').onclick = function () { self.step(1); };
    this.mount.querySelector('#spLoop').onclick = function () { self.loop = !self.loop; self.refreshCtrls(); };
    this.mount.querySelector('#spLoopAll').onclick = function () { self.loopAll = !self.loopAll; self.refreshCtrls(); };
    this.mount.querySelector('#spAB').onclick = function () { self.toggleAB(); };
    this.mount.querySelector('#spRate').onclick = function () { self.cycleRate(); };
    this.mount.querySelector('#spMode').onclick = function () { self.mode = (self.mode + 1) % 4; self.refreshCtrls(); self.renderSub(); };

    this.seek.addEventListener('click', function (e) {
      var r = self.seek.getBoundingClientRect();
      var f = (e.clientX - r.left) / r.width;
      if (self.audio.duration) self.audio.currentTime = clampT(f * self.audio.duration, self.audio.duration);
    });
    this.sub.addEventListener('click', function (e) {
      var w = e.target.closest ? e.target.closest('.tb-w') : null;
      if (w) { if (self.onWordClick) self.onWordClick(w.dataset.w || w.textContent, w); return; }
      var el = e.target.closest ? e.target.closest('.sline') : null;
      if (el && el.dataset.si != null) self.seekToSeg(+el.dataset.si);
    });

    this.audio.addEventListener('timeupdate', function () { self.onTime(); });
    this.audio.addEventListener('loadedmetadata', function () { self.allEl.textContent = fmt(self.audio.duration); self.refreshCtrls(); });
    this.audio.addEventListener('play', function () { self.playBtn.textContent = '⏸'; });
    this.audio.addEventListener('pause', function () { self.playBtn.textContent = '▶'; });
    this.audio.addEventListener('ended', function () { self.playBtn.textContent = '▶'; });
    this.audio.addEventListener('error', function () { self.meta.textContent = '音频加载失败（需联网访问外链）'; });
  };

  AudioPlayer.prototype.setDict = function (dict) {
    this.dict = dict || null;
    this.renderSub();
  };

  AudioPlayer.prototype.load = function (track, parsed) {
    this.seg = parsed ? parsed.seg : [];
    this.divs = parsed ? parsed.divs : [];
    this.cur = -1;
    this.abA = this.abB = null;
    if (track && track.url) {
      this.audio.src = track.url;
      this.audio.playbackRate = this.rate;
      this.meta.textContent = track.label || '音频';
    } else {
      this.audio.removeAttribute('src');
      this.meta.textContent = '本课无音频';
    }
    this.renderSub();
    this.refreshCtrls();
    this.fill.style.width = '0%'; this.kn.style.left = '0'; this.curEl.textContent = '0:00';
  };

  AudioPlayer.prototype.sentenceEnd = function (i) {
    if (i < 0 || i >= this.seg.length) return this.audio.duration || 0;
    var nxt = this.seg[i + 1];
    return nxt ? nxt.t : (this.audio.duration || 0);
  };
  AudioPlayer.prototype.seekToSeg = function (i) {
    if (!this.seg[i]) return;
    this.audio.currentTime = clampT(this.seg[i].t, this.audio.duration);
    if (this.audio.paused) this.toggle();
  };
  AudioPlayer.prototype.step = function (d) {
    if (!this.seg.length) return;
    var i = this.cur < 0 ? 0 : this.cur + d;
    i = Math.max(0, Math.min(this.seg.length - 1, i));
    this.seekToSeg(i);
  };
  AudioPlayer.prototype.toggle = function () {
    if (!this.audio.src) return;
    if (this.audio.paused) this.audio.play().catch(function () { }); else this.audio.pause();
  };
  AudioPlayer.prototype.cycleRate = function () {
    var i = RATES.indexOf(this.rate);
    this.rate = RATES[(i + 1) % RATES.length];
    this.audio.playbackRate = this.rate;
    this.refreshCtrls();
  };
  AudioPlayer.prototype.toggleAB = function () {
    if (this.cur < 0) return;
    if (this.abA == null) { this.abA = this.cur; this.abB = null; }
    else if (this.abB == null) { this.abB = this.cur; if (this.abB < this.abA) { var t = this.abA; this.abA = this.abB; this.abB = t; } }
    else { this.abA = this.cur; this.abB = null; }
    this.refreshCtrls();
    this.renderAB();
  };
  AudioPlayer.prototype.renderAB = function () {
    if (this.abA == null || this.abB == null || !this.seg.length) { this.abEl.style.display = 'none'; return; }
    var a = this.seg[this.abA].t, b = this.sentenceEnd(this.abB);
    if (!this.audio.duration) { this.abEl.style.display = 'none'; return; }
    this.abEl.style.display = 'block';
    this.abEl.style.left = (a / this.audio.duration * 100) + '%';
    this.abEl.style.width = ((b - a) / this.audio.duration * 100) + '%';
  };

  AudioPlayer.prototype.onTime = function () {
    var t = this.audio.currentTime, dur = this.audio.duration || 0;
    if (dur) { this.fill.style.width = (t / dur * 100) + '%'; this.kn.style.left = (t / dur * 100) + '%'; }
    this.curEl.textContent = fmt(t);
    // A-B 复读
    if (this.abA != null && this.abB != null && this.seg[this.abB]) {
      var bEnd = this.sentenceEnd(this.abB);
      if (t >= bEnd - 0.02) { this.audio.currentTime = clampT(this.seg[this.abA].t, dur); return; }
    }
    // 单句循环
    if (this.cur >= 0 && this.loop) {
      var end = this.sentenceEnd(this.cur);
      if (end > 0 && t >= end - 0.02) { this.audio.currentTime = clampT(this.seg[this.cur].t, dur); return; }
    }
    // 整段循环
    if (this.loopAll && dur && t >= dur - 0.05 && this.seg.length) {
      this.audio.currentTime = clampT(this.seg[0].t, dur); return;
    }
    // 当前句高亮
    var i = this.curIndex(t);
    if (i !== this.cur) { this.cur = i; this.renderSub(); this.scrollToCur(); }
  };
  AudioPlayer.prototype.curIndex = function (t) {
    var idx = -1;
    for (var i = 0; i < this.seg.length; i++) { if (this.seg[i].t <= t + 0.001) idx = i; else break; }
    return idx;
  };

  AudioPlayer.prototype.renderSub = function () {
    if (!this.seg.length) { this.sub.innerHTML = '<div class="loading">本课无字幕（可看下方教材）</div>'; return; }
    var self = this, mode = MODES[this.mode];
    var html = '';
    var di = 0;
    this.seg.forEach(function (r, i) {
      if (di < self.divs.length && self.divs[di].at === i) { html += '<div class="ldiv">Lesson ' + self.divs[di].lsn + '</div>'; di++; }
      var en = r.en || '', zh = r.zh || '';
      // 英文文本：有生词表则包成可点词（点词即查），否则转义
      var enHtml = self.dict ? Lookup.markWords(en, self.dict) : Lookup.esc(en);
      var disp;
      if (mode === 'zh') disp = Lookup.esc(zh || en);
      else if (mode === 'en') disp = enHtml;
      else if (mode === 'blur') disp = Lookup.esc(en).replace(/[A-Za-z]/g, '█');
      else disp = enHtml + (zh ? ' <span class="zs">' + Lookup.esc(zh) + '</span>' : '');
      html += '<div class="sline' + (i === self.cur ? ' on' : '') + '" data-si="' + i + '">' +
        '<span class="si">' + (i + 1) + '</span><span class="st">' + disp + '</span></div>';
    });
    this.sub.innerHTML = html;
  };
  AudioPlayer.prototype.scrollToCur = function () {
    var el = this.sub.querySelector('.sline.on');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  AudioPlayer.prototype.refreshCtrls = function () {
    this.mount.querySelector('#spLoop').classList.toggle('on', this.loop);
    this.mount.querySelector('#spLoopAll').classList.toggle('on', this.loopAll);
    this.mount.querySelector('#spRate').textContent = this.rate.toFixed(2).replace(/0$/, '') + 'x';
    this.mount.querySelector('#spMode').textContent = MODE_TXT[MODES[this.mode]];
    this.mount.querySelector('#spAB').textContent = this.abA == null ? '⭯ A-B 复读'
      : this.abB == null ? ('A：句' + (this.abA + 1) + ' · 点设B') : ('A-B 句' + (Math.min(this.abA, this.abB) + 1) + '-' + (Math.max(this.abA, this.abB) + 1) + ' · 取消');
    var st = (this.loop ? '单句循环 · ' : '') + (this.loopAll ? '整段循环 · ' : '') + (this.rate !== 1 ? (this.rate + 'x · ') : '') +
      (this.abA != null && this.abB != null ? 'A-B 区间 · ' : '') + '字幕自动跟随';
    this.state.textContent = st;
  };

  return AudioPlayer;
})();
