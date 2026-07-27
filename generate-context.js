/* eslint-disable no-console */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const META_DIR = path.join(ROOT, '.meta');
const OUTPUT_FILE = path.join(
  META_DIR,
  'project-signaling-compact-full.txt'
);

const OUTPUT_RELATIVE = toUnix(
  path.relative(ROOT, OUTPUT_FILE)
);

/*
 * Эти файлы полностью исключаются:
 * - из дерева;
 * - из блоков содержимого;
 * - из статистики контекста.
 */
const EXCLUDED_FUNCTION_FILES = new Set([
  'index.js',
  'index.compact.js'
]);

const EXCLUDED_EXACT = new Set([
  OUTPUT_RELATIVE,
  '.meta/project-friends-full.txt',
  '.meta/project-friends-adaptive.txt',
  'project-friends-full.txt',
  'project-friends-adaptive.txt'
]);

const EXCLUDED_PREFIXES = [
  '.git/',
  '.meta/',
  'node_modules/',
  'coverage/',
  'dist/',
  'build/',
  'out/',
  '.cache/',
  '.idea/',
  '.vscode/'
];

const EXCLUDED_SUFFIXES = [
  '.log',
  '.tmp',
  '.temp',
  '.bak',
  '.orig',
  '.rej',
  '.map',
  '.min.js',
  '.min.css'
];

const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.graphql',
  '.htm',
  '.html',
  '.ini',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.md',
  '.mjs',
  '.properties',
  '.scss',
  '.sh',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.webmanifest',
  '.xml',
  '.yaml',
  '.yml'
]);

const TEXT_FILE_NAMES = new Set([
  '.editorconfig',
  '.env.example',
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  'AGENTS.md',
  'Dockerfile',
  'LICENSE',
  'Makefile',
  'README',
  'README.md'
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
  const file = toUnix(relative);

  if (!file) return true;
  if (EXCLUDED_FUNCTION_FILES.has(file)) return true;
  if (EXCLUDED_EXACT.has(file)) return true;

  if (
    EXCLUDED_PREFIXES.some(prefix =>
      file.startsWith(prefix)
    )
  ) {
    return true;
  }

  return EXCLUDED_SUFFIXES.some(suffix =>
    file.endsWith(suffix)
  );
}

function listTrackedFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '-z'],
    {
      cwd: ROOT,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024
    }
  );

  return output
    .toString('utf8')
    .split('\0')
    .map(toUnix)
    .filter(Boolean)
    .filter(file => !isExcluded(file))
    .sort((left, right) =>
      left.localeCompare(right, 'en')
    );
}

function repositoryName() {
  const repository = String(
    process.env.GITHUB_REPOSITORY || ''
  ).trim();

  return repository || path.basename(ROOT);
}

function repositoryUrl() {
  const repository = String(
    process.env.GITHUB_REPOSITORY || ''
  ).trim();

  if (repository) {
    return `https://github.com/${repository}`;
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

    if (/^git@github\.com:/.test(remote)) {
      return remote
        .replace(/^git@github\.com:/, 'https://github.com/')
        .replace(/\.git$/, '');
    }

    return remote.replace(/\.git$/, '');
  } catch {
    return 'https://github.com/apel-s-in/vi3-signaling-compact-test';
  }
}

function isProbablyText(relative, buffer) {
  const fileName = path.basename(relative);
  const extension = path
    .extname(relative)
    .toLowerCase();

  if (
    TEXT_FILE_NAMES.has(fileName) ||
    TEXT_EXTENSIONS.has(extension)
  ) {
    return true;
  }

  if (!buffer.length) return true;

  const sample = buffer.subarray(
    0,
    Math.min(buffer.length, 8192)
  );

  if (sample.includes(0)) return false;

  let suspicious = 0;

  for (const byte of sample) {
    const allowedControl =
      byte === 9 ||
      byte === 10 ||
      byte === 13;

    if (byte < 32 && !allowedControl) {
      suspicious++;
    }
  }

  return suspicious / sample.length < 0.01;
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

    for (const directory of parts) {
      if (!current.directories.has(directory)) {
        current.directories.set(directory, {
          directories: new Map(),
          files: []
        });
      }

      current = current.directories.get(directory);
    }

    current.files.push(fileName);
  }

  const lines = [
    'СТРУКТУРА ПРОЕКТА:',
    `${path.basename(ROOT)}/`
  ];

  function render(node, prefix = '') {
    const directories = [
      ...node.directories.entries()
    ].sort(([left], [right]) =>
      left.localeCompare(right, 'en')
    );

    const files = [...node.files]
      .sort((left, right) =>
        left.localeCompare(right, 'en')
      )
      .map(file => ({
        name: file,
        directory: false,
        node: null
      }));

    const children = [
      ...directories.map(([name, child]) => ({
        name,
        directory: true,
        node: child
      })),
      ...files
    ];

    children.forEach((child, index) => {
      const last = index === children.length - 1;
      const branch = last ? '└── ' : '├── ';

      lines.push(
        `${prefix}${branch}${child.name}${child.directory ? '/' : ''}`
      );

      if (child.directory) {
        render(
          child.node,
          `${prefix}${last ? '    ' : '│   '}`
        );
      }
    });
  }

  render(root);
  return lines.join('\n');
}

