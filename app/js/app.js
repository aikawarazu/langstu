/* 新概念英语点读 v1.3：多教材 · 一单元一音频一课 */
"use strict";
var $=s=>document.querySelector(s);
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fmt(s){s=Math.max(0,Math.floor(s));return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2)}
function clampT(t,dur){if(!isFinite(t))return 0;dur=+dur||0;if(dur>0&&t>dur-0.05)t=dur-0.05;return Math.max(0,t)}
function setT(t){var a=$('#audio');try{a.currentTime=clampT(t,a.duration);}catch(e){}}

/* ===== 数据层 =====
   课程一律经 AppData 注册表获取（js/data/registry.js）：内置预设 / 用户导入 / 手动注册三条同源。
   这里不再嗅探任何全局变量，也不再直接碰 window.NCE*。 */
var COURSES=[];                 /* 索引：{id,title,kind,unitCount,origin} */
var DATA={};                    /* id -> 已加载的课程包 */
function courseList(){return COURSES;}
function dataOf(id){return DATA[id]||null;}
function curUnit(){var p=dataOf(S.book);return p?p.units[S.ui-1]:null;}
/* 当前课的教材内容（已加载才有，未加载为 null） */
function noteOf(bk,u){return (u&&u._content)||null;}
function noteExists(bk,u){return !!(u&&(u._content||u.counts));}

/* 已学进度：key = "包id:单元序号"；兼容旧数据里的大写册名（NCE1 → nce1） */
var done=window.AppStore.progress();
(function migrateProgress(){
  var nd=new Set(),changed=false;
  done.forEach(function(k){ if(/^NCE/i.test(k)){changed=true;nd.add(k.replace(/^NCE/i,'nce'));}else nd.add(k); });
  if(changed){done=nd;window.AppStore.saveProgress(done);}
})();
function doneId(pkgId,idx){return pkgId+':'+idx}
function saveDone(){window.AppStore.saveProgress(done);}

var MODES=['show','zh','en','blur'];
var MODE_TXT={show:'字幕：双语',zh:'字幕：中文',en:'字幕：英文',blur:'字幕：模糊'};
var S={book:'nce1',ui:1,tab:'audio',mode:0,ver:'new',rate:1,abA:null,abB:null,loop:false,
  loopAll:true,view:'study',vsimple:false,vp:1,ovBook:'',ovType:'all',ovQ:'',dict:{},
  seg:[],divs:[],cur:-1,dur:0,doneFlag:false,playing:false,drag:false,lastFile:null,wantStart:null,req:0,playTok:0};
(function initPref(){
  var v=window.AppStore.pref('loopAll',null);
  if(v===null){try{v=localStorage.getItem('nce_loopall');}catch(e){}}   /* 兼容旧 key */
  if(v==='0'||v===false)S.loopAll=false;
})();
var lrcCache={};

/* ===== LRC 解析（兼容“无 Lesson 标记”的文件）===== */
function parseLrc(text){
  var seq=[],cur=null;
  text.split(/\r?\n/).forEach(function(raw){
    raw=raw.trim();if(!raw)return;
    var m=raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);if(!m)return;
    var t=+m[1]*60+ +m[2],b=m[3].split('|');
    var en=(b[0]||'').trim(),zh=(b[1]||'').trim();
    if(/^lesson\s*\d+$/i.test(en)||/^第\s*\d+\s*课$/.test(zh)){
      cur=parseInt(en.replace(/\D/g,''),10)||parseInt(zh.replace(/\D/g,''),10);
      seq.push({mk:cur,t:t});return;
    }
    if(en)seq.push({t:t,en:en,zh:zh});
  });
  var by={},rowsAll=[],mk=null,noMarker=true;
  seq.forEach(function(r){
    if(r.mk){mk=r.mk;noMarker=false;by[mk]=by[mk]||{lines:[]};return;}
    rowsAll.push(r);by[mk]=(by[mk]||{lines:[]});
    by[mk].lines.push(r);
  });
  return {by:by,rowsAll:rowsAll,noMarker:noMarker};
}
function loadLrc(pkg,u){
  var tr=window.AppData.audioOf(u,S.ver==='old'?'1985':'new');
  var lrc=tr?(tr.lrc||''):'';
  if(!lrc)return Promise.resolve(null);
  if(lrcCache[lrc])return Promise.resolve(lrcCache[lrc]);
  if(typeof fetch!=='function')return Promise.resolve(null); /* 老环境兜底 */
  return fetch(lrc).then(r=>{if(!r.ok)throw 0;return r.text()})
    .then(t=>{lrcCache[lrc]=parseLrc(t);return lrcCache[lrc];})
    .catch(()=>null);
}
/* 把单元内各课句子合并成连续字幕；S.seg=句子，S.divs=课分隔位置 */
function buildSeg(u,parsed){
  var out=[],divs=[];
  var ls=window.AppData.lessonNums(u);
  if(parsed.noMarker){
    parsed.rowsAll.forEach(function(r){out.push(r);});
    return {seg:out,divs:[]};
  }
  ls.forEach(function(k){
    var L=parsed.by[k];if(!L)return;
    if(out.length)divs.push({at:out.length,lsn:k});
    L.lines.forEach(function(r){out.push({t:r.t,en:r.en,zh:r.zh});});
  });
  return {seg:out,divs:divs};
}

/* ===== 骨架：左＝音频/视频，右＝教材/学习笔记 ===== */
var AUDIO_PANE=
  '<div class="pane on" id="paneAudio">'+
    '<div class="scard"><div class="sub" id="subBox"><div class="loading">加载课文…</div></div>'+
    '<div class="pbar-wrap"><button class="pbtn" id="btnPlay">▶</button>'+
    '<div class="pmeta"><div class="t" id="metaT">准备</div><div class="s" id="metaS"></div>'+
    '<div class="seek" id="seek"><div class="sr"></div><div class="sa" id="segAB" style="display:none"></div>'+
    '<div class="sf" id="sfill"></div><div class="kn" id="skn" style="left:0"></div></div>'+
    '<div class="sm mut" style="text-align:right;margin-top:2px"><span id="tcur">0:00</span> / <span id="tall">0:00</span></div></div></div>'+
    '<div class="ctrls" style="padding:0 14px 13px">'+
      '<button class="cbtn" id="cPrev">⏮ 上一句</button>'+
      '<button class="cbtn" id="cNext">⏭ 下一句</button>'+
      '<button class="cbtn" id="cLoop">🔂 单句循环</button>'+
      '<button class="cbtn" id="cLoopAll">🔁 整段循环</button>'+
      '<button class="cbtn" id="cAB">⭯ A-B 复读</button>'+
      '<button class="cbtn" id="cRate">1.0x</button>'+
      '<button class="cbtn" id="modeBtn">字幕：双语</button></div>'+
    '</div>'+
  '</div>';
var VIDEO_PANE=
  '<div class="pane" id="paneVideo"><div class="vbox"><h4>讲解视频</h4>'+
    '<div class="vchips" id="vchips"></div>'+
    '<div class="vframe blank" id="vframe"><div class="v-empty"><div class="play-ic">▶</div><div id="vEmptyTxt">选择上方某一集开始播放</div></div>'+
    '<iframe id="vid" allowfullscreen loading="lazy" allow="accelerometer;autoplay;clipboard-write;encrypted-media;picture-in-picture"></iframe></div>'+
    '<div class="vfoot"><span id="vlabel"></span><span class="sp"></span>'+
      '<span class="vmode" title="切换播放器外观；两种模式均已禁止跳转 B 站">'+
        '<button class="vmini on" id="vModeFull">普通模式</button>'+
        '<button class="vmini" id="vModeSimple">简洁模式</button></span>'+
      '<a id="vlink" target="_blank" rel="noopener">B站原链 ↗</a></div>'+
    '<div class="vnote" id="vnote"></div></div></div>';
