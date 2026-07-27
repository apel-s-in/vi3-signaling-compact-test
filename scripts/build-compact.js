'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { minify } = require('terser');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'index.js');
const OUTPUT_FILE = path.join(
  ROOT,
  'index.compact.js'
);
const TEMP_FILE = path.join(
  ROOT,
  'index.compact.js.tmp'
);

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

async function removeTemporaryFile() {
  await fs.rm(TEMP_FILE, {
    force: true
  }).catch(() => null);
}

async function main() {
  await removeTemporaryFile();

  const source = await fs.readFile(
    SOURCE_FILE,
    'utf8'
  );

  if (!source.trim()) {
    throw new Error('Исходный файл index.js пуст');
  }

  if (source.charCodeAt(0) === 0xfeff) {
    throw new Error(
      'index.js содержит нежелательный UTF-8 BOM'
    );
  }

  if (!source.includes('exports.handler')) {
    throw new Error(
      'В index.js не найден экспорт exports.handler'
    );
  }

  const sourceHash = sha256(source);

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
      sourceMap: false,
      format: {
        beautify: false,
        comments: 'all',
        semicolons: true,
        ascii_only: false,
        braces: false,
        preamble:
          `/* GENERATED_FROM=index.js SOURCE_SHA256=${sourceHash} DO_NOT_EDIT */`
      }
    }
  );

  if (!result || typeof result.code !== 'string') {
    throw new Error(
      'Terser не вернул сгенерированный код'
    );
  }

  const compact = `${result.code.trim()}\n`;

  if (!compact.includes('exports.handler')) {
    throw new Error(
      'В компактной версии исчез exports.handler'
    );
  }

  if (
    !compact.includes(
      `SOURCE_SHA256=${sourceHash}`
    )
  ) {
    throw new Error(
      'В компактной версии отсутствует SHA-256 исходника'
    );
  }

  if (/sourceMappingURL/i.test(compact)) {
    throw new Error(
      'Компактный файл содержит sourceMappingURL'
    );
  }

  if (Buffer.byteLength(compact) >= Buffer.byteLength(source)) {
    throw new Error(
      'Компактный файл не меньше исходного'
    );
  }

  await fs.writeFile(
    TEMP_FILE,
    compact,
    'utf8'
  );

  await fs.rename(
    TEMP_FILE,
    OUTPUT_FILE
  );

  const sourceBytes = Buffer.byteLength(
    source,
    'utf8'
  );
  const compactBytes = Buffer.byteLength(
    compact,
    'utf8'
  );
  const reduction = Math.round(
    (1 - compactBytes / sourceBytes) * 100
  );

  console.log('✅ Компактная версия создана');
  console.log(`Исходник: index.js`);
  console.log(`Результат: index.compact.js`);
  console.log(`SHA-256 исходника: ${sourceHash}`);
  console.log(`Размер исходника: ${sourceBytes} байт`);
  console.log(`Размер результата: ${compactBytes} байт`);
  console.log(`Уменьшение: ${reduction}%`);
}

main().catch(async error => {
  await removeTemporaryFile();

  console.error(
    '❌ Ошибка создания компактной версии:',
    error?.stack || error
  );

  process.exitCode = 1;
});
