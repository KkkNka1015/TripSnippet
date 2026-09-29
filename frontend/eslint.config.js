import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // App.vue 为根组件，单文件名属正常情况
      'vue/multi-word-component-names': ['error', { ignores: ['App'] }],
      // 保持现有紧凑模板风格：关闭纯格式类规则（格式化交给编辑器/Prettier）
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attributes-order': 'off',
    },
  },
  {
    // Service Worker：使用 Service Worker 专用全局变量
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
];