function skeleton(){
  $('#study').innerHTML=
  '<div class="study-head" id="head"></div>'+
  '<div class="cols">'+
    '<div class="col col-a">'+
      '<div class="tabs"><button class="tabbtn on" id="tbAudio">🎧 音频精听</button>'+
      '<button class="tabbtn" id="tbVideo">🎬 视频讲解</button></div>'+
      AUDIO_PANE+VIDEO_PANE+
    '</div>'+
    '<div class="col col-b">'+
      '<div class="anchortabs" id="anchors"></div>'+
      '<div class="pane on" id="paneTbk"><section class="tbk" id="tbk"></section></div>'+
    '</div>'+
  '</div>'+
  '<div class="navless"><button id="bPrev">← 上一单元</button><button id="bNext">下一单元 →</button></div>';
}
function bindStatic(){
  var a=$('#audio');
  $('#btnPlay').onclick=()=>togglePlay();
  var seek=$('#seek');
  seek.onpointerdown=e=>{S.drag=true;try{e.target.setPointerCapture(e.pointerId);}catch(x){}seekAt(e);};
  seek.onpointermove=e=>{if(S.drag)seekAt(e);};
  ['pointerup','pointercancel'].forEach(ev=>seek['on'+ev]=e=>{S.drag=false;try{e.target.releasePointerCapture(e.pointerId);}catch(x){}});
  $('#cPrev').onclick=()=>jumpLine(-1);
  $('#cNext').onclick=()=>jumpLine(1);
  $('#cLoop').onclick=()=>{S.loop=!S.loop;syncCtl();};
  $('#cLoopAll').onclick=()=>setLoopAll(!S.loopAll);
  $('#cAB').onclick=()=>cycleAB();
  $('#cRate').onclick=()=>{var rs=[0.75,1,1.25,1.5];S.rate=rs[(rs.indexOf(S.rate)+1)%rs.length];a.playbackRate=S.rate;syncCtl();};
  $('#modeBtn').onclick=()=>cycleMode();
  $('#tbAudio').onclick=()=>setTab('audio');
  $('#tbVideo').onclick=()=>setTab('video');
  $('#bPrev').onclick=()=>openUnit(S.ui-1,true);
  $('#bNext').onclick=()=>openUnit(S.ui+1,true);
  bindDirPop();bindWPop();bindView();bindAnchors();bindNoteModal();bindVideoMode();bindTextModal();bindImport();
  $('#overview').onclick=ovClick;
  var bs=$('#bookSel');
  function doBookSwitch(){
    var k=bs.value;if(!k||k===S.book)return;
    window.AppData.get(k).then(function(p){
      DATA[k]=p;
      try{if(setBook(k)===false)bs.value=S.book;/* 切换失败：下拉框回到当前课程 */}
      catch(err){bs.value=S.book;toast('切换失败：'+err.message);console.error(err);}
    }).catch(function(err){
      bs.value=S.book;toast('加载失败：'+err.message);console.error(err);
    });
  }
  bs.onchange=doBookSwitch;
  try{bs.addEventListener('input',doBookSwitch);}catch(err){}
  $('#subBox').onclick=e=>{
    var s=e.target.closest('.sline');if(!s)return;
    var i=+s.dataset.si;if(!(i>=0))return;
    setT(segStart(i));
    tryPlay();
  };
  $('#vchips').onclick=e=>{var b=e.target.closest('.vchip');if(b&&b.dataset.p!=null)playVideoChip(+b.dataset.p);};
  $('#tbk').onclick=e=>{
    var w=e.target.closest('.tb-w');
    if(w){showWPop(w);return;}                       /* 单词即点即译 */
    hideWPop();
    var line=e.target.closest('.tb-sline');
    if(line){                                        /* 点课文句子 → 音频跳到该句 */
      var i=+line.dataset.si;
      if(i>=0&&S.seg[i]){setT(segStart(i));tryPlay();}
      return;
    }
    var en=e.target.closest('.tb-en,.tb-pat .en');
    if(en)speakToggle(en.textContent);               /* 整句点读 */
  };
  a.addEventListener('loadedmetadata',()=>{
    if(a.dataset.tok!==String(S.req))return; /* 旧音频的元数据迟到：丢弃，否则会把上一课的时长/起点写进来 */
    S.dur=a.duration;renderTime();
    if(S.wantStart!=null){setT(S.wantStart);S.wantStart=null;}
  });
  a.addEventListener('timeupdate',tick);
  /* 换源时浏览器会把速率重置为 1，这里补回用户设定的倍速 */
  a.addEventListener('loadstart',()=>{if(a.playbackRate!==S.rate)a.playbackRate=S.rate;});
  /* emptied / pause 可能来自“上一课”的迟到事件；元素已在播就别把状态改回去 */
  a.addEventListener('emptied',()=>{if(!a.paused)return;S.dur=0;S.cur=-1;S.playing=false;resetSeekUI();});
  a.addEventListener('play',()=>{S.playing=true;syncPlayBtn();});
  a.addEventListener('pause',()=>{if(!a.paused)return;S.playing=false;syncPlayBtn();});
  a.addEventListener('ended',()=>{
    S.playing=false;syncPlayBtn();finishUnit();
    /* 整段循环（默认开启）：听完自动回到第一句重播 */
    if(S.loopAll){setT(S.seg.length?segStart(0):0);tryPlay();}
  });
  a.addEventListener('error',()=>toast('音频加载失败：需联网访问资源站'));
}
function setBook(id){
  var bk=dataOf(id);
  if(!bk){toast('课程数据未加载：'+id);console.error('[course] setBook 失败，无数据：',id);return false;}
  try{$('#audio').pause();}catch(e){}
  var sel=$('#bookSel');if(sel)sel.value=id; /* 保持下拉框与当前课程一致 */
  S.book=id;S.lastFile=null;S.abA=null;S.abB=null;S.loop=false;S.cur=-1;S.dur=0;S.doneFlag=false;
  S.seg=[];S.divs=[];S.wantStart=null;
  S.ui=Math.max(1,Math.min(bk.units.length,+(window.AppStore.pref('last.'+id,1)||1)||1));
  closeDir();renderDir();
  openUnit(S.ui,true); /* 换课程属于用户操作，直接开播 */
  try{toast('已切换到 '+bk.title+'（'+bk.units.length+' 课）');}catch(e){}
}
function setTab(t){
  S.tab=t;
  $('#tbAudio').classList.toggle('on',t==='audio');
  $('#tbVideo').classList.toggle('on',t==='video');
  $('#paneAudio').classList.toggle('on',t==='audio');
  $('#paneVideo').classList.toggle('on',t==='video');
}
/* 右栏锚点条 + 教材懒加载笔记：笔记到达后刷新教材与锚点 */
function refreshTextbook(bk,u,req){
  loadNote(bk,u).then(function(j){
    if(req!=null&&req!==S.req)return;   /* 已切走：丢弃 */
    if(!j)return;                        /* 手写数据本来就有，或确实无数据 */
    renderTextbook(bk,u);renderAnchors(bk,u);
  });
}
function cycleMode(){S.mode=(S.mode+1)%MODES.length;applyMode();}
function applyMode(){
  var b=document.body,md=MODES[S.mode];
  b.classList.remove('md-zh','md-en','md-blur');
  if(md!=='show')b.classList.add('md-'+md);
  $('#modeBtn').textContent=MODE_TXT[md];
  $('#modeBtn').title=md==='blur'?'整行模糊，鼠标悬停可看清':'控制左侧歌词字幕的显示';
}

/* ===== 教材目录（气泡弹窗）===== */
var dirRows=[];
function renderDir(){
  var bk=dataOf(S.book),units=bk.units;
  if(!bk)return;
  dirRows=units.map(function(u,i){
    var id=doneId(bk.id,u.index);
    var nums=window.AppData.lessonNums(u);
    var pair=u.lessonLabel||(nums.length>1?('Lesson '+nums.join('&')):'');
    return {u:u.index,i:i+1,title:u.title,pair:pair?String(pair):'',done:done.has(id),active:(i+1)===S.ui};
  });
  $('#topTag').textContent='已学 '+dirRows.filter(r=>r.done).length+' / '+units.length;
  var sub=$('#dirSub');if(sub)sub.textContent=bk.title+' · 共 '+units.length+' 单元';
  var cur=COURSES.filter(function(c){return c.id===S.book;})[0];
  var del=$('#dirDel');if(del)del.style.display=(cur&&cur.origin==='user')?'':'none';
  renderDirList($('#dirSearch')?$('#dirSearch').value:'');
}
function renderDirList(kw){
  var list=$('#dirList');if(!list)return;
  kw=String(kw||'').trim().toLowerCase();
  var rows=dirRows.filter(function(r){
    if(!kw)return true;
    return (r.title+' '+r.pair+' '+r.i).toLowerCase().indexOf(kw)>=0;
  });
  list.innerHTML=rows.length?rows.map(function(r){
    return '<div class="uro'+(r.active?' active':'')+(r.done?' done':'')+'" data-u="'+r.u+'">'+
      '<span class="uix">'+r.i+'</span>'+
      '<span class="utx"><span class="ut">'+esc(r.title)+'</span>'+
      '<span class="ur">'+(r.pair?'('+esc(r.pair)+')':'')+'</span></span>'+
      '<span class="ck">'+(r.done?'✓':'')+'</span></div>';
  }).join(''):'<div class="dir-none">没有匹配的单元</div>';
  var c=$('#dirCount');
  if(c)c.textContent=kw?(rows.length+' / '+dirRows.length):(dirRows.filter(r=>r.done).length+' 已学');
}
function openDir(){
  var pop=$('#dirPop');if(!pop)return;
  pop.hidden=false;
  $('#dirBtn').classList.add('on');
  $('#dirBtn').setAttribute('aria-expanded','true');
  var s=$('#dirSearch');if(s){s.value='';}
  renderDirList('');
  var act=$('#dirList .uro.active');
  if(act&&act.scrollIntoView)act.scrollIntoView({block:'center'});
  setTimeout(function(){try{s.focus();}catch(e){}},30);
}
function closeDir(){
  var pop=$('#dirPop');if(!pop)return;
  pop.hidden=true;
  $('#dirBtn').classList.remove('on');
  $('#dirBtn').setAttribute('aria-expanded','false');
}
function toggleDir(){var p=$('#dirPop');if(!p)return;if(p.hidden)openDir();else closeDir();}
function bindDirPop(){
  var btn=$('#dirBtn'),pop=$('#dirPop');
  if(!btn||!pop)return;
  btn.onclick=e=>{e.stopPropagation();toggleDir();};
  pop.onclick=e=>{
    e.stopPropagation();
    var r=e.target.closest('.uro');
    if(r){openUnit(+r.dataset.u,true);closeDir();return;}
    if(e.target.closest('#dirX')){closeDir();return;}
    if(e.target.closest('#dirNow')){
      var act=$('#dirList .uro.active');
      if(act&&act.scrollIntoView)act.scrollIntoView({block:'center'});
      else renderDirList('');
      return;
    }
    if(e.target.closest('#dirDel')){
      var id=S.book;
      if(!window.confirm('删除课程包「'+id+'」？学习进度与笔记会按 id 保留，但课程内容将被移除。'))return;
      window.AppData.remove(id).then(function(){
        COURSES=window.AppData.list();
        closeDir();
        if(!COURSES.length){renderBookSel();toast('已删除，当前没有课程了');return;}
        var first=COURSES[0].id;
        window.AppData.get(first).then(function(p){
          DATA[first]=p;setBook(first);renderBookSel();
        });
      });
      return;
    }
  };
  var s=$('#dirSearch');
  if(s)s.oninput=()=>renderDirList(s.value);
  document.addEventListener('click',function(e){
    if(pop.hidden)return;
    var el=e.target;
    if(el&&el.closest&&(el.closest('#dirPop')||el.closest('#dirBtn')))return;
    closeDir();
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&!pop.hidden)closeDir();
  });
}

