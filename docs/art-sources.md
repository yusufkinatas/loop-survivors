# Art sources

Loop Survivors' committed raster art was generated specifically for this game
with OpenAI's image-generation model on 2026-07-17. It does not incorporate a
third-party sprite sheet or stock-art pack. Enemy, weapon, projectile, pickup,
environment-prop, and effect sprites are drawn at runtime from original
pixel-shape definitions in `src/game/soundwood-art.ts` and
`src/game/soundwood-shapes.ts`.

## Generated raster assets

| File | Purpose | Generation direction |
| --- | --- | --- |
| `public/art/soundwood-floor.png` | Seamless arena ground texture | Top-down midnight forest-and-nightclub floor, dark indigo and teal, sparse moss, roots, tiny cyan and magenta bioluminescent details, restrained contrast, seamless square pixel art with no objects or text. |

The PNG is used as source art without photographic inputs. The runtime adds
deterministic scenery, lighting, fog, landmarks, silhouettes, outlines, and
combat telegraphs so dense scenes remain readable.

## Visual direction

The in-game art system is called **Midnight Neon Soundwood**: deep blue-black
terrain; cyan player and pickup language; warm pink enemy language; and yellow
for rewards and imminent danger. Shared outline, halo, and animation rules
matter more than raw detail when hundreds of actors are visible at once.
