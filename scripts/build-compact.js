'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const prettier = require('prettier');
const { parse } = require('@babel/parser');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'index.js');
const OUTPUT_FILE = path.join(ROOT, 'index.compact.js');
const TEMP_FILE = path.join(ROOT, 'index.compact.js.tmp');

const PRINT_WIDTH = 320;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function removeTemporaryFile() {
  await fs.rm(TEMP_FILE, { force: true }).catch(() => null);
}

function markLocationLines(set, location) {
  if (!location?.start || !location?.end) return;

  for (let line = location.start.line; line <= location.end.line; line++) {
    set.add(line);
  }
}

function collectProtectedLines(code) {
  const ast = parse(code, {
    sourceType: 'script',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    errorRecovery: false
  });

  const protectedLines = new Set();
  const visited = new WeakSet();

  for (const comment of ast.comments || []) {
    if (comment.type === 'CommentBlock') {
      markLocationLines(protectedLines, comment.loc);
    }
  }

  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (visited.has(value)) return;

    visited.add(value);

    if (value.type === 'TemplateElement') {
      markLocationLines(protectedLines, value.loc);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'comments' || key === 'tokens') continue;
      visit(child);
    }
  }

  visit(ast);

  return protectedLines;
}

function removeSafeBlankLines(code) {
  const normalized = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const protectedLines = collectProtectedLines(normalized);
  const lines = normalized.split('\n');

  let removed = 0;

  const compactLines = lines.filter((line, index) => {
    const lineNumber = index + 1;
    const blank = line.trim() === '';

    if (!blank || protectedLines.has(lineNumber)) {
      return true;
    }

    removed++;
    return false;
  });

  return {
    code: compactLines.join('\n').trim(),
    removed
  };
}

async function main() {
  await removeTemporaryFile();

  const source = await fs.readFile(SOURCE_FILE, 'utf8');

  if (!source.trim()) {
    throw new Error('Исходный файл index.js пуст');
  }

  if (source.charCodeAt(0) === 0xfeff) {
    throw new Error('index.js содержит нежелательный UTF-8 BOM');
  }

  if (!source.includes('exports.handler')) {
    throw new Error('В index.js не найден экспорт exports.handler');
  }

  const sourceHash = sha256(source);

  const formatted = await prettier.format(source, {
    parser: 'babel',
    printWidth: PRINT_WIDTH,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: true,
    quoteProps: 'as-needed',
    jsxSingleQuote: false,
    trailingComma: 'none',
    bracketSpacing: true,
    bracketSameLine: false,
    arrowParens: 'avoid',
    proseWrap: 'never',
    endOfLine: 'lf',
    objectWrap: 'collapse',
    embeddedLanguageFormatting: 'off'
  });

  const tightened = removeSafeBlankLines(formatted);

  const banner = `/* GENERATED_FROM=index.js SOURCE_SHA256=${sourceHash} FORMAT=READABLE_COMPACT PRINT_WIDTH=${PRINT_WIDTH} BLANK_LINES=SAFE_REMOVE DO_NOT_EDIT */`;
  const compact = `${banner}\n${tightened.code}\n`;

  if (!compact.includes('exports.handler')) {
    throw new Error('В компактной версии исчез exports.handler');
  }

  if (!compact.includes(`SOURCE_SHA256=${sourceHash}`)) {
    throw new Error('В компактной версии отсутствует SHA-256 исходника');
  }

  if (/sourceMappingURL/i.test(compact)) {
    throw new Error('Компактный файл содержит sourceMappingURL');
  }

  parse(compact, {
    sourceType: 'script',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    errorRecovery: false
  });

  await fs.writeFile(TEMP_FILE, compact, 'utf8');
  await fs.rename(TEMP_FILE, OUTPUT_FILE);

  const sourceBytes = Buffer.byteLength(source, 'utf8');
  const compactBytes = Buffer.byteLength(compact, 'utf8');
  const reduction = sourceBytes > 0 ? Math.round((1 - compactBytes / sourceBytes) * 100) : 0;

  console.log('✅ Читаемая уплотнённая версия создана');
  console.log('Формат: Prettier + безопасное удаление пустых строк');
  console.log(`Ширина строки: ${PRINT_WIDTH}`);
  console.log(`Удалено пустых строк: ${tightened.removed}`);
  console.log('Исходник: index.js');
  console.log('Результат: index.compact.js');
  console.log(`SHA-256 исходника: ${sourceHash}`);
  console.log(`Размер исходника: ${sourceBytes} байт`);
  console.log(`Размер результата: ${compactBytes} байт`);
  console.log(`Уменьшение: ${reduction}%`);
}

main().catch(async error => {
  await removeTemporaryFile();

  console.error('❌ Ошибка создания компактной версии:', error?.stack || error);
  process.exitCode = 1;
});
