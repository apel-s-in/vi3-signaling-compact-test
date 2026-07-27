/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const META_DIR = path.join(ROOT, '.meta');
const OUTPUT_FILE = path.join(META_DIR, 'repository-context.txt');

const HIDDEN_SOURCE_FILES = new Set([
  'index.js',
  'index.compact.js'
]);

const EXCLUDED_PREFIXES = [
  '.git/',
  '.meta/',
  'node_modules/'
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

const toUnix = value =>
  String(value || '').replace(/\\/g, '/');

const isExcluded = relative => {
  const file = toUnix(relative);

  return (
    !file ||
    file === '.meta' ||
    file === 'node_modules' ||
    EXCLUDED_PREFIXES.some(prefix =>
      file.startsWith(prefix)
    )
  );
};

const sha256 = buffer =>
  crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');

const getRepositoryName = () =>
  String(
    process.env.GITHUB_REPOSITORY ||
    path.basename(ROOT)
  ).trim();

const getRepositoryUrl = () => {
  const repository = String(
    process.env.GITHUB_REPOSITORY || ''
  ).trim();

  if (repository) {
    return `https://github.com/${repository}`;
  }

  try {
    const result = execFileSync(
      'git',
      ['config', '--get', 'remote.origin.url'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    ).trim();

    return result || 'не определён';
  } catch {
    return 'не определён';
  }
};

const listTrackedFiles = () => {
  try {
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
  } catch {
    return listFilesFallback();
  }
};

const listFilesFallback = () => {
  const files = [];
  const stack = [ROOT];

  while (stack.length) {
    const directory = stack.pop();
    let entries = [];

    try {
      entries = fs.readdirSync(directory, {
        withFileTypes: true
      });
    } catch {
      continue;
    }

    entries.forEach(entry => {
      const absolute = path.join(
        directory,
        entry.name
      );
      const relative = toUnix(
        path.relative(ROOT, absolute)
      );

      if (isExcluded(relative)) return;

      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    });
  }

  return files.sort((left, right) =>
    left.localeCompare(right, 'en')
  );
};

const isProbablyText = (relative, buffer) => {
  const name = path.basename(relative);
  const extension =
    path.extname(relative).toLowerCase();

  if (
    TEXT_EXTENSIONS.has(extension) ||
    TEXT_FILE_NAMES.has(name)
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

    if (
      byte < 32 &&
      !allowedControl
    ) {
      suspicious++;
    }
  }

  return suspicious / sample.length < 0.01;
};

const buildTree = files => {
  const root = {
    directories: new Map(),
    files: []
  };

  files.forEach(relative => {
    const parts = relative.split('/');
    const fileName = parts.pop();
    let current = root;

    parts.forEach(part => {
      if (!current.directories.has(part)) {
        current.directories.set(part, {
          directories: new Map(),
          files: []
        });
      }

      current = current.directories.get(part);
    });

    current.files.push(fileName);
  });

  const lines = [
    'СТРУКТУРА РЕПОЗИТОРИЯ:'
  ];

  const render = (node, currentPath = '') => {
    const displayPath = currentPath
      ? `/${currentPath}/`
      : '/';

    const fileNames = [...node.files]
      .sort((left, right) =>
        left.localeCompare(right, 'en')
      );

    if (fileNames.length) {
      lines.push(
        `[${displayPath}] ${fileNames.join(', ')}`
      );
    }

    const directories = [
      ...node.directories.entries()
    ].sort(([left], [right]) =>
      left.localeCompare(right, 'en')
    );

    if (
      !fileNames.length &&
      !directories.length
    ) {
      lines.push(`[${displayPath}] (пусто)`);
    }

    directories.forEach(([name, child]) => {
      render(
        child,
        currentPath
          ? `${currentPath}/${name}`
          : name
      );
    });
  };

  render(root);
  return lines.join('\n');
};

const hiddenSourceBlock = (
  relative,
  buffer
) => `//=================================================
// FILE: /${relative}
// CONTENT OMITTED INTENTIONALLY
// Причина: исходный или сгенерированный файл Cloud Function исключён из полного контекста.
// Размер: ${buffer.length} байт
// SHA-256: ${sha256(buffer)}
`;

const binaryFileBlock = (
  relative,
  buffer
) => `//=================================================
// FILE: /${relative}
// BINARY OR NON-TEXT FILE
// Полный текст не включён.
// Размер: ${buffer.length} байт
// SHA-256: ${sha256(buffer)}
`;

const textFileBlock = (
  relative,
  buffer
) => {
  const text = buffer
    .toString('utf8')
    .replace(/\r\n/g, '\n');

  return `//=================================================
// FILE: /${relative}
${text}${text.endsWith('\n') ? '' : '\n'}`;
};

const buildFileBlock = relative => {
  const absolute = path.join(ROOT, relative);
  let buffer;

  try {
    buffer = fs.readFileSync(absolute);
  } catch (error) {
    return `//=================================================
// FILE: /${relative}
// READ ERROR: ${error.message}
`;
  }

  if (HIDDEN_SOURCE_FILES.has(relative)) {
    return hiddenSourceBlock(relative, buffer);
  }

  if (!isProbablyText(relative, buffer)) {
    return binaryFileBlock(relative, buffer);
  }

  return textFileBlock(relative, buffer);
};

const buildHeader = ({
  files,
  textFiles,
  binaryFiles
}) => {
  const generatedAt = new Date().toISOString();

  return `КОНТЕКСТ ТЕСТОВОГО РЕПОЗИТОРИЯ

Название репозитория: ${getRepositoryName()}
Адрес репозитория: ${getRepositoryUrl()}
Сформировано: ${generatedAt}

НАЗНАЧЕНИЕ:
Диагностика автоматической генерации index.compact.js из index.js.

ПРАВИЛА ЭТОГО КОНТЕКСТА:
- Дерево содержит все отслеживаемые Git файлы, кроме содержимого .meta.
- Полный текст index.js намеренно не включён.
- Полный текст index.compact.js намеренно не включён.
- Для index.js и index.compact.js указаны только размер и SHA-256.
- Полный текст остальных текстовых файлов включён.
- Для бинарных файлов указаны только размер и SHA-256.
- node_modules, .git и .meta не включаются.
- Переменные окружения и GitHub Secrets не читаются и не выводятся.

СВОДКА:
- Файлов в дереве: ${files}
- Текстовых файлов с содержимым: ${textFiles}
- Бинарных или нетекстовых файлов: ${binaryFiles}
- Исключённых исходников: ${HIDDEN_SOURCE_FILES.size}

`;
};

const main = () => {
  const files = listTrackedFiles();

  if (!files.length) {
    throw new Error(
      'В репозитории не найдено отслеживаемых файлов'
    );
  }

  let textFiles = 0;
  let binaryFiles = 0;

  files.forEach(relative => {
    if (HIDDEN_SOURCE_FILES.has(relative)) return;

    const absolute = path.join(ROOT, relative);

    try {
      const buffer = fs.readFileSync(absolute);

      if (isProbablyText(relative, buffer)) {
        textFiles++;
      } else {
        binaryFiles++;
      }
    } catch {}
  });

  let output = buildHeader({
    files: files.length,
    textFiles,
    binaryFiles
  });

  output += `${buildTree(files)}\n\n`;

  files.forEach(relative => {
    output += `${buildFileBlock(relative)}\n`;
  });

  fs.mkdirSync(META_DIR, {
    recursive: true
  });

  const temporaryFile =
    `${OUTPUT_FILE}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    output,
    'utf8'
  );

  fs.renameSync(
    temporaryFile,
    OUTPUT_FILE
  );

  const outputSize =
    fs.statSync(OUTPUT_FILE).size;

  console.log(
    `✅ Создан ${toUnix(
      path.relative(ROOT, OUTPUT_FILE)
    )}`
  );
  console.log(`Файлов в дереве: ${files.length}`);
  console.log(`Текстовых файлов: ${textFiles}`);
  console.log(`Бинарных файлов: ${binaryFiles}`);
  console.log(`Размер контекста: ${outputSize} байт`);
};

try {
  main();
} catch (error) {
  console.error(
    '❌ Ошибка генерации контекста:',
    error?.stack || error
  );
  process.exit(1);
}
