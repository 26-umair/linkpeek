import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

async function magick(args, options = {}) {
  try {
    return await execFileAsync('magick', args, {
      windowsHide: true,
      timeout: options.timeout || 180000,
      maxBuffer: options.maxBuffer || 8 * 1024 * 1024
    });
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message || '').trim();
    throw new Error(detail || 'ImageMagick command failed.');
  }
}

export async function hasImageMagick() {
  try {
    const { stdout } = await magick(['-version'], { timeout: 5000 });
    return /ImageMagick/i.test(stdout);
  } catch { return false; }
}

export async function getEnabledFormats() {
  try {
    const { stdout } = await magick(['identify', '-list', 'format'], { timeout: 12000 });
    const wanted = ['JPEG','PNG','WEBP','AVIF','HEIC','HEIF','TIFF','GIF','SVG','PSD','DNG','CR2','CR3','NEF','ARW','RAF','ORF','RW2','ICO','BMP'];
    return wanted.filter(fmt => new RegExp(`^\\s*${fmt}\\*?\\s`, 'mi').test(stdout));
  } catch { return []; }
}

function modeConfig(mode) {
  if (mode === 'maximum') return { qualities: [98, 96, 94, 92], threshold: 0.997, method: 5 };
  if (mode === 'smallest') return { qualities: [84, 76, 68, 60, 52], threshold: 0.975, method: 3 };
  return { qualities: [94, 90, 86, 82, 78, 74], threshold: 0.990, method: 4 };
}

async function identify(inputPath) {
  const probe = `${inputPath}[0]`;
  const { stdout } = await magick(['identify', '-quiet', '-format', '%m|%w|%h|%[channels]|%[entropy]', probe], { timeout: 60000 });
  const [format, w, h, channels, entropy] = stdout.trim().split('|');
  let frames = 1;
  if (String(format).toUpperCase() === 'GIF') {
    try {
      const seq = await magick(['identify', '-ping', '-format', '%p\n', inputPath], { timeout: 60000 });
      frames = Math.max(1, seq.stdout.trim().split(/\r?\n/).filter(Boolean).length);
    } catch {}
  }
  return {
    format: format || path.extname(inputPath).slice(1).toUpperCase(),
    width: Number(w) || null,
    height: Number(h) || null,
    channels: channels || '',
    entropy: Number(entropy),
    frames,
    alpha: /a/i.test(channels || '')
  };
}

function classify(meta) {
  const format = String(meta.format || '').toUpperCase();
  const graphicFormats = new Set(['SVG', 'ICO']);
  const graphic = graphicFormats.has(format) || (format === 'PNG' && Number.isFinite(meta.entropy) && meta.entropy < 0.72);
  return graphic ? 'graphic' : 'photo';
}

function resizeArgs(meta, maxDimension) {
  if (!maxDimension || !meta.width || !meta.height || Math.max(meta.width, meta.height) <= maxDimension) return [];
  return ['-resize', `${maxDimension}x${maxDimension}>`];
}

async function makeReferencePreview(inputPath, outPath) {
  await magick([
    `${inputPath}[0]`, '-auto-orient', '-colorspace', 'sRGB',
    '-resize', '512x512>', '-background', 'white', '-alpha', 'background', '-alpha', 'off', '-strip', outPath
  ], { timeout: 90000 });
}

async function encodePreview(referencePath, outPath, quality, mode, kind, method) {
  const args = [referencePath, '-strip'];
  if (mode === 'lossless') {
    args.push('-define', 'webp:lossless=true', '-define', `webp:method=${method}`);
  } else {
    args.push('-quality', String(quality), '-define', `webp:method=${method}`);
    if (kind === 'graphic' && mode !== 'smallest') args.push('-define', 'webp:near-lossless=true');
    if (kind === 'photo') args.push('-define', 'webp:image-hint=photo');
  }
  args.push(outPath);
  await magick(args, { timeout: 60000 });
}

async function compareSSIM(referencePath, candidatePath) {
  try {
    await execFileAsync('magick', ['compare', '-metric', 'SSIM', referencePath, candidatePath, 'null:'], {
      windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024
    });
    return 1;
  } catch (error) {
    const text = String(error.stderr || error.stdout || '').trim();
    const paren = text.match(/\(([-+0-9.eE]+)\)/);
    const first = text.match(/^\s*([-+0-9.eE]+)/);
    const dissimilarity = Number(paren ? paren[1] : (first ? first[1] : NaN));
    return Number.isFinite(dissimilarity) ? Math.max(0, Math.min(1, 1 - dissimilarity)) : 0;
  }
}

async function chooseQuality(referencePath, tempDir, mode, kind) {
  const { qualities, threshold, method } = modeConfig(mode);
  let best = { quality: qualities[0], similarity: 1 };
  for (const quality of qualities) {
    const candidate = path.join(tempDir, `preview-q${quality}.webp`);
    await encodePreview(referencePath, candidate, quality, mode, kind, method);
    const similarity = await compareSSIM(referencePath, candidate);
    await fs.rm(candidate, { force: true }).catch(() => {});
    if (similarity >= threshold) best = { quality, similarity };
    else break;
  }
  return { ...best, method };
}

async function encodeFinal(inputPath, outPath, quality, mode, kind, alpha, meta, maxDimension, method) {
  const args = [];
  if (meta.frames > 1 && String(meta.format).toUpperCase() === 'GIF') {
    args.push(inputPath, '-coalesce', '-auto-orient', '-colorspace', 'sRGB');
  } else {
    args.push(`${inputPath}[0]`, '-auto-orient', '-colorspace', 'sRGB');
  }
  args.push(...resizeArgs(meta, maxDimension), '-strip');

  if (mode === 'lossless') {
    args.push('-define', 'webp:lossless=true', '-define', 'webp:method=5');
  } else {
    args.push('-quality', String(quality), '-define', `webp:method=${method}`);
    if (alpha) args.push('-define', 'webp:alpha-quality=100');
    if (kind === 'graphic' && mode !== 'smallest') args.push('-define', 'webp:near-lossless=true');
    if (kind === 'photo') args.push('-define', 'webp:image-hint=photo');
  }
  args.push(outPath);
  await magick(args, { timeout: 300000 });
}

export async function optimizeToWebP({ inputPath, outputPath, mode = 'smart', targetKB = 900, maxDimension = 0 }) {
  const originalStat = await fs.stat(inputPath);
  const meta = await identify(inputPath);
  const kind = classify(meta);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webp-opt-'));
  const reference = path.join(tempDir, 'reference.png');

  try {
    let quality = 100;
    let similarity = 1;
    let method = 5;

    if (mode !== 'lossless') {
      await makeReferencePreview(inputPath, reference);
      const picked = await chooseQuality(reference, tempDir, mode, kind);
      quality = picked.quality;
      similarity = picked.similarity;
      method = picked.method;
    }

    await encodeFinal(inputPath, outputPath, quality, mode, kind, meta.alpha, meta, Number(maxDimension) || 0, method);
    const stat = await fs.stat(outputPath);
    const out = await identify(outputPath);

    return {
      inputBytes: originalStat.size,
      outputBytes: stat.size,
      savedPct: originalStat.size ? (1 - stat.size / originalStat.size) * 100 : 0,
      originalWidth: meta.width,
      originalHeight: meta.height,
      width: out.width,
      height: out.height,
      inputFormat: meta.format,
      frames: meta.frames,
      alpha: meta.alpha,
      kind,
      quality,
      similarity,
      targetKB: Number(targetKB) || 0,
      fastSmart: mode !== 'lossless'
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
