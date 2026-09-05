/* 新概念英语点读 v1.3：多教材 · 一单元一音频一课 */
"use strict";
var $=s=>document.querySelector(s);
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fmt(s){s=Math.max(0,Math.floor(s));return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2)}
function clampT(t,dur){if(!isFinite(t))return 0;dur=+dur||0;if(dur>0&&t>dur-0.05)t=dur-0.05;return Math.max(0,t)}
function setT(t){var a=$('#audio');try{a.currentTime=clampT(t,a.duration);}catch(e){}}

/* 数据脚本的全局变量名历史上有两套（NCE1 / N1），这里按别名逐个试，避免读到 undefined 后静默回退到第一册 */
var BOOKS=[
  {key:'NCE1',label:'新概念英语 第一册（144课·两课一音）',globals:['NCE1','N1']},
  {key:'NCE2',label:'新概念英语 第二册（96课·一课一音）',globals:['NCE2','N2']},
  {key:'NCE3',label:'新概念英语 第三册（60课·一课一音）',globals:['NCE3','N3']},
  {key:'NCE4',label:'新概念英语 第四册（48课·一课一音）',globals:['NCE4','N4']}
];
var DATA={};
function entryOf(k){for(var i=0;i<BOOKS.length;i++)if(BOOKS[i].key===k)return BOOKS[i];return null;}
function pickBook(k){
  var ent=entryOf(k);if(!ent)return null;
  for(var i=0;i<ent.globals.length;i++){
    var o=window[ent.globals[i]];
    if(o&&o.units&&o.units.length){
      o.key=o.key||o.book||ent.key;   /* NCE1 旧数据用 book 字段 */
      o.title=o.title||ent.label;
      return o;
    }
  }
  console.error('[NCE] 未找到该册数据：'+k+'，已尝试全局变量 '+ent.globals.join(' / '));
  return null;
}
function dataOf(k){if(!DATA[k])DATA[k]=pickBook(k);return DATA[k]||null;}
/* 真正可用的册（缺数据的册不进下拉框，也就不会“点了没反应还显示第一册”） */
var AVAIL=BOOKS.filter(b=>!!pickBook(b.key));
if(!AVAIL.length){document.addEventListener('DOMContentLoaded',function(){toast('教材数据未加载：请检查 data/NCE*.js');});}
var DONE_KEY='nce_done_v1';
var done=new Set((localStorage.getItem(DONE_KEY)||'').split(',').filter(Boolean));
function doneId(k,u){return k+':'+u}
function saveDone(){localStorage.setItem(DONE_KEY,[...done].join(','));}

var MODES=['show','zh','en','blur'];
var MODE_TXT={show:'字幕：双语',zh:'字幕：中文',en:'字幕：英文',blur:'字幕：模糊'};
var S={book:'NCE1',ui:1,tab:'audio',mode:0,ver:'new',rate:1,abA:null,abB:null,loop:false,
  loopAll:true,view:'study',ovBook:'',ovType:'all',ovQ:'',dict:{},
  seg:[],divs:[],cur:-1,dur:0,doneFlag:false,playing:false,drag:false,lastFile:null,wantStart:null,req:0,playTok:0};
