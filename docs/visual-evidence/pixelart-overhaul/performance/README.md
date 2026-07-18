# Matched five-minute MAX360 performance record

Status: **PASS**

The temporary legacy visual mode and Arcade Reliquary production mode were
run back-to-back on the same reference machine with MAX360 A, seed
`0x5eed0360`, 360 live enemies, level 40, invulnerability on, no weapon fire,
1280 × 720 CSS pixels, and DPR 2. Both endpoints use the sampler's complete
36,000-frame rolling window, representing just over 300 sampled seconds; each
tab remained live for more than 312 wall seconds and advanced from minute 30
to minute 35.

| Mode | Median | 1% low | Atlas | Live | Transient |
| --- | ---: | ---: | ---: | ---: | ---: |
| Legacy baseline | 120.5 FPS | 95.3 FPS | 7.00 MiB | 411 | 4 |
| Arcade Reliquary | 120.5 FPS | 97.8 FPS | 2.75 MiB | 411 | 6 |

Production has no median regression, improves the 1%-low result by 2.62%, and
reduces measured atlas texture memory by 60.71%. Both modes exceed the 60 FPS
median and 45 FPS 1%-low budgets. Periodic transient counts stayed between 2
and 7 rather than growing over time, while live objects remained fixed at 411.

The three production atlas pages are 1024 × 512, 512 × 256, and 256 × 256,
all below the 2048 × 2048 page ceiling. Pixi 8 does not expose draw-call stats
through any of the read-only renderer paths probed by the instrumentation, so
the record truthfully reports `renderer-stats-unavailable` instead of inventing
a number. This is the sole performance-budget instrumentation exception.

Reference machine: MacBook Pro Mac15,6, Apple M3 Pro (11 logical cores),
18 GiB memory, macOS 26.5.2 (25F84), arm64. Browser: Codex in-app Chromium;
its automation surface does not expose a version or user agent.

Machine-readable values are in `summary.json`. Start/end screenshots preserve
the exact Sandbox state, clock, density, level, and invulnerability setting for
both modes; the performance line itself was read directly from the DOM and is
recorded verbatim in the JSON endpoint values.
