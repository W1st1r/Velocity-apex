# Velocity Apex — Free Roam Reference Map V41

V41 rebuilds the Free Roam presentation around the supplied island-city reference without using the reference image as a stretched world background.

## Map changes

- Kept the existing deterministic 5000×3000 canvas world and shared road/collision geometry.
- Preserved all multiplayer activity coordinates, including Drag, Drift Battle, KOTH, Levels and the three minigame hubs.
- Added a more detailed APEX International airport presentation with a long runway, 09/27 markings, centerline/threshold detail, runway lights, terminal, hangars and service apron.
- Added four crisp 90° top-down vector passenger aircraft, including one larger hero aircraft at the terminal apron.
- Aircraft and terminal scenery live outside the vehicle-road union; no oversized invisible aircraft rectangle is added to the runway.
- Added extra coastal surf detail and reference-inspired palm decoration while filtering palm placement away from driveable surfaces.
- Retained the enlarged Harbor Drift Megapark and all visible IN/OUT lanes.
- The city remains tile-cached vector Canvas art, so zooming does not stretch a low-resolution full-map bitmap.

## Camera and iPhone

- Free Roam camera continues to use the player car as `cx/cy` directly and does not clamp the camera to a background image edge.
- Existing DPR rendering, multitouch controls, iOS selection guards and mobile HUD code are unchanged.

## Verification

- `npm run test:map` checks world connectivity, road/building/tree separation, minigame access, camera contract and the V41 airport/aircraft layout.
- Existing Free Roam event-hub, drag, football, minigame-quality and mobile-HUD tests were also run successfully.
