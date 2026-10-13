# Velocity Apex — Mobile UI V5 + Admin Ranks

## Что изменено

- Главное меню собрано как компактный мобильный dashboard: режимы игры отдельно, быстрый доступ отдельно, статистика внизу.
- На iPhone landscape быстрые разделы теперь идут в 2 читаемые колонки вместо слишком плотной сетки с мелким текстом.
- Увеличены touch-target и читаемость кнопок в ключевых мобильных меню.
- Safe-area применяется для устройств с Dynamic Island / вырезом / home indicator.
- Дополнительно оптимизированы: Support, Admin Panel, Owner Panel, Market, Crew, Tuning, Garage, Shop, Account, Friends, Online, Settings, Pause, Results.
- Отдельно добавлена мобильная защита от переполнения для Free Roam: pause, levels, chat, map.
- Оптимизировано окно кейсов: компактный header, безопасная высота, крупные кнопки, адаптация для узких landscape экранов.
- Версии CSS/JS обновлены (`mobile5`, `admin3`), чтобы Safari/iPhone не оставлял старый интерфейс в кэше.

## Новые названия администрации

1. Helper
2. Moder
3. St.Moder
4. Admin
5. Curator

Права, лимиты, нормы активности и зарплаты уровней не менялись — изменены только названия рангов и их отображение в интерфейсе.

## Обновление на Cloudflare

Из `/workspaces/Velocity-apex`:

```bash
unzip -o Velocity-Apex-Mobile-UI-V5-Admin-Ranks.zip -d .
npm install
npm test
npx wrangler d1 migrations apply velocity-apex-db --remote
npx wrangler deploy
```

Если миграция администрации уже применена, Wrangler не применит её второй раз.

После deploy открой URL из терминала и полностью перезагрузи страницу/PWA.
