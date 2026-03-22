// ESLint flat config for frontend (React + TS + Storybook)
// TTUI-165: добавлен eslint-plugin-storybook
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const eslintPluginImport = require('eslint-plugin-import');
const eslintPluginReact = require('eslint-plugin-react');
const eslintPluginReactHooks = require('eslint-plugin-react-hooks');
const storybook = require('eslint-plugin-storybook');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    // Основные исходники (без stories и .storybook)
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['dist/**', 'src/**/*.stories.{ts,tsx}'],
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
  // Storybook stories + конфиг — ослабленные правила
  {
    files: ['src/**/*.stories.{ts,tsx}', '.storybook/**/*.{ts,tsx}'],
    plugins: { storybook },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsparser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'storybook/default-exports': 'error',
      'storybook/story-exports': 'warn',
    },
  },
];

