import fs from 'fs';
import path from 'path';

const INPUT_FILE = path.resolve('src/design-tokens.ts');
const OUTPUT_FILE = path.resolve('src/tokens.css');

const toKebab = (str) => {
  if (/^[a-z][0-9]$/.test(str)) return str; 
  return str
    .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
    .replace(/([a-z])([0-9])/g, '$1-$2') 
    .toLowerCase();
};

function parseTokens() {
  const content = fs.readFileSync(INPUT_FILE, 'utf8');
  const tokens = { dark: {}, light: {}, status: {}, issueType: {}, layout: {}, typography: {} };

  const extract = (section) => {
    const sectionMatch = content.match(new RegExp(`export const ${section} = \\{([\\s\\S]*?)\\} as const;`));
    if (!sectionMatch) return;
    const lines = sectionMatch[1].split('\n');
    lines.forEach(line => {
      // 1. Убираем комментарии // и /* */
      const cleanLine = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').trim();
      if (!cleanLine) return;

      // 2. Ищем ключ: значение
      const m = cleanLine.match(/^(\w+):\s*(.*?),?$/);
      if (m) {
        let val = m[2].trim().replace(/['"]/g, ''); // Убираем кавычки
        if (val.endsWith(',')) val = val.slice(0, -1);
        tokens[section][m[1]] = val.trim();
      }
    });
  };

  ['dark', 'light', 'status', 'issueType', 'layout', 'typography'].forEach(extract);
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

  Object.entries(tokens.typography).forEach(([k, v]) => {
    const isLh = k.toLowerCase().includes('lh');
    const isFont = k.toLowerCase().includes('font');
    const unit = (isNaN(v) || isLh || isFont) ? '' : 'px';
    css += `  --${toKebab(k)}: ${v}${unit};\n`;
  });

  css += `}\n\n[data-theme='light'] {\n`;
  Object.entries(tokens.light).forEach(([k, v]) => css += `  --${toKebab(k)}: ${v};\n`);
  css += `}\n`;

  fs.writeFileSync(OUTPUT_FILE, css);
  console.log('✅ tokens.css успешно синхронизирован (Syntax Error Fix Build)');
}

generateCSS();
