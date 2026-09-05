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
  seg:[],divs:[],cur:-1,dur:0,doneFlag:false,playing:false,drag:false,lastFile:null,wantStart:null,req:0,playTok:0};
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

/* ===== 骨架 ===== */
function skeleton(){
  $('#study').innerHTML=
  '<div class="study-head" id="head"></div>'+
  '<div class="tabs"><button class="tabbtn on" id="tbAudio">🎧 音频精听</button>'+
  '<button class="tabbtn" id="tbVideo">🎬 视频讲解</button></div>'+
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
      '<button class="cbtn" id="cLoop">🔁 单句循环</button>'+
      '<button class="cbtn" id="cAB">⭯ A-B 复读</button>'+
      '<button class="cbtn" id="cRate">1.0x</button>'+
      '<button class="cbtn" id="modeBtn">字幕：双语</button></div>'+
    '</div>'+
  '</div>'+
  '<div class="pane" id="paneVideo"><div class="vbox"><h4>讲解视频</h4>'+
    '<div class="vchips" id="vchips"></div>'+
    '<div class="vframe blank" id="vframe"><div class="v-empty"><div class="play-ic">▶</div><div id="vEmptyTxt">选择上方某一集开始播放</div></div>'+
    '<iframe id="vid" allowfullscreen loading="lazy" allow="accelerometer;autoplay;clipboard-write;encrypted-media;picture-in-picture"></iframe></div>'+
    '<div class="vfoot"><span id="vlabel"></span><span class="sp"></span><a id="vlink" target="_blank" rel="noopener">B站原链 ↗</a></div>'+
    '<div class="vnote" id="vnote"></div></div></div>'+
  '<section class="tbk" id="tbk"></section>'+
  '<div class="low" style="margin-top:14px"><div class="ibox"><h4>本单元信息</h4><div id="info"></div></div></div>'+
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
  $('#cAB').onclick=()=>cycleAB();
  $('#cRate').onclick=()=>{var rs=[0.75,1,1.25,1.5];S.rate=rs[(rs.indexOf(S.rate)+1)%rs.length];a.playbackRate=S.rate;syncCtl();};
  $('#modeBtn').onclick=()=>cycleMode();
  $('#tbAudio').onclick=()=>setTab('audio');
  $('#tbVideo').onclick=()=>setTab('video');
  $('#bPrev').onclick=()=>openUnit(S.ui-1,true);
  $('#bNext').onclick=()=>openUnit(S.ui+1,true);
  $('#menuBtn').onclick=()=>{document.body.classList.remove('rail-off');document.body.classList.toggle('rail-on');};
  $('#mask').onclick=()=>document.body.classList.remove('rail-on');
  $('#edgeBtn').onclick=()=>{if(document.body.classList.contains('rail-off'))expandRail();else collapseRail();};
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
  $('#tbk').onclick=e=>{var en=e.target.closest('.tb-en,.tb-pat .en');if(en)speakToggle(en.textContent);};
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
  a.addEventListener('ended',()=>{S.playing=false;syncPlayBtn();finishUnit();});
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
  renderRail();syncEdge();
  var list=$('#unitList');if(list){try{list.scrollTop=0;}catch(e){}}
  openUnit(S.ui,true); /* 换册属于用户操作，直接开播 */
  try{toast('已切换到 '+bk.title+'（'+bk.units.length+' 课）');}catch(e){}
}
function collapseRail(){
  document.body.classList.add('rail-off');
  document.body.classList.remove('rail-on');
  syncEdge();
}
function expandRail(){
  document.body.classList.remove('rail-off');
  document.body.classList.remove('rail-on');
  syncEdge();
}
function syncEdge(){
  var off=document.body.classList.contains('rail-off');
  var b=$('#edgeBtn');
  if(b){b.textContent=off?'展开目录':'收起目录';
    b.classList.toggle('off',off);
    b.title=off?'点击展开左侧目录':'点击收起目录，学习区更宽';}
}
function setTab(t){
  S.tab=t;
  $('#tbAudio').classList.toggle('on',t==='audio');
  $('#tbVideo').classList.toggle('on',t==='video');
  $('#paneAudio').classList.toggle('on',t==='audio');
  $('#paneVideo').classList.toggle('on',t==='video');
}
function cycleMode(){S.mode=(S.mode+1)%MODES.length;applyMode();}
function applyMode(){
  var b=document.body,md=MODES[S.mode];
  b.classList.remove('md-zh','md-en','md-blur');
  if(md!=='show')b.classList.add('md-'+md);
  $('#modeBtn').textContent=MODE_TXT[md];
  $('#modeBtn').title=md==='blur'?'整行模糊，鼠标悬停可看清':'控制左侧歌词字幕的显示';
}

