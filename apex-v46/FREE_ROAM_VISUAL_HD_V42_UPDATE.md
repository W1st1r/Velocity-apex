# Velocity Apex — Free Roam Visual HD V42

V42 keeps the V41 airport, minigames and gameplay geometry intact while upgrading the presentation of the Free Roam map.

## Visual upgrade

- Rebalanced the map palette with richer botanical greens, cleaner neutral asphalt, warmer concrete and a subtle warm-sun/cool-ambient color grade.
- Added layered baked building shadows and more rooftop detail (skylights, solar/glass panels, HVAC/service details).
- Rebuilt cached tree sprites with deeper canopies, baked shadows, trunks, leaf-cluster variation and stronger highlights.
- Added sparse deterministic asphalt grain and repaired-seam detail that remains crisp because the city is still vector/tile rendered.
- Improved park surfaces, lots, fountain contrast and general separation between road, sidewalk, grass and structures.

## Extended visual world

- The physical gameplay world remains exactly **5000×3000** so multiplayer coordinates, activities and collisions do not move.
- Added a **900-unit non-driveable visual buffer** on every side of the map.
- West/south edges continue into ocean/surf; north/east edges continue into forested cliffs and vegetation.
- Added visual rock/hedge boundary cues near safe map edges so the world limit feels intentional instead of like a cut-off rectangle.
- The camera is still centered directly on the player and can render the decorative buffer while the car remains constrained by the original road/collision union.

## Performance

- The extension uses the existing bounded 512px tile/LRU renderer rather than a giant world bitmap.
- Tree detail is baked into five cached sprites instead of generated per tree each frame.
- Road texture is deterministic and sparse; shadows are painted into cached city tiles.
- No changes were made to touch controls, networking, accounts, minigames, economy or Owner Panel logic.

## Verification

- Map tests verify that the 5000×3000 physical bounds are unchanged, the 900-unit visual buffer is non-driveable, the runway remains clear, aircraft stay off the road union, and the player-centered camera contract is preserved.
