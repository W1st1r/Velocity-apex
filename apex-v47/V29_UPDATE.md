# Velocity Apex V29 — Free Roam Control Editor Fix

- Fixed the Free Roam control-layout editor being rendered below the Free Roam layer (`z-index 140` vs `260`).
- Control-layout editor now renders at `z-index: 520`.
- Free Roam is made inert and ignores pointer input while the editor is open.
- Drag tracking moved to window-level pointer events for reliable iPhone Safari/PWA dragging.
- Save/cancel returns to the Free Roam pause menu without leaking taps.
- V29 cache-bust added for updated frontend assets.
- Garage sale remains 70%; V28 career HD changes are retained.
