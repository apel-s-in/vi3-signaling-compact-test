'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  assertSameProgram,
  parseJavaScript,
  sha256
} = require('./compact-core');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'input.js');
const OUTPUT_FILE = path.join(
  ROOT,
  'output.compact.js'
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
    OUTPUT_FILE
  );

  if (source.charCodeAt(0) === 0xfeff) {
    throw new Error(
      'input.js содержит UTF-8 BOM'
    );
  }

  if (compact.charCodeAt(0) === 0xfeff) {
    throw new Error(
      'output.compact.js содержит UTF-8 BOM'
    );
  }

  if (/\r/.test(compact)) {
    throw new Error(
      'output.compact.js должен использовать LF'
    );
  }

  parseJavaScript(source);
  parseJavaScript(compact);

  const sourceHash = sha256(source);

  assert.ok(
    compact.includes(
      `SOURCE_SHA256=${sourceHash}`
    ),
    'SHA-256 input.js в заголовке не совпадает'
  );

  assert.ok(
    compact.includes(
      'GENERATED_FROM=input.js'
    ),
    'Отсутствует метка GENERATED_FROM=input.js'
  );

  assertSameProgram(
    source,
    compact,
    'AST обычного файла изменился после форматирования'
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
    '✅ Обычный JavaScript-файл прошёл проверку'
  );
  console.log(
    '✅ Синтаксическое дерево полностью совпадает'
  );
  console.log(`SHA-256: ${sourceHash}`);
  console.log(
    `input.js: ${sourceBytes} байт`
  );
  console.log(
    `output.compact.js: ${compactBytes} байт`
  );
}

try {
  main();
} catch (error) {
  console.error(
    '❌ Проверка обычного файла не пройдена:',
    error?.stack || error
  );

  process.exitCode = 1;
}
