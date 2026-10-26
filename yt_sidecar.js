process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const http=require("http"),https=require("https");
const {execFileSync}=require("child_process");
const fs=require("fs"),path=require("path"),os=require("os");
const PORT = 7890;
const YTDLP_CANDIDATES = [
  path.join(__dirname, "yt-dlp.exe"),
  "C:/Users/csnga/.gemini/antigravity/brain/f3411c24-0958-4516-8fb2-3e79fee3149b/scratch/yt-dlp.exe",
  "yt-dlp"
];
const YTDLP = YTDLP_CANDIDATES.find(p => {
  try { return fs.existsSync(p); } catch(_) { return false; }
}) || "yt-dlp";
const HOST_SB="knwpgznnipufvwobgrzf.supabase.co";
const KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtud3Bnem5uaXB1ZnZ3b2JncnpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjc2NTkxMywiZXhwIjoyMDg4MzQxOTEzfQ.dyZVQRJ0IhG1VE7IL4rVLmb_-H4WeNoC2APyEfEdTk0";
const BUCKET="songs-audio";
const TMPDIR=path.join(os.tmpdir(),"hms_yt_sidecar");
if(!fs.existsSync(TMPDIR))fs.mkdirSync(TMPDIR,{recursive:true});

function sbReq(opts,body){
  return new Promise((resolve,reject)=>{
    const r=https.request({...opts,hostname:HOST_SB,rejectUnauthorized:false},res=>{
      let d="";res.on("data",c=>d+=c);
      res.on("end",()=>resolve({status:res.statusCode,body:d}));
    });
    r.on("error",reject);
    if(body)r.write(body);
    r.end();
  });
}
async function uploadFile(fp,sn,ct){
  const c=fs.readFileSync(fp);
  return sbReq({path:"/storage/v1/object/"+BUCKET+"/"+encodeURIComponent(sn),method:"POST",
    headers:{"Authorization":"Bearer "+KEY,"Content-Type":ct||"audio/mp4","Content-Length":c.length,"x-upsert":"true"}},c);
}
async function updateDB(id,url){
  const b=JSON.stringify({audio_url:url});
  return sbReq({path:"/rest/v1/songs?id=eq."+id,method:"PATCH",
    headers:{"apikey":KEY,"Authorization":"Bearer "+KEY,"Content-Type":"application/json","Content-Length":Buffer.byteLength(b),"Prefer":"return=minimal"}},b);
}
function ytSearch(title,artist){
  const q=title+" "+artist;
  const out=execFileSync(YTDLP,["ytsearch1:"+q,"--print","%(title)s|||%(webpage_url)s|||%(duration)s",
    "--no-playlist","--skip-download","--quiet","--no-warnings","--no-check-certificates"],
    {timeout:20000,encoding:"utf8"}).trim();
  const p=out.split("|||");
  if(p.length<2)throw new Error("Nenhum resultado no YouTube");
  return{ytTitle:p[0],url:p[1],duration:parseInt(p[2]||"0")};
}
async function downloadAndUpload(songId,ytUrl){
  fs.readdirSync(TMPDIR).filter(f=>f.startsWith(songId)).forEach(f=>{try{fs.unlinkSync(path.join(TMPDIR,f));}catch(_){}});
  execFileSync(YTDLP,[ytUrl,"--format","bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
    "--output",path.join(TMPDIR,songId+".%(ext)s"),
    "--no-playlist","--quiet","--no-warnings","--no-check-certificates"],{timeout:120000});
  const files=fs.readdirSync(TMPDIR).filter(f=>f.startsWith(songId));
  if(!files.length)throw new Error("Arquivo nao gerado pelo yt-dlp");
  const fp=path.join(TMPDIR,files[0]);
  const ext=path.extname(files[0]).slice(1)||"m4a";
  const sn=songId+"."+ext;
  const ct=ext==="webm"?"audio/webm":"audio/mp4";
  const pu="https://"+HOST_SB+"/storage/v1/object/public/"+BUCKET+"/"+encodeURIComponent(sn);
  const up=await uploadFile(fp,sn,ct);
  if(up.status>=400&&!up.body.includes("already exists"))throw new Error("Upload erro "+up.status+": "+up.body.slice(0,80));
  const db=await updateDB(songId,pu);
  if(db.status>=400)throw new Error("DB erro "+db.status+": "+db.body.slice(0,80));
  try{fs.unlinkSync(fp);}catch(_){}
  return{publicUrl:pu,storageName:sn};
}
const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type",
  "Access-Control-Allow-Private-Network":"true",
  "Content-Type":"application/json"
};
function sj(res,s,d){res.writeHead(s,CORS);res.end(JSON.stringify(d));}