/* ===== 打开单元 ===== */
function openUnit(u,autoplay){
  var bk=dataOf(S.book);if(!bk)return;
  var units=bk.units;
  if(u<1)u=units.length;else if(u>units.length)u=1;
  S.ui=u;S.abA=null;S.abB=null;S.loop=false;S.cur=-1;S.doneFlag=false;S.wantStart=null;
  var req=++S.req; /* 防快速切换：旧请求返回时丢弃 */
  var unit=units[u-1];
  renderDir();renderHead(bk,unit);renderInfo(bk,unit);renderVideoChips(bk,unit);
  renderTextbook(bk,unit);renderAnchors(bk,unit);refreshTextbook(bk,unit,req);
  var a=$('#audio');
  a.dataset.tok=String(req); /* 打标记：迟到的旧音频事件据此丢弃 */
  var tr=window.AppData.audioOf(unit,S.ver==='old'?'1985':'new');
  var src=tr?tr.url:'';
  if(S.lastFile!==src){
    S.lastFile=src;
    resetSeekUI(); /* 先归零播放器（进度条/时间/播放键/A-B），再换源 */
    a.src=src;
    a.playbackRate=S.rate;
    $('#subBox').innerHTML='<div class="loading">加载课文…</div>';
  }
  renderTime(); /* 先显示本课标题，不依赖音频加载 */
  syncCtl();
  if(autoplay)tryPlay();
  loadLrc(bk,unit).then(function(parsed){
    if(req!==S.req)return; /* 已被更新的切换取代 */
    if(!parsed){
      $('#subBox').innerHTML='<div style="padding:20px;text-align:center;color:var(--mut);font-size:13px">课文加载失败：请联网后重试。</div>';
      var w=$('#sec-text-wrap');
      if(w)w.innerHTML=tbSecId('sec-text','课文','TEXT','<div class="tbk-empty">课文加载失败：请联网后重试。</div>');
      return;
    }
    var r=buildSeg(unit,parsed);
    S.seg=r.seg;S.divs=r.divs;
    renderSubs();
    refreshLessonText(bk,unit,noteOf(bk,unit));  /* 课文正文随 LRC 到达后填充 */
    if(S.seg.length){
      var st=segStart(0);
      if(a.readyState>=1&&a.duration>0){if(a.currentTime<st)setT(st);}
      else S.wantStart=st; /* 元数据还没到，等 loadedmetadata 再定位 */
    }
    renderTime();
    syncCtl();
    if(autoplay&&a.paused)tryPlay(); /* 首播被加载过程打断时补一次 */
  });
}
function renderHead(bk,u){
  var id=doneId(bk.id,u.index);
  var pair=u.lessonLabel||'';
  var nums=window.AppData.lessonNums(u);
  var hasOld=window.AppData.hasVariant(u,'1985');
  $('#head').innerHTML=
    '<div class="study-num">'+u.index+'</div>'+
    '<div class="study-t"><h1>'+esc(u.title)+'</h1>'+
    '<div class="zh">'+esc(pair||('Lesson '+nums[0]))+(nums.length>1?'（两课同一段录音）':'')+'</div>'+
    '<div class="study-tags"><span class="tag'+(done.has(id)?' ok':'')+'">'+(done.has(id)?'已学 ✓':'未学')+'</span>'+
    '<span class="tag">'+(S.ver==='old'&&hasOld?'1985 老版':'新版英音')+'</span>'+
    (hasOld?'<button class="tag" id="tgVer" style="cursor:pointer">切 '+(S.ver==='old'?'新版':'85 老版')+'</button>':'')+
    (done.has(id)?'':'<button class="tag new" id="tgDone" style="cursor:pointer">标为已学</button>')+
    '</div></div>'+
    '<div class="study-meta" id="info"></div>';
  var v=$('#tgVer');if(v)v.onclick=()=>{S.ver=S.ver==='old'?'new':'old';S.lastFile=null;openUnit(u.index,true);};
  var d=$('#tgDone');if(d)d.onclick=()=>markUnit(bk,u,true);
}
function renderSubs(){
  var box=$('#subBox');
  if(!S.seg.length){box.innerHTML='<div style="padding:20px;text-align:center;color:var(--mut)">本单元无逐句字幕。</div>';return;}
  var h='',di=0;
  S.seg.forEach(function(r,i){
    if(di<S.divs.length&&S.divs[di].at===i){h+='<div class="ldiv">Lesson '+S.divs[di].lsn+'</div>';di++;}
    h+='<button class="sline" data-si="'+i+'"><span class="en">'+esc(r.en)+'</span><span class="zh">'+esc(r.zh)+'</span></button>';
  });
  box.innerHTML=h;
}
function cleanPart(part){
  return String(part||'').replace(/^[L\s]*0*\d+/,'').replace(/^[\s·]+/,'').trim()||'整集';
}
function renderVideoChips(bk,u){
  var box=$('#vchips');
  var vid=(bk.media||{}).video||{};
  var note=$('#vnote');
  var pageTxt=function(p){var it=(vid.pages||[]).find(x=>x.p===p);return it?it.part:('P'+p);};
  /* 有「整课切片」直链（NCE2/3，来自CSV video_lesson_*）→ 主播放器直接播这一课 */
  if(u.video&&u.video.embed){
    S.vp=1;
    setVideoSrc(S.vsimple?(simpleFromUrl(u.video.embed)||u.video.embed):u.video.embed);
    $('#vframe').classList.remove('blank');
    $('#vlabel').textContent='整课讲解 · '+u.title;
    $('#vlink').href=u.video.watch||'';
    $('#vEmptyTxt').textContent='视频加载中…';
    var coll=Array.isArray(vid.watch)?vid.watch:[];
    box.innerHTML='<button class="vchip on">▶ 本课整课讲解</button>'+
      (coll.length?'<a class="vchip mini" href="'+esc(coll[0])+'" target="_blank" rel="noopener">官方合集 ↗（想按 单词/语法/文章 分段看时用）</a>':'');
    note.textContent='来源：胶学本课切片（第三方整理）。点播放键即可看这一课的讲解，本页自动带出，切课自动换课。';
    return;
  }
  var nums=window.AppData.lessonNums(u);
  var vmap=(bk.media||{}).lessonVideoMap||{};
  var seen={},ps=[];
  nums.forEach(function(n){
    var arr=vmap[String(n)];
    (arr||[]).forEach(function(p){if(!seen[p]){seen[p]=1;ps.push(p);}});
  });
  ps.sort(function(a,b){return a-b;});
  if(ps.length){
    var p0=ps[0];
    S.vp=p0;
    box.innerHTML=ps.map(function(p,idx){
      var label=cleanPart(pageTxt(p));
      return '<button class="vchip'+(idx===0?' on':'')+'" data-p="'+p+'">'+esc(label)+' · P'+p+'</button>';
    }).join('');
    note.textContent='官方合集按 课号 分P定位（本课涉及 P'+ps.join('/P')+'）。点集切换；切课自动带出本课首集。';
    $('#vEmptyTxt').textContent='选择上方某一集播放';
    setVideoSrc(videoUrl(vid,p0));
    $('#vframe').classList.remove('blank');
    $('#vlabel').textContent='P'+p0+' · '+cleanPart(pageTxt(p0));
    $('#vlink').href='https://www.bilibili.com/video/'+vid.bvid+'/?p='+p0;
  }else{
    S.vp=1;
    var ws=Array.isArray(vid.watch)?vid.watch:[];
    box.innerHTML=ws.length?ws.map(function(w){
      return '<a class="vchip" href="'+w+'" target="_blank" rel="noopener">官方合集 ↗</a>';
    }).join(''):'<div class="sm mut">暂无讲解视频（UP 主尚未制作此册视频课程）</div>';
    note.textContent=ws.length?'此册视频按合集提供：请进入合集后选择本课定位。':'胶学视频暂未覆盖此册。';
    $('#vEmptyTxt').textContent='暂无视频内容';
  }
}
/* 正在播的集数按钮亮起 */
function syncVideoChips(p){
  var chips=document.querySelectorAll('#vchips .vchip[data-p]');
  for(var i=0;i<chips.length;i++)chips[i].classList.toggle('on',+chips[i].dataset.p===p);
}
function playVideoChip(p){
  var bk=dataOf(S.book),vid=(bk.media||{}).video||{},f=$('#vframe');
  S.vp=p;
  setVideoSrc(videoUrl(vid,p));
  f.classList.remove('blank');
  var it=(vid.pages||[]).find(x=>x.p===p);
  $('#vlabel').textContent='P'+p+' · '+cleanPart(it?it.part:'');
  $('#vlink').href='https://www.bilibili.com/video/'+vid.bvid+'/?p='+p;
  syncVideoChips(p);
  setTab('video');
}
/* 本单元信息：放在顶部 bar 右侧，做成一排紧凑信息片 */
function renderInfo(bk,u){
  var box=$('#info');if(!box)return;
  var nums=window.AppData.lessonNums(u);
  var has=noteExists(bk,u);
  var hasOld=window.AppData.hasVariant(u,'1985');
  var chips=
    '<span class="mi">🎧 '+(hasOld?'新版 + 1985 老版':'新版英音')+'</span>'+
    '<span class="mi">📚 '+(u.lessonLabel||('Lesson '+nums.join(' · ')))+(nums.length>1?'（同一段录音）':'')+'</span>'+
    '<span class="mi'+(has?' ok':'')+'">📖 教材：'+(has?'已生成（右侧可按块跳转）':'本课尚未生成')+'</span>'+
    '<span class="mi">💾 进度存于本机</span>';
  box.innerHTML=chips+'<button class="mi act" id="btnReset" title="清除本单元的「已学」标记">重置标记</button>';
  var r=$('#btnReset');if(r)r.onclick=()=>markUnit(bk,u,false,true);
}
/* ===== 教材内容加载：统一走 AppData.content（懒加载 + 缓存 + 404 记忆）=====
   取到后挂在 unit._content 上，渲染层只读 noteOf(bk,unit)。 */
