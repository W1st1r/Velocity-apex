# Velocity Apex — Free Roam Minigame Visibility V43

V43 focuses on keeping the car, ball and objectives visible on iPhone landscape during Free Roam mini-games.

## HUD

- Running Hot Potato, Checkpoint Rush and Mini Football now use a compact HUD.
- The large standings block is shown for the first 1.4 seconds, then collapses automatically.
- A small expand/collapse control restores the standings and leave action when needed.
- Results still reopen the full panel after the match.
- Checkpoint Rush now shows the active checkpoint and the player's captured-point count in the compact strip.

## Camera / visibility

- Added a smoothed minigame safe-zone camera instead of a fixed full-arena camera.
- The camera follows the car with a small speed look-ahead.
- Mini Football biases the camera toward the ball.
- Checkpoint Rush biases toward the next checkpoint.
- Hot Potato can bias toward the current bomb holder.
- Dynamic zoom keeps the important objective visible without abrupt jumps.
- The camera anchor is moved into the usable part of the iPhone landscape viewport so the car is less likely to sit below the top HUD or under bottom controls.

## Touch controls

- During active mini-games, GAS / BRAKE / HB / steering buttons use a more transparent background while preserving the original touch area.
- Pressed controls become brighter, so touch feedback remains clear.
- Existing multitouch and iOS selection/callout prevention remain intact.

## Hot Potato map venue

- Increased the BOMB ARENA paved maneuver area from 320×135 to 390×195.
- ENTRY and EXIT openings are now 84 units tall instead of 58 and stay connected to the actual driveable road union.
- The venue remains clear of the horizontal arterial road and uses the same geometry for visuals and collisions.

## Mini Football

- Server football state cadence improved from 38 ms to 36 ms.
- Authoritative ball progress cadence improved from 60 ms to 50 ms (20 Hz).
- Client ball correction is now error-aware: small corrections are blended more gently while larger divergence is corrected faster.
- Immediate local touch prediction remains in place.
- Server physics still uses substeps up to 120 Hz for stable wall/goal collision behavior.

## Cache / regression

- Free Roam CSS, city and client cache-bust versions updated to V43.
- Added `free_minigame_visibility_v43_test.mjs`.
- Updated affected map/football regression tests to the V43 geometry and cadence.
- Full `npm test` suite passes.
