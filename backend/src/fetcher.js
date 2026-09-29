/**
 * 共享抓取工具：带超时、大小上限、UA 伪装与字符集解码。
 */
const { SafeError, assertSafeUrl } = require('./guard');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * 抓取 HTML，返回 { buffer, contentType, finalUrl }
 */
async function fetchHtml(rawUrl, { timeoutMs = 12000, maxSize = 3 * 1024 * 1024 } = {}) {
  const u = await assertSafeUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(u, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new SafeError('TIMEOUT', '网页请求超时，已自动终止');
    throw new SafeError('FETCH_FAILED', '网页请求失败，请确认链接是否可访问', 502);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new SafeError('AUTH_BLOCKED', '目标网页需要登录或禁止访问，请改用剪贴板粘贴导入', 200);
  }
  if (!res.ok) {
    throw new SafeError('FETCH_FAILED', `网页返回异常状态（${res.status}）`, 200);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    throw new SafeError('NOT_HTML', '目标链接不是网页，无法解析正文', 200);
  }

  const declaredLength = Number(res.headers.get('content-length') || 0);
  if (declaredLength && declaredLength > maxSize) {
    throw new SafeError('TOO_LARGE', '网页体积过大，已终止解析', 200);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > maxSize) {
    throw new SafeError('TOO_LARGE', '网页体积过大，已终止解析', 200);
  }
  return { buffer, contentType, finalUrl: res.url || u.href };
}

/**
 * 按响应头/页面 meta charset 解码 HTML（兼容 gb2312/gbk 等中文站点）
 */
function decodeBody(buffer, contentType) {
  let charset = '';
  const m = /charset=["']?([\w-]+)/i.exec(contentType);
  if (m) charset = m[1];
  if (!charset) {
    const head = buffer.subarray(0, 2048).toString('latin1');
    const mm = /charset=["']?([\w-]+)/i.exec(head);
    if (mm) charset = mm[1];
  }
  charset = (charset || 'utf-8').toLowerCase();
  if (charset === 'gb2312') charset = 'gbk';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

module.exports = { fetchHtml, decodeBody, UA };
