/* ===================== 英语六级真题题库 · 应用逻辑 ===================== */
const BANK = window.BANK;
const KEY = "cet6_cache_v1";
const TYPE_NAME = {writing:"写作",translation:"翻译",reading:"阅读(选择)",listening:"听力(跟读)"};

/* ---------- 存储 ---------- */
function loadCache(){ try{ return JSON.parse(localStorage.getItem(KEY))||null; }catch(e){ return null; } }
function saveCache(c){ try{ localStorage.setItem(KEY, JSON.stringify(c)); }catch(e){} }
let CACHE = loadCache() || {records:[], wrong:[], sessions:[], settings:{}};
const APP_VERSION = "v1.01";   // 软件版本号（从 v1.01 起）
CACHE.marks = CACHE.marks || [];
let PREDOMODE = false;              // 重做模式标记
let DIRTY = false;                 // 缓存是否有未写本地的改动
function persist(){ saveCache(CACHE); DIRTY = true; }

/* ---------- 工具 ---------- */
const app = document.getElementById("app");
function toast(m){ const t=document.getElementById("toast"); t.textContent=m; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2400); }
function esc(s){ return (s==null?"":String(s)).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function fmtDate(d){ const p=n=>String(n).padStart(2,"0"); return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+"_"+p(d.getHours())+p(d.getMinutes()); }
function fmtStamp(d){ const p=n=>String(n).padStart(2,"0"); return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"_"+p(d.getHours())+"-"+p(d.getMinutes())+"-"+p(d.getSeconds()); }
function accOf(m){ const total=m.total; if(!total) return 0; return Math.round((m.c+0.5*m.p)/total*100); }

/* 从 qid 解析出题目数据（用于错题本重做跳转） */
function parseQid(qid, type){
  if(type==="writing"||type==="translation"){
    const idx=parseInt((qid||"").split("_")[1]);
    return BANK[type][idx]||null;
  }else if(type==="reading"){
    const parts=(qid||"").split("_"); const pi=parseInt(parts[1]), qi=parseInt(parts[2]);
    const p=BANK.reading[pi];
    if(!p||!p.questions[qi]) return null;
    return {passage:p.passage,title:p.title,src:p.src,y:p.y,skillNote:p.skillNote,q:p.questions[qi],qIdx:qi,qTotal:p.questions.length};
  }else if(type==="listening"){
    const parts=(qid||"").split("_"); const pi=parseInt(parts[1]), qi=parseInt(parts[2]);
    const p=BANK.listening[pi];
    if(!p||!p.questions[qi]) return null;
    return {transcript:p.transcript,title:p.title,src:p.src,y:p.y,note:p.note,q:p.questions[qi],qIdx:qi,qTotal:p.questions.length};
  }
  return null;
}
/* 错题本中展示的题目摘要 */
function qidInfo(qid, type){
  try{
    const d=parseQid(qid, type);
    if(!d) return "（题目数据未找到）";
    if(type==="writing"){
      const t=(d.t||"").replace(/\n/g," ");
      return `<b>话题：</b>${esc(t.length>50?t.slice(0,50)+"…":t)}`;
    }
    if(type==="translation"){
      const t=(d.zh||"").replace(/\n/g," ");
      return `<b>原文：</b>${esc(t.length>50?t.slice(0,50)+"…":t)}`;
    }
    const q=d.q; if(!q) return "（题目数据未找到）";
    const qt=(q.q||"").replace(/\n/g," ");
    return `<b>${esc(d.title||"")} · 第${d.qIdx+1}题</b><br><span class="muted">${esc(qt.length>60?qt.slice(0,60)+"…":qt)}</span>`;
  }catch(e){ return "（题目数据异常）"; }
}
function isMarked(qid){ return (CACHE.marks||[]).includes(qid); }

/* ============================================================
   语音朗读引擎（浏览器原生 speechSynthesis，离线、无需联网/下载）
   ============================================================ */
const TTS = {
  supported: ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window),
  voices:[],
  init(){
    if(!this.supported) return;
    const load=()=>{ try{ this.voices=speechSynthesis.getVoices()||[]; }catch(e){} };
    load();
    try{ speechSynthesis.onvoiceschanged=load; }catch(e){}
  },
  pickVoice(lang){
    try{ if(!this.voices.length) this.voices=speechSynthesis.getVoices()||[]; }catch(e){}
    const want=(lang||'').toLowerCase().startsWith('zh')?'zh':'en';
    let v=this.voices.find(x=>x.lang && x.lang.toLowerCase().startsWith(want));
    if(!v && want==='zh') v=this.voices.find(x=>/cmn|zh|chinese|yunxiang|hanhan|kangkang/i.test((x.name||'')+(x.lang||'')));
    if(!v) v=this.voices.find(x=>x.lang && x.lang.toLowerCase().startsWith('en'));
    return v||null;
  },
  speak(text,lang,rate){
    if(!this.supported){ toast('当前浏览器不支持语音朗读'); return null; }
    if(!text){ toast('没有可朗读的内容'); return null; }
    try{ speechSynthesis.cancel(); }catch(e){}
    const u=new SpeechSynthesisUtterance(String(text));
    u.lang=(lang||'').toLowerCase().startsWith('zh')?'zh-CN':'en-US';
    const v=this.pickVoice(lang); if(v){u.voice=v;}
    u.rate = rate||((lang||'').toLowerCase().startsWith('zh')?0.95:0.9);
    u.pitch=1;
    try{ speechSynthesis.speak(u); }catch(e){ toast('朗读失败：'+e.message); return null; }
    return u;
  },
  stop(){ if(this.supported){ try{ speechSynthesis.cancel(); }catch(e){} } },
  speaking(){ return !!(this.supported && speechSynthesis.speaking); }
};
TTS.init();

/* 句子切分（英文按 .!?，中文按 。！？；，保留换行处也切） */
function splitSents(text,lang){
  if(!text) return [];
  let t=String(text).replace(/\r/g,'').replace(/^[MWABCD]:\s*/gm,'').replace(/\n+/g,' ').replace(/\s{2,}/g,' ').trim();
  if(!t) return [];
  let arr;
  if((lang||'').toLowerCase().startsWith('zh')){
    arr=t.split(/([。！？；])/);
    let out=[],cur='';
    arr.forEach(p=>{ cur+=p; if(/[。！？；]$/.test(cur)){ if(cur.trim())out.push(cur.trim()); cur=''; } });
    if(cur.trim()) out.push(cur.trim());
    return out;
  }else{
    arr=t.match(/[^.!?]*[.!?]+["')\]]?\s*|[^.!?]+$/g)||[t];
    return arr.map(s=>s.trim()).filter(Boolean);
  }
}

/* 逐句跟读组件：返回HTML，支持逐句高亮；selfTest模式下朗读完一句停顿，弹"下一句"按钮 */
const RA={};
function raHTML(text,lang,opts){
  opts=opts||{};
  const id='ra_'+uid();
  const sents=splitSents(text,lang);
  RA[id]={sents:sents,lang:lang,idx:-1,paused:false,rate:0.9,utter:null,selfTest:!!opts.selfTest};
  const list=sents.map((s,i)=>`<span class="ras" id="${id}_s${i}" onclick="raClick('${id}',${i})">${esc(s)}</span>`).join(' ');
  const stBtns = opts.selfTest
    ? `<button class="btn sm cta pulse" id="${id}_next" onclick="raNext('${id}')" style="display:none">⏭ 下一句</button>
       <button class="btn sm ghost" id="${id}_replay" onclick="raReplay('${id}')" style="display:none">🔁 重听本句</button>`
    : '';
  const stHint = opts.selfTest ? `<span class="note" style="color:#16a34a">📖 跟读自测模式：每句朗读后暂停，点击「下一句」继续</span>` : '';
  return `<div class="rabox">
    <div class="ttsbar">
      <button class="btn sm" id="${id}_play" onclick="raStart('${id}',0)">▶ 逐句朗读</button>
      <button class="btn sm ghost" id="${id}_pause" onclick="raPause('${id}')" style="display:none">⏸ 暂停</button>
      <button class="btn sm ghost" id="${id}_resume" onclick="raResume('${id}')" style="display:none">▶ 继续</button>
      ${stBtns}
      <button class="btn sm ghost" onclick="raStop('${id}')">⏹ 停止</button>
      <span>语速</span>
      <select id="${id}_rate" onchange="RA['${id}'].rate=parseFloat(this.value)">
        <option value="0.6">慢速 0.6×</option>
        <option value="0.8" selected>常速 0.8×</option>
        <option value="1">原速 1.0×</option>
      </select>
      <span class="note" id="${id}_stat"></span>
    </div>
    ${stHint}
    <div class="ratext" id="${id}_text">${list||'<span class="note">（无内容）</span>'}</div>
  </div>`;
}
function raClear(id){ (RA[id].sents||[]).forEach((_,i)=>{const e=document.getElementById(id+'_s'+i); if(e)e.classList.remove('now');}); }
function raHL(id,i){ raClear(id); const e=document.getElementById(id+'_s'+i); if(e){e.classList.add('now'); try{e.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(_){}} }
function raSetBtns(id,playing){
  const p=document.getElementById(id+'_play'),pu=document.getElementById(id+'_pause'),ru=document.getElementById(id+'_resume');
  if(p) p.style.display=playing?'none':'';
  if(pu) pu.style.display=playing?'':'none';
  if(ru) ru.style.display='none';
}
function raSpeak(id,i){
  const c=RA[id]; if(!c) return;
  if(!TTS.supported){ toast('当前浏览器不支持语音朗读'); return; }
  if(i>=c.sents.length){ raClear(id); const st=document.getElementById(id+'_stat'); if(st)st.textContent='朗读完成'; raSetBtns(id,false); raHideNextBtns(id); c.idx=-1; return; }
  c.idx=i; c.paused=false;
  raHL(id,i);
  const st=document.getElementById(id+'_stat'); if(st)st.textContent=`正在朗读第 ${i+1}/${c.sents.length} 句`;
  raSetBtns(id,true);
  raHideNextBtns(id);
  const u=new SpeechSynthesisUtterance(c.sents[i]);
  u.lang=c.lang.toLowerCase().startsWith('zh')?'zh-CN':'en-US';
  const v=TTS.pickVoice(c.lang); if(v)u.voice=v;
  u.rate=c.rate;
  u.onend=()=>{
    if(!RA[id] || RA[id].idx!==i || RA[id].paused) return;
    if(c.selfTest){
      // 跟读自测模式：朗读完一句后停顿，显示"下一句"按钮
      const isLast = (i+1)>=c.sents.length;
      const st2=document.getElementById(id+'_stat');
      if(isLast){
        if(st2)st2.textContent=`第 ${i+1}/${c.sents.length} 句已读完，全部完成 ✅`;
        raSetBtns(id,false);
        const rp=document.getElementById(id+'_replay'); if(rp)rp.style.display='';
      }else{
        if(st2)st2.textContent=`第 ${i+1}/${c.sents.length} 句已读完，点击「下一句」继续`;
        const nx=document.getElementById(id+'_next'); if(nx)nx.style.display='';
        const rp=document.getElementById(id+'_replay'); if(rp)rp.style.display='';
      }
    }else{
      raSpeak(id,i+1);
    }
  };
  u.onerror=()=>{ const st2=document.getElementById(id+'_stat'); if(st2)st2.textContent='朗读出错，可重试'; raSetBtns(id,false); raHideNextBtns(id); };
  c.utter=u;
  try{ speechSynthesis.speak(u); }catch(e){ const st3=document.getElementById(id+'_stat'); if(st3)st3.textContent='朗读失败：'+e.message; raSetBtns(id,false); raHideNextBtns(id); }
}
function raHideNextBtns(id){
  const nx=document.getElementById(id+'_next'), rp=document.getElementById(id+'_replay');
  if(nx)nx.style.display='none'; if(rp)rp.style.display='none';
}
function raNext(id){ const c=RA[id]; if(!c)return; raHideNextBtns(id); raSpeak(id, c.idx+1); }
function raReplay(id){ const c=RA[id]; if(!c)return; raHideNextBtns(id); raSpeak(id, c.idx<0?0:c.idx); }
function raStart(id,i){ TTS.stop(); raSpeak(id, i||0); }
function raClick(id,i){ TTS.stop(); raSpeak(id,i); }
function raPause(id){ const c=RA[id]; if(!c)return; c.paused=true; TTS.stop(); const pu=document.getElementById(id+'_pause'),ru=document.getElementById(id+'_resume'); if(pu)pu.style.display='none'; if(ru)ru.style.display=''; const st=document.getElementById(id+'_stat'); if(st)st.textContent='已暂停（第 '+(c.idx+1)+' 句）'; }
function raResume(id){ const c=RA[id]; if(!c)return; raSpeak(id, c.idx<0?0:c.idx); }
function raStop(id){ const c=RA[id]; if(!c)return; c.paused=true; TTS.stop(); raClear(id); raSetBtns(id,false); const st=document.getElementById(id+'_stat'); if(st)st.textContent='已停止'; c.idx=-1; }

/* 简单朗读条（用于翻译/写作，单段朗读+停止） */
const TS={};
function ttsSimple(text,lang,label){
  const id='ts_'+uid(); TS[id]={text:text,lang:lang};
  return `<div class="ttsbar">
    <button class="btn sm" onclick="tsPlay('${id}')">🔊 ${label||'朗读'}</button>
    <button class="btn sm ghost" onclick="TTS.stop()">⏹ 停止</button>
    <span class="note" id="${id}_st"></span>
  </div>`;
}
function tsPlay(id){ const d=TS[id]; if(!d)return; const st=document.getElementById(id+'_st'); if(st)st.textContent='正在朗读…'; const u=TTS.speak(d.text,d.lang); if(u){ u.onend=()=>{const s=document.getElementById(id+'_st'); if(s)s.textContent='';}; u.onerror=()=>{const s=document.getElementById(id+'_st'); if(s)s.textContent='';}; } }

/* ============================================================
   本地缓存保存（自动写入项目根目录/cache/ 文件夹）
   - localhost 运行时：通过 server.js API 自动写入，无需手动设置
   - GitHub Pages / file:// 运行时：降级为 localStorage + 手动导出
   ============================================================ */
const SERVER_MODE = (location.protocol === "http:" || location.protocol === "https:") && (location.hostname === "localhost" || location.hostname === "127.0.0.1");
const SAVE_PREFIX = "cache";

/* 服务器模式：通过 fetch 保存到 cache/ 目录 */
async function serverSaveCache(opts){
  opts = opts || {};
  if(!SERVER_MODE) return false;
  if(!CACHE.records.length && !CACHE.sessions.length){ if(!opts.silent) toast("暂无数据可保存"); return false; }
  try{
    const resp = await fetch("/api/save-cache", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(CACHE)
    });
    const result = await resp.json();
    if(result.ok){
      DIRTY = false;
      if(!opts.silent) toast("已保存到 cache/" + result.file);
      return true;
    }else{
      if(!opts.silent) toast("保存失败: " + (result.error || "未知错误"));
      return false;
    }
  }catch(e){
    if(!opts.silent) toast("保存失败: " + (e.message || e));
    return false;
  }
}

/* 服务器模式：从 cache/ 目录导入最新缓存 */
async function serverLoadCache(){
  if(!SERVER_MODE) return false;
  try{
    const resp = await fetch("/api/load-cache");
    if(!resp.ok) return false;
    const txt = await resp.text();
    if(!txt || txt.includes('"error"')) return false;
    const obj = JSON.parse(txt);
    const before = CACHE.records.length;
    mergeCache(obj);
    persist();
    toast("已从 cache/ 目录导入缓存（新增 " + (CACHE.records.length - before) + " 条）");
    return true;
  }catch(e){ return false; }
}

/* 服务器模式：列出所有缓存文件 */
async function serverListCache(){
  if(!SERVER_MODE) return null;
  try{
    const resp = await fetch("/api/list-cache");
    const result = await resp.json();
    return result.ok ? result : null;
  }catch(e){ return null; }
}

/* ---- File System Access API 降级方案（仅 GitHub Pages 时使用） ---- */
const DIR_HANDLE_KEY = "cet6_dir_handle";
let DIR_HANDLE = null;
let DIR_ENSURED = false;

function idbGet(k){ return new Promise(res=>{ try{ const r=indexedDB.open("cet6db",1); r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains("kv")) r.result.createObjectStore("kv"); }; r.onsuccess=()=>{ const db=r.result; const tx=db.transaction("kv","readonly"); const rq=tx.objectStore("kv").get(k); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>res(null); }; r.onerror=()=>res(null); }catch(e){ res(null); } }); }
function idbSet(k,v){ return new Promise(res=>{ try{ const r=indexedDB.open("cet6db",1); r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains("kv")) r.result.createObjectStore("kv"); }; r.onsuccess=()=>{ const db=r.result; const tx=db.transaction("kv","readwrite"); tx.objectStore("kv").put(v,k); tx.oncomplete=()=>res(true); tx.onerror=()=>res(false); }; r.onerror=()=>res(false); }catch(e){ res(false); } }); }
function fsSupported(){ return !SERVER_MODE && ("showDirectoryPicker" in window) && (indexedDB != null); }

