import fs from 'fs';
import path from 'path';
import * as tokens from '../src/design-tokens.ts';

const OUTPUT_FILE = path.resolve('src/tokens.css');

/** Превращает camelCase в kebab-case */
const toKebab = (str) => str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();

function generateCSS() {
  let css = `/**
 * АВТОГЕНЕРИРУЕМЫЙ ФАЙЛ. НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ.
 * Источник: src/design-tokens.ts
 * Синхронизация: npm run tokens:sync
 */

:root {
`;

  // 1. Dark theme (default)
  Object.entries(tokens.dark).forEach(([key, value]) => {
    css += `  --${toKebab(key)}: ${value};\n`;
  });

  // 2. Shared status colors
  Object.entries(tokens.status).forEach(([key, value]) => {
    css += `  --s-${toKebab(key)}: ${value};\n`;
  });

  // 3. Shared issue type colors
  Object.entries(tokens.issueType).forEach(([key, value]) => {
    css += `  --type-${toKebab(key)}: ${value};\n`;
  });

  // 4. Shared layout tokens
  Object.entries(tokens.layout).forEach(([key, value]) => {
    const unit = typeof value === 'number' ? 'px' : '';
    css += `  --${toKebab(key)}: ${value}${unit};\n`;
  });

  css += `}\n\n[data-theme='light'] {\n`;

  // 5. Light theme overrides
  Object.entries(tokens.light).forEach(([key, value]) => {
    css += `  --${toKebab(key)}: ${value};\n`;
  });

  css += `}\n`;

  fs.writeFileSync(OUTPUT_FILE, css);
  console.log('✅ tokens.css успешно синхронизирован с design-tokens.ts');
}

generateCSS();
