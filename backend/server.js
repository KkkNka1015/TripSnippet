/**
 * TripSnippet 极简代理后端
 * - 仅提供 GET /api/extract 与 GET /api/image 两个只读接口
 * - 无数据库、无文件落盘：所有抓取结果响应后即丢弃
 * - CORS 仅允许 ALLOWED_ORIGIN 指定的前端域名
 * - 全局异常捕获，返回结构化错误码
 */
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { extractRoute } = require('./src/extract');
const { imageProxyRoute } = require('./src/imageProxy');

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------- CORS：仅允许配置的前端域名 ---------- */
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.set('trust proxy', 1);
app.use(
  cors({
    origin(origin, cb) {
      // 非浏览器请求（curl 等）允许，浏览器请求必须在白名单内
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    methods: ['GET'],
  })
);

/* ---------- 接口限流，防止公开部署后被滥用 ---------- */
const baseLimit = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' },
};
app.use(rateLimit({ windowMs: 60 * 1000, limit: 120, ...baseLimit })); // 全局
const extractLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, ...baseLimit }); // 网页解析
const imageLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, ...baseLimit }); // 图片代理

/* ---------- 路由 ---------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'tripsnippet-backend', time: Date.now() });
});
app.get('/api/extract', extractLimiter, extractRoute);
app.get('/api/image', imageLimiter, imageProxyRoute);

app.use((req, res) => {
  res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '接口不存在' });
});

/* ---------- 全局异常捕获 ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  if (status >= 500) console.error('[backend]', err);
  const message =
    err.expose || status < 500 ? err.message || '服务开小差了，请稍后再试' : '服务开小差了，请稍后再试';
  res.status(status < 500 ? status : 200).json({ ok: false, code, message });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[tripsnippet-backend] listening on http://localhost:${PORT}`);
    console.log(`[tripsnippet-backend] allowed origins: ${allowedOrigins.join(', ')}`);
  });
}

// 供 Vercel Serverless 入口（api/index.js）复用；本地 npm start 仍直接监听端口
module.exports = app;
