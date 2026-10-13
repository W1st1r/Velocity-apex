# Apollo EVO update

- Added `apollo-evo` to the LUX catalog with an orange transparent top-down sprite and dedicated thumbnail.
- Price: 318,000 CR.
- Base performance: 558 max speed, 428 acceleration, 560 braking, 2.52 turn rate, 0.94 drift factor.
- 5-level tuning: speed +2.8%/level, acceleration +6.4%/level, brakes +7.2%/level.
- Full tuning cost: 606,830 CR. Max tuned performance: 636 / 565 / 762.
- Added tuned visual/collision geometry so the wide Apollo body keeps the same on-track scale family as other LUX cars.
- Owner profile now shows how many players entered this account as their inviter at registration, plus how many invitations were accepted by anti-abuse rules.

## Sprite replacement — 2026-09-15
- Replaced the Apollo EVO artwork with the new detailed true top-down model supplied by the owner.
- Removed the transparent outer glow from the source canvas and tightly cropped the actual body silhouette so the car no longer renders as a broad/square block.
- Rotated the source to the game's `nose-right` sprite convention and regenerated both the full-resolution race sprite and the catalog thumbnail with the same aspect ratio.
- Kept gameplay collision/performance values unchanged; existing `preserveAspectRatio` rendering now uses the corrected natural proportions of the new sprite.
