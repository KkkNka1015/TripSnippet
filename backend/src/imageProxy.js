/**
 * 图片二进制代理：
 * 前端无法跨域直接抓取网页配图（CORS / 防盗链），由后端以页面来源站
 * Referer 身份转发图片字节流。响应后立即丢弃，不做任何持久化。
 */
const { SafeError, assertSafeUrl } = require('./guard');
const { UA } = require('./fetcher');

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

async function imageProxyRoute(req, res, next) {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) throw new SafeError('INVALID_URL', '缺少 url 参数');

    const u = await assertSafeUrl(rawUrl);
    // 以图片所属站点的自身 Referer 请求，绕过部分站点防盗链
    const referer = `${u.protocol}//${u.host}/`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let imgRes;
    try {
      imgRes = await fetch(u, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'user-agent': UA,
          accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          referer,
        },
      });
    } catch (e) {
      if (e.name === 'AbortError') throw new SafeError('TIMEOUT', '图片请求超时', 200);
      throw new SafeError('FETCH_FAILED', '图片请求失败', 200);
    } finally {
      clearTimeout(timer);
    }

    if (!imgRes.ok) {
      throw new SafeError('IMAGE_BLOCKED', `图片被源站拒绝（${imgRes.status}）`, 200);
    }
    const contentType = imgRes.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new SafeError('IMAGE_BLOCKED', '目标资源不是图片', 200);
    }

    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) {
      throw new SafeError('TOO_LARGE', '图片体积超出上限', 200);
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200).end(buf);
  } catch (e) {
    next(e);
  }
}

module.exports = { imageProxyRoute };