/* ===== 目录 ===== */
function renderRail(){
  var bk=dataOf(S.book),units=bk.units;
  var rows=units.map(function(u,i){
    var active=(i+1)===S.ui,id=doneId(bk.key,u.u);
    var pair=(u.lesson_no||(u.ls&&u.ls[1]?u.ls[0]+'&'+u.ls[1]:u.n));
    return '<div class="uro'+(active?' active':'')+(done.has(id)?' done':'')+'" data-u="'+u.u+'">'+
      '<span class="uix">'+(i+1)+'</span>'+
      '<span class="utx"><span class="ut">'+esc(u.title)+'</span>'+
      '<span class="ur">'+(pair?'('+esc(String(pair))+')':'')+'</span></span>'+
      '<span class="ck">'+(done.has(id)?'✓':'')+'</span></div>';
  }).join('');
  $('#unitList').innerHTML=rows;
  var opts=['<option value="0">跳到单元…</option>'];
  units.forEach(function(u,i){opts.push('<option value="'+(i+1)+'"'+(i+1===S.ui?' selected':'')+'>'+(i+1)+' · '+esc(u.title)+'</option>');});
  $('#unitJump').innerHTML=opts.join('');
  $('#topTag').textContent='已学 '+[...done].filter(x=>x.startsWith(bk.key+':')).length+' / '+units.length;
  $('#railSub').textContent=bk.title;
}
function bindRail(){
  $('#unitList').onclick=e=>{var r=e.target.closest('.uro');if(r)openUnit(+r.dataset.u,true);};
  $('#unitJump').onchange=e=>{var v=+e.target.value;if(v>=1)openUnit(v,true);};
}

