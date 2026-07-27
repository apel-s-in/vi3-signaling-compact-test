# vi3-signaling-compact-test

Тестовый репозиторий для безопасной автоматической генерации компактной версии Yandex Cloud Function `vi3-signaling`.

## Основные файлы

- `index.js` — исходная версия функции;
- `index.compact.js` — автоматически сгенерированная компактная версия;
- `scripts/build-compact.js` — генератор;
- `scripts/check-compact.js` — защитные проверки;
- `generate-context.js` — генератор контекста;
- `.meta/project-signaling-compact-full.txt` — контекст без файлов функции.

## Важно

Нельзя вручную редактировать:

- `index.compact.js`;
- `.meta/project-signaling-compact-full.txt`.

Все функциональные изменения вносятся в `index.js`.

## Локальная установка

```bash
npm install
