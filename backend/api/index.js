/**
 * Vercel Serverless 入口
 * - 将 Express 应用导出为函数处理程序，所有 /api/* 请求经 vercel.json 重写后由本函数处理
 * - 不在此处监听端口：Vercel 平台负责接收 HTTP 并转发给导出的 app
 */
const app = require('../server');

module.exports = app;