async function loadDirHandle(){ if(SERVER_MODE) return; try{ DIR_HANDLE = await idbGet(DIR_HANDLE_KEY) || null; }catch(e){ DIR_HANDLE = null; } }

async function verifyPermission(h){
  try{
    const o = {mode: "readwrite"};
    if(h.queryPermission && (await h.queryPermission(o)) === "granted") return true;
    if(h.requestPermission && (await h.requestPermission(o)) === "granted") return true;
  }catch(e){}
  return false;
}

async function ensureDir(){
  if(SERVER_MODE || DIR_ENSURED) return; DIR_ENSURED = true;
  if(DIR_HANDLE){ try{ await verifyPermission(DIR_HANDLE); }catch(e){} }
}

async function pickSaveDir(){
  if(SERVER_MODE){ toast("服务器模式下缓存自动保存到 cache/ 目录，无需手动设置"); return; }
  if(!fsSupported()){ toast("当前浏览器不支持本地目录选择，将使用下载方式"); return; }
  try{
    const h = await window.showDirectoryPicker({mode: "readwrite"});
    if(await verifyPermission(h)){
      DIR_HANDLE = h; await idbSet(DIR_HANDLE_KEY, h);
      toast("已设置本地保存目录：" + h.name);
      const cur = document.querySelector("#nav button.active");
      if(cur && cur.dataset.v === "data") render("data");
    }else{ toast("未获得目录写入权限"); }
  }catch(e){ if((e && e.name) !== "AbortError") toast("设置目录失败：" + (e && e.message || e)); }
}

/* 统一保存接口：服务器模式→fetch API；否则→File System Access API；最后降级→下载 */
async function saveToLocal(opts){
  opts = opts || {};
  if(!CACHE.records.length && !CACHE.sessions.length){ if(!opts.silent) toast("暂无数据可保存"); return false; }

  /* 服务器模式：直接调 API */
  if(SERVER_MODE){
    return await serverSaveCache(opts);
  }

  /* File System Access API 模式 */
  if(DIR_HANDLE){
    const fname = SAVE_PREFIX + "_" + fmtStamp(new Date()) + ".json";
    const data = JSON.stringify(CACHE, null, 2);
    try{
      if(!(await verifyPermission(DIR_HANDLE))){ if(!opts.silent) toast("无目录写入权限，请在「数据管理」重新设置"); return false; }
      const fh = await DIR_HANDLE.getFileHandle(fname, {create: true});
      const w = await fh.createWritable();
      await w.write(data);
      await w.close();
      DIRTY = false;
      if(!opts.silent) toast("已保存：" + fname);
      return true;
    }catch(e){ if(!opts.silent) toast("保存失败：" + (e && e.message || e)); return false; }
  }

  /* 降级：下载文件 */
  if(opts.silent) return false;
  downloadFallback();
  return false;
}

