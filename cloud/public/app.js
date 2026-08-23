const $ = s => document.querySelector(s);
const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const browseBtn = $('#browseBtn');
const queueSection = $('#queueSection');
const resultsSection = $('#resultsSection');
const fileList = $('#fileList');
const resultList = $('#resultList');
const convertBtn = $('#convertBtn');
const clearBtn = $('#clearBtn');
const resetBtn = $('#resetBtn');
const downloadAllBtn = $('#downloadAllBtn');
const targetKB = $('#targetKB');
const maxDimension = $('#maxDimension');
const summaryHeading = resultsSection.querySelector('.results-summary h3');
const summaryText = $('#summaryText');
let files = [];
let mode = 'smart';
let currentJob = null;

function fmtBytes(bytes){
  if(bytes===0)return '0 B';
  const u=['B','KB','MB','GB'];
  let i=Math.floor(Math.log(bytes)/Math.log(1024));
  i=Math.min(i,u.length-1);
  return `${(bytes/1024**i).toFixed(i===0?0:i===1?0:1)} ${u[i]}`;
}
function fmtDuration(ms){
  if(!Number.isFinite(ms)||ms<=0)return 'Calculating ETA…';
  const sec=Math.max(1,Math.round(ms/1000));
  if(sec<60)return `~${sec}s remaining`;
  const min=Math.floor(sec/60), rem=sec%60;
  return `~${min}m${rem?` ${rem}s`:''} remaining`;
}
function visualQualityLabel(similarity){
  const s=Number(similarity);
  if(!Number.isFinite(s))return 'Excellent';
  if(s>=0.998)return 'Excellent';
  if(s>=0.994)return 'Very high';
  if(s>=0.985)return 'High';
  return 'Good';
}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function keyFor(f){return `${f.name}-${f.size}-${f.lastModified}`}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function addFiles(newFiles){
  const map=new Map(files.map(f=>[keyFor(f),f]));
  [...newFiles].forEach(f=>map.set(keyFor(f),f));
  files=[...map.values()].slice(0,100);
  renderQueue();
}
function renderQueue(){
  $('#fileCount').textContent=files.length;
  queueSection.classList.toggle('hidden',files.length===0);
  fileList.innerHTML='';
  files.forEach((f,index)=>{
    const row=document.createElement('div');
    row.className='file-row';
    const isImage=f.type.startsWith('image/');
    const thumb=isImage?`<img class="file-thumb" alt="" src="${URL.createObjectURL(f)}">`:`<div class="file-icon">${(f.name.split('.').pop()||'IMG').toUpperCase()}</div>`;
    row.innerHTML=`${thumb}<div><div class="file-name">${escapeHtml(f.name)}</div><div class="file-meta">${fmtBytes(f.size)} • queued</div></div><button class="remove-btn" data-i="${index}">Remove</button>`;
    fileList.appendChild(row);
  });
  fileList.querySelectorAll('.remove-btn').forEach(b=>b.onclick=()=>{files.splice(+b.dataset.i,1);renderQueue()});
}

browseBtn.onclick=e=>{e.stopPropagation();fileInput.click()};
dropzone.onclick=e=>{if(e.target!==browseBtn)fileInput.click()};
dropzone.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fileInput.click()}};
fileInput.onchange=()=>{addFiles(fileInput.files);fileInput.value=''};
['dragenter','dragover'].forEach(evt=>dropzone.addEventListener(evt,e=>{e.preventDefault();dropzone.classList.add('drag')}));
['dragleave','drop'].forEach(evt=>dropzone.addEventListener(evt,e=>{e.preventDefault();dropzone.classList.remove('drag')}));
dropzone.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
clearBtn.onclick=()=>{files=[];renderQueue();resultsSection.classList.add('hidden')};
resetBtn.onclick=()=>{mode='smart';document.querySelectorAll('.mode').forEach(x=>x.classList.toggle('active',x.dataset.mode==='smart'));targetKB.value='900';maxDimension.value='0';toast('Settings reset')};
document.querySelectorAll('.mode').forEach(btn=>btn.onclick=()=>{mode=btn.dataset.mode;document.querySelectorAll('.mode').forEach(x=>x.classList.toggle('active',x===btn));if(mode==='lossless')targetKB.value='0'});

function resultRowHtml(r){
  if(!r.ok){
    return `<div class="result-row"><div><div class="file-name">${escapeHtml(r.originalName||'Image')}</div><div class="result-meta failure">${escapeHtml(r.error||'Conversion failed')}</div></div><div class="result-size failure">Failed</div><div></div></div>`;
  }
  const delta=r.savedPct>=0?`${r.savedPct.toFixed(1)}% smaller`:`${Math.abs(r.savedPct).toFixed(1)}% larger`;
  const qualityLabel=visualQualityLabel(r.similarity);
  return `<div class="result-row"><div><div class="file-name">${escapeHtml(r.outputName)}</div><div class="result-meta">${r.width||'?'} × ${r.height||'?'} • ${escapeHtml(r.kind||'image')} • Q${r.quality} • Visual quality: ${qualityLabel}</div></div><div><div class="result-size">${fmtBytes(r.inputBytes)} → ${fmtBytes(r.outputBytes)}</div><div class="saving ${r.savedPct<0?'failure':''}">${delta}</div></div><a class="download-btn" href="${r.downloadUrl}">Download</a></div>`;
}

