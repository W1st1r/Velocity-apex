# 2.0.1 — P0 frontend startup recovery

Status: RELEASED 2.0.1; production browser startup gate PASS.

Published 2026-10-22 18:32:38 UTC, source bc133a41a539cd7b595d0affa7096c4fe3931be9. Worker version 361ab350-a0eb-4fd9-afd1-19c551233fdb. Protected workflow 39831409271 SUCCESS.

Live production smoke: five profiles PASS (WebKit iPhone 13/14/15/17 landscape and Chromium), 41 linked CSS/JS assets loaded, login/menu visible, reload successful, no application page errors. Independent cloud browser displayed the main menu with build 2.0.1 after reload. Authentication persistence was not independently validated against an authenticated server response; visible profile restoration alone is insufficient proof. Physical iPhone/PWA remains unverified. No D1 migrations, repeat release or rollback performed.

Workflow: https://github.com/W1st1r/Velocity-apex/actions/runs/39831409271

Production 2.0.0 was reproduced in the cloud browser: the complete document became `<html ...>2.0.0</html>`, with no body, login or menu. Console subsequently reported `renderTrackCards` accessing a deleted element. This is a startup defect, not an assumed PWA cache problem.

Root cause: `loadAppVersion` sets `documentElement.dataset.appVersion`, then selects `[data-app-version]` and sets every match's `textContent`. The root HTML element is now a match and loses all children. The existing unit document fixture returned only the version label and missed the root element.

Fix: exclude `doc.documentElement` when updating version labels. The root keeps its version metadata and application DOM. Version and common asset cache keys are 2.0.1. No game rules, bot behavior, account data or economy changes.

Regression: the document fixture now includes the dynamically marked root and detects its children being deleted. It FAILED on the original loader and PASSed after the one-line fix. A new focused Playwright check loads the complete application, checks all linked CSS/JS responses and page errors, waits for visible login or main menu after version rendering, takes screenshots and reloads the page. Targets: WebKit iPhone 13/14/15/17 landscape and Chromium. A protected hotfix workflow runs the browser gate before production approval and repeats the focused test against the deployed application.

Hotfix workflow deploys Worker/assets only; no D1 migration/export/restore. The verified V77 source/D1 recovery artifacts and previous deployment metadata from release 39827949155 remain available. A prior-version metadata artifact is retained before hotfix publication. No rollback to the known-broken 2.0.0 is automatic.

PWA update after a verified deployment: close the installed app, open the production URL with `?update=2.0.1` in Safari, reload and confirm the login/menu, then reopen the home-screen app. Do not clear website storage or delete accounts. No new service worker is introduced; cache keys change for linked scripts and styles. Physical iPhone acceptance requires the owner's actual device result and is not claimed from emulation.
