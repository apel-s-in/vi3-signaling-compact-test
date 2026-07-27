'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const prettier = require('prettier');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'index.js');
const OUTPUT_FILE = path.join(ROOT, 'index.compact.js');
const TEMP_FILE = path.join(ROOT, 'index.compact.js.tmp');

const PRINT_WIDTH = 240;

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

  const formatted = await prettier.format(
    source,
    {
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
    }
  );

  const banner =
    `/* GENERATED_FROM=index.js SOURCE_SHA256=${sourceHash} ` +
    `FORMAT=READABLE_COMPACT PRINT_WIDTH=${PRINT_WIDTH} DO_NOT_EDIT */`;

  const compact = `${banner}\n${formatted.trim()}\n`;

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
  const reduction = sourceBytes > 0
    ? Math.round(
        (1 - compactBytes / sourceBytes) * 100
      )
    : 0;

  console.log('✅ Читаемая компактная версия создана');
  console.log('Формат: Prettier readable compact');
  console.log(`Ширина строки: ${PRINT_WIDTH}`);
  console.log('Исходник: index.js');
  console.log('Результат: index.compact.js');
  console.log(`SHA-256 исходника: ${sourceHash}`);
  console.log(`Размер исходника: ${sourceBytes} байт`);
  console.log(`Размер результата: ${compactBytes} байт`);
  console.log(`Изменение размера: ${reduction}%`);
}

main().catch(async error => {
  await removeTemporaryFile();

  console.error(
    '❌ Ошибка создания компактной версии:',
    error?.stack || error
  );

  process.exitCode = 1;
});