function loadNote(bk,u){
  return window.AppData.content(bk,u).then(function(c){
    u._content=c||null;
    return u._content;
  });
}
function normW(w){return String(w==null?'':w).toLowerCase().replace(/[^a-z'’-]/g,'');}
function buildDict(nt){
  var m={};
  ((nt&&nt.words)||[]).forEach(function(x){
    var k=normW(x.word);
    if(k&&!m[k])m[k]=[x.word,meaningsText(x)];
  });
  return m;
}
/* 生词表里是原形，课文里可能是复数/过去式，这里做一层简单还原再查 */
function findWord(dict,raw){
  var w=normW(raw);if(!w||!dict)return null;
  var c=[w];
  if(/'s$/.test(w))c.push(w.slice(0,-2));
  c.push(w.replace(/ies$/,'y'),w.replace(/(es|s)$/,''),w.replace(/(ed|d)$/,''),
    w.replace(/ing$/,''),w.replace(/s$/,''));
  for(var i=0;i<c.length;i++)if(dict[c[i]])return dict[c[i]];
  return null;
}
function markWords(text,dict){
  return esc(text).replace(/[A-Za-z][A-Za-z'’-]*/g,function(w){
    return '<span class="tb-w'+(findWord(dict,w)?' hit':'')+'" data-w="'+w+'">'+w+'</span>';
  });
}
function showWPop(el){
  var pop=$('#wpop');if(!pop||!el)return;
  var w=el.dataset.w||el.textContent,hit=findWord(S.dict,w);
  pop.innerHTML='<div class="wp-row"><b>'+esc(w)+'</b>'+
    '<button class="wp-sp" id="wpSp" title="朗读这个单词">🔊</button></div>'+
    (hit?'<div class="wp-zh">'+esc(hit[1])+'</div>'+
      (normW(hit[0])!==normW(w)?'<div class="wp-mut">生词表原形：'+esc(hit[0])+'</div>':'')
      :'<div class="wp-zh no">本课生词表未收录</div>');
  pop.hidden=false;pop.style.left='0px';pop.style.top='0px';
  var r=el.getBoundingClientRect(),pw=pop.offsetWidth,ph=pop.offsetHeight;
  var left=Math.max(8,Math.min(r.left,window.innerWidth-pw-8));
  var top=r.bottom+6;if(top+ph>window.innerHeight-8)top=Math.max(8,r.top-ph-6);
  pop.style.left=left+'px';pop.style.top=top+'px';
  var sp=$('#wpSp');if(sp)sp.onclick=function(){speakToggle(w);};
}
function hideWPop(){var p=$('#wpop');if(p)p.hidden=true;}
function bindWPop(){
  document.addEventListener('click',function(e){
    var el=e.target;
    if(el&&el.closest&&(el.closest('.tb-w')||el.closest('#wpop')))return;
    hideWPop();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')hideWPop();});
  window.addEventListener('scroll',hideWPop,true);
  window.addEventListener('resize',hideWPop);
}
function tbSec(title,en,inner){
  return '<div class="tbk-sec"><h5>'+esc(title)+' <i>'+esc(en)+'</i></h5>'+inner+'</div>';
}
/* 一课课文：{lesson,title?,kind?,lines:[{speaker,en,zh?,note?}],drill?} */
function tbLesson(L,dict){
  var h='<div class="tbk-sec"><h5>'+(L.lesson?('Lesson '+esc(L.lesson)):'课文')+(L.title?' · '+esc(L.title):'')+
    (L.kind?' <i>'+esc(L.kind)+'</i>':'')+'</h5>';
  if(L.lines&&L.lines.length){
    h+='<div class="tbk-text">'+L.lines.map(function(l){
      var sp=l.speaker||'',cls=(sp==='B'||sp==='2')?'b':'';
      return '<div class="tb-line"><span class="tb-sp '+cls+'">'+esc(sp||'·')+'</span>'+
        '<div class="tb-l"><div class="tb-en">'+markWords(l.en,dict)+'</div>'+
        (l.zh?'<div class="tb-zh">'+esc(l.zh)+'</div>':'')+
        (l.note?'<div class="tb-note">'+esc(l.note)+'</div>':'')+'</div></div>';
    }).join('')+'</div>';
  }
  var d=L.drill;
  if(d){
    h+='<div class="tb-drill" style="margin-top:10px"><div class="q">'+esc(d.q).replace('___','<em>___</em>')+'</div>'+
      (d.zh?'<div class="zh">'+esc(d.zh)+'</div>':'')+
      (d.slots&&d.slots.length?'<div class="tb-slots">'+d.slots.map(function(s){
        return '<span class="tb-slot">'+esc(s.en)+'<small>'+esc(s.zh||'')+'</small></span>';}).join('')+'</div>':'')+
      (d.answers&&d.answers.length?'<div class="tb-ans">'+d.answers.map(function(a,i){
        return '<span'+(i?' class="no"':'')+'>'+esc(a)+'</span>';}).join('')+'</div>':'')+
      '</div>';
  }
  return h+'</div>';
}
function tbSecId(id,title,en,inner){
  return '<section class="tbk-sec" id="'+id+'"><h5>'+esc(title)+' <i>'+esc(en)+'</i></h5>'+inner+'</section>';
}
/* 例句行：{en,zh} */
function exLine(e,dict){
  return '<div class="tb-ex-line"><span class="en">'+markWords(e.en,dict)+'</span>'+
    (e.zh?'<span class="zh">'+esc(e.zh)+'</span>':'')+'</div>';
}
function exLines(list,dict,label){
  var h=(list||[]).map(function(e){return exLine(e,dict);}).join('');
  return h?('<div class="tb-exs-mini">'+(label?'<div class="t">'+esc(label)+'</div>':'')+h+'</div>'):'';
}
/* 释义串：meanings[] -> "词性. 释义（用法）；…" */
function meaningsText(w){
  return ((w&&w.meanings)||[]).map(function(m){
    return (m.pos?m.pos+'. ':'')+(m.meaning||'')+(m.usage?'（'+m.usage+'）':'');
  }).join('；');
}
/* 生词卡：{word, phonetic?, meanings:[{pos?,meaning,usage?}], examples?:[{en,zh}]} */
function tbWordCard(w){
  return '<div class="tb-word"><b>'+esc(w.word)+'</b>'+
    (w.phonetic?'<i class="ph">'+esc(w.phonetic)+'</i>':'')+
    '<span>'+esc(meaningsText(w))+'</span>'+
    exLines(w.examples,S.dict)+'</div>';
}
/* 短语卡：{phrase, usage?, examples:[{en,zh}]} */
function tbPhraseCard(p){
  return '<div class="tb-word phrase"><b>'+esc(p.phrase)+'</b>'+
    (p.usage?'<span>'+esc(p.usage)+'</span>':'')+
    exLines(p.examples,S.dict)+'</div>';
}
/* 语法卡：{title, definition?, structure?, usage?, examples:[{en,zh}]} */
function grCardRich(g,dict){
  var d=(g.definition||'')+(g.usage?(g.definition?' ':'')+g.usage:'');
  return '<div class="tb-gr"><div class="k">'+esc(g.title)+'</div>'+
    (g.structure?'<div class="f">'+esc(g.structure)+'</div>':'')+
    (d?'<div class="d">'+esc(d)+'</div>':'')+
    exLines(g.examples,dict)+'</div>';
}
/* 句型卡：{pattern, original?:{en,zh}, imitations:[{en,zh}]} */
function patCard(p,i,dict){
  var im=exLines(p.imitations,dict,'仿写');
  return '<div class="tb-pat"><span class="no">'+(i+1)+'</span><div>'+
    '<div class="en">'+markWords(p.pattern,dict)+'</div>'+
    (p.original&&p.original.en
      ? '<div class="zh">课文原句：'+esc(p.original.en)+(p.original.zh?'（'+esc(p.original.zh)+'）':'')+'</div>'
      : '')+
    im+'</div></div>';
}
function patCardRich(p,i,dict){return patCard(p,i,dict);}
function renderTextbook(bk,u){
  var box=$('#tbk');if(!box)return;
  var nt=noteOf(bk,u);
  var dict=S.dict=buildDict(nt||{});
  var nums=window.AppData.lessonNums(u);
  var h='<div class="tbk-paper">';
  /* 页眉 */
  h+='<div class="tbk-head"><span class="tbk-lesson">'+
    esc(u.lessonLabel||('Lesson '+nums.join(' & ')))+'</span>'+
    '<div><h3>'+esc((nt&&nt.title)||u.title)+'</h3>'+
    (nt&&nt.subtitle?'<div class="zh">'+esc(nt.subtitle)+'</div>':'')+'</div></div>';
  h+='<div class="tbk-body">';
  /* 导学（问 + 概要 + 贴士；没有这部分则整块隐藏） */
  var lead=(nt&&nt.lead)||{};
  var intro='';
  if(lead.question)intro+='<div class="tbk-q">🎧 <b>听录音前先想</b>：'+esc(lead.question)+'</div>';
  if(lead.summary)intro+='<div style="font-size:13px;line-height:1.95;color:#5f5a4c">'+esc(lead.summary)+'</div>';
  if(lead.tips)intro+='<div class="tb-tip"><b>💡</b><div>'+esc(lead.tips)+'</div></div>';
  h+=tbSecId('sec-intro','导学','STUDY',
    intro||'<div class="tbk-empty">本课没有单独的导学内容，直接从课文开始。</div>');
  /* 课文（手写精修优先，否则用 LRC 逐句渲染；LRC 异步到达后由 refreshLessonText 填充） */
  h+='<div id="sec-text-wrap">'+lessonTextHTML(bk,u,nt,dict)+'</div>';
  /* 生词 / 短语 */
  var words=(nt&&nt.words)||[];
  if(words.length)h+=tbSecId('sec-words','生词','WORDS','<div class="tb-words">'+words.map(tbWordCard).join('')+'</div>');
  var phrases=(nt&&nt.phrases)||[];
  if(phrases.length)h+=tbSecId('sec-phrases','短语','PHRASES','<div class="tb-words">'+phrases.map(tbPhraseCard).join('')+'</div>');
  /* 语法 / 句型 / 练习 */
  if(nt&&nt.grammar&&nt.grammar.length)
    h+=tbSecId('sec-gram','语法要点','GRAMMAR',nt.grammar.map(function(g){return grCardRich(g,dict);}).join(''));
  if(nt&&nt.patterns&&nt.patterns.length)
    h+=tbSecId('sec-pat','重点句','PATTERNS','<div class="tb-pats">'+nt.patterns.map(function(p,i){return patCardRich(p,i,dict);}).join('')+'</div>');
  if(nt&&nt.exercises&&nt.exercises.length)
    h+=tbSecId('sec-ex','自测练习','PRACTICE','<div class="tb-exs">'+nt.exercises.map(exCard).join('')+'</div>');
  h+='</div></div>';
  box.innerHTML=h;
}
/* 课文正文：教材里的 text 优先，否则用已解析的 LRC 逐句（点句子可定位音频） */
function lessonTextHTML(bk,u,nt,dict){
  var lessons=(nt&&nt.text)||[];
  var inner='';
  if(lessons.length){
    inner=lessons.map(function(L){return tbLesson(L,dict);}).join('');
  }else if(S.seg.length){
    var h='',di=0;
    S.seg.forEach(function(r,i){
      if(di<S.divs.length&&S.divs[di].at===i){h+='<div class="tb-ldiv">Lesson '+S.divs[di].lsn+'</div>';di++;}
      h+='<button class="tb-line tb-sline" data-si="'+i+'"><span class="tb-sp">'+(i+1)+'</span>'+
        '<div class="tb-l"><div class="tb-en">'+markWords(r.en,dict)+'</div>'+
        (r.zh?'<div class="tb-zh">'+esc(r.zh)+'</div>':'')+'</div></button>';
    });
    inner='<div class="tbk-text">'+h+'</div>';
  }else{
    inner='<div class="tbk-empty">课文加载中…（需联网获取字幕）</div>';
  }
  return tbSecId('sec-text','课文','TEXT',inner);
}
function refreshLessonText(bk,u,nt){
  var wrap=$('#sec-text-wrap');if(!wrap)return;
  var dict=S.dict=buildDict(nt||{});
  wrap.innerHTML=lessonTextHTML(bk,u,nt,dict);
}
/* ===== 学习笔记（右栏第二个 tab）=====
   分组参考 https://github.com/aikawarazu/new-concept-english 的右侧笔记区：
   词汇 / 短语 / 语法 / 句型 分块切换；额外提供「导学」与随手可写的「我的笔记」。 */
/* 我的笔记：统一走 AppStore */
function myNoteId(bk,u){return bk.id+':'+u.id}
function myNoteOf(bk,u){return window.AppStore.notes()[myNoteId(bk,u)]||''}
function saveMyNote(id,v){
  var o=window.AppStore.notes();
  if(v)o[id]=v;else delete o[id];
  window.AppStore.saveNotes(o);
}
/* 笔记分组（标准字段：words/phrases/grammar/patterns/exercises/lead 各自独立） */
function ntGroups(nt){
  var vocab=(nt&&nt.words)||[];
  var phrase=(nt&&nt.phrases)||[];
  var t=[];
  var lead=(nt&&nt.lead)||{};
  if(lead.question||lead.summary||lead.tips)t.push(['intro','导学','📌']);
  if(vocab.length)t.push(['words','词汇','🔤',vocab.length]);
  if(phrase.length)t.push(['phrase','短语','🗣',phrase.length]);
  if(nt.grammar&&nt.grammar.length)t.push(['gram','语法','📐',nt.grammar.length]);
  if(nt.patterns&&nt.patterns.length)t.push(['pat','句型','💬',nt.patterns.length]);
  if(nt.exercises&&nt.exercises.length)t.push(['ex','练习','✏️',nt.exercises.length]);
  t.push(['mine','我的笔记','📝']);
  return {tabs:t,vocab:vocab,phrase:phrase};
}
/* 卡片片段：教材与笔记总览共用（标准对象） */
function wordCard(w){
  var ex=(w.examples||[]).map(function(e){
    return '<div class="wc-ex"><span class="en">'+esc(e.en)+'</span>'+
      (e.zh?'<span class="zh">'+esc(e.zh)+'</span>':'')+'</div>';
  }).join('');
  var head=w.word?'<b>'+esc(w.word)+'</b>'+(w.phonetic?'<i class="ph">'+esc(w.phonetic)+'</i>':'')
           :'<b>'+esc(w.phrase)+'</b>';
  return '<button class="nt-word">'+head+
    '<span>'+esc(w.word?meaningsText(w):(w.usage||''))+'</span>'+
    (ex?'<div class="wc-exs">'+ex+'</div>':'')+'</button>';
}
function grCard(g){return grCardRich(g,S.dict||{});}
function exCard(e){return '<details class="tb-ex"><summary>'+esc(e.q)+'</summary>'+
  '<div class="a">'+esc(e.a)+(e.note?'<i>'+esc(e.note)+'</i>':'')+'</div></details>';}
function ntWordCards(list){return '<div class="nt-words">'+list.map(wordCard).join('')+'</div>';}

/* ===== 教材锚点按钮条（原「学习笔记」tab 改为定位跳转）===== */
function renderAnchors(bk,u){
  var box=$('#anchors');if(!box)return;
  var nt=noteOf(bk,u)||{};
  var ix=(u&&u.counts)||{};   /* 内容未加载时用单元上的计数先顶上 */
  var cnt=function(a,ixk){return (a||[]).length||(ix[ixk]||0);};
  var lead=nt.lead||{};
  var items=[];
  if(lead.question||lead.summary||lead.tips)items.push(['sec-intro','📌 导学']);
  items.push(['sec-text','📖 课文']);
  if(cnt(nt.words,'w'))items.push(['sec-words','🔤 词汇 '+cnt(nt.words,'w')]);
  if(cnt(nt.phrases,'ph'))items.push(['sec-phrases','🗣 短语 '+cnt(nt.phrases,'ph')]);
  if(cnt(nt.grammar,'g'))items.push(['sec-gram','📐 语法 '+cnt(nt.grammar,'g')]);
  if(cnt(nt.patterns,'p'))items.push(['sec-pat','💬 句型 '+cnt(nt.patterns,'p')]);
  if(cnt(nt.exercises,'ex'))items.push(['sec-ex','✏️ 练习 '+cnt(nt.exercises,'ex')]);
  box.innerHTML=items.map(function(x){
    return '<button class="achip" data-go="'+x[0]+'">'+esc(x[1])+'</button>';
  }).join('')+
  '<button class="achip mine'+(myNoteOf(bk,u)?' has':'')+'" id="achMine">📝 我的笔记'+(myNoteOf(bk,u)?' ✓':'')+'</button>'+
  '<button class="achip tool" id="achCopy" title="复制本课教材全文">📋 复制</button>'+
  '<button class="achip tool" id="achExport" title="下载本课教材为 txt 文件">⬇️ 导出</button>'+
  '<button class="achip tool" id="achView" title="查看纯文本，可自由选取复制">👁 纯文本</button>';
}
function jumpSection(id){
  var el=document.getElementById(id);
  if(!el){toast('该部分暂无内容');return;}
  if(el.scrollIntoView)el.scrollIntoView({block:'start',behavior:'smooth'});
  else{ /* 老环境兜底：手动滚动右栏 */
    var c=el.closest('.col-b')||document.scrollingElement;
    if(c)c.scrollTop=el.offsetTop-70;
  }
}
function bindAnchors(){
  var box=$('#anchors');if(!box)return;
  box.onclick=function(e){
    if(e.target.closest('#achMine')){openNoteModal();return;}
    if(e.target.closest('#achCopy')){copyText(tbPlainText(dataOf(S.book),dataOf(S.book).units[S.ui-1]));return;}
    if(e.target.closest('#achExport')){exportTextbook();return;}
    if(e.target.closest('#achView')){openTextModal();return;}
    var c=e.target.closest('.achip[data-go]');
    if(c)jumpSection(c.dataset.go);
  };
}

/* ===== 教材文本工具：复制 / 导出 / 纯文本查看 =====
   教材正文是大量可点按钮，直接框选困难；这里把它序列化成纯文本再交给剪贴板/文件/浮框。 */
function tbPlainText(bk,u){
  var nt=noteOf(bk,u)||{},L=[];
  L.push(bk.title+' · Unit '+u.index+' · '+u.title);
  L.push(u.lessonLabel||'');
  L.push('');
  var has=false;
  var lead=nt.lead||{};
  if(lead.question||lead.summary||lead.tips){
    L.push('—— 导学 ——');
    if(lead.question)L.push('听录音前先想：'+lead.question);
    if(lead.summary)L.push(lead.summary);
    if(lead.tips)L.push('小贴士：'+lead.tips);
    L.push('');has=true;
  }
  L.push('—— 课文 ——');
  var lessons=nt.text||[];
  if(lessons.length){
    lessons.forEach(function(ls){
      L.push('');
      L.push((ls.lesson?('Lesson '+ls.lesson):'课文')+(ls.title?' · '+ls.title:'')+(ls.kind?'（'+ls.kind+'）':''));
      (ls.lines||[]).forEach(function(l){
        L.push((l.speaker?l.speaker+': ':'')+l.en);
        if(l.zh)L.push('  '+l.zh);
        if(l.note)L.push('  注：'+l.note);
      });
      var d=ls.drill;
      if(d){
        L.push('');
        L.push('句型操练：'+d.q);
        if(d.zh)L.push('  '+d.zh);
        if(d.slots&&d.slots.length)L.push('  可替换：'+d.slots.map(function(s){return s.en+(s.zh?'（'+s.zh+'）':'');}).join('、'));
        if(d.answers&&d.answers.length)L.push('  回答：'+d.answers.join(' / '));
      }
    });
    has=true;
  }else if(S.seg.length){
    var di=0;
    S.seg.forEach(function(r,i){
      if(di<S.divs.length&&S.divs[di].at===i){
        L.push('');L.push('—— Lesson '+S.divs[di].lsn+' ——');di++;
      }
      L.push(r.en);
      if(r.zh)L.push('  '+r.zh);
    });
    has=true;
  }else{
    L.push('（课文尚未加载：请先在学习页播放本课）');
  }
  L.push('');
  if((nt.words||[]).length){
    L.push('—— 生词 ——');
    nt.words.forEach(function(w){
      L.push('  '+w.word+(w.phonetic?'  '+w.phonetic:'')+'  '+meaningsText(w));
    });
    L.push('');has=true;
  }
  if((nt.phrases||[]).length){
    L.push('—— 短语 ——');
    nt.phrases.forEach(function(p){
      L.push('  '+p.phrase+(p.usage?'  '+p.usage:''));
      (p.examples||[]).forEach(function(e){L.push('    例：'+e.en+(e.zh?'（'+e.zh+'）':''));});
    });
    L.push('');has=true;
  }
  if((nt.grammar||[]).length){
    L.push('—— 语法要点 ——');
    nt.grammar.forEach(function(g){
      L.push('· '+g.title);
      if(g.structure)L.push('  句型结构：'+g.structure);
      if(g.definition)L.push('  '+g.definition);
      (g.examples||[]).forEach(function(e){L.push('    例：'+e.en+(e.zh?'（'+e.zh+'）':''));});
    });
    L.push('');has=true;
  }
  if((nt.patterns||[]).length){
    L.push('—— 重点句 ——');
    nt.patterns.forEach(function(p,i){
      L.push((i+1)+'. '+p.pattern);
      if(p.original&&p.original.en)L.push('   课文原句：'+p.original.en+(p.original.zh?'（'+p.original.zh+'）':''));
      (p.imitations||[]).forEach(function(e){L.push('   仿写：'+e.en+(e.zh?'（'+e.zh+'）':''));});
    });
    L.push('');has=true;
  }
  if((nt.exercises||[]).length){
    L.push('—— 自测练习 ——');
    nt.exercises.forEach(function(e,i){
      L.push((i+1)+'. '+e.q);
      L.push('   答案：'+e.a+(e.note?'（'+e.note+'）':''));
    });
    L.push('');has=true;
  }
  if(!has&&L.length<=4)L.push('（本课暂无教材内容）');
  return L.join('\n');
}
function copyText(t){
  function fallback(){
    try{
      var ta=document.createElement('textarea');
      ta.value=t;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('已复制到剪贴板');
    }catch(e){toast('复制失败：请用「👁 纯文本」手动选取复制');}
  }
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(function(){toast('已复制到剪贴板');},fallback);
  }else fallback();
}
function exportTextbook(){
  var bk=dataOf(S.book);if(!bk)return;
  var u=bk.units[S.ui-1];
  var t=tbPlainText(bk,u);
  var name=bk.id+'-U'+('0'+u.index).slice(-2)+'-'+String(u.title).replace(/[\\\/:*?"<>|\s]+/g,'-')+'.txt';
  try{
    var blob=new Blob(['\ufeff'+t],{type:'text/plain;charset=utf-8'}); /* BOM：Windows 记事本直接可读 */
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=name;
    document.body.appendChild(a);a.click();
    setTimeout(function(){
      if(URL.revokeObjectURL)URL.revokeObjectURL(a.href);
      if(a.remove)a.remove();else a.parentNode&&a.parentNode.removeChild(a);
    },500);
    toast('已导出 '+name);
  }catch(e){toast('导出失败：请用「👁 纯文本」手动复制');}
}
/* 纯文本查看浮框 */
function openTextModal(){
  var bk=dataOf(S.book);if(!bk)return;
  var u=bk.units[S.ui-1];
  $('#txSub').textContent=bk.title+' · Unit '+u.index+' · '+u.title;
  $('#txPre').textContent=tbPlainText(bk,u);
  $('#textModal').hidden=false;
  setTimeout(function(){$('#txPre').scrollTop=0;},30);
}
function closeTextModal(){$('#textModal').hidden=true;hideWPop();}
function bindTextModal(){
  var m=$('#textModal');if(!m)return;
  $('#txMask').onclick=closeTextModal;
  $('#txX').onclick=closeTextModal;
  $('#txDone').onclick=closeTextModal;
  $('#txCopy').onclick=function(){copyText($('#txPre').textContent);};
  $('#txExport').onclick=exportTextbook;
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&!m.hidden)closeTextModal();
  });
}

/* ===== 课程包导入（用户上传 JSON）=====
   格式见 docs/course-package-spec.md；单课 / 系列课程同一个通道。 */
function bindImport(){
  var btn=$('#impBtn'),file=$('#impFile');
  if(!btn||!file)return;
  btn.onclick=function(){file.value='';file.click();};
  file.onchange=function(){
    var f=file.files&&file.files[0];
    if(!f)return;
    var rd=new FileReader();
    rd.onload=function(){
      var p;
      try{p=JSON.parse(rd.result);}catch(e){toast('导入失败：不是合法 JSON');return;}
      var v=window.AppData.validate(p);
      if(!v.ok){toast('校验失败：'+v.errors.join('；'));console.warn('[import]',v.errors);return;}
      window.AppData.importPkg(p).then(function(){
        COURSES=window.AppData.list();
        renderBookSel();
        toast('已导入课程包「'+p.title+'」');
        if(v.warnings.length)console.warn('[import] warnings:',v.warnings);
      }).catch(function(e){toast('导入失败：'+e.message);console.error(e);});
    };
    rd.onerror=function(){toast('读取文件失败');};
    rd.readAsText(f);
  };
}

/* ===== 记笔记：弹出浮框 ===== */
var nmRef=null;
function nmSt(t,ok){var s=$('#nmSt');if(s){s.textContent=t;s.classList.toggle('ok',!!ok);}}
function openNoteModal(){
  var bk=dataOf(S.book);if(!bk)return;
  nmRef={bk:bk,u:bk.units[S.ui-1]};
  $('#nmSub').textContent=bk.title+' · '+nmRef.u.title;
  $('#nmText').value=myNoteOf(nmRef.bk,nmRef.u);
  nmSt('自动保存到本机',false);
  $('#noteModal').hidden=false;
  setTimeout(function(){$('#nmText').focus();},30);
}
function closeNoteModal(){
  $('#noteModal').hidden=true;nmRef=null;hideWPop();
  var bk=dataOf(S.book);
  if(bk){renderAnchors(bk,bk.units[S.ui-1]);}   /* 刷新「我的笔记 ✓」角标 */
  if(S.view==='notes')renderOverview();          /* 总览里的我的笔记可能变了 */
}
function bindNoteModal(){
  var m=$('#noteModal');if(!m)return;
  $('#nmMask').onclick=closeNoteModal;
  $('#nmX').onclick=closeNoteModal;
  $('#nmDone').onclick=closeNoteModal;
  $('#nmClear').onclick=function(){
    if(!nmRef)return;
    var ta=$('#nmText');ta.value='';ta.focus();
    saveMyNote(myNoteId(nmRef.bk,nmRef.u),'');
    nmSt('已清空',false);
  };
  $('#nmText').oninput=function(){
    if(!nmRef)return;
    saveMyNote(myNoteId(nmRef.bk,nmRef.u),this.value);
    var d=new Date();
    nmSt('已保存 '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),true);
  };
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&!m.hidden)closeNoteModal();
  });
}

