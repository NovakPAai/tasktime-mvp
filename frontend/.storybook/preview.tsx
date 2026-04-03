/**
 * Storybook Preview — Flow Universe UI Kit 2.0
 * TTUI-165: Глобальный декоратор: CSS-токены + Ant Design ConfigProvider
 */
import type { Preview, Decorator } from '@storybook/react-vite';
import React from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import '../src/styles.css';

// Цвета акцента и фона из App.tsx (TTUI-118 — два источника правды)
const LIGHT_THEME = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#4f6ef7',
    colorBgBase: '#f5f3ff',
    colorBgContainer: '#fdfcff',
    colorBgElevated: '#fdfcff',
    colorText: '#2e1065',
    colorTextBase: '#2e1065',
    borderRadius: 12,
    fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
    fontSize: 13,
  },
};

const DARK_THEME = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: '#4f6ef7',
    colorBgBase: '#03050f',
    colorBgContainer: '#0f1320',
    colorBgElevated: '#161e30',
    colorText: '#e2e8f8',
    colorTextBase: '#e2e8f8',
    borderRadius: 12,
    fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
    fontSize: 13,
  },
};

const withThemeProvider: Decorator = (Story, context) => {
  const isDark = context.globals['theme'] !== 'light';
  const antTheme = isDark ? DARK_THEME : LIGHT_THEME;
  const bg = isDark ? '#03050f' : '#f5f3ff';

  // Применяем data-theme к body, чтобы CSS-переменные работали
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
  }

  return (
    <ConfigProvider theme={antTheme}>
      <div
        style={{
          background: bg,
          minHeight: '100vh',
          padding: 32,
          fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
        }}
      >
        <Story />
      </div>
    </ConfigProvider>
  );
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Тема (dark / light)',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'dark', icon: 'circle', title: 'Dark' },
          { value: 'light', icon: 'circlehollow', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withThemeProvider],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'fullscreen',
    a11y: {
      test: 'todo',
    },
    backgrounds: { disable: true }, // используем наш кастомный theme decorator
  },
};

export default preview;