function textBlock(relative, buffer) {
  const text = buffer
    .toString('utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  return `//=================================================
// FILE: /${relative}
${text}${text.endsWith('\n') ? '' : '\n'}
`;
}

function binaryBlock(relative, buffer) {
  return `//=================================================
// FILE: /${relative}
// BINARY OR NON-TEXT FILE
// Содержимое не включено.
// Размер: ${buffer.length} байт
// SHA-256: ${sha256(buffer)}

`;
}

function fileBlock(relative) {
  const absolute = path.join(ROOT, relative);

  try {
    const buffer = fs.readFileSync(absolute);

    return isProbablyText(relative, buffer)
      ? textBlock(relative, buffer)
      : binaryBlock(relative, buffer);
  } catch (error) {
    return `//=================================================
// FILE: /${relative}
// READ ERROR: ${error.message}

`;
  }
}

function main() {
  const files = listTrackedFiles();

  if (!files.length) {
    throw new Error(
      'Не найдено файлов для формирования контекста'
    );
  }

  let textFiles = 0;
  let binaryFiles = 0;

  for (const relative of files) {
    const buffer = fs.readFileSync(
      path.join(ROOT, relative)
    );

    if (isProbablyText(relative, buffer)) {
      textFiles++;
    } else {
      binaryFiles++;
    }
  }

  let output = `Название репозитория: ${repositoryName()}
Адрес репозитория: ${repositoryUrl()}
Назначение: тестирование безопасной автоматической генерации index.compact.js из index.js для Yandex Cloud Function vi3-signaling.

ПРАВИЛА КОНТЕКСТА:
- index.js полностью исключён из контекста.
- index.compact.js полностью исключён из контекста.
- Эти два файла отсутствуют и в дереве проекта, и в блоках содержимого.
- Каталог .meta не включается во избежание рекурсивной генерации.
- node_modules, .git, временные файлы и lock-файлы не включаются.
- Генерируется только один файл: .meta/project-signaling-compact-full.txt.
- Adaptive-контекст не создаётся.
- Переменные окружения и GitHub Secrets не читаются.

СВОДКА:
- Файлов в контексте: ${files.length}
- Текстовых файлов: ${textFiles}
- Бинарных или нетекстовых файлов: ${binaryFiles}
- Полностью исключённых файлов функции: ${EXCLUDED_FUNCTION_FILES.size}

${buildTree(files)}

Сгенерировано: ${new Date()
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)} UTC

`;

  for (const relative of files) {
    output += fileBlock(relative);
  }

  if (
    output.includes('// FILE: /index.js') ||
    output.includes('// FILE: /index.compact.js')
  ) {
    throw new Error(
      'Защитная проверка: файл функции попал в контекст'
    );
  }

  fs.mkdirSync(META_DIR, {
    recursive: true
  });

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

  const stat = fs.statSync(OUTPUT_FILE);

  if (!stat.size) {
    throw new Error(
      'Сгенерированный контекст оказался пустым'
    );
  }

  console.log(`✅ Создан ${OUTPUT_RELATIVE}`);
  console.log(`Файлов: ${files.length}`);
  console.log(`Текстовых: ${textFiles}`);
  console.log(`Бинарных: ${binaryFiles}`);
  console.log(`Размер: ${stat.size} байт`);
}

try {
  main();
} catch (error) {
  console.error(
    '❌ Ошибка генерации контекста:',
    error?.stack || error
  );
  process.exit(1);
}