/* ===== 整段循环 ===== */
function setLoopAll(v){
  S.loopAll=!!v;
  try{localStorage.setItem('nce_loopall',S.loopAll?'1':'0');}catch(e){}
  syncCtl();
  toast(S.loopAll?'整段循环已开启（听完整课自动重播）':'整段循环已关闭');
}

/* ===== 视频播放器：普通 / 简洁两种模式，均带 sandbox 禁止跳转 B 站 =====
   做法参照 https://perrykum.github.io/rtcls/study/bliframe/bliframe.html
   - 普通模式：player.bilibili.com（默认）
   - 简洁模式：移动版嵌入地址 html5mobileplayer，本身就没有跳转入口
   - sandbox 不给 allow-popups / allow-top-navigation，两种模式下点击播放器都无法跳走 */
var V_SANDBOX='allow-scripts allow-same-origin allow-forms allow-presentation';
function videoUrl(vid,p){
  return S.vsimple
    ? 'https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid='+vid.bvid+'&page='+p+'&as_wide=1'
    : 'https://player.bilibili.com/player.html?bvid='+vid.bvid+'&high_quality=1&autoplay=0&p='+p;
}
/* 把任意 B 站播放器链接（含整课切片）转成简洁播放器地址 */
function simpleFromUrl(url){
  var m=String(url||'').match(/bvid=([A-Za-z0-9]+)/);
  if(!m)return null;
  var p=(String(url).match(/[?&](?:p|page)=(\d+)/)||[])[1]||1;
  return videoUrl({bvid:m[1]},+p);
}
function setVideoSrc(url){
  var f=$('#vid');if(!f)return;
  f.setAttribute('sandbox',V_SANDBOX); /* 无论哪种模式都禁止跳转 */
  f.src=url; /* 改 sandbox 本身就会让 iframe 重载，这里再置一次 src 兜底 */
}
/* 用当前单元 + 当前集数按新模式重新装载播放器 */
function reloadVideo(){
  var bk=dataOf(S.book),u=bk?bk.units[S.ui-1]:null;
  if(u&&u.video&&u.video.embed){
    setVideoSrc(S.vsimple?(simpleFromUrl(u.video.embed)||u.video.embed):u.video.embed);
    return;
  }
  var vid=(bk&&bk.media&&bk.media.video)||{};
  if(!vid.bvid)return;
  setVideoSrc(videoUrl(vid,S.vp||1));
}
function setVideoMode(simple){
  if(S.vsimple===simple)return;
  S.vsimple=simple;
  var f=$('#vModeFull'),s=$('#vModeSimple');
  if(f)f.classList.toggle('on',!simple);
  if(s)s.classList.toggle('on',simple);
  reloadVideo();
  toast(simple?'已切换到简洁播放器':'已切换到普通播放器');
}
function bindVideoMode(){
  var f=$('#vModeFull'),s=$('#vModeSimple');
  if(f)f.onclick=function(){setVideoMode(false);};
  if(s)s.onclick=function(){setVideoMode(true);};
}

