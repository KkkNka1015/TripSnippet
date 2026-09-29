/**
 * URL 安全守卫 —— 防 SSRF：仅允许公网 http/https 链接，
 * 拦截内网 IP、本机域名与非常规端口。
 */
const dns = require('dns').promises;
const net = require('net');

class SafeError extends Error {
  constructor(code, message, status = 400, expose = true) {
    super(message);
    this.code = code;
    this.status = status;
    this.expose = expose;
  }
}

function isPrivateIP(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 169 && p[1] === 254) return true; // 含云厂商元数据端点
    if (p[0] >= 224) return true; // 组播/保留段
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::' || v6 === '::0') return true;
  if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
  if (v6.startsWith('::ffff:')) return isPrivateIP(v6.slice(7));
  return false;
}

/**
 * 校验并解析 URL，返回标准化 URL 对象。
 * 对域名额外做 DNS 解析校验，防止主机名直接指向内网地址。
 */
async function assertSafeUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SafeError('INVALID_URL', '链接格式不正确，请检查后重试');
  }
  if (!/^https?:$/.test(u.protocol)) {
    throw new SafeError('INVALID_URL', '仅支持 http/https 协议的网页链接');
  }
  if (u.port && !['80', '443'].includes(u.port)) {
    throw new SafeError('BLOCKED_HOST', '非常规端口已被安全策略拦截');
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new SafeError('BLOCKED_HOST', '该域名已被安全策略拦截');
  }

  if (net.isIP(host)) {
    if (isPrivateIP(host)) throw new SafeError('BLOCKED_HOST', '该地址已被安全策略拦截');
    return u;
  }

  let address;
  try {
    ({ address } = await dns.lookup(host));
  } catch {
    throw new SafeError('FETCH_FAILED', '域名解析失败，请检查链接是否可访问');
  }
  if (isPrivateIP(address)) {
    throw new SafeError('BLOCKED_HOST', '该地址已被安全策略拦截');
  }
  return u;
}

module.exports = { SafeError, assertSafeUrl, isPrivateIP };
