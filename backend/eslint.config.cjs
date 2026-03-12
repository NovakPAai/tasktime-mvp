// ESLint flat config for backend (Node + TypeScript)
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const eslintPluginImport = require('eslint-plugin-import');
const eslintPluginNode = require('eslint-plugin-node');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    files: ['src/**/*.ts'],
    ignores: ['dist/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsparser,
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: eslintPluginImport,
      node: eslintPluginNode,
    },
    rules: Object.assign(
      {},
      tseslint.configs.recommended.rules,
      {
        'node/no-unsupported-features/es-syntax': 'off',
        'node/no-missing-import': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
      },
    ),
  },
];

