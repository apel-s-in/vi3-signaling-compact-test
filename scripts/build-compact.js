'use strict';

const fs = require('fs/promises');
const path = require('path');
const { minify } = require('terser');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'index.js');
const OUTPUT_FILE = path.join(ROOT, 'index.compact.js');
const TEMP_FILE = path.join(ROOT, 'index.compact.js.tmp');

async function main() {
  const source = await fs.readFile(SOURCE_FILE, 'utf8');

  if (!source.trim()) {
    throw new Error('Исходный файл index.js пуст');
  }

  const result = await minify(
    {
      'index.js': source
    },
    {
      ecma: 2022,
      module: false,
      compress: false,
      mangle: false,
      toplevel: false,
      keep_fnames: true,
      keep_classnames: true,
      format: {
        beautify: false,
        comments: 'all',
        semicolons: true,
        ascii_only: false,
        preamble: '/* АВТОМАТИЧЕСКИ СОЗДАНО ИЗ index.js. НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ. */'
      }
    }
  );

  if (!result.code) {
    throw new Error('Terser не вернул сгенерированный код');
  }

  await fs.writeFile(TEMP_FILE, `${result.code}\n`, 'utf8');
  await fs.rename(TEMP_FILE, OUTPUT_FILE);

  const sourceBytes = Buffer.byteLength(source, 'utf8');
  const compactBytes = Buffer.byteLength(result.code, 'utf8');
  const reduction = sourceBytes > 0
    ? Math.round((1 - compactBytes / sourceBytes) * 100)
    : 0;

  console.log(`Создан: ${path.relative(ROOT, OUTPUT_FILE)}`);
  console.log(`Исходный размер: ${sourceBytes} байт`);
  console.log(`Компактный размер: ${compactBytes} байт`);
  console.log(`Уменьшение: ${reduction}%`);
}

main().catch(async error => {
  await fs.rm(TEMP_FILE, { force: true }).catch(() => null);
  console.error('[compact:build]', error);
  process.exitCode = 1;
});
