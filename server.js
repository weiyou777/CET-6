/* 英语六级真题题库 · 本地静态服务器
 * 作用：用 http://localhost 方式打开题库，使浏览器的「文件系统访问 API」可用，
 *       从而实现：关闭程序时自动把「缓存文件_时间.json」静默写入项目根目录。
 *
 * 启动方式（在本文件夹内运行）：
 *   node server.js
 * 然后用 Chrome / Edge 打开终端里打印的地址（默认 http://localhost:8765/ ）。
 *
 * 说明：本脚本只用 __dirname（相对当前目录），不含任何中文路径硬编码，
 *       因此不会出现 CMD 批处理乱码问题。
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8765;
const INDEX = "英语六级真题题库.html";
const CACHE_DIR = path.join(ROOT, "cache");   // 缓存目录（英文，避免编码问题）

/* 确保缓存目录存在 */
try{ if(!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, {recursive:true}); }catch(e){ console.error("创建cache目录失败:", e.message); }

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

function safeJoin(root, reqPath){
  const p = decodeURIComponent(reqPath.split("?")[0]);
  let rel = path.normalize(p).replace(/^([/\\])+/, "");
  if(rel.includes("..")) return null;             // 防目录穿越
  return path.join(root, rel);
}

const server = http.createServer((req, res)=>{
  let urlPath = req.url;
  const method = req.method;

  /* ---- API: 保存缓存到 cache/ 目录 ---- */
  if(method==="POST" && urlPath.startsWith("/api/save-cache")){
    let body="";
    req.on("data", chunk=>{ body+=chunk; if(body.length>20*1024*1024){ res.writeHead(413); res.end('{"error":"too large"}'); req.destroy(); } });
    req.on("end", ()=>{
      try{
        const now=new Date();
        const p=n=>String(n).padStart(2,"0");
        const stamp=now.getFullYear()+"-"+p(now.getMonth()+1)+"-"+p(now.getDate())+"_"+p(now.getHours())+"-"+p(now.getMinutes())+"-"+p(now.getSeconds());
        const fname="cache_"+stamp+".json";
        const fpath=path.join(CACHE_DIR, fname);
        fs.writeFileSync(fpath, body, "utf8");
        /* 同时写一份 latest.json 方便快速恢复 */
        fs.writeFileSync(path.join(CACHE_DIR, "latest.json"), body, "utf8");
        res.writeHead(200, {"Content-Type":"application/json; charset=utf-8"});
        res.end(JSON.stringify({ok:true, file:fname, dir:"cache"}));
      }catch(e){
        res.writeHead(500, {"Content-Type":"application/json; charset=utf-8"});
        res.end(JSON.stringify({ok:false, error:e.message}));
      }
    });
    return;
  }

  /* ---- API: 读取最新缓存 ---- */
  if(method==="GET" && urlPath.startsWith("/api/load-cache")){
    try{
      const latestPath=path.join(CACHE_DIR, "latest.json");
      if(fs.existsSync(latestPath)){
        const data=fs.readFileSync(latestPath, "utf8");
        res.writeHead(200, {"Content-Type":"application/json; charset=utf-8"});
        res.end(data);
      }else{
        /* 尝试找最新的 cache_*.json */
        const files=fs.readdirSync(CACHE_DIR).filter(f=>f.startsWith("cache_")&&f.endsWith(".json"))
          .map(f=>({f, m:fs.statSync(path.join(CACHE_DIR,f)).mtimeMs}))
          .sort((a,b)=>b.m-a.m);
        if(files.length){
          const data=fs.readFileSync(path.join(CACHE_DIR, files[0].f), "utf8");
          res.writeHead(200, {"Content-Type":"application/json; charset=utf-8"});
          res.end(data);
        }else{
          res.writeHead(404, {"Content-Type":"application/json; charset=utf-8"});
          res.end('{"ok":false,"error":"no cache file"}');
        }
      }
    }catch(e){
      res.writeHead(500, {"Content-Type":"application/json; charset=utf-8"});
      res.end(JSON.stringify({ok:false, error:e.message}));
    }
    return;
  }

  /* ---- API: 列出所有缓存文件 ---- */
  if(method==="GET" && urlPath.startsWith("/api/list-cache")){
    try{
      const files=fs.readdirSync(CACHE_DIR).filter(f=>(f.startsWith("cache_")||f==="latest.json")&&f.endsWith(".json"))
        .map(f=>{ const st=fs.statSync(path.join(CACHE_DIR,f)); return {name:f, size:st.size, mtime:st.mtime.toISOString()}; })
        .sort((a,b)=>new Date(b.mtime)-new Date(a.mtime));
      res.writeHead(200, {"Content-Type":"application/json; charset=utf-8"});
      res.end(JSON.stringify({ok:true, dir:"cache", files:files}));
    }catch(e){
      res.writeHead(500, {"Content-Type":"application/json; charset=utf-8"});
      res.end(JSON.stringify({ok:false, error:e.message}));
    }
    return;
  }

  /* ---- 静态文件服务 ---- */
  if(urlPath === "/" || urlPath === "") urlPath = "/" + INDEX;
  const file = safeJoin(ROOT, urlPath);
  if(!file){ res.writeHead(403); res.end("403 Forbidden"); return; }
  fs.stat(file, (err, st)=>{
    if(err || !st.isFile()){
      // 404 时回落到首页（单页应用风格），便于直接访问
      res.writeHead(404, {"Content-Type":"text/plain; charset=utf-8"});
      res.end("404 Not Found: " + path.basename(file));
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {"Content-Type": MIME[ext] || "application/octet-stream"});
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, "127.0.0.1", ()=>{
  const url = "http://localhost:" + PORT + "/";
  console.log("==================================================");
  console.log("  英语六级真题题库 已启动");
  console.log("  请用 Chrome / Edge 打开： " + url);
  console.log("  缓存自动保存到项目根目录/cache/ 文件夹，无需手动设置。");
  console.log("  关闭程序/每轮练习结束都会自动写入 cache/cache_时间.json。");
  console.log("  按 Ctrl+C 停止服务。");
  console.log("==================================================");
});

server.on("error", (e)=>{
  if(e.code === "EADDRINUSE"){
    console.error("端口 " + PORT + " 被占用，请换一个端口：PORT=9000 node server.js");
  }else{
    console.error("启动失败：", e.message);
  }
});
