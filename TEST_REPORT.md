# Velocity Apex 2 — Validation Report

Date: 2026-09-13

## Scope

This package keeps the existing HTML/CSS/vanilla JavaScript/Canvas 2D and Cloudflare Worker/Durable Object/WebSocket architecture. The pass covers the main menu, local race setup, Online landing/create/join/Lobby UI, shared vehicle physics, AI/racing-line tuning, online state validation, and a new sixth track. Legacy save key `velocityApex.v1`, car IDs, Shop/Garage, controls, pause behavior, PWA assets and room flow remain in place.

## New track

- `AURORA GRAND LOOP` (`auroraGrandLoop`)
- Generated length: **15,000.0** world-distance units / **15.00 km**
- `targetLength: 15000`
- `roadWidth: 226`
- 25 Catmull-Rom control points
- Geometry smoke test: 1,250 samples, minimum local segment 11.87, no centerline self-intersections
- `aurora` cached Canvas scenery adds shoreline/water, forest belts, rock zones, paddock/service details, grandstand/pit treatment, signals and braking/road markings.

## Shared race physics

- `maxSpeed`: **510**
- `accel`: **268**
- `brakePower`: **368**
- `turnRate`: **2.40**

The deterministic six-second full-throttle straight-line check measures 2,278.4 distance units in the new model versus 1,807.7 with the legacy 400/210/320/2.32 settings: **1.260× distance**. HUD speed now shows actual `Car.speed`. Player and AI still share the same `Car.update()` physics; difficulty remains a driver-model difference.

AI braking horizon, racing-line speed envelopes, look-ahead, traffic horizon and recovery speeds were retuned for the higher velocities. Camera look-ahead/zoom and subtle speed-line thresholds were also adapted. Online `player_state` accepts the new honest top speed with a bounded 650 speed ceiling and ±1200 velocity-component limits; the Durable Object displacement guard and client large-correction threshold were scaled correspondingly without removing sanity checks.

## UI / iPhone landscape

Menu and Online panels now use a compact premium graphite/teal treatment with a clearer primary-action hierarchy, subtle highlights, controlled lime glow, modern fields/selects/toggles, dedicated connection pill, richer room-code card, player status badges, separated Host Settings, copy feedback, pressed/focus states and 120–180 ms micro-transitions. Compact landscape rules preserve the same layout hierarchy down to 375–430 px viewport heights, retain safe-area insets and respect `prefers-reduced-motion`.

## Automated validation

### `npm test` — PASS

The full suite passed: physics/camera, economy, 41-car catalog/assets, geometry/collisions, Shop/Garage, root tools, interaction guards, all six track geometries, trajectory sectors, deterministic standalone AI/traffic, online protocol, network interpolation/extrapolation, room/Durable Object flow and Online DOM/PWA static checks.

Notable checks:
- all six tracks have finite smooth geometry and zero detected centerline self-intersections;
- `auroraGrandLoop` is exactly 15,000.0 generated length and >1.4× Desert Canyon;
- standalone difficulty hierarchy is valid on all six tracks;
- Online protocol accepts `auroraGrandLoop` and valid speed 510, while rejecting speed 651+;
- bounded extrapolation remains capped at 140 ms.

### `npm run test:ai` — PASS

The deterministic 6-track × 4-difficulty clean-air benchmark plus 3/7/13-car traffic matrix passed all quality gates:
- hierarchy: PASS
- clean finish: PASS
- clean no-barrier: PASS
- traffic finish: PASS
- 13-car stress no pile-up: PASS
- stress off-road: PASS

Aurora clean-air average laps were 58.37 s (Easy), 57.38 s (Medium), 44.36 s (Hard), and 42.46 s (Extreme) in the standalone suite, with zero barrier impacts and zero true off-road time.
