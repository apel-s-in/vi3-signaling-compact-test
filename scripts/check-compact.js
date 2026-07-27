'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'index.js');
const COMPACT_FILE = path.join(ROOT, 'index.compact.js');

function checkSyntax(file) {
  const result = spawnSync(
    process.execPath,
    ['--check', file],
    {
      cwd: ROOT,
      encoding: 'utf8'
    }
  );

  if (result.status !== 0) {
    throw new Error(
      [
        `Синтаксическая ошибка в ${path.basename(file)}`,
        result.stdout,
        result.stderr
      ].filter(Boolean).join('\n')
    );
  }
}

function loadFresh(file) {
  const resolved = require.resolve(file);
  delete require.cache[resolved];
  return require(resolved);
}

function normalizePingResponse(response) {
  const normalized = {
    ...response
  };

  if (typeof normalized.body === 'string' && normalized.body) {
    const body = JSON.parse(normalized.body);
    delete body.ts;
    normalized.body = body;
  }

  return normalized;
}

async function main() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error('Не найден index.js');
  }

  if (!fs.existsSync(COMPACT_FILE)) {
    throw new Error(
      'Не найден index.compact.js. Выполните npm run compact:build'
    );
  }

  const sourceStat = fs.statSync(SOURCE_FILE);
  const compactStat = fs.statSync(COMPACT_FILE);

  if (sourceStat.size === 0) {
    throw new Error('index.js пуст');
  }

  if (compactStat.size === 0) {
    throw new Error('index.compact.js пуст');
  }

  checkSyntax(SOURCE_FILE);
  checkSyntax(COMPACT_FILE);

  const sourceModule = loadFresh(SOURCE_FILE);
  const compactModule = loadFresh(COMPACT_FILE);

  const sourceExports = Object.keys(sourceModule).sort();
  const compactExports = Object.keys(compactModule).sort();

  assert.deepStrictEqual(
    compactExports,
    sourceExports,
    'Наборы экспортов index.js и index.compact.js различаются'
  );

  assert.strictEqual(
    typeof sourceModule.handler,
    'function',
    'index.js не экспортирует функцию handler'
  );

  assert.strictEqual(
    typeof compactModule.handler,
    'function',
    'index.compact.js не экспортирует функцию handler'
  );

  const pingEvent = {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {
      action: 'ping'
    }
  };

  const sourcePing = normalizePingResponse(
    await sourceModule.handler(pingEvent)
  );

  const compactPing = normalizePingResponse(
    await compactModule.handler(pingEvent)
  );

  assert.deepStrictEqual(
    compactPing,
    sourcePing,
    'Ответ ping компактной версии отличается от исходной'
  );

  const optionsEvent = {
    httpMethod: 'OPTIONS',
    headers: {
      origin: 'https://apel-s-in.github.io'
    }
  };

  const sourceOptions = await sourceModule.handler(optionsEvent);
  const compactOptions = await compactModule.handler(optionsEvent);

  assert.deepStrictEqual(
    compactOptions,
    sourceOptions,
    'Ответ OPTIONS компактной версии отличается от исходной'
  );

  console.log('Проверка успешно завершена:');
  console.log(`- синтаксис ${path.basename(SOURCE_FILE)} корректен`);
  console.log(`- синтаксис ${path.basename(COMPACT_FILE)} корректен`);
  console.log('- экспорты совпадают');
  console.log('- handler присутствует в обеих версиях');
  console.log('- ответы ping совпадают');
  console.log('- ответы OPTIONS совпадают');
  console.log(`- размер index.js: ${sourceStat.size} байт`);
  console.log(`- размер index.compact.js: ${compactStat.size} байт`);
}

main().catch(error => {
  console.error('[compact:check]', error);
  process.exitCode = 1;
});