function downloadFallback(){
  const fname = SAVE_PREFIX + "_" + fmtStamp(new Date()) + ".json";
  const blob = new Blob([JSON.stringify(CACHE, null, 2)], {type: "application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  toast("已下载 " + fname + "（建议保存到项目 cache/ 文件夹）");
}

/* 从本地导入最新缓存 */
async function importLatestFromDir(){
  if(SERVER_MODE){
    const ok = await serverLoadCache();
    if(!ok) toast("cache/ 目录中暂无缓存文件");
    else render("report");
    return;
  }
  if(!DIR_HANDLE){ toast("请先在「数据管理」设置本地保存目录"); return; }
  try{
    if(!(await verifyPermission(DIR_HANDLE))){ toast("无目录读取权限"); return; }
    let latest = null, latestM = 0;
    for await(const entry of DIR_HANDLE.values()){
      if(entry.kind === "file" && entry.name.startsWith(SAVE_PREFIX) && entry.name.endsWith(".json")){
        const f = await entry.getFile();
        if(f.lastModified > latestM){ latestM = f.lastModified; latest = {name: entry.name, file: f}; }
      }
    }
    if(!latest){ toast("目录中未找到缓存文件"); return; }
    const txt = await latest.file.text();
    const obj = JSON.parse(txt);
    const before = CACHE.records.length;
    mergeCache(obj);
    persist();
    await saveToLocal({silent: true});
    toast("已从 " + latest.name + " 导入（新增 " + (CACHE.records.length - before) + " 条）");
    render("report");
  }catch(e){ toast("导入失败：" + (e && e.message || e)); }
}

function mergeCache(obj){
  CACHE.records=(CACHE.records||[]).concat(obj.records||[]);
  CACHE.sessions=(CACHE.sessions||[]).concat(obj.sessions||[]);
  CACHE.wrong=(CACHE.wrong||[]).concat(obj.wrong||[]);
  CACHE.marks=[...new Set([...(CACHE.marks||[]), ...(obj.marks||[])])];
  const seen={}; CACHE.records=CACHE.records.filter(r=>r&&r.id? (seen[r.id]?false:(seen[r.id]=1)) : true);
  const ss={}; CACHE.sessions=CACHE.sessions.filter(s=>{ if(!s||!s.ts)return true; if(ss[s.ts])return false; ss[s.ts]=1; return true; });
}

/* 定时静默保存（服务器模式或有句柄时才写） */
setInterval(()=>{ if(DIRTY && (SERVER_MODE || DIR_HANDLE)){ saveToLocal({silent:true}); } }, 90000);

/* 关闭/刷新时：服务器模式→sendBeacon/fetch keepalive；有句柄→写目录；否则不弹框 */
function onUnloadSave(){
  try{
    if(DIRTY && (CACHE.records.length||CACHE.sessions.length)){
      if(SERVER_MODE){
        const data=JSON.stringify(CACHE);
        const blob=new Blob([data],{type:"application/json"});
        if(navigator.sendBeacon){
          navigator.sendBeacon("/api/save-cache", blob);
        }else{
          /* 降级：fetch with keepalive */
          fetch("/api/save-cache",{method:"POST",headers:{"Content-Type":"application/json"},body:data,keepalive:true}).catch(()=>{});
        }
      }else if(DIR_HANDLE){
        saveToLocal({silent:true});
      }
    }
  }catch(e){}
}
window.addEventListener('pagehide', onUnloadSave);
window.addEventListener('beforeunload', onUnloadSave);

/* ============================================================
   导航
   ============================================================ */
document.querySelectorAll("#nav button").forEach(b=>b.onclick=()=>{
  ensureDir();                       // 首次手势内重授权本地句柄
  TTS.stop();                        // 切页停止朗读
  const sb=document.getElementById('startup_banner'); if(sb) sb.remove();  // 清除启动导入提示
  document.querySelectorAll("#nav button").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  render(b.dataset.v);
});
function render(v){
  if(v==="home")return renderHome();
  if(v==="practice")return renderPractice();
  if(v==="mock")return renderMock();
  if(v==="wrong")return renderWrong();
  if(v==="report")return renderReport();
  if(v==="res")return renderRes();
  if(v==="data")return renderData();
}

/* ---------- 首页：提分策略 ---------- */
function renderHome(){
  const hasRecords = CACHE.records.length>0;
  const dirBanner = SERVER_MODE
    ? `<div class="dirok">📁 缓存自动保存已启用：关闭程序/每轮练习结束都会自动写入 <code>cache/cache_时间.json</code>（项目根目录/cache/ 文件夹）。</div>`
    : DIR_HANDLE
      ? `<div class="dirok">📁 已绑定本地保存目录：<b>${esc(DIR_HANDLE.name)}</b>。每次练习结束/关闭程序都会自动把缓存写入该目录。</div>`
      : `<div class="dirwarn">📁 缓存当前保存在浏览器 localStorage。建议用 <code>启动.bat</code> 或运行 <code>node server.js</code> 以 <code>http://localhost:8765/</code> 打开，即可自动保存到项目 <code>cache/</code> 文件夹。</div>`;
  const importBanner = hasRecords ? "" : `
  <div class="card" style="border-color:#bfdbfe;background:#eff6ff">
    <b>👋 欢迎使用六级提分训练系统。</b> 未检测到本地练习记录。
    <div class="row" style="margin-top:8px">
      ${DIR_HANDLE?`<button class="btn sm" onclick="importLatestFromDir()">📥 从本地保存目录导入最新缓存</button>`:''}
      <label class="btn sm">从文件导入缓存<input type="file" accept=".json" style="display:none" onchange="importCache(this.files[0])"></label>
      <button class="btn ghost sm" onclick="render('practice')">直接开始练习</button>
    </div>
  </div>`;
  app.innerHTML = importBanner + dirBanner + `
  <div class="card">
    <h2>六级提分总览（核心规律）</h2>
    <p class="muted">以下为近10年真题提炼的命题规律；完整文档见「资源导航」里的《01-提分策略详解.md》。</p>
    <h3>📈 分值结构</h3>
    <p>写作 15%（30min）· 听力 35%（30min）· 阅读 35%（40min）· 翻译 15%（30min）。<b>听力+阅读占 70%，是提分主战场。</b></p>
    <h3>🎧 听力 7 大命题规律</h3>
    <ul class="tips">
      <li>顺序原则：约 97% 出题顺序与原文一致。</li>
      <li>同义替换：<b>70%+ 正确选项是同义替换</b>，原词复现多为干扰。</li>
      <li>首尾处、转折（but/however）后、比较级、数字信息、综合信号处常设考点。</li>
      <li>听前用 Directions 时间预读选项，圈「信号灯/定位词/判定词」。</li>
    </ul>
    <h3>📖 阅读 三步法</h3>
    <ul class="tips">
      <li>预读题目划关键词 → 定位原文 → 比对同义替换、排除偷换概念/过度推理。</li>
      <li>时间：选词填空≤10′，长篇阅读≤18′，仔细阅读≤25′。</li>
      <li>趋势：科普文占比升、长难句多，单纯找原词已失效，重逻辑与推理。</li>
    </ul>
    <h3>✍️ 翻译 万能句式</h3>
    <ul class="tips">
      <li>With the improvement/development of…；be honored as…；symbolize…</li>
      <li>不会写的词用解释法绕开；保证主干与时态正确优先于华丽。</li>
    </ul>
    <h3>📝 写作 三段式</h3>
    <ul class="tips">
      <li>开头亮观点 → 主体两段（观点+解释+例子）→ 结尾总结升华。</li>
      <li>四大话题反复考：科技与社会、青年成长、社会发展、文化传承。</li>
    </ul>
    <div class="row" style="margin-top:12px">
      <button class="btn cta big" onclick="render('practice')">开始在线练习 →</button>
      <button class="btn ghost" onclick="render('report')">查看我的分析报告</button>
      <button class="btn ghost" onclick="showUpdatePanel()">🔄 题库更新 (${APP_VERSION})</button>
    </div>
  </div>`;
}

/* ---------- 在线练习 ---------- */
let PQ=[], PIDX=0, PSESSION=[], PSEL=null, PSELF=null, P_SELFTEST=true;
function renderPractice(){
  const types=[["writing","写作"],["translation","翻译"],["reading","阅读(选择)"],["listening","听力(跟读自测)"]];
  app.innerHTML=`
  <div class="card">
    <h2>在线练习</h2>
    <p class="muted">选择题型与筛选条件开始一组练习。客观题自动判分；写作/翻译/听力自测后由你自评对错，系统均会记录并生成报告。<b>听力原文/阅读/翻译/写作均支持 🔊 朗读跟读。</b></p>
    <div class="filter">
      题型：<select id="fType">${types.map(t=>`<option value="${t[0]}">${t[1]}</option>`).join("")}</select>
      <span id="fExtra"></span>
      <label><input type="checkbox" id="fShuffle"> 随机打乱</label>
      <input type="number" id="fLimit" value="10" min="1" style="width:70px"> 题/组
      <button class="btn sm cta" onclick="startPractice()">开始</button>
    </div>
  </div>
  <div id="practiceArea"></div>`;
  document.getElementById("fType").onchange=updateFilters;
  updateFilters();
}
function updateFilters(){
  const t=document.getElementById("fType").value; const box=document.getElementById("fExtra");
  if(t==="writing"||t==="translation"){
    const cats=[...new Set(BANK[t].map(x=>x.c))];
    box.innerHTML=`分类：<select id="fCat"><option value="">全部</option>${cats.map(c=>`<option>${esc(c)}</option>`).join("")}</select>`;
  }else if(t==="reading"){
    const yrs=[...new Set(BANK.reading.map(x=>x.y))];
    box.innerHTML=`年份：<select id="fYr"><option value="">全部</option>${yrs.map(y=>`<option>${esc(y)}</option>`).join("")}</select>`;
  }else if(t==="listening"){
    box.innerHTML=`<label><input type="checkbox" id="fSelfTest" checked> 跟读自测模式（朗读后暂停，手动点「下一句」）</label>`;
  }else{ box.innerHTML=""; }
}
function startPractice(){
  ensureDir();
  TTS.stop();
  const t=document.getElementById("fType").value;
  let pool=[];
  if(t==="writing"||t==="translation"){
    const cat=document.getElementById("fCat")?document.getElementById("fCat").value:"";
    pool=BANK[t].filter(x=>!cat||x.c===cat).map(x=>({type:t,qid:t+"_"+BANK[t].indexOf(x),data:x}));
  }else if(t==="reading"){
    const yr=document.getElementById("fYr")?document.getElementById("fYr").value:"";
    let arr=BANK.reading.filter(x=>!yr||x.y===yr);
    let list=[]; arr.forEach(p=>p.questions.forEach((q,qi)=>list.push({type:"reading",qid:"r_"+BANK.reading.indexOf(p)+"_"+qi,data:{passage:p.passage,title:p.title,src:p.src,y:p.y,skillNote:p.skillNote,q,qIdx:qi,qTotal:p.questions.length}})));
    pool=list;
  }else{
    let list=[]; BANK.listening.forEach(p=>p.questions.forEach((q,qi)=>list.push({type:"listening",qid:"l_"+BANK.listening.indexOf(p)+"_"+qi,data:{transcript:p.transcript,title:p.title,src:p.src,y:p.y,note:p.note,q,qIdx:qi,qTotal:p.questions.length}})));
    pool=list;
  }
  if(!pool.length){ toast("该筛选下没有题目"); return; }
  if(document.getElementById("fShuffle").checked) pool=pool.sort(()=>Math.random()-0.5);
  const lim=Math.max(1,Math.min(parseInt(document.getElementById("fLimit").value)||10,pool.length));
  PQ=pool.slice(0,lim); PIDX=0; PSESSION=[]; PSEL=null; PSELF=null;
  P_SELFTEST = t==="listening" ? (document.getElementById("fSelfTest")?document.getElementById("fSelfTest").checked:true) : false;
  document.getElementById("practiceArea").innerHTML="";
  renderQuestion();
}
function renderQuestion(){
  TTS.stop();                 // 进入新题，停止上一题朗读
  if(PIDX>=PQ.length){
    if(PREDOMODE){ PREDOMODE=false; render("wrong"); return; }
    return finishSession();
  }
  const it=PQ[PIDX]; const total=PQ.length;
  const isMC = it.type==="reading"||it.type==="listening";
  const marked = isMarked(it.qid);
  let headerBadges = PREDOMODE
    ? `<span class="badge easy">🔄 重做</span>`
    : `<span class="badge">第 ${PIDX+1}/${total} 题</span>`;
  if(marked) headerBadges += ` <span class="badge easy">⚠️ 易错题</span>`;
  let html=`<div class="card"><div class="row" style="justify-content:space-between">
    ${headerBadges}
    <span class="badge g">${TYPE_NAME[it.type]}</span></div>
    <div class="prog"><i style="width:${PIDX/total*100}%"></i></div>`;
  if(it.type==="writing"){
    const d=it.data;
    html+=`<h3>作文题（${esc(d.y)} · ${esc(d.c)} · ${esc(d.type)}）</h3>
    <div class="zh" style="font-weight:600">${esc(d.t)}</div>
    ${ttsSimple(d.t,'zh','朗读题目')}
    <p class="muted">写作提示：${esc(d.tip)}</p>
    <p>在下方写你的作文/提纲，完成后点「完成本题」对照思路自评：</p>
    <textarea id="uAns" rows="8" placeholder="在此输入英文作文或提纲..."></textarea>
    <div class="row" style="margin-top:10px"><button class="btn cta" id="selfBtn" onclick="submitSelf('writing')">完成本题</button></div>`;
  }else if(it.type==="translation"){
    const d=it.data;
    html+=`<h3>汉译英（${esc(d.y)} 第${esc(d.s)}套 · ${esc(d.c)}）</h3>
    <div class="zh">${esc(d.zh)}</div>
    ${ttsSimple(d.zh,'zh','朗读中文原文')}
    <p class="muted">关键词提示：${(d.k||[]).map(k=>`<span class="badge">${esc(k)}</span>`).join("")}</p>
    <textarea id="uAns" rows="6" placeholder="在此输入英文译文..."></textarea>
    <div class="row" style="margin-top:10px"><button class="btn cta" id="selfBtn" onclick="submitSelf('translation')">完成本题</button></div>`;
  }else if(isMC){
    const d=it.data;
    const head = it.type==="reading"
      ? `<h3>仔细阅读（${esc(d.src)} · ${esc(d.y)}）</h3>${raHTML(d.passage,'en')}`
      : `<h3>听力·原文跟读（${esc(d.src)} · ${esc(d.y)}）</h3>
         <p class="muted">${esc(d.note||"")}</p>
         ${raHTML(d.transcript,'en',{selfTest:P_SELFTEST})}`;
    html+= head + `<div class="zh" style="font-weight:600">${esc(d.q.q)}</div>
      ${ttsSimple(d.q.q,'en','朗读题目')}
      ${d.q.opts.map((o,i)=>`<button class="opt" data-i="${i}">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join("")}
      <div class="row" style="margin-top:10px"><button class="btn cta" id="mcSubmit" onclick="submitMC()">提交本题</button></div>`;
  }
  html+=`</div>`;
  document.getElementById("practiceArea").innerHTML=html;
  if(isMC){
    document.querySelectorAll(".opt").forEach(o=>o.onclick=()=>{
      document.querySelectorAll(".opt").forEach(x=>x.classList.remove("sel"));
      o.classList.add("sel"); PSEL=parseInt(o.dataset.i);
    });
  }
}
/* 提交后：在原文（朗读跟读组件 .ras 句子）中标注参考定位句 + 题号徽标 */
const normStr=s=>(s||'').toLowerCase().replace(/[.,!?;:'"()\[\]]/g,' ').replace(/\s+/g,' ').trim();
function highlightRefs(refs, qLabel){
  const spans=[...document.querySelectorAll('#practiceArea .ratext .ras')];
  const seen=new Set(); const sents=[]; let firstHit=null;
  (refs||[]).forEach(ref=>{
    if(!ref){ sents.push(null); return; }
    const key=normStr(ref);
    let found=null;
    if(key){
      for(const sp of spans){
        const t=normStr(sp.textContent||'');
        if(t && (t.includes(key) || key.includes(t.slice(0,Math.min(80,t.length))))){ found=sp; break; }
      }
    }
    if(found){
      sents.push(found.textContent);
      if(!seen.has(found)){
        seen.add(found); found.classList.add('refhl');
        const badge=document.createElement('sup'); badge.className='qnbadge'; badge.textContent='题'+qLabel;
        found.insertAdjacentElement('afterend', badge);
        if(!firstHit) firstHit=found;
      }
    }else{
      sents.push(null);
    }
  });
  if(firstHit){ try{ firstHit.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){} }
  return sents;
}
function submitMC(){
  const it=PQ[PIDX]; const d=it.data; const sel=PSEL;
  if(sel===null){ toast("请先选择一个选项"); return; }
  const correct=d.q.a;
  const result = sel===correct ? "correct":"wrong";
  document.querySelectorAll(".opt").forEach((o,i)=>{ o.onclick=null; if(i===correct)o.classList.add("correct"); if(i===sel&&sel!==correct)o.classList.add("wrong"); });
  // 题号标签：优先用题在原文中的序号，否则用本轮序号
  const qLabel = (typeof d.qIdx==='number') ? (d.qIdx+1) : (PIDX+1);
  const qTotalTxt = d.qTotal ? ('/共'+d.qTotal+'题') : '';
  // 参考原文定位
  let refBlock='';
  const refs=Array.isArray(d.q.ref)?d.q.ref:[];
  if(refs.length){
    const sents=highlightRefs(refs, qLabel);
    const items=sents.map(s=> s?`<div class="refsent">${esc(s)}</div>`:`<div class="refsent muted">（当前收录原文中未直接匹配到该题定位句，请结合下方解析与原文理解）</div>`);
    refBlock=`<div class="refbox"><span class="rtitle">📌 参考原文定位句（题${qLabel}${qTotalTxt}）— 已在上文原文中高亮</span>${items.join('')}</div>`;
  }else{
    refBlock=`<div class="refbox"><span class="rtitle">📌 参考原文</span><div class="refsent muted">本题为主旨/态度/综合推理题，无单一定位句，需结合全文理解，请参考下方解析。</div></div>`;
  }
  const head = result==="correct"
    ? `<div class="fb ok">✅ 回答正确！</div>`
    : `<div class="fb no">❌ 回答错误。正确答案：<b>${String.fromCharCode(65+correct)}. ${esc(d.q.opts[correct])}</b></div>`;
  const fb = head + refBlock + `<div class="fb">📝 解析：${esc(d.q.ex)}</div>`;
  const noteId="note"+PIDX;
  let tail;
  if(PREDOMODE){
    tail=`<div id="${noteId}"><p class="muted">重做笔记（可选）：</p><textarea rows="2" placeholder="记录这次重做的感悟..."></textarea>
    <div class="row" style="margin-top:8px"><button class="btn cta" onclick="saveRedoMC('${result}','${noteId}')">保存重做结果</button></div></div>`;
  }else{
    tail=`<div id="${noteId}"><p class="muted">我的错题笔记（可选）：</p><textarea rows="2" placeholder="记录这道题的问题/知识点..."></textarea>
    <div class="row" style="margin-top:8px"><button class="btn" onclick="saveAndNext('${result}','${noteId}')">${PIDX+1>=PQ.length?'完成本组':'下一题'}</button></div></div>`;
  }
  const card=document.getElementById("practiceArea").querySelector(".card");
  card.insertAdjacentHTML("beforeend", fb+tail);
  const sb=document.getElementById("mcSubmit"); if(sb)sb.remove();
}
function saveAndNext(result,noteId){
  const it=PQ[PIDX];
  const note=document.getElementById(noteId).querySelector("textarea").value;
  const rec={id:uid(),type:it.type,qid:it.qid,ts:Date.now(),result:result,skill:it.data.q?it.data.q.skill:null,note:note};
  CACHE.records.push(rec); persist();
  PSESSION.push(rec); PIDX++; renderQuestion();
}
/* 重做选择题：保存结果后显示标记选项（不跳下一题） */
function saveRedoMC(result,noteId){
  const it=PQ[PIDX];
  const note=document.getElementById(noteId).querySelector("textarea").value;
  const rec={id:uid(),type:it.type,qid:it.qid,ts:Date.now(),result:result,skill:it.data.q?it.data.q.skill:null,note:note,redo:true};
  CACHE.records.push(rec); persist();
  saveToLocal({silent:true});
  showRedoResult(result, it.qid);
}
function submitSelf(type){
  const it=PQ[PIDX];
  const ref = type==="translation"
    ? `<div class="en">${esc(it.data.en)}</div>${ttsSimple(it.data.en,'en','朗读参考译文')}`
    : `<p class="muted">写作框架/提示：${esc(it.data.tip)}</p>`;
  const saveBtn = PREDOMODE
    ? `<button class="btn" onclick="saveRedoSelf('${type}')">保存重做结果</button>`
    : `<button class="btn cta" onclick="saveSelf('${type}')">${PIDX+1>=PQ.length?'完成本组':'下一题'}</button>`;
  const box=`<div class="fb ok"><b>参考${type==="translation"?"译文":"思路"}：</b>${ref}</div>
    <p>请自评本题掌握情况：</p>
    <div class="row">
      <button class="btn sm" id="rCorrect" onclick="rateSelf('correct',this)">✅ 做对了</button>
      <button class="btn sm ghost" id="rPartial" onclick="rateSelf('partial',this)">🟡 半对</button>
      <button class="btn sm" style="background:#dc2626" id="rWrong" onclick="rateSelf('wrong',this)">❌ 错了</button>
    </div>
    <div id="selfNote" style="margin-top:8px"><textarea rows="2" placeholder="记录问题/生词/改进点..."></textarea>
    <div class="row" style="margin-top:8px">${saveBtn}</div></div>`;
  document.getElementById("practiceArea").querySelector(".card").insertAdjacentHTML("beforeend",box);
  const b=document.getElementById("selfBtn"); if(b)b.remove();
}
function rateSelf(r,btn){
  PSELF=r;
  ["rCorrect","rPartial","rWrong"].forEach(id=>{const e=document.getElementById(id); if(e)e.style.opacity=1;});
  btn.style.opacity=.55;
}
function saveSelf(type){
  if(!PSELF){ toast("请先选择自评结果"); return; }
  const it=PQ[PIDX];
  const note=document.getElementById("selfNote").querySelector("textarea").value;
  const rec={id:uid(),type:type,qid:it.qid,ts:Date.now(),result:PSELF,skill:null,note:note};
  CACHE.records.push(rec); persist();
  PSESSION.push(rec); PIDX++; PSELF=null; renderQuestion();
}
/* 重做写作/翻译：保存自评结果后显示标记选项 */
function saveRedoSelf(type){
  if(!PSELF){ toast("请先选择自评结果"); return; }
  const it=PQ[PIDX];
  const note=document.getElementById("selfNote").querySelector("textarea").value;
  const rec={id:uid(),type:type,qid:it.qid,ts:Date.now(),result:PSELF,skill:null,note:note,redo:true};
  CACHE.records.push(rec); persist();
  saveToLocal({silent:true});
  showRedoResult(PSELF, it.qid);
}
function finishSession(){
  const total=PSESSION.length;
  const correct=PSESSION.filter(r=>r.result==="correct").length;
  const partial=PSESSION.filter(r=>r.result==="partial").length;
  const score=correct+0.5*partial;
  const acc= total? Math.round(score/total*100):0;
  CACHE.sessions.push({ts:Date.now(),total,correct,partial,acc}); persist();
  // 每轮结束可靠地写一次本地（用户手势上下文）
  saveToLocal({silent:true});
  const savedTo = SERVER_MODE ? "cache/ 目录" : (DIR_HANDLE ? DIR_HANDLE.name + " 目录" : "浏览器 localStorage");
  app.insertAdjacentHTML("beforeend",`<div class="card"><h2>🎉 本组练习完成</h2>
    <div class="stat">
      <div class="box"><div class="num">${total}</div><div class="muted">总题数</div></div>
      <div class="box"><div class="num">${acc}%</div><div class="muted">正确率</div></div>
      <div class="box"><div class="num">${correct}</div><div class="muted">全对</div></div>
      <div class="box"><div class="num">${partial}</div><div class="muted">半对</div></div>
    </div>
    <p class="muted">本次记录已自动保存到 ${savedTo}。可在「分析报告」查看趋势与薄弱环节。</p>
    <div class="row"><button class="btn" onclick="render('report')">查看分析报告</button>
    <button class="btn ghost" onclick="render('practice')">再练一组</button></div></div>`);
  document.getElementById("practiceArea").innerHTML="";
}

/* ---------- 错题本 ---------- */
function renderWrong(){
  const wrong=CACHE.records.filter(r=>r.result!=="correct");
  const markCount=(CACHE.marks||[]).length;
  if(!wrong.length && !markCount){ app.innerHTML=`<div class="card empty">🎉 暂时没有错题记录，保持住！<br><span class="muted">去「在线练习」做一组试试吧。</span></div>`; return; }
  // 已标记易错题列表（按 qid 去重）
  const markedQids=[...new Set(CACHE.marks||[])];
  let markSection="";
  if(markedQids.length){
    const mrows=markedQids.map(qid=>{
      // 从 records 找该 qid 对应的 type
      const rec=wrong.find(r=>r.qid===qid) || CACHE.records.find(r=>r.qid===qid);
      const type=rec?rec.type:null;
      if(!type) return `<tr><td colspan="3">${esc(qid)}</td><td><button class="btn sm ghost" onclick="toggleMark('${esc(qid)}');renderWrong();">取消标记</button></td></tr>`;
      return `<tr><td>${TYPE_NAME[type]||type}</td><td class="qinfo">${qidInfo(qid,type)}</td><td><span class="badge easy">⚠️易错</span></td>
        <td class="wrbtns"><button class="btn sm" onclick="redoQuestion('${esc(qid)}','${type}')">🔄 重做</button>
        <button class="btn sm ghost" onclick="toggleMark('${esc(qid)}');renderWrong();">取消标记</button></td></tr>`;
    }).join("");
    markSection=`<h3>⚠️ 已标记易错题（${markedQids.length} 题）</h3>
    <p class="muted">这些题目曾经做错、重做后做对并标记的「需持续关注」的题目。下次正常练习到时会显示提醒。</p>
    <table><thead><tr><th>题型</th><th>题目</th><th>标记</th><th>操作</th></tr></thead><tbody>${mrows}</tbody></table>`;
  }
  if(!wrong.length){
    app.innerHTML=`<div class="card"><h2>错题本</h2>${markSection||'<p class="muted">暂无错题记录。</p>'}</div>`;
    return;
  }
  const rows=wrong.slice().reverse().map(r=>{
    const tn=TYPE_NAME[r.type]||r.type;
    const pill = r.result==="wrong"?`<span class="pill w">错</span>`:`<span class="pill p">半对</span>`;
    const qinfo = qidInfo(r.qid, r.type);
    const marked = isMarked(r.qid);
    const markBadge = marked?` <span class="badge easy">⚠️易错</span>`:'';
    const markBtn = marked
      ? `<button class="btn sm ghost" onclick="toggleMark('${esc(r.qid)}');renderWrong();">取消标记</button>`
      : `<button class="btn sm ghost" style="background:#fff7ed;color:#d97706;border-color:#fde68a" onclick="toggleMark('${esc(r.qid)}');renderWrong();">标记易错</button>`;
    return `<tr>
      <td>${tn}${markBadge}${r.redo?'<br><span class="pill c">重做</span>':''}</td>
      <td class="qinfo">${qinfo}</td>
      <td>${pill}<br><span class="note">${esc(r.skill||"—")}</span></td>
      <td class="note">${esc(r.note||"—")}</td>
      <td class="wrbtns">
        <button class="btn sm" onclick="redoQuestion('${esc(r.qid)}','${r.type}','${r.id}')">🔄 重做</button>
        ${markBtn}
        <button class="btn sm ghost" onclick="delWrong('${r.id}')">删除</button>
      </td></tr>`;
  }).join("");
  app.innerHTML=`<div class="card"><h2>错题本（${wrong.length} 条${markCount?` · 易错题 ${markCount} 题`:''}）</h2>
    <p class="muted">点击「重做」跳转到该题重新作答（阅读/听力只显示原文与该题）；做对后可标记为「易错题」以便后续关注。</p>
    <table><thead><tr><th>题型</th><th>题目</th><th>状态/考点</th><th>笔记</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>
    ${markSection}</div>`;
}
function delWrong(id){
  CACHE.records=CACHE.records.filter(r=>r.id!==id); persist(); renderWrong(); toast("已删除");
}

/* ---------- 重做模式 ---------- */
function redoQuestion(qid, type, recordId){
  ensureDir();
  TTS.stop();
  const data=parseQid(qid, type);
  if(!data){ toast("题目数据未找到，可能题库已更新"); return; }
  PREDOMODE=true;
  PQ=[{type:type, qid:qid, data:data, redoRecId:recordId}];
  PIDX=0; PSESSION=[]; PSEL=null; PSELF=null;
  document.querySelectorAll("#nav button").forEach(x=>x.classList.remove("active"));
  document.querySelector('#nav button[data-v="practice"]').classList.add("active");
  const sb=document.getElementById('startup_banner'); if(sb) sb.remove();
  const marked=isMarked(qid);
  app.innerHTML=`<div class="redobanner"><div class="row" style="justify-content:space-between">
    <h2 style="margin:0">🔄 重做模式</h2>
    ${marked?`<span class="badge easy">⚠️ 易错题</span>`:''}
    </div><p class="muted" style="margin:6px 0 0">从错题本跳转的单题重做。做对后可选择标记为「易错题」，下次练习到本题时会显示提醒。</p>
    <div class="row" style="margin-top:8px"><button class="btn ghost sm" onclick="exitRedo()">← 返回错题本</button></div></div>
    <div id="practiceArea"></div>`;
  renderQuestion();
}
function exitRedo(){ PREDOMODE=false; render("wrong"); }
function exitRedoToPractice(){ PREDOMODE=false; render("practice"); }

/* 重做完成后：显示标记选项 + 返回按钮 */
function showRedoResult(result, qid){
  const card=document.getElementById("practiceArea").querySelector(".card");
  if(!card) return;
  let markHTML='';
  if(result==="correct"){
    markHTML=`<div class="fb ok"><b>✅ 重做正确！</b><br>是否标记为「易错题」？标记后，下次正常练习到本题时会显示提醒。
      <div class="row" style="margin-top:8px">
        <button class="btn sm" style="background:#f59e0b;color:#fff" onclick="toggleMark('${esc(qid)}')">标记为易错题</button>
        <button class="btn sm ghost" onclick="this.closest('.markarea').innerHTML='<span class=note>已跳过标记</span>'">不标记</button>
      </div></div>`;
  }else if(result==="partial"){
    markHTML=`<div class="fb" style="background:#fff7ed;border:1px solid #fde68a"><b>🟡 重做半对</b> 还有提升空间，建议对照解析再练。
      <div class="row" style="margin-top:8px">
        <button class="btn sm" style="background:#f59e0b;color:#fff" onclick="toggleMark('${esc(qid)}')">标记为易错题</button>
      </div></div>`;
  }else{
    markHTML=`<div class="fb no"><b>❌ 重做仍需努力</b> 请查看上方解析，理解后再来重做。</div>`;
  }
  card.insertAdjacentHTML("beforeend", `<div id="redoResult"><div class="markarea">${markHTML}</div>
    <div class="row" style="margin-top:8px">
      <button class="btn ghost" onclick="exitRedo()">← 返回错题本</button>
      <button class="btn" onclick="exitRedoToPractice()">再练一组 →</button>
    </div></div>`);
}

/* 切换易错题标记（qid 维度） */
function toggleMark(qid){
  if(!CACHE.marks) CACHE.marks=[];
  const i=CACHE.marks.indexOf(qid);
  if(i>=0){ CACHE.marks.splice(i,1); toast("已取消易错标记"); }
  else{ CACHE.marks.push(qid); toast("已标记为易错题"); }
  persist();
  saveToLocal({silent:true});
  refreshMarkArea(qid);
}
function refreshMarkArea(qid){
  const ms=document.querySelector('#redoResult .markarea');
  if(!ms) return;
  const marked=CACHE.marks.includes(qid);
  if(marked){
    ms.innerHTML=`<div class="fb ok"><b>✅ 已标记为易错题</b> 下次练习到本题时会显示提醒。
      <div class="row" style="margin-top:8px"><button class="btn sm" style="background:#f59e0b" onclick="toggleMark('${esc(qid)}')">取消易错标记</button></div></div>`;
  }else{
    ms.innerHTML=`<div class="fb ok"><b>已取消标记</b>
      <div class="row" style="margin-top:8px"><button class="btn sm" style="background:#f59e0b;color:#fff" onclick="toggleMark('${esc(qid)}')">重新标记为易错题</button></div></div>`;
  }
}

/* ---------- 分析报告 ---------- */
function renderReport(){
  const recs=CACHE.records;
  if(!recs.length){ app.innerHTML=`<div class="card empty">还没有练习记录。去「在线练习」做一组吧！</div>`; return; }
  const byType={};
  recs.forEach(r=>{ const m=byType[r.type]=byType[r.type]||{total:0,c:0,p:0}; m.total++; if(r.result==="correct")m.c++; if(r.result==="partial")m.p++; });
  const typeRows=Object.keys(TYPE_NAME).map(t=>{
    const m=byType[t]; if(!m) return "";
    const acc=accOf(m); const cls=acc>=70?"g":(acc>=50?"":"r");
    return `<div class="row" style="justify-content:space-between"><span>${TYPE_NAME[t]}（${m.total}题）</span><span><b>${acc}%</b></span></div>
      <div class="bar ${cls}"><i style="width:${acc}%"></i></div>`;
  }).join("");
  const sm={};
  recs.filter(r=>r.type==="reading"&&r.skill).forEach(r=>{ const m=sm[r.skill]=sm[r.skill]||{total:0,c:0,p:0}; m.total++; if(r.result==="correct")m.c++; if(r.result==="partial")m.p++; });
  let skillBlock="";
  const sk=Object.keys(sm);
  if(sk.length){
    skillBlock=`<h3>阅读考点正确率</h3>`+sk.map(s=>{ const m=sm[s]; const acc=accOf(m); const cls=acc>=70?"g":(acc>=50?"":"r");
      return `<div class="row" style="justify-content:space-between"><span>${esc(s)}（${m.total}题）</span><span><b>${acc}%</b></span></div><div class="bar ${cls}"><i style="width:${acc}%"></i></div>`;
    }).join("");
    const weak=sk.map(s=>({s,acc:accOf(sm[s])})).sort((a,b)=>a.acc-b.acc).slice(0,3);
    skillBlock+=`<h3>⚠️ 阅读薄弱考点</h3><p>${weak.map(w=>`<span class="badge a">${esc(w.s)} ${w.acc}%</span>`).join("")}</p>`;
  }
  const weakType=Object.keys(TYPE_NAME).filter(t=>byType[t]).map(t=>({t,acc:accOf(byType[t])})).sort((a,b)=>a.acc-b.acc).slice(0,2);
  const totalAll=recs.length;
  const totalAcc=accOf({total:recs.length,c:recs.filter(r=>r.result==="correct").length,p:recs.filter(r=>r.result==="partial").length});
  const sess=CACHE.sessions.slice(-8);
  const trend=sess.length?`<h3>📊 近期练习正确率趋势</h3>`+sess.map(s=>{
    const d=new Date(s.ts); const lbl=(d.getMonth()+1)+"/"+d.getDate();
    return `<div class="row" style="justify-content:space-between;font-size:12.5px"><span>${lbl} · ${s.total}题</span><span><b>${s.acc}%</b></span></div><div class="bar ${s.acc>=70?'g':(s.acc>=50?'':'r')}"><i style="width:${s.acc}%"></i></div>`;
  }).join(""):"";
  const markCount=(CACHE.marks||[]).length;
  app.innerHTML=`<div class="card">
    <h2>我的分析报告</h2>
    <div class="stat">
      <div class="box"><div class="num">${totalAll}</div><div class="muted">累计练习</div></div>
      <div class="box"><div class="num">${totalAcc}%</div><div class="muted">总正确率</div></div>
      <div class="box"><div class="num">${CACHE.sessions.length}</div><div class="muted">练习组数</div></div>
      <div class="box"><div class="num">${recs.filter(r=>r.result!=="correct").length}</div><div class="muted">错题数</div></div>
      <div class="box"><div class="num" style="color:#d97706">${markCount}</div><div class="muted">易错题</div></div>
    </div>
    <h3>各题型正确率</h3>${typeRows}
    ${weakType.length?`<h3>⚠️ 整体薄弱题型</h3><p>${weakType.map(w=>`<span class="badge a">${TYPE_NAME[w.t]} ${w.acc}%</span>`).join("")}</p>`:""}
    ${skillBlock}
    ${trend}
    <div class="row" style="margin-top:6px"><button class="btn ghost sm" onclick="render('wrong')">查看错题本</button>
    <button class="btn ghost sm" onclick="render('data')">管理缓存</button></div>
  </div>`;
}

/* ---------- 资源导航（精选版：仅保留免费/官方/稳定可达资源，去除失效链接与收费课程） ---------- */
const RES_DATA = [
  {cat:"official", icon:"📋", title:"中国教育考试网", url:"https://cet.neea.edu.cn", desc:"四六级官方网站：报名、成绩查询、考试大纲下载、准考证打印。备考必收藏。", tag:"官方"},
  {cat:"official", icon:"📋", title:"四六级考试报名网", url:"https://cet-bm.neea.edu.cn", desc:"考试报名入口、成绩查询、历年考试时间安排与政策通知。", tag:"报名"},

  {cat:"papers", icon:"📝", title:"英语真题在线", url:"https://zhenti.burningvocabulary.cn", desc:"近10年四六级真题免费在线练习，支持听力调速、点词查词、真题 PDF 下载、答案对照。", tag:"免费推荐"},
  {cat:"papers", icon:"📝", title:"新东方在线六级真题", url:"https://cet6.koolearn.com/zt/cet6timu/", desc:"历年六级真题分题型整理，含听力原文、阅读全文、作文范文、翻译参考及解析。", tag:"真题库"},

  {cat:"listening", icon:"🎧", title:"每日英语听力", url:"https://www.eudic.net/tingting", desc:"听力宝库：四六级真题、影视片段、新闻。支持单句精听、倍速、跟读打分、生词本。", tag:"APP推荐"},
  {cat:"listening", icon:"🎧", title:"可可英语", url:"https://www.kekenet.com", desc:"听力原文+音频跟读，四六级真题听力专区，含慢速/常速切换，完全免费。", tag:"免费"},
  {cat:"listening", icon:"🎧", title:"欧路词典真题听力", url:"https://dict.eudic.net", desc:"内置六级真题听力库，带解析与跟读功能，支持导入自定义音频。", tag:"工具"},
  {cat:"listening", icon:"🎧", title:"TED 演讲", url:"https://www.ted.com", desc:"地道英文演讲，语速适中、观点新颖，是提升听力与积累写作素材的优质来源。", tag:"英文原版"},

  {cat:"vocab", icon:"📖", title:"墨墨背单词", url:"https://www.maimemo.com", desc:"基于艾宾浩斯遗忘曲线+海量记忆数据动态排期，支持导入真题生词本，无广告。", tag:"算法记忆"},
  {cat:"vocab", icon:"📖", title:"不背单词", url:"https://www.bbdc.cn", desc:"真实语境例句取自影视/演讲原声，配正版柯林斯词典，界面极简，适合精记。", tag:"语境记忆"},
  {cat:"vocab", icon:"📖", title:"百词斩", url:"https://www.baicizhan.com", desc:"图背单词开创者，趣味图片+真人发音+游戏化闯关，适合入门与坚持。", tag:"图片记忆"},
  {cat:"vocab", icon:"📖", title:"扇贝单词", url:"https://www.shanbay.com", desc:"AI 智能路径动态调整复习节奏，词根词缀解析+社群打卡，联动扇贝听力。", tag:"AI规划"},

  {cat:"writing", icon:"✍️", title:"新东方六级作文", url:"https://cet6.koolearn.com", desc:"写作钻石句型、高分范文、万能模板汇总，历年作文真题范文赏析。", tag:"名师"},
  {cat:"writing", icon:"✍️", title:"有道翻译", url:"https://fanyi.youdao.com", desc:"翻译不确定句子可对照参考，支持文档翻译（PPT/Word/PDF）并保持原排版。", tag:"工具"},
  {cat:"writing", icon:"✍️", title:"Grammarly", url:"https://www.grammarly.com", desc:"英文写作语法检查神器，自动检测语法错误、用词与句式优化，免费版可用。", tag:"写作工具"},

  {cat:"reading", icon:"📚", title:"新东方阅读练习", url:"https://cet6.koolearn.com", desc:"六级阅读专项练习题及答案，含长难句拆解、同义替换技巧精讲。", tag:"在线练习"},
  {cat:"reading", icon:"📚", title:"中国日报(英文版)", url:"https://www.chinadaily.com.cn", desc:"权威英文新闻，题材与六级阅读高度契合，适合做外刊精读与词汇积累。", tag:"英文原版"},

  {cat:"video", icon:"🎬", title:"B站四六级专区", url:"https://search.bilibili.com?keyword=英语六级", desc:"搜索「四六级」获取大量免费视频：听力技巧、作文模板、选词填空方法等。", tag:"免费视频"},
  {cat:"video", icon:"🎬", title:"中国大学MOOC", url:"https://www.icourse163.org", desc:"清华、北外等名校免费四六级备考课程，涵盖听说读写全模块，系统化补弱。", tag:"名校课程"},
  {cat:"video", icon:"🎬", title:"网易公开课", url:"https://open.163.com", desc:"海量免费名校公开课与 TED 精选，泛听泛读素材丰富，适合碎片时间磨耳朵。", tag:"免费视频"},

  {cat:"app", icon:"📱", title:"粉笔四六级", url:"https://www.fenbi.com", desc:"历年真题分类刷题+全真模拟+错题本+免费直播课+老师讲解，提前适应节奏。", tag:"刷题APP"},
  {cat:"app", icon:"📱", title:"星火英语APP", url:"https://www.sparke.cn", desc:"与线下教辅联动的真题解析+应试技巧 APP，收录海量真题+模拟题+权威解析。", tag:"真题APP"},
  {cat:"app", icon:"📱", title:"新东方英语APP", url:"https://www.koolearn.com", desc:"历年真题+详细解析+错题本+写作翻译智能评分+免费直播课，功能全面。", tag:"综合APP"},
  {cat:"app", icon:"📱", title:"有道词典", url:"https://www.youdao.com", desc:"查词最快：释义+例句+词根+真人发音，生词表免费，真题生词随时加入复习。", tag:"查词工具"},

  {cat:"book", icon:"📗", title:"六级词汇闪过", url:"https://search.dangdang.com/?key=六级词汇闪过", desc:"按考频分类，重点记忆高频词，省时高效，适合短期冲刺。", tag:"词汇书"},
  {cat:"book", icon:"📗", title:"星火六级真题", url:"https://search.dangdang.com/?key=星火六级真题", desc:"真题解析详尽+模拟题+技巧点拨，备考导向明确的经典教辅。", tag:"真题书"},

  {cat:"community", icon:"💡", title:"新东方四六级官网", url:"https://cet4-6.xdf.cn", desc:"最新考试资讯+真题资料+备考技巧+免费干货+老师指导，权威备考平台。", tag:"资讯"},
  {cat:"community", icon:"💡", title:"知乎六级话题", url:"https://www.zhihu.com/topic/19550994", desc:"六级备考经验分享、高分攻略、资料推荐与答疑互动。", tag:"经验分享"},
  {cat:"community", icon:"💡", title:"豆瓣六级小组", url:"https://www.douban.com/search?q=英语六级", desc:"学习打卡小组、备考日记、资料交换、同伴互助，适合需要氛围的同学。", tag:"学习社区"},

  {cat:"local", icon:"📂", title:"00-资源导航.md", url:"资源合集/00-资源导航.md", desc:"官方/真题/工具总索引与使用说明。", tag:"本地"},
  {cat:"local", icon:"📂", title:"01-提分策略详解.md", url:"资源合集/01-提分策略详解.md", desc:"全题型高分策略：听力7大规律、阅读三步法、翻译万能句式、写作三段式。", tag:"本地"},
  {cat:"local", icon:"📂", title:"02-高频词汇与翻译模板.md", url:"资源合集/02-高频词汇与翻译模板.md", desc:"翻译主题词+万能句式+高频表达。", tag:"本地"},
  {cat:"local", icon:"📂", title:"03-写作模板与句型.md", url:"资源合集/03-写作模板与句型.md", desc:"写作模板+句型库+过渡词+高分句式。", tag:"本地"},
  {cat:"local", icon:"📂", title:"04-真题来源与版权说明.md", url:"资源合集/04-真题来源与版权说明.md", desc:"真题数据来源说明与版权信息。", tag:"本地"},
];
const RES_CATS = [
  {id:"all", icon:"🌟", label:"全部", color:"#2563eb"},
  {id:"official", icon:"📋", label:"官方信息", color:"#0ea5e9"},
  {id:"papers", icon:"📝", label:"真题下载", color:"#8b5cf6"},
  {id:"listening", icon:"🎧", label:"听力训练", color:"#06b6d4"},
  {id:"vocab", icon:"📖", label:"词汇记忆", color:"#f59e0b"},
  {id:"writing", icon:"✍️", label:"写作翻译", color:"#ec4899"},
  {id:"reading", icon:"📚", label:"阅读专项", color:"#10b981"},
  {id:"video", icon:"🎬", label:"视频课程", color:"#ef4444"},
  {id:"app", icon:"📱", label:"备考APP", color:"#6366f1"},
  {id:"book", icon:"📗", label:"书籍推荐", color:"#84cc16"},
  {id:"community", icon:"💡", label:"社区策略", color:"#14b8a6"},
  {id:"local", icon:"📂", label:"本地资料", color:"#64748b"},
];
let RES_ACTIVE_CAT = "all";
function renderRes(){
  const catCounts={};
  RES_DATA.forEach(r=>{ catCounts[r.cat]=(catCounts[r.cat]||0)+1; });
  const tabs=RES_CATS.map(c=>{
    const cnt=c.id==="all"?RES_DATA.length:(catCounts[c.id]||0);
    return `<button class="res-tab ${c.id===RES_ACTIVE_CAT?"active":""}" data-cat="${c.id}" onclick="resSwitchCat('${c.id}')">${c.icon} ${c.label}<span style="opacity:.6;font-size:11px;margin-left:4px">${cnt}</span></button>`;
  }).join("");
  app.innerHTML=`
  <div class="res-hero">
    <h2>🌐 资源导航中心</h2>
    <p>精选 ${RES_DATA.length} 个优质六级备考资源 · 涵盖真题/听力/词汇/写作/阅读/视频/APP/书籍/社区 · 点击卡片直达</p>
  </div>
  <input type="text" class="res-search" id="resSearch" placeholder="🔍 搜索资源名称、描述或关键词..." oninput="resSearch()">
  <div class="res-tabs">${tabs}</div>
  <div id="resContent"></div>`;
  resRenderContent("");
}
function resSwitchCat(catId){
  RES_ACTIVE_CAT=catId;
  document.querySelectorAll(".res-tab").forEach(t=>t.classList.toggle("active", t.dataset.cat===catId));
  const q=(document.getElementById("resSearch")||{}).value||"";
  resRenderContent(q);
}
function resSearch(){
  const q=(document.getElementById("resSearch")||{}).value||"";
  resRenderContent(q);
}
function resRenderContent(query){
  const q=(query||"").toLowerCase().trim();
  let items=RES_DATA.filter(r=>RES_ACTIVE_CAT==="all"||r.cat===RES_ACTIVE_CAT);
  if(q) items=items.filter(r=>(r.title+" "+r.desc+" "+r.tag).toLowerCase().includes(q));
  if(!items.length){
    document.getElementById("resContent").innerHTML=`<div class="card empty">未找到匹配资源，试试其他关键词 🔍</div>`;
    return;
  }
  /* 按 category 分组渲染 */
  const groups={};
  items.forEach(r=>{ (groups[r.cat]=groups[r.cat]||[]).push(r); });
  const catOrder=RES_CATS.filter(c=>c.id!=="all"&&groups[c.id]);
  let html="";
  catOrder.forEach(c=>{
    const catItems=groups[c.id];
    const catInfo=RES_CATS.find(x=>x.id===c.id);
    html+=`<div class="res-cat-header res-cat-${c.id}">${catInfo.icon} ${catInfo.label}<span class="count">${catItems.length} 个资源</span></div>`;
    html+=`<div class="res-grid">`;
    catItems.forEach(r=>{
      const isLocal=r.url.startsWith("资源合集/");
      const target=isLocal?'':'target="_blank" rel="noopener"';
      const tagColor={"免费推荐":"#16a34a","官方":"#0ea5e9","APP推荐":"#6366f1","免费":"#16a34a","免费视频":"#16a34a","英文原版":"#8b5cf6","名师":"#ec4899","真题":"#8b5cf6","网盘":"#f59e0b","合集":"#f59e0b","工具":"#64748b","本地":"#64748b","真题库":"#8b5cf6","汇总":"#f59e0b","报名":"#0ea5e9","算法记忆":"#f59e0b","图片记忆":"#f59e0b","语境记忆":"#10b981","AI规划":"#6366f1","游戏化":"#84cc16","国际工具":"#14b8a6","写作工具":"#ec4899","付费课程":"#ef4444","名校课程":"#ef4444","直播课":"#ef4444","刷题APP":"#6366f1","真题APP":"#6366f1","综合APP":"#6366f1","查词工具":"#06b6d4","词汇书":"#84cc16","真题书":"#84cc16","专项书":"#84cc16","语法书":"#84cc16","书籍":"#84cc16","资讯":"#14b8a6","经验分享":"#14b8a6","学习社区":"#14b8a6","交流":"#14b8a6"}[r.tag]||"#64748b";
      html+=`<a class="res-card" href="${esc(r.url)}" ${target}>
        <span class="rc-icon">${r.icon}</span>
        <div class="rc-title">${esc(r.title)}</div>
        <div class="rc-desc">${esc(r.desc)}</div>
        <span class="rc-tag" style="background:${tagColor}20;color:${tagColor}">${esc(r.tag)}</span>
      </a>`;
    });
    html+=`</div>`;
  });
  document.getElementById("resContent").innerHTML=html;
}

/* ---------- 数据管理 ---------- */
function renderData(){
  const r=CACHE.records.length, w=CACHE.records.filter(x=>x.result!=="correct").length, s=CACHE.sessions.length, mk=(CACHE.marks||[]).length;
  const dirInfo = SERVER_MODE
    ? `<div class="dirok">📁 <b>服务器模式（自动保存已启用）</b><br>缓存自动保存到项目根目录 <code>cache/</code> 文件夹。关闭程序/每轮练习结束/每 90 秒都会自动写入 <code>cache/cache_时间.json</code> + <code>cache/latest.json</code>（快速恢复用）。<br>无需任何手动设置。</div>`
    : DIR_HANDLE
      ? `<div class="dirok">📁 已绑定本地保存目录：<b>${esc(DIR_HANDLE.name)}</b>。<br>关闭程序/每轮练习结束会自动写入缓存文件到该目录。</div>`
      : `<div class="dirwarn">📁 当前为非服务器模式，缓存仅保存在浏览器 localStorage。<br><b>推荐</b>：双击 <code>启动.bat</code> 或运行 <code>node server.js</code>，用 <code>http://localhost:8765/</code> 打开即可自动保存到 <code>cache/</code> 文件夹。<br>或点击下方「设置本地保存目录」使用浏览器目录写入（需 Chrome/Edge）。</div>`;
  app.innerHTML=`<div class="card">
    <h2>数据管理（本地缓存）</h2>
    <p class="muted">所有练习记录、错题本、分析报告均保存在<b>本浏览器 localStorage</b>（键名 <code>cet6_cache_v1</code>），不上传任何服务器。绑定本地目录后还会额外写入项目根目录。</p>
    ${dirInfo}
    <div class="stat">
      <div class="box"><div class="num">${r}</div><div class="muted">练习记录</div></div>
      <div class="box"><div class="num">${w}</div><div class="muted">错题</div></div>
      <div class="box"><div class="num">${s}</div><div class="muted">练习组</div></div>
      <div class="box"><div class="num" style="color:#d97706">${mk}</div><div class="muted">易错题</div></div>
    </div>
    <h3>本地缓存目录（${SERVER_MODE ? "服务器模式 · 自动保存到 cache/" : "浏览器目录写入"}）</h3>
    ${SERVER_MODE ? `<p class="muted">✅ 服务器模式已启用，缓存自动保存到项目根目录 <code>cache/</code> 文件夹，无需手动操作。</p>` : ""}
    <div class="row">
      ${SERVER_MODE ? "" : `<button class="btn sm" onclick="pickSaveDir()">📁 设置本地保存目录</button>`}
      <button class="btn sm" onclick="saveToLocal()">💾 立即保存缓存</button>
      <button class="btn sm ghost" onclick="importLatestFromDir()">📥 导入最新缓存</button>
    </div>
    <h3>导出 / 导入（文件）</h3>
    <p class="muted">未绑定目录时用下方方式：导出会下载 JSON 文件（默认在浏览器“下载”文件夹），下次启动用「导入」恢复进度。</p>
    <div class="row">
      <button class="btn" onclick="downloadFallback()">导出缓存文件（下载）</button>
      <label class="btn ghost">导入缓存文件<input type="file" id="impFile" accept=".json" style="display:none" onchange="importCache(this.files[0])"></label>
      <button class="btn" style="background:#dc2626" onclick="clearCache()">清空全部缓存</button>
    </div>
  </div>`;
}
function importCache(file){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const obj=JSON.parse(e.target.result);
      const before=CACHE.records.length;
      mergeCache(obj);
      persist();
      saveToLocal({silent:true});
      toast("缓存导入成功（新增 "+(CACHE.records.length-before)+" 条）");
      render("report");
    }catch(err){ toast("文件解析失败，请确认是导出的缓存 JSON"); }
  };
  reader.readAsText(file);
}
function clearCache(){
  if(confirm("确定要清空全部练习记录、错题与报告吗？此操作不可恢复！")){
    CACHE={records:[],wrong:[],sessions:[],settings:{},marks:[]}; persist(); toast("缓存已清空"); render("data");
  }
}

