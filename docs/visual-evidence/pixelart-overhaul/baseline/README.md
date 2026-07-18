# Phase 0 capture record

These images were captured from baseline commit
`32d4092fd0d77dab1ee70001d732a49e27b4e044` at a 1280 × 720 CSS viewport in the
Codex in-app Chromium browser. The device-pixel ratio was 2 and Pixi's backing
buffer was 2560 × 1440. Screenshots are unscaled browser-output JPEGs; the
extension reflects the browser transport rather than implying lossless source
art.

| File | Scene |
| --- | --- |
| `title-1280x720.jpg` | Title and collection overview |
| `opening-choice-1280x720.jpg` | Weaponless opening, timer frozen at 0:00, three distinct pickups |
| `early-combat-1280x720.jpg` | Early run after selecting Kick with developer auto-move enabled |
| `sandbox-combat-1280x720.jpg` | Real Sandbox Combat tab before added visual-truth tools |
| `normal-weapons-headliner-1280x720.jpg` | All nine tier-IV normal weapon triggers, a minute-30 mixed wave, and a Headliner |
| `max-density-360-1280x720.jpg` | Exact 360-enemy scene with no weapons and the FPS/entity overlay visible |
| `shop-1280-wide.jpg` | Real Afterhours Shop surface; the baseline's independently scrolling screen makes this a framing reference, not a full inventory proof |

## Exact density setup

The Sandbox uses RNG seed `0x5eed`. Set threat minute 30, clear all transient
entities, remove all weapons, then spawn three 24-body rings for each of Dusk
Moth, Plague Husk, Void Golem, Phase Shade, and Crypt Spider. This yields
`5 × 3 × 24 = 360` live enemies. Invulnerability stays on and the performance
overlay reports the count.

## Known missing baseline views

The baseline has no grayscale or color-vision capture mode, shared capture
presets, hitbox/pivot/opaque-bound overlays, or fixed visual time. Those are
Phase 1 deliverables rather than evidence that could be recorded honestly at
Phase 0. Motion clips will be captured after deterministic presets exist.

`frame-stats.json` and `collision-baseline.json` preserve the pre-production
atlas measurements and visual/body relationships. These evidence copies are
immutable comparison inputs. The final runtime keeps the current production
`frame-stats.json` but deliberately removes the public collision-baseline
generator and output: simulation geometry and native production metadata now
meet only in the development overlays instead of a duplicated shipping file.
