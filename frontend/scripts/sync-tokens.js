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
  const tokens = { dark: {}, light: {}, status: {}, issueType: {}, layout: {}, typography: {}, semantic: {} };

  const extract = (section) => {
    const sectionMatch = content.match(new RegExp(`export const ${section} = \\{([\\s\\S]*?)\\} as const;`));
    if (!sectionMatch) return;
    const lines = sectionMatch[1].split('\n');
    lines.forEach(line => {
      const cleanLine = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').trim();
      const m = cleanLine.match(/^(\w+):\s*(.*?),?$/);
      if (m) {
        let val = m[2].trim().replace(/['"]/g, '');
        if (val.endsWith(',')) val = val.slice(0, -1);
        tokens[section][m[1]] = val.trim();
      }
    });
  };

  ['dark', 'light', 'status', 'issueType', 'layout', 'typography', 'semantic'].forEach(extract);
  return tokens;
}

function generateCSS() {
  const tokens = parseTokens();
  let css = `/**
 * АВТОГЕНЕРИРУЕМЫЙ ФАЙЛ. НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ.
 */

:root {
`;

  Object.entries(tokens.dark).forEach(([k, v]) => css += `  --${toKebab(k)}: ${v};\n`);
  Object.entries(tokens.status).forEach(([k, v]) => css += `  --s-${toKebab(k)}: ${v};\n`);
  Object.entries(tokens.issueType).forEach(([k, v]) => css += `  --type-${toKebab(k)}: ${v};\n`);
  
  Object.entries(tokens.layout).forEach(([k, v]) => {
    const unit = isNaN(v) ? '' : 'px';
    const name = toKebab(k);
    css += `  --${name}: ${v}${unit};\n`;
    if (name === 'sidebar-width') css += `  --sidebar-w: ${v}${unit};\n`;
    if (name === 'topbar-height') css += `  --topbar-h: ${v}${unit};\n`;
    if (name === 'page-padding') css += `  --page-p: ${v}${unit};\n`;
  });

  Object.entries(tokens.typography).forEach(([k, v]) => {
    const isLh = k.toLowerCase().includes('lh');
    const name = toKebab(k);
    let val = v;
    // ФОРСИРОВАННЫЙ ФИКС ШРИФТОВ
    if (name === 'font-display') val = "Space Grotesk, Inter, system-ui, sans-serif";
    if (name === 'font-sans') val = "Inter, system-ui, sans-serif";
    
    const unit = (isNaN(val) || isLh || name.includes('font')) ? '' : 'px';
    css += `  --${name}: ${val}${unit};\n`;
  });

  css += `}\n\n[data-theme='light'] {\n`;
  Object.entries(tokens.light).forEach(([k, v]) => css += `  --${toKebab(k)}: ${v};\n`);
  css += `}\n`;

  fs.writeFileSync(OUTPUT_FILE, css);
  console.log('✅ tokens.css успешно синхронизирован (Final Layout Fix Build)');
}

generateCSS();