/* ============================================================
   模拟考试（按六级结构随机组卷 + 自动评分 + 报告）
   分值：写作106.5 + 听力248.5 + 阅读248.5 + 翻译106.5 = 710
   ============================================================ */
const MOCK_SCORES={writing:106.5,listening:248.5,reading:248.5,translation:106.5};
let ME_QUESTIONS=[], ME_IDX=0, ME_START=0, ME_ACTIVE=false, ME_TIMER=null, ME_SEL=null, ME_SELF=null;

function renderMock(){
  ME_ACTIVE=false;
  if(ME_TIMER){ clearInterval(ME_TIMER); ME_TIMER=null; }
  // 历史模拟考试成绩
  const mockSessions=(CACHE.sessions||[]).filter(s=>s.mock);
  let histHTML="";
  if(mockSessions.length){
    const rows=mockSessions.slice().reverse().slice(0,10).map(s=>{
      const d=new Date(s.ts); const p=n=>String(n).padStart(2,'0');
      const dt=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
      const passCls = s.score>=425?'score-pass':'score-fail';
      return `<tr><td>${dt}</td><td class="${passCls}"><b>${s.score}</b></td><td>${s.totalSubj+s.totalObj}</td>
        <td>${s.writingAcc!=null?s.writingAcc+'%':'—'}</td>
        <td>${s.listeningAcc!=null?s.listeningAcc+'%':'—'}</td>
        <td>${s.readingAcc!=null?s.readingAcc+'%':'—'}</td>
        <td>${s.translationAcc!=null?s.translationAcc+'%':'—'}</td></tr>`;
    }).join("");
    histHTML=`<div class="card mock-history"><h3>📊 历次模考成绩</h3>
      <table><thead><tr><th>时间</th><th>总分</th><th>题数</th><th>写作</th><th>听力</th><th>阅读</th><th>翻译</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  // 统计可用题量
  const wrCount=BANK.writing.length;
  const trCount=BANK.translation.length;
  const rdCount=BANK.reading.reduce((s,p)=>s+p.questions.length,0);
  const lsCount=BANK.listening.reduce((s,p)=>s+p.questions.length,0);
  app.innerHTML=`
  <div class="mock-header">
    <h2>📝 六级模拟考试</h2>
    <p>根据近10年命题动向随机组卷 · 限时130分钟 · 自动评分（710分制）· 生成薄弱项报告</p>
  </div>
  <div class="card">
    <h3>试卷结构（与真实六级一致）</h3>
    <table><thead><tr><th>部分</th><th>题型</th><th>题量</th><th>分值占比</th><th>建议用时</th></tr></thead>
      <tbody>
        <tr><td>Part I</td><td>写作</td><td>1 题</td><td>15%（106.5分）</td><td>30 min</td></tr>
        <tr><td>Part II</td><td>听力</td><td>${lsCount} 题</td><td>35%（248.5分）</td><td>30 min</td></tr>
        <tr><td>Part III</td><td>阅读</td><td>${rdCount} 题</td><td>35%（248.5分）</td><td>40 min</td></tr>
        <tr><td>Part IV</td><td>翻译</td><td>1 题</td><td>15%（106.5分）</td><td>30 min</td></tr>
      </tbody></table>
    <p class="muted" style="margin-top:8px">📋 当前题库可用：写作 ${wrCount} 篇 · 翻译 ${trCount} 篇 · 阅读 ${rdCount} 题 · 听力 ${lsCount} 题。<br>
    模考将从题库中随机抽取，客观题（听力/阅读）自动判分，主观题（写作/翻译）由你自评后计入分数。每次模考成绩会保存到分析报告中。</p>
    <div class="row" style="margin-top:12px">
      <button class="btn cta pulse big" onclick="startMockExam()">🚀 开始模拟考试</button>
    </div>
  </div>
  ${histHTML}`;
}

function startMockExam(){
  ensureDir(); TTS.stop();
  // 随机组卷：1写作 + 全部听力 + 全部阅读 + 1翻译
  const wrIdx=Math.floor(Math.random()*BANK.writing.length);
  const trIdx=Math.floor(Math.random()*BANK.translation.length);
  // 听力：全部题目，打乱
  let lsList=[]; BANK.listening.forEach((p,pi)=>p.questions.forEach((q,qi)=>lsList.push({type:"listening",qid:"l_"+pi+"_"+qi,data:{transcript:p.transcript,title:p.title,src:p.src,y:p.y,note:p.note,q,qIdx:qi,qTotal:p.questions.length}})));
  lsList=lsList.sort(()=>Math.random()-0.5);
  // 阅读：全部题目，打乱
  let rdList=[]; BANK.reading.forEach((p,pi)=>p.questions.forEach((q,qi)=>rdList.push({type:"reading",qid:"r_"+pi+"_"+qi,data:{passage:p.passage,title:p.title,src:p.src,y:p.y,skillNote:p.skillNote,q,qIdx:qi,qTotal:p.questions.length}})));
  rdList=rdList.sort(()=>Math.random()-0.5);
  // 组卷顺序：写作 → 听力 → 阅读 → 翻译
  ME_QUESTIONS=[
    {type:"writing",qid:"writing_"+wrIdx,data:BANK.writing[wrIdx],userAnswer:null,result:null},
    ...lsList.map(x=>({...x,userAnswer:null,result:null})),
    ...rdList.map(x=>({...x,userAnswer:null,result:null})),
    {type:"translation",qid:"translation_"+trIdx,data:BANK.translation[trIdx],userAnswer:null,result:null}
  ];
  ME_IDX=0; ME_START=Date.now(); ME_ACTIVE=true; ME_SEL=null; ME_SELF=null;
  // 启动计时器
  if(ME_TIMER) clearInterval(ME_TIMER);
  ME_TIMER=setInterval(updateMockTimer,1000);
  renderMockQuestion();
}

function updateMockTimer(){
  if(!ME_ACTIVE) return;
  const el=document.getElementById('mockTimer');
  if(!el) return;
  const elapsed=Math.floor((Date.now()-ME_START)/1000);
  const limit=130*60; // 130分钟
  const remain=limit-elapsed;
  if(remain<=0){
    el.textContent='⏰ 时间到';
    el.classList.add('warn');
    finishMockExam(true);
    return;
  }
  const m=Math.floor(remain/60), s=remain%60;
  el.textContent=`⏱ 剩余 ${m}:${String(s).padStart(2,'0')}`;
  if(remain<300) el.classList.add('warn'); // 最后5分钟变红
}

function renderMockQuestion(){
  TTS.stop();
  if(ME_IDX>=ME_QUESTIONS.length) return finishMockExam(false);
  const it=ME_QUESTIONS[ME_IDX]; const total=ME_QUESTIONS.length;
  const isMC = it.type==="reading"||it.type==="listening";
  const secLabel = it.type==="writing"?"Part I · 写作":it.type==="listening"?"Part II · 听力":it.type==="reading"?"Part III · 阅读":"Part IV · 翻译";
  const marked = isMarked(it.qid);
  let html=`<div class="mock-timer"><span><b>${secLabel}</b> · 第 ${ME_IDX+1}/${total} 题${marked?' <span class="badge easy">⚠️易错</span>':''}</span><span class="clk" id="mockTimer">⏱ 计算中</span></div>`;
  html+=`<div class="prog" style="margin-bottom:14px"><i style="width:${ME_IDX/total*100}%"></i></div>`;
  html+=`<div class="card">`;
  if(it.type==="writing"){
    const d=it.data;
    html+=`<h3>作文题（${esc(d.y)} · ${esc(d.c)} · ${esc(d.type)}）</h3>
    <div class="zh" style="font-weight:600">${esc(d.t)}</div>
    ${ttsSimple(d.t,'zh','朗读题目')}
    <p class="muted">写作提示：${esc(d.tip)}</p>
    <p>在下方写你的作文，完成后点「完成本题」对照思路自评：</p>
    <textarea id="uAns" rows="10" placeholder="在此输入英文作文..."></textarea>
    <div class="row" style="margin-top:10px"><button class="btn cta" id="selfBtn" onclick="submitMockSelf()">完成本题</button></div>`;
  }else if(it.type==="translation"){
    const d=it.data;
    html+=`<h3>汉译英（${esc(d.y)} 第${esc(d.s)}套 · ${esc(d.c)}）</h3>
    <div class="zh">${esc(d.zh)}</div>
    ${ttsSimple(d.zh,'zh','朗读中文原文')}
    <p class="muted">关键词提示：${(d.k||[]).map(k=>`<span class="badge">${esc(k)}</span>`).join("")}</p>
    <textarea id="uAns" rows="8" placeholder="在此输入英文译文..."></textarea>
    <div class="row" style="margin-top:10px"><button class="btn cta" id="selfBtn" onclick="submitMockSelf()">完成本题</button></div>`;
  }else if(isMC){
    const d=it.data;
    const head = it.type==="reading"
      ? `<h3>仔细阅读（${esc(d.src)} · ${esc(d.y)}）</h3>${raHTML(d.passage,'en')}`
      : `<h3>听力（${esc(d.src)} · ${esc(d.y)}）</h3>
         <p class="muted">${esc(d.note||"")}</p>
         ${raHTML(d.transcript,'en',{selfTest:true})}`;
    html+= head + `<div class="zh" style="font-weight:600">${esc(d.q.q)}</div>
      ${ttsSimple(d.q.q,'en','朗读题目')}
      ${d.q.opts.map((o,i)=>`<button class="opt" data-i="${i}">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join("")}
      <div class="row" style="margin-top:10px"><button class="btn cta" id="mcSubmit" onclick="submitMockMC()">提交本题</button></div>`;
  }
  html+=`</div>`;
  // 保留已答的导航
  const answered=ME_QUESTIONS.filter(q=>q.result).length;
  html+=`<div class="card"><p class="muted">已作答 ${answered}/${total} 题 · <a href="javascript:void(0)" onclick="if(confirm('确定要提前交卷吗？未作答的题计为0分。'))finishMockExam(false)">提前交卷</a></p></div>`;
  app.innerHTML=html;
  if(isMC){
    document.querySelectorAll(".opt").forEach(o=>o.onclick=()=>{
      document.querySelectorAll(".opt").forEach(x=>x.classList.remove("sel"));
      o.classList.add("sel"); ME_SEL=parseInt(o.dataset.i);
    });
  }
  updateMockTimer();
}

/* 模考客观题提交 */
function submitMockMC(){
  const it=ME_QUESTIONS[ME_IDX]; const d=it.data; const sel=ME_SEL;
  if(sel===null){ toast("请先选择一个选项"); return; }
  const correct=d.q.a;
  const result = sel===correct ? "correct":"wrong";
  it.userAnswer=sel; it.result=result;
  // 记录到练习历史
  const rec={id:uid(),type:it.type,qid:it.qid,ts:Date.now(),result:result,skill:d.q?d.q.skill:null,note:"",mock:true};
  CACHE.records.push(rec); persist();
  document.querySelectorAll(".opt").forEach((o,i)=>{ o.onclick=null; if(i===correct)o.classList.add("correct"); if(i===sel&&sel!==correct)o.classList.add("wrong"); });
  // 参考定位
  const qLabel = (typeof d.qIdx==='number') ? (d.qIdx+1) : (ME_IDX+1);
  const refs=Array.isArray(d.q.ref)?d.q.ref:[];
  let refBlock='';
  if(refs.length){
    const sents=highlightRefs(refs, qLabel);
    const items=sents.map(s=> s?`<div class="refsent">${esc(s)}</div>`:`<div class="refsent muted">（当前收录原文中未直接匹配到该题定位句）</div>`);
    refBlock=`<div class="refbox"><span class="rtitle">📌 参考原文定位句（题${qLabel}）</span>${items.join('')}</div>`;
  }
  const head = result==="correct"
    ? `<div class="fb ok">✅ 回答正确！</div>`
    : `<div class="fb no">❌ 回答错误。正确答案：<b>${String.fromCharCode(65+correct)}. ${esc(d.q.opts[correct])}</b></div>`;
  const fb = head + refBlock + `<div class="fb">📝 解析：${esc(d.q.ex)}</div>`;
  const tail=`<div class="row" style="margin-top:10px"><button class="btn cta" onclick="ME_IDX++;ME_SEL=null;renderMockQuestion()">${ME_IDX+1>=ME_QUESTIONS.length?'完成模考 · 查看成绩':'下一题 →'}</button></div>`;
  const card=document.querySelector(".card");
  card.insertAdjacentHTML("beforeend", fb+tail);
  const sb=document.getElementById("mcSubmit"); if(sb)sb.remove();
}

/* 模考主观题提交 */
function submitMockSelf(){
  const it=ME_QUESTIONS[ME_IDX];
  const ref = it.type==="translation"
    ? `<div class="en">${esc(it.data.en)}</div>${ttsSimple(it.data.en,'en','朗读参考译文')}`
    : `<p class="muted">写作框架/提示：${esc(it.data.tip)}</p>`;
  const box=`<div class="fb ok"><b>参考${it.type==="translation"?"译文":"思路"}：</b>${ref}</div>
    <p>请自评本题掌握情况（影响估分）：</p>
    <div class="row">
      <button class="btn sm" id="rCorrect" onclick="rateMockSelf('correct',this)">✅ 做对了</button>
      <button class="btn sm ghost" id="rPartial" onclick="rateMockSelf('partial',this)">🟡 半对</button>
      <button class="btn sm" style="background:#dc2626" id="rWrong" onclick="rateMockSelf('wrong',this)">❌ 错了</button>
    </div>
    <div id="selfNote" style="margin-top:8px"><textarea rows="2" placeholder="记录问题/改进点..."></textarea>
    <div class="row" style="margin-top:8px"><button class="btn cta" onclick="saveMockSelf()">${ME_IDX+1>=ME_QUESTIONS.length?'完成模考 · 查看成绩':'下一题 →'}</button></div></div>`;
  document.querySelector(".card").insertAdjacentHTML("beforeend",box);
  const b=document.getElementById("selfBtn"); if(b)b.remove();
}
function rateMockSelf(r,btn){
  ME_SELF=r;
  ["rCorrect","rPartial","rWrong"].forEach(id=>{const e=document.getElementById(id); if(e)e.style.opacity=1;});
  btn.style.opacity=.55;
}
function saveMockSelf(){
  if(!ME_SELF){ toast("请先选择自评结果"); return; }
  const it=ME_QUESTIONS[ME_IDX];
  it.userAnswer=ME_SELF; it.result=ME_SELF;
  // 记录到练习历史
  const note=document.getElementById("selfNote").querySelector("textarea").value;
  const rec={id:uid(),type:it.type,qid:it.qid,ts:Date.now(),result:ME_SELF,skill:null,note:note,mock:true};
  CACHE.records.push(rec); persist();
  ME_IDX++; ME_SELF=null; renderMockQuestion();
}

/* 模考结束：计算分数 + 生成报告 */
function finishMockExam(timeout){
  ME_ACTIVE=false;
  if(ME_TIMER){ clearInterval(ME_TIMER); ME_TIMER=null; }
  // 未作答的题计为wrong
  ME_QUESTIONS.forEach(q=>{ if(!q.result){ q.result="wrong"; q.userAnswer=null; } });
  // 记录未答的客观题到练习历史
  ME_QUESTIONS.forEach(q=>{
    if(q.type==="reading"||q.type==="listening"){
      const rec={id:uid(),type:q.type,qid:q.qid,ts:Date.now(),result:q.result,skill:q.data.q?q.data.q.skill:null,note:timeout?"超时未答":"未作答",mock:true};
      CACHE.records.push(rec);
    }
  });
  // 分项统计
  const byType={writing:{c:0,p:0,w:0,n:0},listening:{c:0,p:0,w:0,n:0},reading:{c:0,p:0,w:0,n:0},translation:{c:0,p:0,w:0,n:0}};
  ME_QUESTIONS.forEach(q=>{
    const t=byType[q.type]; t.n++;
    if(q.result==="correct")t.c++;
    else if(q.result==="partial")t.p++;
    else t.w++;
  });
  // 计算分数
  const wrScore = byType.writing.c*MOCK_SCORES.writing + byType.writing.p*MOCK_SCORES.writing*0.5;
  const trScore = byType.translation.c*MOCK_SCORES.translation + byType.translation.p*MOCK_SCORES.translation*0.5;
  const lsPerQ = byType.listening.n>0 ? MOCK_SCORES.listening/byType.listening.n : 0;
  const rdPerQ = byType.reading.n>0 ? MOCK_SCORES.reading/byType.reading.n : 0;
  const lsScore = (byType.listening.c + byType.listening.p*0.5) * lsPerQ;
  const rdScore = (byType.reading.c + byType.reading.p*0.5) * rdPerQ;
  const totalScore = Math.round(wrScore + trScore + lsScore + rdScore);
  const passed = totalScore>=425;
  // 正确率
  const accOf2=m=> m.n>0?Math.round((m.c+0.5*m.p)/m.n*100):0;
  const wrAcc=accOf2(byType.writing), lsAcc=accOf2(byType.listening), rdAcc=accOf2(byType.reading), trAcc=accOf2(byType.translation);
  const totalObj=byType.listening.n+byType.reading.n;
  const totalSubj=byType.writing.n+byType.translation.n;
  const objAcc=totalObj>0?Math.round(((byType.listening.c+byType.reading.c)+0.5*(byType.listening.p+byType.reading.p))/totalObj*100):0;
  // 保存模考session
  const elapsed=Math.round((Date.now()-ME_START)/60000);
  CACHE.sessions.push({ts:Date.now(),mock:true,score:totalScore,passed:passed,
    writingAcc:wrAcc,listeningAcc:lsAcc,readingAcc:rdAcc,translationAcc:trAcc,
    writingScore:Math.round(wrScore),listeningScore:Math.round(lsScore),readingScore:Math.round(rdScore),translationScore:Math.round(trScore),
    total:ME_QUESTIONS.length,totalObj:totalObj,totalSubj:totalSubj,
    correct:byType.listening.c+byType.reading.c,partial:byType.listening.p+byType.reading.p,
    acc:objAcc,minutes:elapsed});
  persist();
  saveToLocal({silent:true});
  // 薄弱项分析
  const sectionAccs=[{n:"写作",a:wrAcc},{n:"听力",a:lsAcc},{n:"阅读",a:rdAcc},{n:"翻译",a:trAcc}];
  const weak=sectionAccs.filter(s=>s.a<70).sort((a,b)=>a.a-b.a);
  const strong=sectionAccs.filter(s=>s.a>=70).sort((a,b)=>b.a-a.a);
  // 阅读考点分析
  const sk={};
  ME_QUESTIONS.filter(q=>q.type==="reading"&&q.data.q&&q.data.q.skill).forEach(q=>{ const m=sk[q.data.q.skill]=sk[q.data.q.skill]||{total:0,c:0,p:0}; m.total++; if(q.result==="correct")m.c++; if(q.result==="partial")m.p++; });
  const skKeys=Object.keys(sk);
  let skillHTML="";
  if(skKeys.length){
    skillHTML=`<h3>📖 阅读考点分析</h3>`+skKeys.map(s=>{ const m=sk[s]; const acc=accOf2(m); const cls=acc>=70?"g":(acc>=50?"":"r");
      return `<div class="row" style="justify-content:space-between"><span>${esc(s)}（${m.total}题）</span><span><b>${acc}%</b></span></div><div class="bar ${cls}"><i style="width:${acc}%"></i></div>`;
    }).join("");
  }
  // 渲染报告
  app.innerHTML=`
  <div class="mock-header">
    <h2>📊 模考成绩报告${timeout?'（超时交卷）':''}</h2>
    <p>用时 ${elapsed} 分钟 · 共 ${ME_QUESTIONS.length} 题（客观题 ${totalObj} + 主观题 ${totalSubj}）</p>
  </div>
  <div class="card" style="text-align:center">
    <div class="score-big ${passed?'score-pass':'score-fail'}">${totalScore}</div>
    <p style="font-size:16px">${passed?'🎉 恭喜通过！达到425分及格线':'⚠️ 未达425分及格线，继续加油！'}</p>
    <p class="muted">满分 710 分 · 及格线 425 分</p>
  </div>
  <div class="card">
    <h3>分项成绩</h3>
    <table><thead><tr><th>部分</th><th>正确率</th><th>估分</th><th>满分</th><th>正确/半对/错误</th></tr></thead><tbody>
      <tr><td>✍️ 写作</td><td>${wrAcc}%</td><td><b>${Math.round(wrScore)}</b></td><td>${MOCK_SCORES.writing}</td><td>${byType.writing.c}/${byType.writing.p}/${byType.writing.w}</td></tr>
      <tr><td>🎧 听力</td><td>${lsAcc}%</td><td><b>${Math.round(lsScore)}</b></td><td>${MOCK_SCORES.listening}</td><td>${byType.listening.c}/${byType.listening.p}/${byType.listening.w}</td></tr>
      <tr><td>📖 阅读</td><td>${rdAcc}%</td><td><b>${Math.round(rdScore)}</b></td><td>${MOCK_SCORES.reading}</td><td>${byType.reading.c}/${byType.reading.p}/${byType.reading.w}</td></tr>
      <tr><td>🔄 翻译</td><td>${trAcc}%</td><td><b>${Math.round(trScore)}</b></td><td>${MOCK_SCORES.translation}</td><td>${byType.translation.c}/${byType.translation.p}/${byType.translation.w}</td></tr>
    </tbody></table>
  </div>
  <div class="card">
    <h3>💡 薄弱项分析与提分建议</h3>
    ${weak.length?`<p><b>需重点提升：</b>${weak.map(w=>`<span class="badge a">${w.n} ${w.a}%</span>`).join("")}</p>`:'<p class="muted">各部分均达到70%以上，整体均衡，继续保持！</p>'}
    ${strong.length?`<p><b>优势项：</b>${strong.map(s=>`<span class="badge g">${s.n} ${s.a}%</span>`).join("")}</p>`:''}
    ${skillHTML}
    <div class="row" style="margin-top:12px">
      <button class="btn" style="background:#7c3aed" onclick="render('mock')">再考一次</button>
      <button class="btn ghost" onclick="render('wrong')">查看错题本</button>
      <button class="btn ghost" onclick="render('report')">查看总报告</button>
    </div>
  </div>`;
}


/* ---------- 时事新题库 集成 + 题库更新 ---------- */
/* 将 BANK.news 中的最新时事题并入主题库（写作/翻译/阅读/听力），
   并打上 news 标记，使其自动出现在「在线练习」筛选与「模拟考试」组卷中。 */
function integrateNews(){
  const N = window.BANK && window.BANK.news;
  if(!N) return;
  ["writing","translation","reading","listening"].forEach(k=>{
    if(BANK[k]) BANK[k] = BANK[k].filter(x=>!x.news);   // 先清除旧并入项，避免重复
  });
  if(N.writing)     N.writing.forEach(x=>{ x.news=true; BANK.writing.push(x); });
  if(N.translation) N.translation.forEach(x=>{ x.news=true; BANK.translation.push(x); });
  if(N.reading)     N.reading.forEach(x=>{ x.news=true; BANK.reading.push(x); });
  if(N.listening)   N.listening.forEach(x=>{ x.news=true; BANK.listening.push(x); });
}
function newsCount(){
  const N = window.BANK && window.BANK.news;
  if(!N) return {writing:0,translation:0,reading:0,listening:0};
  return {
    writing:(N.writing||[]).length,
    translation:(N.translation||[]).length,
    reading:(N.reading||[]).reduce((s,p)=>s+p.questions.length,0),
    listening:(N.listening||[]).reduce((s,p)=>s+p.questions.length,0)
  };
}
/* 题库更新面板 */
function showUpdatePanel(){
  const c = newsCount();
  const total = c.writing + c.translation + c.reading + c.listening;
  const imported = CACHE.settings && CACHE.settings.newsImport ? "✅ 已导入自定义更新包（本次会话生效）" : "未导入（使用内置时事题）";
  app.innerHTML = `
  <div class="card">
    <h2>🔄 题库更新中心 <span class="badge" style="background:#ede9fe;color:#6d28d9">${APP_VERSION}</span></h2>
    <p class="muted">内置「2026 时事热点新题」由<strong>自动化流水线</strong>生成：① 实时联网爬取当年热点 → ② 按历年命题风格模型做大数据筛选/比对/去重 →
    ③ 组合命制。本期话题均来自 2026-08-07 真实热点（世界人工智能大会与国产算力、十五五碳达峰行动方案、1270 万毕业生就业、非遗“国潮焕新”文旅消费、上半年外贸新高、长期护理保险），
    严格按历年六级命题风格命制，覆盖写作 / 翻译 / 阅读 / 听力全题型。</p>

    <h3>📦 当前内置时事题量</h3>
    <div class="stat">
      <div class="box"><div class="num">${c.writing}</div><div class="muted">写作话题</div></div>
      <div class="box"><div class="num">${c.translation}</div><div class="muted">翻译段落</div></div>
      <div class="box"><div class="num">${c.reading}</div><div class="muted">阅读题</div></div>
      <div class="box"><div class="num">${c.listening}</div><div class="muted">听力题</div></div>
    </div>
    <p class="muted" style="margin-top:8px">合计 ${total} 道新题，已并入主题库，可在「在线练习」按分类/年份筛选，也会进入「模拟考试」随机组卷。</p>

    <h3>🛠 如何更新题库</h3>
    <ul class="tips">
      <li><b>方式一（自动化，推荐）</b>：对助手说“更新题库”，即触发实时爬取→筛选比对→组合生成，自动产出当期新题并写入 <code>data_news.js</code> / <code>data_news.json</code>；也可在本目录手动跑完整流水线
        <code>node analyze_style.js &amp;&amp; node screen_topics.js &amp;&amp; node update_bank.js</code>（需先有 <code>topics.raw.json</code> 爬取结果）。</li>
      <li><b>方式二（免代码）</b>：把别人/自己生成的 <code>data_news.json</code> 通过下方「导入更新包」载入，
        立即并入当前练习，并随缓存持久保存（下次打开自动应用）。</li>
    </ul>
    <p class="muted">${imported}</p>
    <div class="row" style="margin-top:10px">
      <label class="btn cta sm">📥 导入更新包（data_news.json）<input type="file" accept=".json" style="display:none" onchange="importNewsFile(this.files[0])"></label>
      <button class="btn ghost sm" onclick="render('home')">返回首页</button>
    </div>
    <div id="importMsg"></div>
  </div>`;
}
/* 导入更新包 JSON：覆盖 BANK.news 并持久化 */
function importNewsFile(file){
  if(!file){ return; }
  const msg=document.getElementById("importMsg");
  const r=new FileReader();
  r.onload=()=>{
    try{
      const obj=JSON.parse(r.result);
      if(!obj || (!obj.writing && !obj.translation && !obj.reading && !obj.listening)) throw new Error("缺少 writing/translation/reading/listening 字段");
      window.BANK.news = obj;
      integrateNews();
      CACHE.settings = CACHE.settings||{};
      CACHE.settings.newsImport = obj;
      persist();
      saveToLocal({silent:true});
      const c=newsCount();
      if(msg) msg.innerHTML=`<div class="dirok" style="margin-top:10px">✅ 更新包已导入并生效：写作 ${c.writing} · 翻译 ${c.translation} · 阅读 ${c.reading} · 听力 ${c.listening}。已随缓存自动保存，下次打开仍生效。</div>`;
      toast("题库更新包已导入");
    }catch(e){
      if(msg) msg.innerHTML=`<div class="fb no" style="margin-top:10px">❌ 导入失败：${esc(e.message)}。请确认是标准的 data_news.json 更新包。</div>`;
    }
  };
  r.readAsText(file);
}

(async function boot(){
  await loadDirHandle();
  integrateNews();                                   // 并入内置时事新题
  if(CACHE.settings && CACHE.settings.newsImport){    // 若有导入的更新包，优先覆盖
    window.BANK.news = CACHE.settings.newsImport;
    integrateNews();
  }
  /* 服务器模式：启动时自动检查 cache/ 目录是否有缓存 */
  if(SERVER_MODE){
    try{
      const resp=await fetch("/api/load-cache");
      if(resp.ok){
        const txt=await resp.text();
        if(txt && !txt.includes('"error"')){
          /* 有缓存文件，提示是否导入 */
          const banner=document.createElement("div");
          banner.id="startup_banner";
          banner.className="card dirok";
          banner.style.cssText="max-width:980px;margin:8px auto;border-radius:14px;";
          banner.innerHTML=`🔁 检测到 cache/ 目录中有缓存文件。是否导入以恢复学习进度？
            <div class="row" style="margin-top:8px">
              <button class="btn sm" onclick="this.closest('.card').remove(); importLatestFromDir();">📥 导入缓存</button>
              <button class="btn ghost sm" onclick="this.closest('.card').remove();">暂不导入</button>
            </div>`;
          const wrap=document.getElementById("app");
          wrap.parentNode.insertBefore(banner, wrap);
          setTimeout(()=>{ if(banner.parentNode) banner.style.opacity=".6"; }, 5000);
        }
      }
    }catch(e){}
  }else if(DIR_HANDLE){
    /* File System Access API 模式：提示从目录导入 */
    const banner=document.createElement("div");
    banner.id="startup_banner";
    banner.className="card dirok";
    banner.style.cssText="max-width:980px;margin:8px auto;border-radius:14px;";
    banner.innerHTML=`🔁 检测到已绑定本地保存目录「${esc(DIR_HANDLE.name)}」。是否导入最新缓存？
      <div class="row" style="margin-top:8px">
        <button class="btn sm" onclick="this.closest('.card').remove(); importLatestFromDir();">📥 导入最新缓存</button>
        <button class="btn ghost sm" onclick="this.closest('.card').remove();">暂不导入</button>
      </div>`;
    const wrap=document.getElementById("app");
    wrap.parentNode.insertBefore(banner, wrap);
    setTimeout(()=>{ if(banner.parentNode) banner.style.opacity=".6"; }, 5000);
  }
  render("home");
})();
