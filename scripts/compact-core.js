'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { parse } = require('@babel/parser');
const prettier = require('prettier');

const PRINT_WIDTH = 320;

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

function parseJavaScript(code) {
  return parse(code, {
    sourceType: 'unambiguous',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: false,
    allowUndeclaredExports: true,
    errorRecovery: false,
    plugins: ['jsx']
  });
}

function markLocationLines(set, location) {
  if (!location?.start || !location?.end) {
    return;
  }

  for (
    let line = location.start.line;
    line <= location.end.line;
    line++
  ) {
    set.add(line);
  }
}

function collectProtectedLines(code) {
  const ast = parseJavaScript(code);
  const protectedLines = new Set();
  const visited = new WeakSet();

  for (const comment of ast.comments || []) {
    if (comment.type === 'CommentBlock') {
      markLocationLines(
        protectedLines,
        comment.loc
      );
    }
  }

  function visit(value) {
    if (
      !value ||
      typeof value !== 'object' ||
      visited.has(value)
    ) {
      return;
    }

    visited.add(value);

    if (value.type === 'TemplateElement') {
      markLocationLines(
        protectedLines,
        value.loc
      );
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }

      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        key === 'loc' ||
        key === 'start' ||
        key === 'end' ||
        key === 'comments' ||
        key === 'tokens'
      ) {
        continue;
      }

      visit(child);
    }
  }

  visit(ast);
  return protectedLines;
}

function removeSafeBlankLines(code) {
  const normalized = code
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const protectedLines =
    collectProtectedLines(normalized);

  const lines = normalized.split('\n');
  let removed = 0;

  const result = lines.filter((line, index) => {
    if (line.trim() !== '') {
      return true;
    }

    if (protectedLines.has(index + 1)) {
      return true;
    }

    removed++;
    return false;
  });

  return {
    code: result.join('\n').trim(),
    removed
  };
}

function addBanner(code, banner) {
  if (!code.startsWith('#!')) {
    return `${banner}\n${code}`;
  }

  const newlineIndex = code.indexOf('\n');

  if (newlineIndex === -1) {
    return `${code}\n${banner}`;
  }

  return [
    code.slice(0, newlineIndex),
    banner,
    code.slice(newlineIndex + 1)
  ].join('\n');
}

async function formatReadableCompact({
  source,
  sourceName
}) {
  if (!source.trim()) {
    throw new Error(
      `Исходный файл ${sourceName} пуст`
    );
  }

  if (source.charCodeAt(0) === 0xfeff) {
    throw new Error(
      `${sourceName} содержит UTF-8 BOM`
    );
  }

  parseJavaScript(source);

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
      quoteProps: 'preserve',
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

  const tightened =
    removeSafeBlankLines(formatted);

  const banner =
    `/* GENERATED_FROM=${sourceName} ` +
    `SOURCE_SHA256=${sourceHash} ` +
    `FORMAT=READABLE_COMPACT ` +
    `PRINT_WIDTH=${PRINT_WIDTH} ` +
    `BLANK_LINES=SAFE_REMOVE ` +
    `DO_NOT_EDIT */`;

  const compact =
    `${addBanner(tightened.code, banner).trim()}\n`;

  parseJavaScript(compact);

  return {
    compact,
    sourceHash,
    removedBlankLines: tightened.removed,
    printWidth: PRINT_WIDTH
  };
}

function memberPropertyName(node) {
  if (!node || node.type !== 'MemberExpression') {
    return '';
  }

  if (
    !node.computed &&
    node.property?.type === 'Identifier'
  ) {
    return node.property.name;
  }

  if (
    node.computed &&
    node.property?.type === 'StringLiteral'
  ) {
    return node.property.value;
  }

  return '';
}

function isModuleExports(node) {
  return Boolean(
    node?.type === 'MemberExpression' &&
    node.object?.type === 'Identifier' &&
    node.object.name === 'module' &&
    memberPropertyName(node) === 'exports'
  );
}

function isHandlerMember(node) {
  if (
    node?.type !== 'MemberExpression' ||
    memberPropertyName(node) !== 'handler'
  ) {
    return false;
  }

  if (
    node.object?.type === 'Identifier' &&
    node.object.name === 'exports'
  ) {
    return true;
  }

  return isModuleExports(node.object);
}

