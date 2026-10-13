# Velocity Apex — Free Roam Mobile HUD / iPhone Fix

## Что исправлено

- Drag HUD переработан для современных iPhone в landscape, включая экраны 844–932 CSS px.
- Мобильные правила теперь ориентируются не только на ширину, но и на небольшую высоту экрана.
- Во время активного drag пассивный preview чата скрывается, чтобы не перекрывать гонку и индикатор лидера.
- Если чат был открыт перед стартом drag, он автоматически закрывается вместе с клавиатурой.
- Если игрок вручную открывает чат во время drag, окно размещается ниже Drag HUD и выше кнопок управления.
- На телефоне preview чата показывает только две последние строки и занимает меньше места.
- Уменьшены HUD, speed panel, кнопки меню и мобильные controls в landscape.
- Учтены iPhone safe-area / Dynamic Island / home indicator через существующие safe-area variables.
- Добавлен portrait fallback и режим для очень низкой высоты viewport (например, при открытой iOS-клавиатуре).
- Обновлены cache-bust версии CSS и Free Roam JS, чтобы Safari не оставался на старом интерфейсе.
- Добавлен автоматический тест `free_mobile_hud_test.js`.

## Проверка

`npm test` — проходит полностью, включая drag sync и новый mobile HUD test.

## Обновление через GitHub / терминал

Загрузите ZIP в корень репозитория и выполните:

```bash
unzip -o Velocity-Apex-Mobile-HUD-iPhone-Fix.zip -d .
rm Velocity-Apex-Mobile-HUD-iPhone-Fix.zip
npm test
git add .
git commit -m "Optimize Free Roam HUD for iPhone"
git push
```

Если Cloudflare Worker / Pages не разворачивается автоматически:

```bash
npx wrangler deploy
```
