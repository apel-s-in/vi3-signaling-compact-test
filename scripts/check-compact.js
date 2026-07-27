'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  assertSameProgram,
  hasHandlerExport,
  parseJavaScript,
  sha256
} = require('./compact-core');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'index.js');
const COMPACT_FILE = path.join(
  ROOT,
  'index.compact.js'
);

function readRequiredFile(file) {
  if (!fs.existsSync(file)) {
    throw new Error(
      `Не найден файл ${path.relative(ROOT, file)}`
    );
  }

  const text = fs.readFileSync(
    file,
    'utf8'
  );

  if (!text.trim()) {
    throw new Error(
      `Файл ${path.relative(ROOT, file)} пуст`
    );
  }

  return text;
}

function main() {
  const source = readRequiredFile(
    SOURCE_FILE
  );

  const compact = readRequiredFile(
    COMPACT_FILE
  );

  if (source.charCodeAt(0) === 0xfeff) {
    throw new Error(
      'index.js содержит UTF-8 BOM'
    );
  }

  if (compact.charCodeAt(0) === 0xfeff) {
    throw new Error(
      'index.compact.js содержит UTF-8 BOM'
    );
  }

  if (/\r/.test(compact)) {
    throw new Error(
      'index.compact.js должен использовать LF'
    );
  }

  parseJavaScript(source);
  parseJavaScript(compact);

  assert.ok(
    hasHandlerExport(source),
    'В index.js отсутствует экспорт handler'
  );

  assert.ok(
    hasHandlerExport(compact),
    'В index.compact.js отсутствует экспорт handler'
  );

  const sourceHash = sha256(source);

  assert.ok(
    compact.includes(
      `SOURCE_SHA256=${sourceHash}`
    ),
    'SHA-256 исходника в заголовке не совпадает'
  );

  assert.ok(
    compact.includes(
      'GENERATED_FROM=index.js'
    ),
    'Отсутствует метка GENERATED_FROM=index.js'
  );

  assertSameProgram(
    source,
    compact,
    'AST Cloud Function изменился после форматирования'
  );

  const sourceBytes = Buffer.byteLength(
    source,
    'utf8'
  );

  const compactBytes = Buffer.byteLength(
    compact,
    'utf8'
  );

  console.log(
    '✅ Cloud Function прошла проверку'
  );
  console.log(
    '✅ Синтаксическое дерево полностью совпадает'
  );
  console.log(
    '✅ Экспорт handler сохранён'
  );
  console.log(`SHA-256: ${sourceHash}`);
  console.log(
    `index.js: ${sourceBytes} байт`
  );
  console.log(
    `index.compact.js: ${compactBytes} байт`
  );
  console.log(
    `Соотношение: ${Math.round(
      compactBytes / sourceBytes * 100
    )}%`
  );
}

try {
  main();
} catch (error) {
  console.error(
    '❌ Проверка Cloud Function не пройдена:',
    error?.stack || error
  );

  process.exitCode = 1;
}
