/**
 * 正文提取服务：
 * 1. 抓取目标网页（超时/大小上限/安全校验）
 * 2. 优先使用 Mozilla Readability 提取正文 + 文章配图
 * 3. 失败时降级为启发式段落提取
 * 4. SPA / 登录页 / 空正文返回结构化错误码，由前端降级为手动粘贴模式
 */
// linkedom 的 CJS 构建会 require 纯 ESM 的 css-select@7，在不支持 require(esm) 的
// 运行时（如 Vercel Serverless Node）模块加载即崩；改走动态 import 的 ESM 构建，全版本兼容
let parseHTMLPromise = null;
function getParseHTML() {
  parseHTMLPromise ??= import('linkedom').then((m) => m.parseHTML);
  return parseHTMLPromise;
}

const { Readability } = require('@mozilla/readability');
const { fetchHtml, decodeBody } = require('./fetcher');
const { TtlCache } = require('./cache');
const { SafeError } = require('./guard');

// 同 URL 5 分钟内直接复用抓取结果，避免重复请求浪费资源
const extractCache = new TtlCache(5 * 60 * 1000, 60);

const BAD_IMG_CLASS = /(avatar|logo|icon|emoji|sprite|qrcode|wechat|weixin|ad[-_]|banner|sponsor|comment|share|footer|header|nav-|badge|smiley|loading|placeholder)/i;
const BAD_IMG_ALT = /(头像|logo|图标|表情|二维码|广告|logo)/i;
const IMG_EXT = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;

function absolutize(src, base) {
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

function cleanText(s) {
  return (s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function collectMeta(doc) {
  const get = (sel) => doc.querySelector(sel)?.getAttribute?.('content')?.trim() || '';
  return {
    ogTitle: get('meta[property="og:title"]') || get('meta[name="og:title"]'),
    ogSiteName: get('meta[property="og:site_name"]') || get('meta[name="og:site_name"]'),
    ogImage: get('meta[property="og:image"]') || get('meta[name="og:image"]'),
    description: get('meta[name="description"]') || get('meta[property="og:description"]'),
  };
}

function imgSrcOf(img, base) {
  const candidates =
    [img.getAttribute?.('src'), img.getAttribute?.('data-src'), img.getAttribute?.('data-original'), img.getAttribute?.('data-lazy-src'), img.getAttribute?.('data-actualsrc')]
      .filter(Boolean);
  for (const c of candidates) {
    const abs = absolutize(c, base);
    if (abs && /^https?:/i.test(abs)) return abs;
  }
  return null;
}

/** 从一段 HTML 片段中收集可用文章配图 */
async function collectImagesFromFragment(html, base, limit = 12) {
  const out = [];
  const seen = new Set();
  try {
    const parseHTML = await getParseHTML();
    const { document } = parseHTML(`<body>${html}</body>`);
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      if (out.length >= limit) break;
      const src = imgSrcOf(img, base);
      if (!src || seen.has(src)) continue;
      const w = Number(img.getAttribute?.('width') || 0);
      const h = Number(img.getAttribute?.('height') || 0);
      if ((w && w <= 80) || (h && h <= 80)) continue; // 拦截图标/表情类小图
      const cls = `${img.getAttribute?.('class') || ''} ${img.getAttribute?.('id') || ''} ${img.getAttribute?.('alt') || ''}`;
      if (BAD_IMG_CLASS.test(cls) || BAD_IMG_ALT.test(cls)) continue;
      if (/^data:/i.test(img.getAttribute?.('src') || '')) continue;
      if (!IMG_EXT.test(src) && !/(img|image|photo|pic)/i.test(src)) continue; // 无扩展名时仅放行明显图片链接
      seen.add(src);
      out.push(src);
    }
  } catch {
    /* 解析失败时静默降级为无图 */
  }
  return out;
}

/** Readability 失败时的启发式段落提取 */
async function fallbackExtract(doc, base) {
  const kill = doc.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,iframe');
  for (const k of kill) k.remove && k.remove();
  const paragraphs = [];
  const ps = doc.querySelectorAll('p,li,h1,h2,h3');
  for (const p of ps) {
    const t = cleanText(p.textContent);
    if (t && t.length >= 8) paragraphs.push(t);
    if (paragraphs.join('').length > 20000) break;
  }
  const text = cleanText(paragraphs.join('\n\n'));
  const images = await collectImagesFromFragment(doc.body ? doc.body.innerHTML : '', base);
  return { text, images };
}

function looksLikeSpa(html) {
  return (
    /id=["']?(app|root|__nuxt|__next)["']/i.test(html) ||
    /__NUXT__|__INITIAL_STATE__|window\.__APP_STATE__/i.test(html)
  );
}

async function doExtract(rawUrl) {
  const parseHTML = await getParseHTML();
  const { buffer, contentType, finalUrl } = await fetchHtml(rawUrl);
  const html = decodeBody(buffer, contentType);
  const { document: doc } = parseHTML(html);

  const meta = collectMeta(doc);
  const docTitle = cleanText(doc.querySelector('title')?.textContent || '');

  let title = '';
  let text = '';
  let images = [];
  let degraded = false;

  // 1) Readability 精提取
  try {
    const article = new Readability(doc).parse();
    if (article) {
      title = cleanText(article.title) || '';
      text = cleanText(article.textContent) || '';
      if (article.content) {
        images = await collectImagesFromFragment(article.content, finalUrl);
      }
    }
  } catch {
    /* 走降级 */
  }

  // 2) 正文太短 → 降级启发式提取（可能是 Readability 兼容问题）
  if (text.length < 80) {
    degraded = true;
    const { document: doc2 } = parseHTML(html);
    const fb = await fallbackExtract(doc2, finalUrl);
    text = fb.text;
    images = fb.images;
  }

  // 3) 仍然没有正文 → SPA / 动态渲染页面，交给前端降级为手动粘贴
  if (text.length < 80) {
    if (looksLikeSpa(html)) {
      throw new SafeError('SPA_OR_EMPTY', '该网页由前端脚本动态渲染，暂不支持自动解析，请改用剪贴板粘贴导入', 200);
    }
    throw new SafeError('SPA_OR_EMPTY', '未能从该网页中提取到有效正文，请改用剪贴板粘贴导入', 200);
  }

  // og:image 补位（作为首图候选）
  if (meta.ogImage && /^https?:/i.test(meta.ogImage) && !images.includes(meta.ogImage)) {
    images.unshift(meta.ogImage);
  }

  title = title || meta.ogTitle || docTitle || meta.description.slice(0, 40) || '未命名网页素材';

  const site = (() => {
    try {
      return new URL(finalUrl).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();

  return {
    ok: true,
    data: {
      title: title.slice(0, 120),
      siteName: meta.ogSiteName || site,
      text: text.slice(0, 30000),
      images: images.slice(0, 12),
      url: finalUrl,
      originalUrl: rawUrl,
      degraded,
      fetchedAt: Date.now(),
    },
  };
}

async function extractArticle(rawUrl) {
  const key = rawUrl.trim().toLowerCase();
  return extractCache.join(key, () => doExtract(rawUrl));
}

async function extractRoute(req, res, next) {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) throw new SafeError('INVALID_URL', '缺少 url 参数');
    const result = await extractArticle(rawUrl);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

module.exports = { extractRoute };
