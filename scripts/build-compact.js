'use strict';

const fs = require('fs/promises');
const path = require('path');

const {
  assertSameProgram,
  formatReadableCompact,
  hasHandlerExport
} = require('./compact-core');

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

  console.log(
    `Прочитан index.js: ${Buffer.byteLength(source, 'utf8')} байт`
  );

  console.log(
    'Проверяется экспорт handler...'
  );

  if (!hasHandlerExport(source)) {
    throw new Error(
      [
        'В index.js не найден экспорт handler.',
        'Поддерживаются:',
        'exports.handler = ...',
        'module.exports.handler = ...',
        'module.exports = { handler }'
      ].join('\n')
    );
  }

  console.log(
    'Запускается читаемое компактное форматирование...'
  );

  const result =
    await formatReadableCompact({
      source,
      sourceName: 'index.js'
    });

  console.log(
    'Форматирование завершено'
  );

  if (!hasHandlerExport(result.compact)) {
    throw new Error(
      'Экспорт handler исчез после форматирования'
    );
  }
  console.log(
    'Сравниваются AST исходника и результата...'
  );
  assertSameProgram(
    source,
    result.compact,
    'AST index.js и index.compact.js различается'
  );
  console.log(
    'AST исходника и результата совпадают'
  );
  await fs.writeFile(
    TEMP_FILE,
    result.compact,
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
    result.compact,
    'utf8'
  );

  console.log('✅ Cloud Function обработана');
  console.log('Вход: index.js');
  console.log('Выход: index.compact.js');
  console.log(
    `SHA-256: ${result.sourceHash}`
  );
  console.log(
    `Ширина строки: ${result.printWidth}`
  );
  console.log(
    `Удалено пустых строк: ${result.removedBlankLines}`
  );
  console.log(
    `Размер исходника: ${sourceBytes} байт`
  );
  console.log(
    `Размер результата: ${compactBytes} байт`
  );
}

main().catch(async error => {
  await removeTemporaryFile();

  console.error(
    '❌ Ошибка генерации Cloud Function:',
    error?.stack || error
  );

  process.exitCode = 1;
});
