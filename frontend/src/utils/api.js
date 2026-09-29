/**
 * 后端代理客户端：
 * - 超时自动终止（AbortController）
 * - 同 URL 短时缓存 + 并发去重（避免重复请求浪费资源）
 * - 结构化错误码 → 友好提示
 */
const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3000').replace(/\/$/, '');

const EXTRACT_TTL = 5 * 60 * 1000;
const MAX_CACHE = 20;
const extractCache = new Map(); // url -> { at: number, data: object }
const inFlight = new Map(); // url -> Promise

export class ApiError extends Error {
  constructor(code, message, friendly = message) {
    super(message);
    this.code = code;
    this.friendly = friendly;
  }
}

function friendlyMessage(code, fallback) {
  const map = {
    NETWORK: '无法连接代理服务，请确认后端已启动；或改用剪贴板粘贴导入',
    RATE_LIMITED: '请求过于频繁，请稍后再试',
    TIMEOUT: '网页解析超时，已自动终止',
    INVALID_URL: '链接格式不正确，请检查后重试',
    SPA_OR_EMPTY: '该网页无法自动解析（SPA / 动态页面），建议改用剪贴板粘贴',
    AUTH_BLOCKED: '该网页需要登录或禁止访问，建议改用剪贴板粘贴',
    NOT_HTML: '目标链接不是网页',
    TOO_LARGE: '页面/文件体积过大，已终止',
    IMAGE_BLOCKED: '图片被源站防盗链拒绝',
    BLOCKED_HOST: '目标地址被安全策略拦截',
  };
  return map[code] || fallback;
}

async function fetchWithTimeout(url, { timeoutMs = 20000, signal: outerSignal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (outerSignal) outerSignal.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (e) {
    if (outerSignal?.aborted) throw new ApiError('ABORTED', '操作已取消');
    if (e.name === 'AbortError') throw new ApiError('TIMEOUT', friendlyMessage('TIMEOUT'));
    throw new ApiError('NETWORK', '网络请求失败', friendlyMessage('NETWORK'));
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
  }
}

async function readApiError(res) {
  let code = 'UNKNOWN';
  let message = `服务异常（HTTP ${res.status}）`;
  try {
    const json = await res.json();
    code = json.code || code;
    message = json.message || message;
  } catch {
    /* 非 JSON 响应 */
  }
  return new ApiError(code, message, friendlyMessage(code, message));
}

/**
 * 解析网页：正文 + 配图 URL 列表
 * @param {string} url 目标网页
 * @param {{signal?: AbortSignal}} options
 * @returns {Promise<{title,siteName,text,images,url,degraded,fetchedAt}>}
 */
export async function apiExtract(url, { signal } = {}) {
  const key = url.trim().toLowerCase();

  // 1) 命中缓存直接返回
  const hit = extractCache.get(key);
  if (hit && Date.now() - hit.at < EXTRACT_TTL) return hit.data;

  // 2) 并发去重：同 URL 请求复用进行中的 Promise
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    const res = await fetchWithTimeout(`${API_BASE}/api/extract?url=${encodeURIComponent(url)}`, {
      timeoutMs: 20000,
      signal,
    });
    if (!res.ok) throw await readApiError(res);
    const json = await res.json();
    if (!json.ok) throw new ApiError(json.code, json.message, friendlyMessage(json.code, json.message));
    return json.data;
  })();

  inFlight.set(key, task);
  try {
    const data = await task;
    while (extractCache.size >= MAX_CACHE) extractCache.delete(extractCache.keys().next().value);
    extractCache.set(key, { at: Date.now(), data });
    return data;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * 通过代理抓取远程图片为 Blob（绕过 CORS / 防盗链）
 */
export async function apiFetchImage(imageUrl, { timeoutMs = 25000 } = {}) {
  const res = await fetchWithTimeout(`${API_BASE}/api/image?url=${encodeURIComponent(imageUrl)}`, {
    timeoutMs,
  });
  if (!res.ok) throw await readApiError(res);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new ApiError('IMAGE_BLOCKED', '资源不是图片');
  if (blob.size > 15 * 1024 * 1024) throw new ApiError('TOO_LARGE', '图片体积超出上限');
  return blob;
}

/** 后端健康检查 */
export async function apiHealth() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/health`, { timeoutMs: 4000 });
    return res.ok;
  } catch {
    return false;
  }
}

export { API_BASE };