function objectExportsHandler(node) {
  if (node?.type !== 'ObjectExpression') {
    return false;
  }

  return node.properties.some(property => {
    if (
      property.type !== 'ObjectProperty' &&
      property.type !== 'ObjectMethod'
    ) {
      return false;
    }

    if (
      property.key?.type === 'Identifier' &&
      property.key.name === 'handler'
    ) {
      return true;
    }

    return (
      property.key?.type === 'StringLiteral' &&
      property.key.value === 'handler'
    );
  });
}

function declarationExportsHandler(node) {
  if (!node) return false;

  if (
    (
      node.type === 'FunctionDeclaration' ||
      node.type === 'ClassDeclaration'
    ) &&
    node.id?.name === 'handler'
  ) {
    return true;
  }

  if (node.type === 'VariableDeclaration') {
    return node.declarations.some(
      declaration =>
        declaration.id?.type === 'Identifier' &&
        declaration.id.name === 'handler'
    );
  }

  return false;
}

function hasHandlerExport(code) {
  const ast = parseJavaScript(code);
  const visited = new WeakSet();
  let found = false;

  function visit(value) {
    if (
      found ||
      !value ||
      typeof value !== 'object' ||
      visited.has(value)
    ) {
      return;
    }

    visited.add(value);

    if (
      value.type === 'AssignmentExpression'
    ) {
      if (isHandlerMember(value.left)) {
        found = true;
        return;
      }

      if (
        isModuleExports(value.left) &&
        objectExportsHandler(value.right)
      ) {
        found = true;
        return;
      }
    }

    if (
      value.type === 'ExportNamedDeclaration' &&
      declarationExportsHandler(value.declaration)
    ) {
      found = true;
      return;
    }

    if (
      value.type === 'ExportNamedDeclaration' &&
      Array.isArray(value.specifiers) &&
      value.specifiers.some(specifier =>
        (
          specifier.exported?.name === 'handler' ||
          specifier.exported?.value === 'handler'
        )
      )
    ) {
      found = true;
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }

      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        key === 'loc' ||
        key === 'start' ||
        key === 'end' ||
        key === 'comments' ||
        key === 'tokens'
      ) {
        continue;
      }

      visit(child);
    }
  }

  visit(ast);
  return found;
}

const REMOVED_AST_KEYS = new Set([
  'start',
  'end',
  'loc',
  'extra',
  'comments',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'tokens',
  'errors'
]);

function staticPropertyKeyValue(node) {
  if (
    !node ||
    typeof node !== 'object'
  ) {
    return null;
  }

  if (node.computed === true) {
    return null;
  }

  if (node.key?.type === 'Identifier') {
    return node.key.name;
  }

  if (node.key?.type === 'StringLiteral') {
    return node.key.value;
  }

  return null;
}

function normalizeAstValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeAstValue);
  }

  if (
    !value ||
    typeof value !== 'object'
  ) {
    return value;
  }

  const normalized = {};
  const propertyKey = (
    value.type === 'ObjectProperty' ||
    value.type === 'ObjectMethod'
  )
    ? staticPropertyKeyValue(value)
    : null;

  for (const key of Object.keys(value).sort()) {
    if (REMOVED_AST_KEYS.has(key)) {
      continue;
    }

    if (
      key === 'key' &&
      propertyKey !== null
    ) {
      normalized.key = {
        type: 'StaticPropertyKey',
        value: propertyKey
      };
      continue;
    }

    normalized[key] =
      normalizeAstValue(value[key]);
  }

  return normalized;
}

function comparableAst(code) {
  return normalizeAstValue(
    parseJavaScript(code)
  );
}

function assertSameProgram(
  source,
  compact,
  message = 'AST исходника и результата различается'
) {
  assert.deepStrictEqual(
    comparableAst(compact),
    comparableAst(source),
    message
  );
}

module.exports = {
  PRINT_WIDTH,
  assertSameProgram,
  formatReadableCompact,
  hasHandlerExport,
  parseJavaScript,
  sha256
};
