export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send("URL parameter required");
  }

  let decodedUrl = decodeURIComponent(url);
  if (!/^https?:\/\//i.test(decodedUrl)) {
    decodedUrl = "https://" + decodedUrl;
  }

  let title = getDomain(decodedUrl);
  let description = "Click to visit website";
  let screenshot = `https://image.thum.io/get/width/1200/crop/630/noanimate/viewportWidth/1280/${encodeURIComponent(decodedUrl)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const metaRes = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(decodedUrl)}&screenshot=true&meta=true`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const metaData = await metaRes.json();
    if (metaData.status === "success") {
      title = metaData.data?.title || title;
      description = metaData.data?.description || description;
      if (metaData.data?.screenshot?.url) {
        screenshot = metaData.data.screenshot.url;
      } else if (metaData.data?.image?.url) {
        screenshot = metaData.data.image.url;
      }
    }
  } catch (e) {}

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <meta property="og:title" content="${escHtml(title)}" />
  <meta property="og:description" content="${escHtml(description)}" />
  <meta property="og:image" content="${escHtml(screenshot)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${escHtml(decodedUrl)}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escHtml(title)}" />
  <meta name="twitter:description" content="${escHtml(description)}" />
  <meta name="twitter:image" content="${escHtml(screenshot)}" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#0a0a12;font-family:'DM Sans',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;}
    .blob1{position:fixed;top:-150px;right:-150px;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(109,40,217,0.2) 0%,transparent 70%);pointer-events:none;}
    .blob2{position:fixed;bottom:-150px;left:-100px;width:350px;height:350px;border-radius:50%;background:radial-gradient(circle,rgba(16,185,129,0.12) 0%,transparent 70%);pointer-events:none;}
    .card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;max-width:540px;width:100%;position:relative;z-index:1;}
    .thumb-wrap{width:100%;height:290px;background:#0f0f1a;position:relative;overflow:hidden;}
    .thumb-wrap img{width:100%;height:100%;object-fit:cover;object-position:top;display:block;}
    .thumb-overlay{position:absolute;bottom:0;left:0;right:0;height:80px;background:linear-gradient(to top,rgba(10,10,18,0.95),transparent);}
    .no-img{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1e1b4b,#0f172a);}
    .no-img span{font-size:3rem;opacity:0.3;}
    .body{padding:1.5rem 1.75rem 1.75rem;}
    .domain{font-size:11px;color:#a78bfa;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:10px;}
    h1{font-size:1.35rem;font-weight:700;color:#f1f5f9;line-height:1.3;margin-bottom:10px;}
    p{font-size:14px;color:#94a3b8;line-height:1.65;margin-bottom:1.5rem;}
    .btn{display:block;width:100%;padding:14px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-size:15px;font-weight:600;text-align:center;text-decoration:none;margin-bottom:14px;box-shadow:0 4px 20px rgba(124,58,237,0.35);}
    .countdown{font-size:12px;color:#334155;text-align:center;}
    #timer{color:#a78bfa;font-weight:600;}
  </style>
</head>
<body>
  <div class="blob1"></div>
  <div class="blob2"></div>
  <div class="card">
    <div class="thumb-wrap">
      <img src="${escHtml(screenshot)}" alt="${escHtml(title)}" id="thumbImg" onerror="document.getElementById('thumbImg').style.display='none';document.getElementById('noImg').style.display='flex';" />
      <div class="no-img" id="noImg" style="display:none;"><span>&#127760;</span></div>
      <div class="thumb-overlay"></div>
    </div>
    <div class="body">
      <p class="domain">${escHtml(getDomain(decodedUrl))}</p>
      <h1>${escHtml(title)}</h1>
      <p>${escHtml(description)}</p>
      <a class="btn" href="${escHtml(decodedUrl)}" id="visitBtn">Visit Website &rarr;</a>
      <p class="countdown">Automatically redirecting in <span id="timer">3</span>s</p>
    </div>
  </div>
  <script>
    let t=3;
    const el=document.getElementById('timer');
    const iv=setInterval(()=>{t--;el.textContent=t;if(t<=0){clearInterval(iv);window.location.href="${escJs(decodedUrl)}"}},1000);
    document.getElementById('visitBtn').onclick=e=>{e.preventDefault();clearInterval(iv);window.location.href="${escJs(decodedUrl)}"};
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.status(200).send(html);
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function escJs(str) {
  return String(str).replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/'/g,"\\'");
}
function getDomain(url) {
  try{return new URL(url).hostname.replace(/^www\./,"");}catch{return url;}
}
