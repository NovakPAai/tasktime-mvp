import fs from 'fs';
import path from 'path';

/**
 * ЧИСТЫЙ JS СКРИПТ ДЛЯ CI/CD. 
 * Не требует лоадеров TypeScript. Парсит design-tokens.ts как текст.
 */

const INPUT_FILE = path.resolve('src/design-tokens.ts');
const OUTPUT_FILE = path.resolve('src/tokens.css');

const toKebab = (str) => str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();

function parseTokens() {
  const content = fs.readFileSync(INPUT_FILE, 'utf8');
  const tokens = { dark: {}, light: {}, status: {}, issueType: {}, layout: {} };

  // Упрощенный парсинг через RegExp для извлечения ключ: 'значение'
  const extract = (section) => {
    const sectionMatch = content.match(new RegExp(`export const ${section} = \\{([\\s\\S]*?)\\} as const;`));
    if (!sectionMatch) return;
    const lines = sectionMatch[1].split('\n');
    lines.forEach(line => {
      const m = line.match(/^\s*(\w+):\s*['"](.*?)['"]/);
      if (m) tokens[section][m[1]] = m[2];
      const numM = line.match(/^\s*(\w+):\s*(\d+)/);
      if (numM) tokens[section][numM[1]] = numM[2];
    });
  };

  ['dark', 'light', 'status', 'issueType', 'layout'].forEach(extract);
  return tokens;
}

function generateCSS() {
  const tokens = parseTokens();
  let css = `/**
 * АВТОГЕНЕРИРУЕМЫЙ ФАЙЛ. НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ.
 * Источник: src/design-tokens.ts
 */

:root {
`;

  Object.entries(tokens.dark).forEach(([k, v]) => css += `  --${toKebab(k)}: ${v};\n`);
  Object.entries(tokens.status).forEach(([k, v]) => css += `  --s-${toKebab(k)}: ${v};\n`);
  Object.entries(tokens.issueType).forEach(([k, v]) => css += `  --type-${toKebab(k)}: ${v};\n`);
  Object.entries(tokens.layout).forEach(([k, v]) => {
    const unit = isNaN(v) ? '' : 'px';
    css += `  --${toKebab(k)}: ${v}${unit};\n`;
  });

  css += `}\n\n[data-theme='light'] {\n`;
  Object.entries(tokens.light).forEach(([k, v]) => css += `  --${toKebab(k)}: ${v};\n`);
  css += `}\n`;

  fs.writeFileSync(OUTPUT_FILE, css);
  console.log('✅ tokens.css успешно синхронизирован (Pure Node.js Mode)');
}

generateCSS();
