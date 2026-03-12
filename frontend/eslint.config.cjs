// ESLint flat config for frontend (React + TS)
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const eslintPluginImport = require('eslint-plugin-import');
const eslintPluginReact = require('eslint-plugin-react');
const eslintPluginReactHooks = require('eslint-plugin-react-hooks');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['dist/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsparser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: ['./tsconfig.json'],
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: eslintPluginImport,
      react: eslintPluginReact,
      'react-hooks': eslintPluginReactHooks,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: Object.assign(
      {},
      tseslint.configs.recommended.rules,
      {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
        'react/jsx-uses-react': 'off',
        'react/react-in-jsx-scope': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
      },
    ),
  },
];

