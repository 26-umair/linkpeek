export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send("URL parameter required");
  }

  let decodedUrl = decodeURIComponent(url);
  if (!/^https?:\/\//i.test(decodedUrl)) {
    decodedUrl = "https://" + decodedUrl;
  }

  // Metadata fetch from Microlink
  let title = decodedUrl;
  let description = "Click to visit website";
  let screenshot = `https://image.thum.io/get/width/1200/crop/630/noanimate/${encodeURIComponent(decodedUrl)}`;

  try {
    const metaRes = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(decodedUrl)}&meta=true`,
      { headers: { "User-Agent": "LinkPeek/1.0" } }
    );
    const metaData = await metaRes.json();
    if (metaData.status === "success") {
      title = metaData.data?.title || title;
      description = metaData.data?.description || description;
      if (metaData.data?.screenshot?.url) {
        screenshot = metaData.data.screenshot.url;
      }
    }
  } catch (e) {}

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>

  <!-- OG Tags -->
  <meta property="og:title" content="${escHtml(title)}" />
  <meta property="og:description" content="${escHtml(description)}" />
  <meta property="og:image" content="${escHtml(screenshot)}" />
  <meta property="og:url" content="${escHtml(decodedUrl)}" />
  <meta property="og:type" content="website" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escHtml(title)}" />
  <meta name="twitter:description" content="${escHtml(description)}" />
  <meta name="twitter:image" content="${escHtml(screenshot)}" />

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a12;
      font-family: 'DM Sans', system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      overflow: hidden;
      max-width: 520px;
      width: 100%;
    }
    .thumb {
      width: 100%;
      height: 280px;
      object-fit: cover;
      object-position: top;
      display: block;
      background: #0f0f1a;
    }
    .body {
      padding: 1.5rem;
    }
    .domain {
      font-size: 12px;
      color: #a78bfa;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 1.3rem;
      font-weight: 700;
      color: #f1f5f9;
      line-height: 1.3;
      margin-bottom: 10px;
    }
    p {
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 13px;
      border-radius: 12px;
      background: linear-gradient(135deg, #7c3aed, #4f46e5);
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      margin-bottom: 12px;
    }
    .countdown {
      font-size: 12px;
      color: #475569;
      text-align: center;
    }
    #timer { color: #a78bfa; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <img class="thumb" src="${escHtml(screenshot)}" alt="${escHtml(title)}" onerror="this.style.display='none'" />
    <div class="body">
      <p class="domain">${escHtml(getDomain(decodedUrl))}</p>
      <h1>${escHtml(title)}</h1>
      <p>${escHtml(description)}</p>
      <a class="btn" href="${escHtml(decodedUrl)}" id="visitBtn">Visit Website</a>
      <p class="countdown">Automatically redirecting in <span id="timer">3</span>s</p>
    </div>
  </div>
  <script>
    let t = 3;
    const el = document.getElementById('timer');
    const interval = setInterval(() => {
      t--;
      el.textContent = t;
      if (t <= 0) {
        clearInterval(interval);
        window.location.href = "${escJs(decodedUrl)}";
      }
    }, 1000);
    document.getElementById('visitBtn').onclick = (e) => {
      e.preventDefault();
      clearInterval(interval);
      window.location.href = "${escJs(decodedUrl)}";
    };
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.status(200).send(html);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escJs(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'");
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
