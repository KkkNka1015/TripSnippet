import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 部署：base 设为相对路径，配合 hash 路由可在任意子路径下运行
export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: 'dist',
    // 输出 Vite build manifest，Service Worker 依据它精确预缓存全部构建产物
    manifest: 'manifest.json',
  },
  // Vitest 单元测试（纯函数模块，node 环境即可，无需浏览器）
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
  },
});