/* ===== 打开单元 ===== */
function openUnit(u,autoplay){
  var bk=dataOf(S.book);if(!bk)return;
  var units=bk.units;
  if(u<1)u=units.length;else if(u>units.length)u=1;
  S.ui=u;S.abA=null;S.abB=null;S.loop=false;S.cur=-1;S.doneFlag=false;S.wantStart=null;
  var req=++S.req; /* 防快速切换：旧请求返回时丢弃 */
  var unit=units[u-1];
  document.body.classList.remove('rail-on');
  renderRail();renderHead(bk,unit);renderInfo(bk,unit);renderVideoChips(bk,unit);renderTextbook(bk,unit);
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
    if(!parsed){$('#subBox').innerHTML='<div style="padding:20px;text-align:center;color:var(--mut);font-size:13px">课文加载失败：请联网后重试。</div>';return;}
    var r=buildSeg(unit,parsed);
    S.seg=r.seg;S.divs=r.divs;
    renderSubs();
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
    '</div></div>';
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
    $('#vid').src=u.ve;
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
    $('#vid').src='https://player.bilibili.com/player.html?bvid='+vid.bvid+'&high_quality=1&autoplay=0&p='+p0;
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
  $('#vid').src='https://player.bilibili.com/player.html?bvid='+vid.bvid+'&high_quality=1&autoplay=0&p='+p;
  f.classList.remove('blank');
  var it=(vid.pages||[]).find(x=>x.p===p);
  $('#vlabel').textContent='P'+p+' · '+cleanPart(it?it.part:'');
  $('#vlink').href='https://www.bilibili.com/video/'+vid.bvid+'/?p='+p;
  setTab('video');
}
function renderInfo(bk,u){
  var id=doneId(bk.key,u.u);
  var nums=u.ls||[u.n];
  var h='<div class="sm mut" style="line-height:2">'+
    '<b style="color:var(--ink)">'+esc(u.title)+'</b><br>'+
    (u.ls&&u.ls.length>1?('Lesson '+nums.join(' · ')+'（同一段录音）<br>'):('Lesson '+nums[0]+'<br>'))+
    '音频源：'+(u.audio85?'新版 + 1985 老版':'新版英音')+'<br>'+
    '进度存于本机浏览器。</div>';
  h+='<div style="margin-top:10px;border-top:1px dashed var(--line);padding-top:10px">'+
    '<div class="sm mut" style="line-height:1.9">'+(noteOf(bk,u)?'📖 教材：见下方「课本原文与讲解」':'📖 教材：本课尚未生成')+'</div></div>';
  h+='<button class="cbtn gray" style="margin-top:10px" id="btnReset">重置本单元标记</button>';
  $('#info').innerHTML=h;
  var r=$('#btnReset');if(r)r.onclick=()=>markUnit(bk,u,false,true);
}
/* ===== 教材（课本原文 + 讲解）===== */
function noteOf(bk,u){return (window.NOTES||{})[bk.key+':'+u.u]||null;}
function tbSec(title,en,inner){
  return '<div class="tbk-sec"><h5>'+esc(title)+' <i>'+esc(en)+'</i></h5>'+inner+'</div>';
}
function tbLesson(L){
  var h='<div class="tbk-sec"><h5>Lesson '+esc(L.no)+(L.title?' · '+esc(L.title):'')+
    (L.kind?' <i>'+esc(L.kind)+'</i>':'')+'</h5>';
  if(L.lines&&L.lines.length){
    h+='<div class="tbk-text">'+L.lines.map(function(l){
      var sp=l[0]||'',cls=(sp==='B'||sp==='2')?'b':'';
      return '<div class="tb-line"><span class="tb-sp '+cls+'">'+esc(sp||'·')+'</span>'+
        '<div class="tb-l"><div class="tb-en">'+esc(l[1])+'</div>'+
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
function renderTextbook(bk,u){
  var box=$('#tbk');if(!box)return;
  var nt=noteOf(bk,u);
  if(!nt){
    box.innerHTML='<div class="tbk-paper"><div class="tbk-empty"><b>本课教材尚未生成</b>'+
      '数据结构已就绪（课文 / 生词 / 语法 / 重点句 / 练习），按一课一份产出即可，前端无需改动。</div></div>';
    return;
  }
  var nums=u.ls||[u.n];
  var h='<div class="tbk-paper">';
  /* 页眉 */
  h+='<div class="tbk-head"><span class="tbk-lesson">'+
    esc(nt.unit||('Lesson '+nums.join(' & ')))+'</span>'+
    '<div><h3>'+esc(nt.title||u.title)+'</h3>'+
    (nt.subtitle?'<div class="zh">'+esc(nt.subtitle)+'</div>':'')+'</div></div>';
  h+='<div class="tbk-body">';
  if(nt.question)h+='<div class="tbk-q">🎧 <b>听录音前先想</b>：'+esc(nt.question)+'</div>';
  if(nt.summary)h+=tbSec('本课概要','SUMMARY',
    '<div style="font-size:13px;line-height:1.95;color:#5f5a4c">'+esc(nt.summary)+'</div>');
  /* 课文 | 生词 双栏 */
  var lessons=nt.lessons||[];
  var left=lessons.map(tbLesson).join('')||'';
  var right='';
  if(nt.words&&nt.words.length){
    right=tbSec('生词与短语','WORDS','<div class="tb-words">'+nt.words.map(function(w){
      return '<div class="tb-word"><b>'+esc(w[0])+'</b><span>'+esc(w[1])+'</span></div>';
    }).join('')+'</div>');
  }
  h+=(left||right)?'<div class="tbk-cols"><div>'+left+'</div><div>'+right+'</div></div>':'';
  if(nt.grammar&&nt.grammar.length){
    h+=tbSec('语法要点','GRAMMAR',nt.grammar.map(function(g){
      return '<div class="tb-gr"><div class="k">'+esc(g.k)+'</div><div class="f">'+esc(g.f)+'</div>'+
        '<div class="d">'+esc(g.d)+'</div></div>';
    }).join(''));
  }
  if(nt.patterns&&nt.patterns.length){
    h+=tbSec('重点句','PATTERNS','<div class="tb-pats">'+nt.patterns.map(function(p,i){
      return '<div class="tb-pat"><span class="no">'+(i+1)+'</span><div>'+
        '<div class="en">'+esc(p[0])+'</div><div class="zh">'+esc(p[1])+'</div></div></div>';
    }).join('')+'</div>');
  }
  if(nt.exercises&&nt.exercises.length){
    h+=tbSec('自测练习','PRACTICE','<div class="tb-exs">'+nt.exercises.map(function(e){
      return '<details class="tb-ex"><summary>'+esc(e.q)+'</summary>'+
        '<div class="a">'+esc(e.a)+(e.n?'<i>'+esc(e.n)+'</i>':'')+'</div></details>';
    }).join('')+'</div>');
  }
  if(nt.tips)h+=tbSec('小贴士','TIPS','<div class="tb-tip"><b>💡</b><div>'+esc(nt.tips)+'</div></div>');
  h+='</div></div>';
  box.innerHTML=h;
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
  saveDone();renderRail();renderHead(bk,u);
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
  var c=$('#cAB');
  c.textContent=S.abA==null?'⭯ A-B 复读':S.abB==null?('A：句'+(S.abA+1)+' · 点设B'):('A-B 句'+(Math.min(S.abA,S.abB)+1)+'-'+(Math.max(S.abA,S.abB)+1)+' · 取消');
  c.classList.toggle('warm',S.abA!=null);
  var r=$('#cRate');r.textContent=S.rate+'x';r.classList.toggle('on',S.rate!==1);
  $('#metaS').textContent=(S.loop?'单句循环 · ':'')+(S.rate!==1?(S.rate+'x · '):'')+(S.abA!=null&&S.abB!=null?'A-B 区间 · ':'')+'歌词自动跟随';
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
  renderRail();renderHead(bk,u);
  toast('本单元已听完 ✓');
}

/* ===== 启动 ===== */
function boot(){
  skeleton();bindStatic();bindRail();
  applyMode();
  if(!AVAIL.length){$('#bookSel').innerHTML='<option value="">教材数据未加载</option>';toast('教材数据未加载：请检查 data/NCE*.js');return;}
  $('#bookSel').innerHTML=AVAIL.map(b=>'<option value="'+b.key+'"'+(b.key===S.book?' selected':'')+'>'+esc(b.label)+'</option>').join('');
  var bk=dataOf(S.book)||dataOf(AVAIL[0].key);
  S.book=bk.key;$('#bookSel').value=bk.key;
  S.ui=Math.min(bk.units.length,+(localStorage.getItem('nce_last_'+S.book)||24)||1);
  renderRail();syncEdge();
  try{openUnit(S.ui);}catch(e){console.log('boot/openUnit fail:',e.message,'| book=',S.book,'| ui=',S.ui);throw e;}
  setInterval(()=>localStorage.setItem('nce_last_'+S.book,String(S.ui)),1200);
}
function toast(m){var t=$('#toast');t.textContent=m;t.style.opacity='1';
  clearTimeout(t._t);t._t=setTimeout(function(){t.style.opacity='0';},2000);}
boot();