/* ===== 视图切换：学习 / 笔记总览 ===== */
function bindView(){
  var a=$('#vwStudy'),b=$('#vwNotes');
  if(a)a.onclick=()=>setView('study');
  if(b)b.onclick=()=>setView('notes');
}
function setView(v){
  S.view=v;
  var a=$('#vwStudy'),b=$('#vwNotes');
  if(a)a.classList.toggle('on',v==='study');
  if(b)b.classList.toggle('on',v==='notes');
  $('#study').hidden=(v!=='study');
  $('#overview').hidden=(v!=='notes');
  hideWPop();
  if(v==='notes')renderOverview();
}
function gotoUnit(key,u){
  var go=function(){
    setView('study');
    openUnit(u,true);
    var h=$('#head');if(h&&h.scrollIntoView)h.scrollIntoView({block:'nearest'});
  };
  if(key&&key!==S.book){
    var sel=$('#bookSel');if(sel)sel.value=key;
    window.AppData.get(key).then(function(p){
      DATA[key]=p;
      if(setBook(key)===false){return;}
      go();
    }).catch(function(err){toast('加载失败：'+err.message);});
  }else go();
}

/* ===== 笔记总览：把分散在各课的笔记汇总到一页 ===== */
var OV_TYPES=[['all','全部','📚'],['words','生词','🔤'],['phrase','短语','🗣'],
  ['gram','语法','📐'],['pat','句型','💬'],['ex','练习','✏️'],['mine','我的笔记','📝']];
