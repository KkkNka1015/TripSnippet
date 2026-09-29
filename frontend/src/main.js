import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import { createDiscreteApi } from 'naive-ui';
import App from './App.vue';
import { naiveThemeOverrides } from './naive-theme';
import './assets/theme.css';

const router = createRouter({
  // GitHub Pages 部署友好：hash 路由不依赖服务端重写
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/project/:id', name: 'project', component: () => import('./views/ProjectView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

const app = createApp(App).use(router);

/* ---------- 全局错误处理（兑底，避免白屏与静默失败） ---------- */
// NaiveUI 离散 API：脱离组件上下文也能弹出与手账主题一致的提示
const { message: globalMessage } = createDiscreteApi(['message'], {
  configProviderProps: { themeOverrides: naiveThemeOverrides },
});

// 相同错误 3 秒内只提示一次，避免弹窗轰炸
let lastErrMsg = '';
let lastErrAt = 0;
function showError(msg) {
  const now = Date.now();
  if (msg === lastErrMsg && now - lastErrAt < 3000) return;
  lastErrMsg = msg;
  lastErrAt = now;
  globalMessage.error(msg);
}

// 组件渲染 / 生命周期内未捕获的异常
app.config.errorHandler = (err, instance, info) => {
  console.error('[TripSnippet] 组件异常：', info, err);
  showError('页面出了点小问题，请刷新重试；频繁出现请先导出备份');
};

// 未处理的 Promise 拒绝（异步操作失败兑底）
window.addEventListener('unhandledrejection', (event) => {
  console.error('[TripSnippet] 未处理的 Promise 异常：', event.reason);
  showError('操作出了点小问题，可能没有完成，请重试');
});

// 未捕获的脚本错误（资源加载失败不弹窗）
window.addEventListener('error', (event) => {
  if (!(event instanceof ErrorEvent)) return;
  console.error('[TripSnippet] 未捕获的错误：', event.error || event.message);
  showError('页面出了点小问题，请刷新重试');
});

app.mount('#app');

/* ---------- PWA：生产环境注册 Service Worker（静态资源离线可用） ---------- */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