function htmlPage(title, body) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>HMS YouTube</title>
<style>body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}
.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:32px 40px;max-width:480px;width:100%;text-align:center}
h2{margin:0 0 8px;font-size:1.2rem;color:#e6edf3}
p{color:#8b949e;font-size:.9rem;margin:8px 0}
.ok{color:#3fb950;font-size:2rem;margin:16px 0}
.err{color:#f85149;font-size:2rem;margin:16px 0}
.url{font-size:.75rem;word-break:break-all;background:#0d1117;padding:8px;border-radius:6px;margin-top:12px;color:#58a6ff}
.spin{width:32px;height:32px;border:3px solid #30363d;border-top-color:#58a6ff;border-radius:50%;animation:s 0.8s linear infinite;margin:16px auto}
@keyframes s{to{transform:rotate(360deg)}}</style></head>
<body><div class="card"><h2>${title}</h2>${body}</div></body></html>`;
}

http.createServer(async(req,res)=>{
  const ts=new Date().toLocaleTimeString("pt-BR");
  const u=new URL(req.url,"http://localhost:"+PORT);
  console.log("["+ts+"] "+req.method+" "+u.pathname);

  // OPTIONS preflight (Chrome PNA)
  if(req.method==="OPTIONS"){
    res.writeHead(204,{...CORS,"Access-Control-Allow-Private-Network":"true"});
    res.end();
    return;
  }

  // ── GET /ping ──
  if(req.method==="GET"&&u.pathname==="/ping"){sj(res,200,{ok:true,v:2});return;}

  // ── GET /ui?songId=...&title=...&artist=... ──
  // Abre em nova aba do browser, sem CORS. Processa e mostra resultado.
  if(req.method==="GET"&&u.pathname==="/ui"){
    const songId = u.searchParams.get("songId")||"";
    const title  = u.searchParams.get("title")||"";
    const artist = u.searchParams.get("artist")||"";
    if(!songId||!title){
      res.writeHead(400,{"Content-Type":"text/html;charset=utf-8"});
      res.end(htmlPage("Erro","<div class='err'>✗</div><p>Parâmetros inválidos</p>"));
      return;
    }

    // Responde imediatamente com página de loading, depois faz o processamento
    // Usa streaming para mostrar progresso
    res.writeHead(200,{"Content-Type":"text/html;charset=utf-8"});
    res.write(htmlPage(
      `🎵 ${title}`,
      `<div class="spin"></div><p>Buscando no YouTube e baixando…</p><p style="font-size:.75rem;color:#8b949e">Aguarde, isso pode levar até 1 minuto</p>`
    ).replace("</body></html>",""));

    let ok=false, publicUrl="", errMsg="";
    try{
      const s=ytSearch(title,artist);
      console.log("[YT] Encontrado: "+s.ytTitle);
      const r=await downloadAndUpload(songId,s.url);
      publicUrl=r.publicUrl;
      ok=true;
      console.log("[OK] "+title+" → "+publicUrl);
    }catch(e){
      errMsg=e.message;
      console.log("[ERRO] "+errMsg);
    }

    if(ok){
      res.write(`<script>
        document.querySelector('.card').innerHTML=
          '<h2>✅ Vinculado com sucesso!</h2>'+
          '<div class="ok">🎵</div>'+
          '<p>${title.replace(/'/g,"\\'")} agora tem áudio no HMS.</p>'+
          '<p class="url">${publicUrl}</p>'+
          '<p style="margin-top:20px;font-size:.8rem;color:#8b949e">Pode fechar esta aba e recarregar o HMS.</p>';
      </script></body></html>`);
    }else{
      res.write(`<script>
        document.querySelector('.card').innerHTML=
          '<h2>❌ Erro</h2>'+
          '<div class="err">✗</div>'+
          '<p>${errMsg.replace(/'/g,"\\'").replace(/\n/g," ")}</p>'+
          '<p style="margin-top:16px"><a href="javascript:history.back()" style="color:#58a6ff">← Voltar</a></p>';
      </script></body></html>`);
    }
    res.end();
    return;
  }

  // ── POST /download (fallback JSON) ──
  if(req.method==="POST"&&u.pathname==="/download"){
    let b="";req.on("data",c=>b+=c);
    req.on("end",async()=>{
      try{
        const{songId,title,artist,ytUrl}=JSON.parse(b);
        if(!songId||!title){sj(res,400,{error:"songId e title obrigatorios"});return;}
        const ru=ytUrl||ytSearch(title,artist).url;
        const r=await downloadAndUpload(songId,ru);
        sj(res,200,r);
      }catch(e){sj(res,500,{error:e.message});}
    });
    return;
  }

  sj(res,404,{error:"not found"});
}).listen(PORT,"0.0.0.0",()=>{
  console.log("HMS YouTube Sidecar v3 em http://localhost:"+PORT);
  console.log("Mantenha esta janela aberta enquanto usar o HMS.");
});