function ovCollect(){
  var list=[];
  courseList().forEach(function(e){
    if(S.ovBook&&e.id!==S.ovBook)return;
    var bk=dataOf(e.id);if(!bk)return;
    bk.units.forEach(function(u){
      var nt=noteOf(bk,u),mine=myNoteOf(bk,u),ix=u.counts||{};
      if(!nt&&!mine&&!ix.w&&!ix.ph&&!ix.g&&!ix.p&&!ix.ex)return;   /* 无笔记数据也无手写：跳过 */
      var g=ntGroups(nt||{});
      list.push({key:e.id,u:u,nt:nt,mine:mine,ix:ix,
        vocab:nt?g.vocab:[],phrase:nt?g.phrase:[]});
    });
  });
  return list;
}
/* 计数：已加载用真实数据，未加载退回索引 */
function ovCount(it,key){
  var loaded=(it.nt&&((key==='w'&&(it.nt.words||[]).length)||(key==='ph'&&(it.nt.phrases||[]).length)||
    (key==='g'&&(it.nt.grammar||[]).length)||(key==='p'&&(it.nt.patterns||[]).length)))||0;
  return loaded||it.ix[key]||0;
}
function ovStatsOf(list){
  var s={words:0,phrase:0,gram:0,pat:0,ex:0,mine:0};
  list.forEach(function(it){
    s.words+=ovCount(it,'w');s.phrase+=ovCount(it,'ph');
    s.gram+=ovCount(it,'g');s.pat+=ovCount(it,'p');
    s.ex+=(it.nt&&(it.nt.exercises||[]).length)||0;
    if(it.mine)s.mine++;
  });
  return s;
}
function ovMatch(it,q,type){
  var n=it.nt||{};
  if(type==='mine'&&!it.mine)return false;
  if(type!=='all'&&type!=='mine'){
    var map={words:'w',phrase:'ph',gram:'g',pat:'p'};
    var n2=map[type]?ovCount(it,map[type])
      :((n.exercises||[]).length);
    if(!n2)return false;
  }
  if(!q)return true;
  var hay=[it.u.title,it.mine||''];
  if(it.nt){
    (it.nt.words||[]).forEach(function(w){hay.push(w.word,meaningsText(w));});
    (it.nt.phrases||[]).forEach(function(p){hay.push(p.phrase,p.usage||'');});
    (it.nt.grammar||[]).forEach(function(g){hay.push(g.title,g.structure||'',g.definition||'');});
    (it.nt.patterns||[]).forEach(function(p){hay.push(p.pattern,p.original?p.original.zh:'');});
    (it.nt.exercises||[]).forEach(function(e){hay.push(e.q,e.a,e.note||'');});
    var ld=it.nt.lead||{};
    hay.push(ld.summary||'',ld.question||'',ld.tips||'');
  }
  return hay.join(' ').toLowerCase().indexOf(q)>=0;
}
function ovStatsHTML(st,n){
  return [['有笔记单元',n],['生词',st.words],['短语',st.phrase],['语法',st.gram],
    ['句型',st.pat],['练习',st.ex],['我的笔记',st.mine]].map(function(x){
    return '<div class="ov-st"><b>'+x[1]+'</b><span>'+x[0]+'</span></div>';}).join('');
}
function ovSections(it){
  var n=it.nt||{},t=S.ovType,h='';
  var show=function(k){return t==='all'||t===k;};
  if(show('words')&&it.vocab.length)
    h+='<div class="ov-sec"><h6>🔤 生词 '+(it.vocab.length)+'</h6><div class="nt-words">'+it.vocab.map(wordCard).join('')+'</div></div>';
  if(show('phrase')&&it.phrase.length)
    h+='<div class="ov-sec"><h6>🗣 短语 '+it.phrase.length+'</h6><div class="nt-words">'+it.phrase.map(wordCard).join('')+'</div></div>';
  if(show('gram')&&(n.grammar||[]).length)
    h+='<div class="ov-sec"><h6>📐 语法</h6>'+n.grammar.map(grCard).join('')+'</div>';
  if(show('pat')&&(n.patterns||[]).length)
    h+='<div class="ov-sec"><h6>💬 句型</h6><div class="tb-pats">'+n.patterns.map(patCard).join('')+'</div></div>';
  if(show('ex')&&(n.exercises||[]).length)
    h+='<div class="ov-sec"><h6>✏️ 练习</h6><div class="tb-exs">'+n.exercises.map(exCard).join('')+'</div></div>';
  if(show('mine'))
    h+='<div class="ov-sec"><h6>📝 我的笔记</h6>'+(it.mine
      ? '<div class="ov-mine">'+esc(it.mine).replace(/\n/g,'<br>')+'</div>'
      : '<div class="ov-none">这一课还没写过</div>')+'</div>';
  return h||'<div class="ov-none">该类型下暂无内容</div>';
}
function ovUnitCard(it){
  var n=it.nt||{},meta=[];
  if(ovCount(it,'w'))meta.push('生词 '+ovCount(it,'w'));
  if(ovCount(it,'ph'))meta.push('短语 '+ovCount(it,'ph'));
  if(ovCount(it,'g'))meta.push('语法 '+ovCount(it,'g'));
  if(ovCount(it,'p'))meta.push('句型 '+ovCount(it,'p'));
  if((n.exercises||[]).length)meta.push('练习 '+n.exercises.length);
  if(it.mine)meta.push('我的笔记 ✓');
  var body=it.nt?ovSections(it):'<div class="ov-none">展开加载这一课的详细笔记…</div>';
  return '<details class="ov-unit" data-key="'+it.key+'" data-u="'+it.u.index+'"><summary>'+
    '<span class="ov-no">'+it.u.index+'</span>'+
    '<div class="ov-tt"><div class="t">'+esc(it.u.title)+'</div>'+
    '<div class="m">'+esc(meta.join(' · ')||'暂无内容')+'</div></div>'+
    '<span class="ov-go">去学习 →</span></summary>'+
    '<div class="ov-ub">'+body+'</div></details>';
}
/* 展开单元时按需加载笔记详情 */
function bindOverviewToggles(){
  var box=$('#overview');if(!box)return;
  box.querySelectorAll('.ov-unit').forEach(function(det){
    det.addEventListener('toggle',function(){
      if(!det.open||det.dataset.filled)return;
      det.dataset.filled='1';
      var bk=dataOf(det.dataset.key);if(!bk)return;
      var u=bk.units[+det.dataset.u-1];if(!u)return;
      var mine=myNoteOf(bk,u);
      loadNote(bk,u).then(function(){
        if(S.view!=='notes')return;
        var nt=noteOf(bk,u)||{},g=ntGroups(nt);
        det.querySelector('.ov-ub').innerHTML=
          ovSections({key:bk.id,u:u,nt:nt,mine:mine,ix:u.counts||{},vocab:g.vocab,phrase:g.phrase});
      });
    });
  });
}
/* 打开总览时后台预载当前范围（默认当前册）的全部笔记，加载完自动刷新 */
var ovPreloading=null;
function preloadOverviewNotes(){
  /* 只预载当前查看范围：选定册 = 该册；全部册 = 当前册（其余在展开时按需加载） */
  var books=[S.ovBook||S.book];
  var jobs=[];
  books.forEach(function(k){
    var bk=dataOf(k);if(!bk)return;
    bk.units.forEach(function(u){
      if(noteOf(bk,u))return;   /* 已加载则跳过 */
      jobs.push(loadNote(bk,u));
    });
  });
  if(!jobs.length){return;}
  if(ovPreloading)ovPreloading.abort=true;
  var token={abort:false};
  ovPreloading=token;
  Promise.all(jobs).then(function(){
    if(token.abort)return;
    ovPreloading=null;
    if(S.view==='notes')renderOverview();
  });
}
function renderOverview(){
  var box=$('#overview');if(!box)return;
  var all=ovCollect();
  var q=(S.ovQ||'').trim().toLowerCase();
  var list=all.filter(function(it){return ovMatch(it,q,S.ovType);});
  box.innerHTML=
   '<div class="ov-head"><div><h2>笔记总览</h2>'+
     '<div class="ov-sub">各课的 生词 / 短语 / 语法 / 句型 / 练习 / 我的笔记 汇总到一页，按单元分组，可筛选、可搜索。'+
     '点单元标题展开，点「去学习 →」回到学习页。</div></div>'+
     '<div class="ov-stats">'+ovStatsHTML(ovStatsOf(all),all.length)+'</div></div>'+
   '<div class="ov-bar">'+
     '<div class="ov-chips"><button class="ovchip'+(S.ovBook?'':' on')+'" data-b="">全部课程</button>'+
       courseList().map(function(b){return '<button class="ovchip'+(S.ovBook===b.id?' on':'')+'" data-b="'+b.id+'">'+esc(b.id)+'</button>';}).join('')+'</div>'+
     '<div class="ov-chips">'+OV_TYPES.map(function(t){
       return '<button class="ovchip'+(S.ovType===t[0]?' on':'')+'" data-t="'+t[0]+'">'+t[2]+' '+t[1]+'</button>';}).join('')+'</div>'+
     '<div class="ov-search"><input id="ovQ" type="text" placeholder="搜索单词、语法、句型或自己写的笔记…" value="'+esc(S.ovQ)+'">'+
       '<span id="ovCount"></span></div>'+
   '</div>'+
   '<div class="ov-body">'+(
     list.length?list.map(ovUnitCard).join('')
     :'<div class="ov-empty">没有匹配的笔记。换个筛选条件，或先在「学习 → 学习笔记 → 记笔记」里写点东西。</div>'
   )+'</div>';
  var c=$('#ovCount');if(c)c.textContent=list.length+' 个单元';
  var qi=$('#ovQ');
  if(qi)qi.oninput=function(){
    S.ovQ=qi.value;
    var pos=qi.selectionStart;
    renderOverview();
    var n=$('#ovQ');
    if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(e){}}
  };
  bindOverviewToggles();
  preloadOverviewNotes();
}
function ovClick(e){
  var b=e.target.closest?e.target.closest('.ovchip[data-b]'):null;
  if(b){S.ovBook=b.dataset.b;renderOverview();return;}
  var t=e.target.closest?e.target.closest('.ovchip[data-t]'):null;
  if(t){S.ovType=t.dataset.t;renderOverview();return;}
  var w=e.target.closest?e.target.closest('.nt-word'):null;
  if(w){var x=w.querySelector('b');if(x)speakToggle(x.textContent);return;}
  var go=e.target.closest?e.target.closest('.ov-go'):null;
  if(go){
    e.preventDefault();
    var d=go.closest('.ov-unit');
    if(d)gotoUnit(d.dataset.key,+d.dataset.u);
  }
}