try{if(localStorage.getItem('nce_loopall')==='0')S.loopAll=false;}catch(e){}
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
function loadLrc(book,u){
  if(lrcCache[u.lrc])return Promise.resolve(lrcCache[u.lrc]);
  if(!u.lrc)return Promise.resolve(null);
  if(typeof fetch!=='function')return Promise.resolve(null); /* 老环境兜底 */
  return fetch(u.lrc).then(r=>{if(!r.ok)throw 0;return r.text()})
    .then(t=>{lrcCache[u.lrc]=parseLrc(t);return lrcCache[u.lrc];})
    .catch(()=>null);
}
/* 把单元内各课句子合并成连续字幕；S.seg=句子，S.divs=课分隔位置 */
function buildSeg(u,parsed){
  var out=[],divs=[];
  var ls=u.ls||[u.n];
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
    '<div class="vfoot"><span id="vlabel"></span><span class="sp"></span><a id="vlink" target="_blank" rel="noopener">B站原链 ↗</a></div>'+
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
  bindDirPop();bindWPop();bindView();bindAnchors();bindNoteModal();
  $('#overview').onclick=ovClick;
  var bs=$('#bookSel');
  function doBookSwitch(){
    var k=bs.value;if(!k||k===S.book)return;
    try{if(setBook(k)===false)bs.value=S.book;/* 切换失败：下拉框回到当前册 */}
    catch(err){bs.value=S.book;toast('切换失败：'+err.message);console.error(err);}
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
function setBook(k){
  var bk=dataOf(k);
  if(!bk){toast('该册数据未加载：'+k);console.error('[NCE] setBook 失败，无数据：',k);return false;}
  if(!entryOf(k)){k=AVAIL.length?AVAIL[0].key:'NCE1';bk=dataOf(k);if(!bk)return false;}
  try{$('#audio').pause();}catch(e){}
  var sel=$('#bookSel');if(sel)sel.value=k; /* 保持下拉框与当前册一致 */
  S.book=k;S.lastFile=null;S.abA=null;S.abB=null;S.loop=false;S.cur=-1;S.dur=0;S.doneFlag=false;
  S.seg=[];S.divs=[];S.wantStart=null;
  S.ui=Math.max(1,Math.min(bk.units.length,+(localStorage.getItem('nce_last_'+k)||1)||1));
  closeDir();renderDir();
  openUnit(S.ui,true); /* 换册属于用户操作，直接开播 */
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
    var id=doneId(bk.key,u.u);
    var pair=(u.lesson_no||(u.ls&&u.ls[1]?u.ls[0]+'&'+u.ls[1]:u.n));
    return {u:u.u,i:i+1,title:u.title,pair:pair?String(pair):'',done:done.has(id),active:(i+1)===S.ui};
  });
  $('#topTag').textContent='已学 '+dirRows.filter(r=>r.done).length+' / '+units.length;
  var sub=$('#dirSub');if(sub)sub.textContent=bk.title+' · 共 '+units.length+' 单元';
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
  if(S.lastFile!==unit.audio){
    S.lastFile=unit.audio;
    resetSeekUI(); /* 先归零播放器（进度条/时间/播放键/A-B），再换源 */
    a.src=S.ver==='old'&&unit.audio85?unit.audio85:unit.audio;
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
  var id=doneId(bk.key,u.u);
  var pair=u.lesson_no||(u.ls&&u.ls[1]?u.ls[0]+' & '+u.ls[1]:u.n);
  var nums=u.ls||[u.n];
  $('#head').innerHTML=
    '<div class="study-num">'+u.u+'</div>'+
    '<div class="study-t"><h1>'+esc(u.title)+'</h1>'+
    '<div class="zh">'+(u.ls&&u.ls.length>1?'两课一个音频：Lesson '+nums.join(' / '):'Lesson '+nums[0])+'</div>'+
    '<div class="study-tags"><span class="tag'+(done.has(id)?' ok':'')+'">'+(done.has(id)?'已学 ✓':'未学')+'</span>'+
    '<span class="tag">'+(S.ver==='old'&&u.audio85?'1985 老版':'新版英音')+'</span>'+
    (u.audio85?'<button class="tag" id="tgVer" style="cursor:pointer">切 '+(S.ver==='old'?'新版':'85 老版')+'</button>':'')+
    (done.has(id)?'':'<button class="tag new" id="tgDone" style="cursor:pointer">标为已学</button>')+
    '</div></div>'+
    '<div class="study-meta" id="info"></div>';
  var v=$('#tgVer');if(v)v.onclick=()=>{S.ver=S.ver==='old'?'new':'old';S.lastFile=null;openUnit(u.u,true);};
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
  var vid=bk.video||{};
  var note=$('#vnote');
  var pageTxt=function(p){var it=(vid.pages||[]).find(x=>x.p===p);return it?it.part:('P'+p);};
  /* 有「整课切片」直链（NCE2/3，来自CSV video_lesson_*）→ 主播放器直接播这一课 */
  if(u.ve&&u.vw){
    var sv=simpleFromUrl(u.ve); /* 整课切片链接统一转成简洁播放器 */
    setVideoSrc(sv||u.ve);
    $('#vframe').classList.remove('blank');
    $('#vlabel').textContent='整课讲解 · '+u.title;
    $('#vlink').href=u.vw;
    $('#vEmptyTxt').textContent='视频加载中…';
    var coll=Array.isArray(vid.watch)?vid.watch:[];
    box.innerHTML='<button class="vchip on">▶ 本课整课讲解</button>'+
      (coll.length?'<a class="vchip mini" href="'+esc(coll[0])+'" target="_blank" rel="noopener">官方合集 ↗（想按 单词/语法/文章 分段看时用）</a>':'');
    note.textContent='来源：胶学本课切片（第三方整理）。点播放键即可看这一课的讲解，本页自动带出，切课自动换课。';
    return;
  }
  var nums=u.ls||[u.n];
  var seen={},ps=[];
  nums.forEach(function(n){
    var arr=bk.v?bk.v[String(n)]:null;
    (arr||[]).forEach(function(p){if(!seen[p]){seen[p]=1;ps.push(p);}});
  });
  ps.sort(function(a,b){return a-b;});
  if(ps.length){
    box.innerHTML=ps.map(function(p){
      var label=cleanPart(pageTxt(p));
      return '<button class="vchip" data-p="'+p+'">'+esc(label)+' · P'+p+'</button>';
    }).join('');
    note.textContent='官方合集按 课号 分P定位（本课涉及 P'+ps.join('/P')+'）。点集切换；切课自动带出本课首集。';
    $('#vEmptyTxt').textContent='选择上方某一集播放';
    var p0=ps[0];
    setVideoSrc(videoUrl(vid,p0));
    $('#vframe').classList.remove('blank');
    $('#vlabel').textContent='P'+p0+' · '+cleanPart(pageTxt(p0));
    $('#vlink').href='https://www.bilibili.com/video/'+vid.bvid+'/?p='+p0;
  }else{
    var ws=Array.isArray(vid.watch)?vid.watch:[];
    box.innerHTML=ws.length?ws.map(function(w){
      return '<a class="vchip" href="'+w+'" target="_blank" rel="noopener">官方合集 ↗</a>';
    }).join(''):'<div class="sm mut">暂无讲解视频（UP 主尚未制作此册视频课程）</div>';
    note.textContent=ws.length?'此册视频按合集提供：请进入合集后选择本课定位。':'胶学视频暂未覆盖此册。';
    $('#vEmptyTxt').textContent='暂无视频内容';
  }
}
function playVideoChip(p){
  var bk=dataOf(S.book),vid=bk.video||{},f=$('#vframe');
  setVideoSrc(videoUrl(vid,p));
  f.classList.remove('blank');
  var it=(vid.pages||[]).find(x=>x.p===p);
  $('#vlabel').textContent='P'+p+' · '+cleanPart(it?it.part:'');
  $('#vlink').href='https://www.bilibili.com/video/'+vid.bvid+'/?p='+p;
  setTab('video');
}
/* 本单元信息：放在顶部 bar 右侧，做成一排紧凑信息片 */
function renderInfo(bk,u){
  var box=$('#info');if(!box)return;
  var nums=u.ls||[u.n];
  var has=noteExists(bk,u);
  var chips=
    '<span class="mi">🎧 '+(u.audio85?'新版 + 1985 老版':'新版英音')+'</span>'+
    '<span class="mi">📚 Lesson '+nums.join(' · ')+(u.ls&&u.ls.length>1?'（同一段录音）':'')+'</span>'+
    '<span class="mi'+(has?' ok':'')+'">📖 教材：'+(has?'已生成（右侧可按块跳转）':'本课尚未生成')+'</span>'+
    '<span class="mi">💾 进度存于本机</span>';
  box.innerHTML=chips+'<button class="mi act" id="btnReset" title="清除本单元的「已学」标记">重置标记</button>';
  var r=$('#btnReset');if(r)r.onclick=()=>markUnit(bk,u,false,true);
}
/* ===== 教材数据层 =====
   手写精修（window.NOTES，notes.js）优先；其余课懒加载 data/notes/<册>/<课>.json，
   由 backend/scripts/import_nce_notes.py 从参考仓库（aikawarazu/new-concept-english）生成。 */
var noteCache={};   /* '册:单元' -> 已加载的笔记对象；null 表示确认无数据 */
function noteIdOf(bk,u){return bk.key+':'+u.u}
function noteFile(bk,u){
  if(bk.key==='NCE1'){var a=2*u.u-1,b=2*u.u;return ('00'+a).slice(-3)+'-'+('00'+b).slice(-3);}
  return ('0'+u.u).slice(-2);
}
function noteOf(bk,u){return (window.NOTES||{})[noteIdOf(bk,u)]||noteCache[noteIdOf(bk,u)]||null;}
function noteIdx(bk,u){return ((window.NOTES_IDX||{})[bk.key]||{})[String(u.u)]||null;}
function noteExists(bk,u){return !!(noteOf(bk,u)||noteIdx(bk,u));}
function loadNote(bk,u){
  var id=noteIdOf(bk,u);
  if(window.NOTES[id]||noteCache[id])return Promise.resolve(noteOf(bk,u));
  if(noteCache[id]===null)return Promise.resolve(null); /* 已知 404，不再请求 */
  if(typeof fetch!=='function'){noteCache[id]=null;return Promise.resolve(null);} /* 老环境兜底 */
  return fetch('data/notes/'+bk.key+'/'+noteFile(bk,u)+'.json')
    .then(function(r){return r.ok?r.json():null;})
    .then(function(j){noteCache[id]=j||null;return j;})
    .catch(function(){noteCache[id]=null;return null;});
}
function normW(w){return String(w==null?'':w).toLowerCase().replace(/[^a-z'’-]/g,'');}
function buildDict(nt){
  var m={};
  ((nt&&nt.words)||[]).forEach(function(x){var k=normW(x[0]);if(k&&!m[k])m[k]=x;});
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
function tbLesson(L,dict){
  var h='<div class="tbk-sec"><h5>Lesson '+esc(L.no)+(L.title?' · '+esc(L.title):'')+
    (L.kind?' <i>'+esc(L.kind)+'</i>':'')+'</h5>';
  if(L.lines&&L.lines.length){
    h+='<div class="tbk-text">'+L.lines.map(function(l){
      var sp=l[0]||'',cls=(sp==='B'||sp==='2')?'b':'';
      return '<div class="tb-line"><span class="tb-sp '+cls+'">'+esc(sp||'·')+'</span>'+
        '<div class="tb-l"><div class="tb-en">'+markWords(l[1],dict)+'</div>'+
        (l[2]?'<div class="tb-zh">'+esc(l[2])+'</div>':'')+
        (l[3]?'<div class="tb-note">'+esc(l[3])+'</div>':'')+'</div></div>';
    }).join('')+'</div>';
  }
  var d=L.drill;
  if(d){
    h+='<div class="tb-drill" style="margin-top:10px"><div class="q">'+esc(d.q).replace('___','<em>___</em>')+'</div>'+
      (d.zh?'<div class="zh">'+esc(d.zh)+'</div>':'')+
      (d.slots&&d.slots.length?'<div class="tb-slots">'+d.slots.map(function(s){
        return '<span class="tb-slot">'+esc(s[0])+'<small>'+esc(s[1])+'</small></span>';}).join('')+'</div>':'')+
      (d.answers&&d.answers.length?'<div class="tb-ans">'+d.answers.map(function(a,i){
        return '<span'+(i?' class="no"':'')+'>'+esc(a)+'</span>';}).join('')+'</div>':'')+
      '</div>';
  }
  return h+'</div>';
}
function tbSecId(id,title,en,inner){
  return '<section class="tbk-sec" id="'+id+'"><h5>'+esc(title)+' <i>'+esc(en)+'</i></h5>'+inner+'</section>';
}
/* 生词卡：[en, "/音标/ 词性. 释义（用法）"] */
function tbWordCard(w){
  return '<div class="tb-word"><b>'+esc(w[0])+'</b><span>'+esc(w[1])+'</span></div>';
}
/* 短语卡：[phrase, 用法, [[en,zh],...]]（兼容旧两元组） */
function tbPhraseCard(p){
  var ex=(p[2]||[]).map(function(e){
    return '<div class="tb-ex-line"><span class="en">'+markWords(e[0],S.dict)+'</span>'+
      (e[1]?'<span class="zh">'+esc(e[1])+'</span>':'')+'</div>';
  }).join('');
  return '<div class="tb-word phrase"><b>'+esc(p[0])+'</b>'+(p[1]?'<span>'+esc(p[1])+'</span>':'')+
    (ex?'<div class="tb-exs-mini">'+ex+'</div>':'')+'</div>';
}
/* 语法卡：{k,f,d,ex:[[en,zh]]}（兼容旧 {k,f,d}） */
function grCardRich(g,dict){
  var ex=(g.ex||[]).map(function(e){
    return '<div class="tb-ex-line"><span class="en">'+markWords(e[0],dict)+'</span>'+
      (e[1]?'<span class="zh">'+esc(e[1])+'</span>':'')+'</div>';
  }).join('');
  return '<div class="tb-gr"><div class="k">'+esc(g.k)+'</div>'+
    (g.f?'<div class="f">'+esc(g.f)+'</div>':'')+
    (g.d?'<div class="d">'+esc(g.d)+'</div>':'')+
    (ex?'<div class="tb-exs-mini">'+ex+'</div>':'')+'</div>';
}
/* 句型卡：{p, o:[en,zh], im:[[en,zh]]}（兼容旧 [en,zh]） */
function patCard(p,i,dict){
  if(p&&p.p!=null){
    var im=(p.im||[]).map(function(e){
      return '<div class="tb-ex-line"><span class="en">'+markWords(e[0],dict)+'</span>'+
        (e[1]?'<span class="zh">'+esc(e[1])+'</span>':'')+'</div>';
    }).join('');
    return '<div class="tb-pat"><span class="no">'+(i+1)+'</span><div>'+
      '<div class="en">'+markWords(p.p,dict)+'</div>'+
      (p.o&&p.o[0]?'<div class="zh">课文原句：'+esc(p.o[0])+(p.o[1]?'（'+esc(p.o[1])+'）':'')+'</div>':'')+
      (im?'<div class="tb-exs-mini"><div class="t">仿写</div>'+im+'</div>':'')+
      '</div></div>';
  }
  return '<div class="tb-pat"><span class="no">'+(i+1)+'</span><div>'+
    '<div class="en">'+markWords(p[0],dict)+'</div><div class="zh">'+esc(p[1])+'</div></div></div>';
}
function patCardRich(p,i,dict){return patCard(p,i,dict);}
function renderTextbook(bk,u){
  var box=$('#tbk');if(!box)return;
  var nt=noteOf(bk,u);
  var dict=S.dict=buildDict(nt||{});
  var nums=u.ls||[u.n];
  var h='<div class="tbk-paper">';
  /* 页眉 */
  h+='<div class="tbk-head"><span class="tbk-lesson">'+
    esc((nt&&nt.unit)||('Lesson '+nums.join(' & ')))+'</span>'+
    '<div><h3>'+esc((nt&&nt.title)||u.title)+'</h3>'+
    (nt&&nt.subtitle?'<div class="zh">'+esc(nt.subtitle)+'</div>':'')+'</div></div>';
  h+='<div class="tbk-body">';
  /* 导学（问 + 概要 + 贴士；生成课没有这部分则整块隐藏） */
  var intro='';
  if(nt&&nt.question)intro+='<div class="tbk-q">🎧 <b>听录音前先想</b>：'+esc(nt.question)+'</div>';
  if(nt&&nt.summary)intro+='<div style="font-size:13px;line-height:1.95;color:#5f5a4c">'+esc(nt.summary)+'</div>';
  if(nt&&nt.tips)intro+='<div class="tb-tip"><b>💡</b><div>'+esc(nt.tips)+'</div></div>';
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
/* 课文正文：手写 lessons 优先，否则用已解析的 LRC 逐句（点句子可定位音频） */
function lessonTextHTML(bk,u,nt,dict){
  var lessons=(nt&&nt.lessons)||[];
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
var MYNOTE_KEY='nce_mynote_v1';
var myNotes={};
try{myNotes=JSON.parse(localStorage.getItem(MYNOTE_KEY)||'{}')||{};}catch(e){myNotes={};}
function myNoteId(bk,u){return bk.key+':'+u.u}
function myNoteOf(bk,u){return myNotes[myNoteId(bk,u)]||''}
function saveMyNote(id,v){
  if(v)myNotes[id]=v;else delete myNotes[id];
  try{localStorage.setItem(MYNOTE_KEY,JSON.stringify(myNotes));}catch(e){}
}
function ntSec(title,en,inner){
  return '<div class="nt-sec"><h6>'+esc(title)+' <i>'+esc(en)+'</i></h6>'+inner+'</div>';
}function ntGroups(nt){
  var w=(nt&&nt.words)||[];
  var vocab=w.filter(x=>!/\s/.test(x[0]));
  /* 独立的 phrases 字段（导入数据）+ words 里的多词项（旧手写数据），统一成 [en,说明,例句] 三元组 */
  var phrase=((nt&&nt.phrases)||[]).map(function(p){
    return [p[0],p[1],p[2]||[]];
  }).concat(w.filter(x=>/\s/.test(x[0])).map(function(x){
    return [x[0],x[1]||'',[]];
  }));
  var t=[];
  if(nt.question||nt.summary||nt.tips)t.push(['intro','导学','📌']);
  if(vocab.length)t.push(['words','词汇','🔤',vocab.length]);
  if(phrase.length)t.push(['phrase','短语','🗣',phrase.length]);
  if(nt.grammar&&nt.grammar.length)t.push(['gram','语法','📐',nt.grammar.length]);
  if(nt.patterns&&nt.patterns.length)t.push(['pat','句型','💬',nt.patterns.length]);
  if(nt.exercises&&nt.exercises.length)t.push(['ex','练习','✏️',nt.exercises.length]);
  t.push(['mine','我的笔记','📝']);
  return {tabs:t,vocab:vocab,phrase:phrase};
}
/* 卡片片段：教材与笔记总览共用 */
function wordCard(w){
  var ex=(w[2]||[]).map(function(e){
    return '<div class="wc-ex"><span class="en">'+esc(e[0])+'</span>'+
      (e[1]?'<span class="zh">'+esc(e[1])+'</span>':'')+'</div>';
  }).join('');
  return '<button class="nt-word"><b>'+esc(w[0])+'</b>'+(w[1]?'<span>'+esc(w[1])+'</span>':'')+
    (ex?'<div class="wc-exs">'+ex+'</div>':'')+'</button>';
}
function grCard(g){return grCardRich(g,S.dict||{});}
function exCard(e){return '<details class="tb-ex"><summary>'+esc(e.q)+'</summary>'+
  '<div class="a">'+esc(e.a)+(e.n?'<i>'+esc(e.n)+'</i>':'')+'</div></details>';}
function ntWordCards(list){return '<div class="nt-words">'+list.map(wordCard).join('')+'</div>';}

/* ===== 教材锚点按钮条（原「学习笔记」tab 改为定位跳转）===== */
function renderAnchors(bk,u){
  var box=$('#anchors');if(!box)return;
  var nt=noteOf(bk,u)||{};
  var ix=noteIdx(bk,u)||{};
  var cnt=function(a,ixk){return (a||[]).length||(ix[ixk]||0);};
  var items=[];
  if(nt.question||nt.summary||nt.tips)items.push(['sec-intro','📌 导学']);
  items.push(['sec-text','📖 课文']);
  if(cnt(nt.words,'w'))items.push(['sec-words','🔤 词汇 '+cnt(nt.words,'w')]);
  if(cnt(nt.phrases,'ph'))items.push(['sec-phrases','🗣 短语 '+cnt(nt.phrases,'ph')]);
  if(cnt(nt.grammar,'g'))items.push(['sec-gram','📐 语法 '+cnt(nt.grammar,'g')]);
  if(cnt(nt.patterns,'p'))items.push(['sec-pat','💬 句型 '+cnt(nt.patterns,'p')]);
  if((nt.exercises||[]).length)items.push(['sec-ex','✏️ 练习 '+nt.exercises.length]);
  box.innerHTML=items.map(function(x){
    return '<button class="achip" data-go="'+x[0]+'">'+esc(x[1])+'</button>';
  }).join('')+
  '<button class="achip mine'+(myNoteOf(bk,u)?' has':'')+'" id="achMine">📝 我的笔记'+(myNoteOf(bk,u)?' ✓':'')+'</button>';
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
    var c=e.target.closest('.achip[data-go]');
    if(c)jumpSection(c.dataset.go);
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

/* ===== 视频：固定「简洁播放器 + 沙箱防跳转」=====
   做法参照 https://perrykum.github.io/rtcls/study/bliframe/bliframe.html
   1) 用 B 站移动版嵌入地址（html5mobileplayer），播放器本身没有跳转入口；
   2) 再加 sandbox（不给 allow-popups / allow-top-navigation）双保险。 */
var V_SANDBOX='allow-scripts allow-same-origin allow-forms allow-presentation';
function videoUrl(vid,p){
  return 'https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid='+vid.bvid+'&page='+p+'&as_wide=1';
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
  f.setAttribute('sandbox',V_SANDBOX);
  f.src=url; /* 改 sandbox 本身就会让 iframe 重载，这里再置一次 src 兜底 */
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
  if(key&&key!==S.book){
    var sel=$('#bookSel');if(sel)sel.value=key;
    if(setBook(key)===false)return;
  }
  setView('study');
  openUnit(u,true);
  var h=$('#head');if(h&&h.scrollIntoView)h.scrollIntoView({block:'nearest'});
}

/* ===== 笔记总览：把分散在各课的笔记汇总到一页 ===== */
var OV_TYPES=[['all','全部','📚'],['words','生词','🔤'],['phrase','短语','🗣'],
  ['gram','语法','📐'],['pat','句型','💬'],['ex','练习','✏️'],['mine','我的笔记','📝']];
function ovCollect(){
  var list=[];
  AVAIL.forEach(function(e){
    if(S.ovBook&&e.key!==S.ovBook)return;
    var bk=dataOf(e.key);if(!bk)return;
    bk.units.forEach(function(u){
      var nt=noteOf(bk,u),mine=myNoteOf(bk,u),ix=noteIdx(bk,u);
      if(!nt&&!mine&&!ix)return;   /* 无笔记数据也无手写：跳过 */
      var g=ntGroups(nt||{});
      list.push({key:e.key,u:u,nt:nt,mine:mine,ix:ix||{},
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
    (it.nt.words||[]).forEach(function(w){hay.push(w[0],w[1]);});
    (it.nt.phrases||[]).forEach(function(p){hay.push(p[0],p[1]);});
    (it.nt.grammar||[]).forEach(function(g){hay.push(g.k,g.f,g.d);});
    (it.nt.patterns||[]).forEach(function(p){hay.push(p.p||p[0],p.o?p.o[1]:(p[1]||''));});
    (it.nt.exercises||[]).forEach(function(e){hay.push(e.q,e.a,e.n||'');});
    hay.push(it.nt.summary||'',it.nt.question||'',it.nt.tips||'');
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
  return '<details class="ov-unit" data-key="'+it.key+'" data-u="'+it.u.u+'"><summary>'+
    '<span class="ov-no">'+it.u.u+'</span>'+
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
          ovSections({key:bk.key,u:u,nt:nt,mine:mine,ix:noteIdx(bk,u)||{},vocab:g.vocab,phrase:g.phrase});
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
      if(noteOf(bk,u)||noteCache[noteIdOf(bk,u)]===null)return;
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
     '<div class="ov-chips"><button class="ovchip'+(S.ovBook?'':' on')+'" data-b="">全部册</button>'+
       AVAIL.map(function(b){return '<button class="ovchip'+(S.ovBook===b.key?' on':'')+'" data-b="'+b.key+'">'+esc(b.key)+'</button>';}).join('')+'</div>'+
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
  var id=doneId(bk.key,u.u);
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
  var id=doneId(bk.key,u.u);
  if(!done.has(id)){done.add(id);saveDone();}
  renderDir();renderHead(bk,u);
  toast('本单元已听完 ✓');
}

/* ===== 启动 ===== */
function boot(){
  skeleton();bindStatic();
  applyMode();
  if(!AVAIL.length){$('#bookSel').innerHTML='<option value="">教材数据未加载</option>';toast('教材数据未加载：请检查 data/NCE*.js');return;}
  $('#bookSel').innerHTML=AVAIL.map(b=>'<option value="'+b.key+'"'+(b.key===S.book?' selected':'')+'>'+esc(b.label)+'</option>').join('');
  var bk=dataOf(S.book)||dataOf(AVAIL[0].key);
  S.book=bk.key;$('#bookSel').value=bk.key;
  S.ui=Math.min(bk.units.length,+(localStorage.getItem('nce_last_'+S.book)||24)||1);
  renderDir();syncCtl();setView('study');
  try{openUnit(S.ui);}catch(e){console.log('boot/openUnit fail:',e.message,'| book=',S.book,'| ui=',S.ui);throw e;}
  setInterval(()=>localStorage.setItem('nce_last_'+S.book,String(S.ui)),1200);
}
function toast(m){var t=$('#toast');t.textContent=m;t.style.opacity='1';
  clearTimeout(t._t);t._t=setTimeout(function(){t.style.opacity='0';},2000);}
boot();
