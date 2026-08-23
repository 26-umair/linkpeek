import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { optimizeToWebP, hasImageMagick, getEnabledFormats } from './optimizer.js';
import { createZip } from './zip.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const TEMP = path.join(ROOT, 'temp');
const PORT = Number(process.env.PORT || 4173);
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_MB || 500) * 1024 * 1024;
const JOB_TTL = 30 * 60 * 1000;
const BASIC_USER = process.env.BASIC_USER || '';
const BASIC_PASS = process.env.BASIC_PASS || '';

function isAuthorized(req) {
  if (!BASIC_USER || !BASIC_PASS) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const [user, pass] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
    return user === BASIC_USER && pass === BASIC_PASS;
  } catch { return false; }
}
function requireAuth(req, res) {
  if (isAuthorized(req)) return true;
  res.writeHead(401, {'WWW-Authenticate':'Basic realm="WebP Optimizer"','Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
  res.end('Authentication required.'); return false;
}
await fsp.mkdir(TEMP, { recursive: true });
function json(res, code, data) { const body=Buffer.from(JSON.stringify(data)); res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store'}); res.end(body); }
function safeName(name){return path.basename(name||'image').replace(/[^a-zA-Z0-9._()\- ]+/g,'_').slice(0,180)||'image'}
function safeBase(name){return path.basename(safeName(name),path.extname(name)).trim()||'image'}
function mime(file){const ext=path.extname(file).toLowerCase();return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}[ext]||'application/octet-stream')}
async function serveStatic(req,res,pathname){const rel=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');const full=path.resolve(PUBLIC,rel);if(!full.startsWith(PUBLIC))return false;try{const data=await fsp.readFile(full);res.writeHead(200,{'Content-Type':mime(full),'Content-Length':data.length,'Cache-Control':'no-cache'});res.end(data);return true}catch{return false}}
async function saveBody(req,dest){const fh=await fsp.open(dest,'w');let total=0;try{for await(const chunk of req){total+=chunk.length;if(total>MAX_FILE_BYTES)throw Object.assign(new Error(`File exceeds ${Math.round(MAX_FILE_BYTES/1024/1024)} MB limit.`),{status:413});await fh.write(chunk)}}catch(e){await fsp.rm(dest,{force:true}).catch(()=>{});throw e}finally{await fh.close()}if(!total)throw Object.assign(new Error('Empty file received.'),{status:400});return total}
async function uniqueOutput(dir,base){let name=`${base}.webp`,n=2;while(fs.existsSync(path.join(dir,name)))name=`${base}-${n++}.webp`;return name}
function sendFile(res,filePath,downloadName,type='application/octet-stream'){fs.stat(filePath,(err,stat)=>{if(err)return json(res,404,{error:'File expired or not found.'});res.writeHead(200,{'Content-Type':type,'Content-Length':stat.size,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,'Cache-Control':'no-store'});fs.createReadStream(filePath).pipe(res)})}

const server=http.createServer(async(req,res)=>{
  if(!requireAuth(req,res))return;
  const url=new URL(req.url,`http://${req.headers.host||'127.0.0.1'}`);const p=url.pathname;
  try{
    if(p==='/api/status'&&req.method==='GET'){const imageMagick=await hasImageMagick();return json(res,200,{ok:imageMagick,processingMode:'private-cloud',imageMagick,maxFileMB:Math.round(MAX_FILE_BYTES/1024/1024),enabledFormats:imageMagick?await getEnabledFormats():[]})}
    if(p==='/api/jobs'&&req.method==='POST'){const id=crypto.randomUUID();await fsp.mkdir(path.join(TEMP,id,'input'),{recursive:true});await fsp.mkdir(path.join(TEMP,id,'output'),{recursive:true});return json(res,201,{jobId:id})}
    let m=p.match(/^\/api\/jobs\/([a-f0-9-]+)\/convert$/i);
    if(m&&req.method==='POST'){
      if(!(await hasImageMagick()))return json(res,503,{error:'Image processing engine is unavailable.'});
      const jobId=m[1],job=path.join(TEMP,jobId),inputDir=path.join(job,'input'),outputDir=path.join(job,'output');
      await fsp.access(job).catch(()=>{throw Object.assign(new Error('Job expired or not found.'),{status:404})});
      const originalName=safeName(url.searchParams.get('filename')||'image');
      const inputName=`${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${originalName}`;
      const inputPath=path.join(inputDir,inputName);await saveBody(req,inputPath);
      const outputName=await uniqueOutput(outputDir,safeBase(originalName)),outputPath=path.join(outputDir,outputName);
      try{
        const result=await optimizeToWebP({inputPath,outputPath,mode:['smart','maximum','smallest','lossless'].includes(url.searchParams.get('mode'))?url.searchParams.get('mode'):'smart',targetKB:Math.max(0,Number(url.searchParams.get('targetKB')||900)),maxDimension:Math.max(0,Number(url.searchParams.get('maxDimension')||0))});
        return json(res,200,{ok:true,originalName,outputName,...result,downloadUrl:`/api/jobs/${jobId}/files/${encodeURIComponent(outputName)}`});
      }catch(e){await fsp.rm(outputPath,{force:true}).catch(()=>{});return json(res,422,{ok:false,originalName,error:e.message||'Conversion failed.'})}
    }
    m=p.match(/^\/api\/jobs\/([a-f0-9-]+)\/files\/([^/]+)$/i);if(m&&req.method==='GET'){const file=path.join(TEMP,m[1],'output',safeName(decodeURIComponent(m[2])));return sendFile(res,file,path.basename(file),'image/webp')}
    m=p.match(/^\/api\/jobs\/([a-f0-9-]+)\/download-all$/i);if(m&&req.method==='GET'){const outputDir=path.join(TEMP,m[1],'output');const names=await fsp.readdir(outputDir).catch(()=>null);if(!names)return json(res,404,{error:'Job expired or not found.'});const webps=names.filter(n=>n.toLowerCase().endsWith('.webp'));if(!webps.length)return json(res,404,{error:'No converted images found.'});const zipPath=path.join(TEMP,m[1],'webp-optimized-images.zip');await createZip(webps.map(name=>({name,path:path.join(outputDir,name)})),zipPath);return sendFile(res,zipPath,'webp-optimized-images.zip','application/zip')}
    m=p.match(/^\/api\/jobs\/([a-f0-9-]+)$/i);if(m&&req.method==='DELETE'){await fsp.rm(path.join(TEMP,m[1]),{recursive:true,force:true});return json(res,200,{ok:true})}
    if(req.method==='GET'&&await serveStatic(req,res,p))return;json(res,404,{error:'Not found.'});
  }catch(e){json(res,e.status||500,{error:e.message||'Unexpected error.'})}
});
async function cleanup(){try{const now=Date.now();for(const e of await fsp.readdir(TEMP,{withFileTypes:true})){if(!e.isDirectory())continue;const full=path.join(TEMP,e.name),stat=await fsp.stat(full);if(now-stat.mtimeMs>JOB_TTL)await fsp.rm(full,{recursive:true,force:true})}}catch{}}
setInterval(cleanup,5*60*1000).unref();cleanup();
server.listen(PORT,'0.0.0.0',()=>console.log(`WebP Optimizer running on port ${PORT}`));
