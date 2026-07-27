'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'index.js');
const COMPACT_FILE = path.join(
  ROOT,
  'index.compact.js'
);
const PACKAGE_FILE = path.join(
  ROOT,
  'package.json'
);

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

function assertFileExists(file) {
  if (!fs.existsSync(file)) {
    throw new Error(
      `Не найден ${path.relative(ROOT, file)}`
    );
  }

  const stat = fs.statSync(file);

  if (!stat.isFile()) {
    throw new Error(
      `${path.relative(ROOT, file)} не является файлом`
    );
  }

  if (!stat.size) {
    throw new Error(
      `${path.relative(ROOT, file)} пуст`
    );
  }

  return stat;
}

function checkSyntax(file) {
  const result = spawnSync(
    process.execPath,
    ['--check', file],
    {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30000
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `Синтаксическая ошибка в ${path.basename(file)}`,
        result.stdout,
        result.stderr
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}

function loadFresh(file) {
  const resolved = require.resolve(file);
  delete require.cache[resolved];
  return require(resolved);
}

function normalizeDynamicValues(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeDynamicValues);
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) =>
          !['ts'].includes(key)
        )
        .map(([key, item]) => [
          key,
          normalizeDynamicValues(item)
        ])
    );
  }

  return value;
}

function parseResponse(response) {
  const normalized = {
    ...response
  };

  if (
    typeof normalized.body === 'string' &&
    normalized.body
  ) {
    normalized.body = JSON.parse(
      normalized.body
    );
  }

  return normalizeDynamicValues(normalized);
}

async function callHandler(module, event) {
  const result = await module.handler(
    JSON.parse(JSON.stringify(event))
  );

  return parseResponse(result);
}

async function compareEvent({
  name,
  sourceModule,
  compactModule,
  event
}) {
  const [sourceResponse, compactResponse] =
    await Promise.all([
      callHandler(sourceModule, event),
      callHandler(compactModule, event)
    ]);

  assert.deepStrictEqual(
    compactResponse,
    sourceResponse,
    `Ответы не совпадают для проверки: ${name}`
  );

  console.log(`✅ Совпадает: ${name}`);
}

async function main() {
  const sourceStat = assertFileExists(
    SOURCE_FILE
  );
  const compactStat = assertFileExists(
    COMPACT_FILE
  );
  assertFileExists(PACKAGE_FILE);

  checkSyntax(SOURCE_FILE);
  checkSyntax(COMPACT_FILE);

  const sourceText = fs.readFileSync(
    SOURCE_FILE,
    'utf8'
  );
  const compactText = fs.readFileSync(
    COMPACT_FILE,
    'utf8'
  );

  if (sourceText.charCodeAt(0) === 0xfeff) {
    throw new Error('index.js содержит UTF-8 BOM');
  }

  if (compactText.charCodeAt(0) === 0xfeff) {
    throw new Error(
      'index.compact.js содержит UTF-8 BOM'
    );
  }

  if (/\r/.test(compactText)) {
    throw new Error(
      'index.compact.js содержит CRLF или CR'
    );
  }

  if (/sourceMappingURL/i.test(compactText)) {
    throw new Error(
      'index.compact.js содержит sourceMappingURL'
    );
  }

  if (/\beval\s*\(/.test(compactText)) {
    throw new Error(
      'index.compact.js неожиданно содержит eval()'
    );
  }

  if (compactStat.size >= sourceStat.size) {
    throw new Error(
      'index.compact.js не меньше index.js'
    );
  }

  const sourceHash = sha256(sourceText);
  const marker = `SOURCE_SHA256=${sourceHash}`;

  assert.ok(
    compactText.includes(marker),
    'SHA-256 исходника в заголовке compact-файла не совпадает'
  );

  assert.ok(
    compactText.includes('exports.handler'),
    'В compact-файле отсутствует exports.handler'
  );

  const packageJson = JSON.parse(
    fs.readFileSync(PACKAGE_FILE, 'utf8')
  );

  assert.strictEqual(
    packageJson.type,
    'commonjs',
    'package.json должен сохранять type=commonjs'
  );

  assert.strictEqual(
    packageJson.main,
    'index.js',
    'Главным исходным файлом должен оставаться index.js'
  );

  const sourceModule = loadFresh(SOURCE_FILE);
  const compactModule = loadFresh(COMPACT_FILE);

  const sourceExports = Object
    .keys(sourceModule)
    .sort();

  const compactExports = Object
    .keys(compactModule)
    .sort();

  assert.deepStrictEqual(
    compactExports,
    sourceExports,
    'Наборы экспортов исходной и компактной версий различаются'
  );

  assert.deepStrictEqual(
    sourceExports,
    ['handler'],
    'Ожидался единственный экспорт handler'
  );

  assert.strictEqual(
    typeof sourceModule.handler,
    'function',
    'index.js не экспортирует handler'
  );

  assert.strictEqual(
    typeof compactModule.handler,
    'function',
    'index.compact.js не экспортирует handler'
  );

  const events = [
    {
      name: 'GET ping через query string',
      event: {
        httpMethod: 'GET',
        headers: {},
        queryStringParameters: {
          action: 'ping'
        }
      }
    },
    {
      name: 'POST ping через JSON body',
      event: {
        httpMethod: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          action: 'ping'
        }),
        isBase64Encoded: false
      }
    },
    {
      name: 'POST ping через base64 body',
      event: {
        httpMethod: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: Buffer
          .from(
            JSON.stringify({
              action: 'ping'
            }),
            'utf8'
          )
          .toString('base64'),
        isBase64Encoded: true
      }
    },
    {
      name: 'прямой event action=ping',
      event: {
        action: 'ping',
        headers: {}
      }
    },
    {
      name: 'неизвестное действие',
      event: {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          action: '__compact_test_unknown__'
        })
      }
    },
    {
      name: 'OPTIONS с разрешённым origin',
      event: {
        httpMethod: 'OPTIONS',
        headers: {
          origin: 'https://apel-s-in.github.io'
        }
      }
    },
    {
      name: 'OPTIONS с null origin',
      event: {
        httpMethod: 'OPTIONS',
        headers: {
          origin: 'null'
        }
      }
    },
    {
      name: 'OPTIONS с custom request headers',
      event: {
        httpMethod: 'OPTIONS',
        headers: {
          origin: 'https://apel-s-in.github.io',
          'access-control-request-headers':
            'Content-Type, X-Vi3-Session'
        }
      }
    }
  ];

  for (const test of events) {
    await compareEvent({
      ...test,
      sourceModule,
      compactModule
    });
  }

  console.log('');
  console.log('✅ Все проверки завершены');
  console.log(`Экспорты: ${sourceExports.join(', ')}`);
  console.log(`SHA-256: ${sourceHash}`);
  console.log(`index.js: ${sourceStat.size} байт`);
  console.log(
    `index.compact.js: ${compactStat.size} байт`
  );
}

main().catch(error => {
  console.error(
    '❌ Проверка compact-файла завершилась ошибкой:',
    error?.stack || error
  );

  process.exitCode = 1;
});
