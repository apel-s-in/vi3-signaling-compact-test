Соблюдай правила из `/ai-rules.txt`.

`index.js` — единственный редактируемый исходник Cloud Function.

`index.compact.js` — автоматически созданная читаемая компактная версия. Не редактируй её вручную.

Для основного форматирования используется Prettier с целевой шириной строки 320. После Prettier генератор безопасно удаляет пустые строки вне шаблонных литералов и многострочных комментариев.

Нельзя использовать:

- Terser;
- UglifyJS;
- минификацию;
- `compress`;
- `mangle`;
- глобальное регулярное выражение для удаления пустых строк;
- преобразование CommonJS в ESM.

После изменения `index.js` необходимо выполнить:

```bash
npm run compact:verify

Обязательно сохраняй:

CommonJS;
exports.handler;
комментарии;
содержимое SQL;
содержимое шаблонных строк;
имена actions;
имена переменных окружения;
числовые и строковые значения;
порядок выполнения операций.

---

# 7. Workflow менять не нужно

Текущий файл:

```text
/.github/workflows/compact-check.yml

уже выполняет:

- name: Install dependencies
  run: npm install --package-lock=false --no-audit --no-fund

Поэтому новая зависимость:

@babel/parser

установится автоматически.

Затем workflow выполнит:

- name: Generate readable index.compact.js
  run: node scripts/build-compact.js

и перезапишет compact-файл новым вариантом.