function renderBatchProgress({results,currentName,completed,total,durations}){
  const pct=total?Math.round((completed/total)*100):0;
  const avgMs=durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:0;
  const etaMs=avgMs*Math.max(0,total-completed);
  const etaText=completed>=total?'Finishing…':fmtDuration(etaMs);
  summaryHeading.textContent='Optimization in progress';
  summaryText.textContent=`${completed} / ${total} completed • ${pct}%${completed?` • ${etaText}`:' • Calculating ETA…'}`;
  downloadAllBtn.classList.add('hidden');

  const currentBlock=completed<total&&currentName?`<div class="current-file-card"><div class="file-icon">${completed+1}</div><div><div class="file-name">Optimizing ${escapeHtml(currentName)}</div><div class="file-meta">Current image • fast visual-quality optimization</div><div class="progress"><span></span></div></div><div class="current-status">Working…</div></div>`:'';
  const completedRows=results.length?`<div class="completed-results"><div class="completed-label">Completed in this batch</div>${results.map(resultRowHtml).join('')}</div>`:'';

  resultList.innerHTML=`<div class="batch-progress-card"><div class="batch-progress-top"><div><div class="batch-progress-count">${completed} / ${total} completed</div><div class="batch-progress-eta">${completed?etaText:'ETA appears after the first image'}</div></div><div class="batch-progress-percent">${pct}%</div></div><div class="overall-progress" aria-label="Batch progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div></div>${currentBlock}${completedRows}`;
}

convertBtn.onclick=async()=>{
  if(!files.length)return;
  convertBtn.disabled=true;
  convertBtn.textContent='Optimizing…';
  resultsSection.classList.remove('hidden');
  summaryHeading.textContent='Preparing batch';
  summaryText.textContent=`0 / ${files.length} completed • Calculating ETA…`;
  downloadAllBtn.classList.add('hidden');
  resultList.innerHTML=`<div class="batch-progress-card"><div class="batch-progress-top"><div><div class="batch-progress-count">Preparing ${files.length} images…</div><div class="batch-progress-eta">Starting secure temporary processing</div></div><div class="batch-progress-percent">0%</div></div><div class="overall-progress"><span style="width:0%"></span></div></div>`;
  resultsSection.scrollIntoView({behavior:'smooth',block:'start'});

  try{
    const jobResp=await fetch('/api/jobs',{method:'POST'});
    const job=await jobResp.json();
    if(!jobResp.ok)throw new Error(job.error||'Could not start batch');
    const results=[];
    const durations=[];

    for(let i=0;i<files.length;i++){
      const f=files[i];
      renderBatchProgress({results,currentName:f.name,completed:i,total:files.length,durations});
      const itemStarted=performance.now();
      const params=new URLSearchParams({filename:f.name,mode,targetKB:targetKB.value,maxDimension:maxDimension.value});
      const r=await fetch(`/api/jobs/${job.jobId}/convert?${params}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:f});
      const data=await r.json();
      if(!r.ok&&!data.originalName)data.originalName=f.name;
      durations.push(performance.now()-itemStarted);
      results.push(data);

      const nextName=files[i+1]?.name||'';
      renderBatchProgress({results,currentName:nextName,completed:i+1,total:files.length,durations});
    }

    currentJob={jobId:job.jobId,zipUrl:`/api/jobs/${job.jobId}/download-all`,results};
    renderResults(results);
  }catch(e){
    summaryHeading.textContent='Optimization failed';
    summaryText.textContent='The batch stopped before completion.';
    resultList.innerHTML=`<div class="file-row"><div class="file-icon">!</div><div><div class="file-name failure">Conversion failed</div><div class="file-meta">${escapeHtml(e.message)}</div></div><div></div></div>`;
    toast(e.message);
  }finally{
    convertBtn.disabled=false;
    convertBtn.textContent='Convert & Optimize';
  }
};

function renderResults(results){
  resultList.innerHTML='';
  const good=results.filter(x=>x.ok);
  const before=good.reduce((s,x)=>s+x.inputBytes,0);
  const after=good.reduce((s,x)=>s+x.outputBytes,0);
  const pct=before?((1-after/before)*100):0;
  summaryHeading.textContent='Optimization complete';
  summaryText.textContent=`${fmtBytes(before)} → ${fmtBytes(after)} • ${pct.toFixed(1)}% total saved`;
  downloadAllBtn.classList.toggle('hidden',good.length===0);
  results.forEach(r=>resultList.insertAdjacentHTML('beforeend',resultRowHtml(r)));
}

downloadAllBtn.onclick=()=>{if(currentJob)location.href=currentJob.zipUrl};

(async function status(){
  try{
    const r=await fetch('/api/status');
    const s=await r.json();
    $('#statusPill').classList.add('ok');
    $('#statusText').textContent=s.imageMagick?'Image engine ready':'Engine unavailable';
    $('#engineNote').textContent=s.imageMagick?`Extended decoder ready${s.enabledFormats?.length?` • ${s.enabledFormats.join(', ')}`:''}. Maximum file size: ${s.maxFileMB} MB.`:`Image engine unavailable. Maximum file size: ${s.maxFileMB||500} MB.`;
  }catch{
    $('#statusText').textContent='Cloud engine unavailable';
  }
})();
