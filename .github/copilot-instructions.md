Соблюдай правила из `/ai-rules.txt`.

`index.js` — единственный редактируемый исходник Cloud Function.

`index.compact.js` — автоматически созданная читаемая компактная версия. Не редактируй её вручную.

Для генерации используется Prettier с шириной строки 240. Нельзя использовать Terser, минификацию, `compress` или `mangle`.

После изменения `index.js` необходимо выполнить:

```bash
npm run compact:verify
Обязательно сохраняй:

CommonJS;
exports.handler;
комментарии;
SQL-шаблоны;
имена actions;
имена переменных окружения;
порядок выполнения операций.


---

# 7. Что делать с текущим `index.compact.js`

Его не нужно исправлять вручную.

После замены файлов:

1. Открой **Actions**.
2. Выбери:

```text
Generate readable compact function
Нажми Run workflow.
Выбери main.
Запусти workflow.
Текущий минифицированный index.compact.js будет полностью перезаписан.

Новый заголовок будет выглядеть так:

javascript

/* GENERATED_FROM=index.js SOURCE_SHA256=... FORMAT=READABLE_COMPACT PRINT_WIDTH=240 DO_NOT_EDIT */
Если в заголовке остаётся старый вариант без:

text

FORMAT=READABLE_COMPACT
значит запущена старая версия генератора.
