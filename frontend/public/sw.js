/**
 * TripSnippet Service Worker（轻量手写，无额外依赖）
 * - install：预缓存应用外壳，依据 Vite build manifest 收集全部构建产物（manifest 不可用时回退解析 HTML/JS）（首次访问即可离线打开）
 * - 同源静态资源缓存优先；跨域仅缓存 Google Fonts（后端 API 等其他跨域请求一律直连、不缓存）
 * - 页面导航网络优先（发版后及时更新），离线时回退缓存
 */
const CACHE = 'tripsnippet-v2';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

/**
 * 从 Vite build manifest 收集全部构建产物（入口 / 懒加载 chunk / worker / css / 内联资源）
 * @returns {Promise<boolean>} 是否成功收集（失败时调用方回退正则扫描）
 */
async function collectFromManifest(urls) {
  try {
    const res = await fetch('./manifest.json');
    if (!res.ok) return false;
    const manifest = await res.json();
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return false;
    let count = 0;
    for (const info of Object.values(manifest)) {
      if (!info || !info.file) continue;
      urls.add(new URL(info.file, self.registration.scope).href);
      count += 1;
      for (const css of info.css || []) urls.add(new URL(css, self.registration.scope).href);
      for (const asset of info.assets || []) urls.add(new URL(asset, self.registration.scope).href);
    }
    return count > 0;
  } catch {
    return false;
  }
}

/** 预缓存外壳 + 依据 build manifest 收集构建产物（拿不到时回退解析 HTML 与入口 JS） */
async function precacheShell() {
  const cache = await caches.open(CACHE);
  const urls = new Set(SHELL);
  try {
    const res = await fetch('./');
    if (res.ok) {
      // 直接用已拿到的响应落缓存（cache.add 会重新发请求，且可能因 Vary 头无法被带 Origin 的页面请求命中）
      const copy = res.clone();
      await cache.put(new URL('./', self.registration.scope).href, copy);
      const html = await res.text();
      for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const v = m[1];
        if (/^(https?:|data:)/.test(v)) continue; // 外链与内联资源不缓存
        urls.add(new URL(v, self.registration.scope).href);
      }
    }
  } catch {
    /* 拿不到首页 HTML 时退回基础外壳 */
  }
  const fromManifest = await collectFromManifest(urls);
  if (fromManifest) {
    // Vite build manifest 不含 Web Worker chunk（如 export-worker），
    // 需对 manifest 收集到的 JS 专项补扫 worker 引用（new URL("x.js", import.meta.url)，相对所在 chunk 解析）
    const jsUrls = [...urls].filter((u) => u.endsWith('.js'));
    await Promise.all(
      jsUrls.map(async (u) => {
        let code;
        try {
          code = await (await fetch(u)).text();
        } catch {
          return; // 读取失败只影响该文件的补扫
        }
        for (const m of code.matchAll(/new URL\s*\(\s*(["'])([^"']+\.js)\1\s*,\s*import\.meta\.url\s*\)/g)) {
          urls.add(new URL(m[2], u).href);
        }
      })
    );
  } else {
    // 兜底：manifest 不可用时，从入口 JS 解析 Vite 动态 import 映射，
    // 继续扫描新发现的 chunk 直到收敛，覆盖懒加载路由 chunk 及其引用的 Web Worker chunk（如 export-worker）
    const scanned = new Set();
    const queue = [...urls].filter((u) => u.endsWith('.js'));
    while (queue.length) {
      const u = queue.shift();
      if (scanned.has(u)) continue;
      scanned.add(u);
      let code;
      try {
        code = await (await fetch(u)).text();
      } catch {
        continue; // 解析失败不影响其余预缓存
      }
      const found = new Set();
      for (const m of code.matchAll(/assets\/[\w.-]+\.(?:js|css)/g)) {
        found.add(new URL(m[0], self.registration.scope).href); // assets/ 引用相对站点根
      }
      for (const m of code.matchAll(/(["'])\.?\/?([\w-]+[-_][\w.-]*\.(?:js|css))\1/g)) {
        if (m[2] === 'sw.js') continue; // SW 自身注册路径，非构建产物
        found.add(new URL(m[2], u).href); // "./" 或裸文件名引用相对当前文件（Vite chunk 名必带 -hash 分隔）
      }
      for (const href of found) {
        if (urls.has(href)) continue;
        urls.add(href);
        if (href.endsWith('.js')) queue.push(href); // 新发现的 chunk 继续扫描
      }
    }
  }
  await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));
}

/**
 * 缓存优先；未命中走网络并回填（兼容跨域 opaque 字体响应）
 * dev/preview 服务器响应带 Vary: Origin，SW 发起的请求与页面请求头不同，
 * 必须忽略 Vary 才能命中缓存，故所有匹配都加 ignoreVary
 */
async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    caches
      .open(CACHE)
      .then((cache) => cache.put(req, res.clone()))
      .catch(() => {});
  }
  return res;
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api')) return; // 同源 /api 兑底跳过
    if (req.mode === 'navigate') {
      // 页面：网络优先，失败回退缓存（离线仍可打开）
      event.respondWith(
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((cache) => cache.put(req, copy))
              .catch(() => {});
            return res;
          })
          .catch(() =>
            caches
              .match(req, { ignoreVary: true })
              .then((hit) => hit || caches.match('./', { ignoreVary: true }))
          )
      );
      return;
    }
    // 静态资源（带 hash 的构建产物 / 图标 / manifest）：缓存优先
    event.respondWith(cacheFirst(req));
    return;
  }

  // 跨域：仅缓存 Google Fonts（隐私约束：后端 API 等其他跨域请求一律直连）
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
});
