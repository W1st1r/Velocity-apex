# Velocity Apex — Garage Layout V54

## Что исправлено

- Garage переразбит на стабильные зоны: Header → Primary Tabs → Secondary Navigation → Content → Bottom status/safe area.
- Категории `ВСЕ / BASIC / SPORT / PREMIUM / RARE / LEGENDARY / LUX` вынесены из правой колонки и теперь всегда находятся отдельной строкой под основными вкладками.
- `МАШИНЫ / ЭФФЕКТЫ / UPGRADE` имеют одинаковую геометрию; активный Upgrade использует аккуратный neon accent вместо сплошной кислотной заливки.
- Standard Garage и Upgrade стали взаимоисключающими sibling-панелями. Скрытая панель получает `hidden`, `aria-hidden` и `inert`, поэтому ghosting и невидимые клики исключены.
- Удалены ручные `style.display` переключения Garage.
- Основной Garage использует независимую responsive CSS Grid: слева выбранная машина, справа коллекция со своим scroll area.
- Header, tabs и категории не прокручиваются вместе с карточками.
- Upgrade использует единую Grid-сетку 34 / 22 / 34, одинаковую высоту колонок и отдельную action bar снизу.
- Колесо центрируется контейнером, без координатных костылей под конкретный iPhone.
- Добавлена отдельная адаптация landscape для низких экранов без глобального `transform: scale()`.
- Учтены safe-area, Dynamic Island / Home Indicator и iPhone landscape.
- Игровые кнопки защищены от случайного выделения текста / touch callout без изменения input-полей.
- Cache-bust V54 добавлен отдельно, не ломая прежние версионные guards.

## Проверка

- `npm test` — PASS.
- `tests/garage_upgrade_v52_test.mjs` — PASS.
- `tests/garage_layout_v54_test.mjs` — PASS.
- `tests/garage_visual_smoke.js` — PASS.
- `tests/garage_performance_smoke.js` — PASS.

Экономика Upgrade, API, машины, эффекты и серверная механика не изменялись.