/* 点英文句子朗读（再点一次停止），不干扰主音频 */
function speakToggle(text){
  var sy=window.speechSynthesis;if(!sy)return;
  if(sy.speaking&&sy._last===text){sy.cancel();sy._last=null;return;}
  try{sy.cancel();}catch(e){}
  var ut=new SpeechSynthesisUtterance(text);
  ut.lang='en-GB';ut.rate=.95;sy._last=text;
  sy.speak(ut);
}

function markUnit(bk,u,set,reset){
  var id=doneId(bk.id,u.index);
  if(reset)done.delete(id);else if(set)done.add(id);else done.delete(id);
  saveDone();renderDir();renderHead(bk,u);
  toast(reset?'已重置':'标记已学 ✓');
}

/* ===== 播放 ===== */
function segStart(i){return S.seg[i]?S.seg[i].t:0}
function segEnd(i){
  if(i+1<S.seg.length)return S.seg[i+1].t-0.02;
  return Math.min((S.seg[i]?S.seg[i].t:0)+4,S.dur>0?S.dur-0.02:1e9);
}
function togglePlay(){var a=$('#audio');if(a.paused)tryPlay();else a.pause();}
/* 统一走这里播放：用 playTok 防止“快速切换”时旧播放请求的结果覆盖新状态 */
function tryPlay(){
  var a=$('#audio');if(!a.src)return;
  var tok=++S.playTok;
  S.playing=true;syncPlayBtn();
  try{
    var p=a.play();
    if(p&&p.catch)p.catch(function(err){
      if(tok!==S.playTok)return;                       /* 已被更新的播放请求取代 */
      if(!err||err.name==='AbortError')return;         /* 换源导致的中断，忽略 */
      S.playing=false;syncPlayBtn();
      if(err.name==='NotAllowedError')toast('浏览器拦截了自动播放，点 ▶ 开始');
    });
  }catch(e){S.playing=false;syncPlayBtn();}
}
/* 按钮以元素实际状态为准，避免滞后事件把图标改错 */
function syncPlayBtn(){
  var b=$('#btnPlay');if(!b)return;
  var a=$('#audio');
  b.textContent=(S.playing&&a&&!a.paused)?'❚❚':'▶';
}
function syncCtl(){
  $('#cLoop').classList.toggle('on',S.loop);
  var la=$('#cLoopAll');if(la)la.classList.toggle('on',S.loopAll);
  var c=$('#cAB');
  c.textContent=S.abA==null?'⭯ A-B 复读':S.abB==null?('A：句'+(S.abA+1)+' · 点设B'):('A-B 句'+(Math.min(S.abA,S.abB)+1)+'-'+(Math.max(S.abA,S.abB)+1)+' · 取消');
  c.classList.toggle('warm',S.abA!=null);
  var r=$('#cRate');r.textContent=S.rate+'x';r.classList.toggle('on',S.rate!==1);
  $('#metaS').textContent=(S.loop?'单句循环 · ':'')+(S.loopAll?'整段循环 · ':'')+(S.rate!==1?(S.rate+'x · '):'')+(S.abA!=null&&S.abB!=null?'A-B 区间 · ':'')+'歌词自动跟随';
}
function jumpLine(d){
  if(!S.seg.length)return;
  var a=$('#audio');
  var i=Math.max(0,Math.min(S.seg.length-1,S.cur+d));
  setT(segStart(i));
  tryPlay();
}
function cycleAB(){
  var c=S.cur<0?0:S.cur;
  if(S.abA==null)S.abA=c;
  else if(S.abB==null){if(S.abA===c){S.abA=null;toast('A、B 不能同一句');}else S.abB=c;}
  else{S.abA=null;S.abB=null;}
  syncCtl();
}
function seekAt(e){
  if(!S.dur)return;
  var r=$('#seek').getBoundingClientRect();
  var ratio=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
  setT(ratio*S.dur);
}
function renderTime(){$('#tall').textContent=fmt(S.dur);var bk=dataOf(S.book);$('#metaT').textContent=bk.units[S.ui-1].title;}
function resetSeekUI(){
  S.dur=0;S.wantStart=null;S.cur=-1;S.playing=false;
  $('#tcur').textContent='0:00';
  var t=$('#tall');if(t)t.textContent='0:00';
  var f=$('#sfill');if(f)f.style.width='0%';
  var k=$('#skn');if(k)k.style.left='0%';
  var sa=$('#segAB');if(sa)sa.style.display='none';
  syncPlayBtn();syncCtl();
}

function tick(){
  var a=$('#audio');
  if(!a.duration)return;
  var t=a.currentTime,d=a.duration;S.dur=d;
  $('#tcur').textContent=fmt(t);
  var tall=$('#tall'),ds=fmt(d);
  if(tall&&tall.textContent!==ds)tall.textContent=ds; /* 没等到 loadedmetadata 也能显示总时长 */
  var ratio=d?t/d:0;
  $('#sfill').style.width=(ratio*100)+'%';
  $('#skn').style.left=(ratio*100)+'%';
  var seg=$('#segAB');
  if(!S.seg.length){seg.style.display='none';if(!S.doneFlag&&d-t<=0.8)finishUnit();return;}
  /* 当前句 */
  var si=-1;
  for(var k=0;k<S.seg.length;k++){if(S.seg[k].t<=t+0.02)si=k;else break;}
  if(si!==S.cur){
    var old=S.cur;S.cur=si;
    var alls=document.querySelectorAll('#subBox .sline');
    if(old>=0&&alls[old])alls[old].classList.remove('active');
    if(si>=0&&alls[si]){
      alls[si].classList.add('active');
      /* 歌词容器内跟随：只在超出可视区时小幅滚动，绝不滚动页面/抢焦点 */
      var box=$('#subBox'),el=alls[si];
      var br=box.getBoundingClientRect(),er=el.getBoundingClientRect();
      var pad=box.clientHeight*0.24;
      var dy=0;
      if(er.top<br.top+pad)dy=er.top-br.top-pad;
      else if(er.bottom>br.bottom-pad)dy=er.bottom-br.bottom+pad;
      if(dy)box.scrollTop+=dy;
    }
  }
  /* A-B / 单句循环 */
  if(S.abA!=null&&S.abB!=null){
    var A=Math.min(S.abA,S.abB),B=Math.max(S.abA,S.abB);
    var st=segStart(A),ed=segEnd(B);
    seg.style.display='block';seg.style.left=(st/d*100)+'%';seg.style.width=((ed-st)/d*100)+'%';
    if(t>=ed){setT(st);return;}
  }else seg.style.display='none';
  if(S.loop&&S.cur>=0&&t>=segEnd(S.cur)){setT(segStart(S.cur));return;}
  /* 近尾完成 */
  if(!S.doneFlag&&d-t<=0.8)finishUnit();
}
function finishUnit(){
  if(S.doneFlag)return;S.doneFlag=true;
  var bk=dataOf(S.book),u=bk.units[S.ui-1];
  if(!u)return;
  var id=doneId(bk.id,u.index);
  if(!done.has(id)){done.add(id);saveDone();}
  renderDir();renderHead(bk,u);
  toast('本单元已听完 ✓');
}

/* ===== 启动 ===== */
function renderBookSel(){
  var sel=$('#bookSel');if(!sel)return;
  sel.innerHTML=COURSES.map(function(c){
    return '<option value="'+c.id+'"'+(c.id===S.book?' selected':'')+'>'+esc(c.title)+
      (c.unitCount?'（'+c.unitCount+' 课）':'')+'</option>';
  }).join('');
}
function boot(){
  skeleton();bindStatic();
  applyMode();
  window.AppData.init().then(function(){
    COURSES=window.AppData.list();
    if(!COURSES.length){renderBookSel();toast('未找到任何课程包：请检查 data/courses/ 或导入课程包');return;}
    /* 恢复上次课程；不再存在的 id 回退到第一个 */
    if(!COURSES.some(function(c){return c.id===S.book;}))S.book=COURSES[0].id;
    renderBookSel();
    return window.AppData.get(S.book).then(function(p){
      DATA[S.book]=p;
      S.ui=Math.min(p.units.length,+(window.AppStore.pref('last.'+S.book,1)||1)||1);
      renderDir();syncCtl();setView('study');
      try{openUnit(S.ui);}catch(e){console.log('boot/openUnit fail:',e.message,'| course=',S.book,'| ui=',S.ui);throw e;}
      setInterval(function(){window.AppStore.setPref('last.'+S.book,S.ui);},1200);
    });
  }).catch(function(e){
    toast('课程加载失败：'+e.message);console.error(e);
  });
}
function toast(m){var t=$('#toast');t.textContent=m;t.style.opacity='1';
  clearTimeout(t._t);t._t=setTimeout(function(){t.style.opacity='0';},2000);}
boot();
