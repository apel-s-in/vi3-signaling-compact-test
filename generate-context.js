/* eslint-disable no-console */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const META_DIR = path.join(ROOT, '.meta');
const OUTPUT_FILE = path.join(META_DIR, 'repository-full.txt');

const EXCLUDED_FILES = new Set([
  'index.js',
  'index.compact.js'
]);

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.meta',
  'node_modules'
]);

function toUnix(value) {
  return String(value || '').replace(/\\/g, '/');
}

function sha256(buffer) {
  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}

function isExcluded(relative) {
  const normalized = toUnix(relative);
  const parts = normalized.split('/');

  if (!normalized) return true;
  if (EXCLUDED_FILES.has(normalized)) return true;

  return parts.some(part =>
    EXCLUDED_DIRECTORIES.has(part)
  );
}

function listTrackedFiles() {
  try {
    const result = execFileSync(
      'git',
      ['ls-files', '-z'],
      {
        cwd: ROOT,
        encoding: 'buffer',
        maxBuffer: 64 * 1024 * 1024
      }
    );

    return result
      .toString('utf8')
      .split('\0')
      .map(toUnix)
      .filter(Boolean)
      .filter(relative => !isExcluded(relative))
      .sort((left, right) =>
        left.localeCompare(right, 'en')
      );
  } catch (error) {
    console.warn(
      'Не удалось выполнить git ls-files, используется обход каталогов:',
      error.message
    );

    return listFilesFromDisk();
  }
}

function listFilesFromDisk() {
  const files = [];
  const stack = [ROOT];

  while (stack.length) {
    const directory = stack.pop();
    let entries = [];

    try {
      entries = fs.readdirSync(directory, {
        withFileTypes: true
      });
    } catch (error) {
      console.warn(
        `Не удалось прочитать каталог ${directory}:`,
        error.message
      );
      continue;
    }

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = toUnix(
        path.relative(ROOT, absolute)
      );

      if (isExcluded(relative)) continue;

      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  }

  return files.sort((left, right) =>
    left.localeCompare(right, 'en')
  );
}

function isTextBuffer(buffer) {
  if (!buffer.length) return true;

  const sample = buffer.subarray(
    0,
    Math.min(buffer.length, 16384)
  );

  if (sample.includes(0)) return false;

  let controlCharacters = 0;

  for (const byte of sample) {
    const allowed =
      byte === 9 ||
      byte === 10 ||
      byte === 13;

    if (byte < 32 && !allowed) {
      controlCharacters++;
    }
  }

  return controlCharacters / sample.length < 0.01;
}

function buildTree(files) {
  const root = {
    directories: new Map(),
    files: []
  };

  for (const relative of files) {
    const parts = relative.split('/');
    const fileName = parts.pop();
    let current = root;

    for (const directoryName of parts) {
      if (!current.directories.has(directoryName)) {
        current.directories.set(directoryName, {
          directories: new Map(),
          files: []
        });
      }

      current = current.directories.get(directoryName);
    }

    current.files.push(fileName);
  }

  const lines = [
    'СТРУКТУРА РЕПОЗИТОРИЯ:',
    `${path.basename(ROOT)}/`
  ];

  function render(node, prefix = '') {
    const directories = [...node.directories.entries()]
      .sort(([left], [right]) =>
        left.localeCompare(right, 'en')
      )
      .map(([name, child]) => ({
        name,
        child,
        directory: true
      }));

    const files = [...node.files]
      .sort((left, right) =>
        left.localeCompare(right, 'en')
      )
      .map(name => ({
        name,
        child: null,
        directory: false
      }));

    const entries = [
      ...directories,
      ...files
    ];

    entries.forEach((entry, index) => {
      const last = index === entries.length - 1;
      const branch = last ? '└── ' : '├── ';

      lines.push(
        `${prefix}${branch}${entry.name}${entry.directory ? '/' : ''}`
      );

      if (entry.directory) {
        render(
          entry.child,
          `${prefix}${last ? '    ' : '│   '}`
        );
      }
    });
  }

  render(root);
  return lines.join('\n');
}

function repositoryName() {
  return String(
    process.env.GITHUB_REPOSITORY ||
    path.basename(ROOT)
  );
}

function repositoryUrl() {
  const githubRepository = String(
    process.env.GITHUB_REPOSITORY || ''
  ).trim();

  if (githubRepository) {
    return `https://github.com/${githubRepository}`;
  }

  try {
    const remote = execFileSync(
      'git',
      ['config', '--get', 'remote.origin.url'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    ).trim();

    if (remote.startsWith('git@github.com:')) {
      return remote
        .replace(
          'git@github.com:',
          'https://github.com/'
        )
        .replace(/\.git$/, '');
    }

    return remote.replace(/\.git$/, '');
  } catch {
    return '';
  }
}

function buildFileBlock(relative) {
  const absolute = path.join(ROOT, relative);

  try {
    const buffer = fs.readFileSync(absolute);

    if (!isTextBuffer(buffer)) {
      return `//=================================================
// FILE: /${relative}
// BINARY FILE
// Размер: ${buffer.length} байт
// SHA-256: ${sha256(buffer)}

`;
    }

    const text = buffer
      .toString('utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    return `//=================================================
// FILE: /${relative}
${text}${text.endsWith('\n') ? '' : '\n'}
`;
  } catch (error) {
    return `//=================================================
// FILE: /${relative}
// Не удалось прочитать файл: ${error.message}

`;
  }
}

function main() {
  const files = listTrackedFiles();

  fs.mkdirSync(META_DIR, {
    recursive: true
  });

  let output = `Название репозитория: ${repositoryName()}
Адрес репозитория: ${repositoryUrl()}
Назначение: генерация полного контекста тестового репозитория vi3-signaling-compact-test.

ИСКЛЮЧЕНО ИЗ КОНТЕКСТА:
- index.js
- index.compact.js
- .git
- .meta
- node_modules

Все остальные отслеживаемые файлы включаются без проверки их синтаксиса или корректности.
Файлы .gitignore и .gitattributes включаются как обычные текстовые файлы.

${buildTree(files)}

Сгенерировано: ${new Date().toISOString()}

`;

  for (const relative of files) {
    output += buildFileBlock(relative);
  }

  const temporaryFile = `${OUTPUT_FILE}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    output,
    'utf8'
  );

  fs.renameSync(
    temporaryFile,
    OUTPUT_FILE
  );

  console.log(`Создан файл: ${OUTPUT_FILE}`);
  console.log(`Включено файлов: ${files.length}`);
  console.log(
    `Размер: ${fs.statSync(OUTPUT_FILE).size} байт`
  );
}

try {
  main();
} catch (error) {
  console.error(
    'Ошибка генерации контекста:',
    error?.stack || error
  );
  process.exitCode = 1;
}
