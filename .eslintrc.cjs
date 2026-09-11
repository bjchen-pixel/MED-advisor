/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.tmp.mjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // 全形空格（U+3000）在中文排版是正常用法，不是誤植
    'no-irregular-whitespace': [
      'error',
      { skipStrings: true, skipComments: true, skipTemplates: true, skipJSXText: true },
    ],
  },
  overrides: [
    {
      // 計算核心必須維持純函式：不碰 DOM、網路、環境變數、bundler API。
      // 它會被批次收斂頁與 CAD add-in 複用，散進這些依賴就無法複用。
      files: ['src/core/**/*.ts'],
      env: { browser: false, node: false },
      rules: {
        'no-restricted-globals': [
          'error',
          { name: 'window', message: '計算核心不得碰 DOM' },
          { name: 'document', message: '計算核心不得碰 DOM' },
          { name: 'navigator', message: '計算核心不得碰 DOM' },
          { name: 'localStorage', message: '計算核心不得碰瀏覽器儲存' },
          { name: 'fetch', message: '計算核心不得發網路請求' },
          { name: 'process', message: '計算核心不得讀環境變數' },
        ],
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              { group: ['**/data/**', '**/ui/**'], message: '計算核心不得依賴資料載入層或 UI' },
              { group: ['react', 'react-dom', 'zod'], message: '計算核心不得依賴 UI 或驗證套件' },
            ],
          },
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector: "MemberExpression[object.type='MetaProperty']",
            message: '計算核心不得使用 import.meta（bundler API）',
          },
        ],
      },
    },
  ],
};
