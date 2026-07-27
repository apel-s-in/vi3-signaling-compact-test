'use strict';

const fs = require('fs/promises');
const path = require('path');

const {
  assertSameProgram,
  formatReadableCompact
} = require('./compact-core');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'input.js');
const OUTPUT_FILE = path.join(
  ROOT,
  'output.compact.js'
);
const TEMP_FILE = path.join(
  ROOT,
  'output.compact.js.tmp'
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

  const result =
    await formatReadableCompact({
      source,
      sourceName: 'input.js'
    });

  assertSameProgram(
    source,
    result.compact,
    'AST input.js и output.compact.js различается'
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

  console.log(
    '✅ Обычный JavaScript-файл обработан'
  );
  console.log('Вход: input.js');
  console.log('Выход: output.compact.js');
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
    '❌ Ошибка генерации обычного файла:',
    error?.stack || error
  );

  process.exitCode = 1;
});
