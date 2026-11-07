# Garden immediate two-second noise stop

> Approved by user on2026-11-07 after the concrete design: any over-target sample freezes the garden for at least2seconds, warm amber wash and large2→1 feedback, continued noise keeps it stopped, all companions stay present. Use subagent-driven-development/TDD and review, then release under existing authorization.

## Rules and boundaries

- Replace noise-driven departures entirely. Preserve all visitors, spawn/upgrade progress, stage, discoveries and props.
- At first over-target sample start a fixed2000ms hold. Later valid monitor ticks consume it, including further loud ticks. Do not rearm during the same stopped episode. Resume only when the hold has expired AND a valid sample is within threshold.
- Only the portion of a quiet tick after hold expiry can grow quiet/spawn/upgrade time. Timer gaps>1500ms and absent signal cannot fabricate recovery; teacher pause freezes the remaining hold and closes microphone as before.
- Lesson elapsed/timed-session clock retains its original duration behavior; the stopped clocks are companion arrivals/upgrades/discoveries and animation. The microphone and live meter stay active for automatic recovery.
- Remove the previous8-second/noise departure input and ignore its legacy stored value. Threshold/spawn/upgrade settings remain.

## Task1 — core and pure tests

- [x] Backup core.js/tests before editing. Add failing tests for immediate2sminimum, brief/noisylongepisodes, sustained noise noavatar loss, no upgrade reset, quietpartialtick, pause/signal/gap, newepisode and timed ending.
- [x] Replace departure branch with holdRemainingMs plus resting latch. Keep compatibility properties noisyMs/departures harmless. Return holdRemainingMs for UI; Model.pause must not clear an active hold.
- [x] Run `node tests/garden_core_test.js` and roster tests; review spec, then quality.

## Task2 — feedback/UI and browser tests

- [x] Add failing Playwright cases for visible amber/banner,2→1→waiting transitions, at least2s freeze despite quiet, longnoise companions retained, micstilllive, preserved newdiscoveries/fade/actionprogress, pause/resume and reset.
- [x] app renders actualmeter over/holding states separately. During hold title音量超標，輕聲一下; count2/1. After2s loud text放輕聲音，花園就會繼續; quiet early text音量已合宜，稍等一下. Signal missing gets等待麥克風訊號. Suppress noiseoverlay during teacherpause/end/idle.
- [x] Add a warm amber translucent wash and prominent readable banner in the gap belowHUD and above first possible avatar row; compact variant for shortscenes. Pointerevents none; no flashing. Pause all scene animations including arrival; common CSSTransition pause remains. Meter/audio continues.
- [x] Remove loud-seconds UI/config and all departure copy. Update obsolete removal tests to new retention behavior, preserving old data/snapshot compatibility. PNG excludes warning layer.

## Task3 — checks and release

- [x] Pure tests and complete browser suite; fourwidth1366/1024/640/390 shortviewport and100people banner/HUD/avatar nonoverlap; frozen scene/props/fades, PNG/reset/accessibility text.
- [x] Inspect screenshot desktop/phone. Embed core; root/gas identical, universalv1.30 dated2026-11-07. No backend/point writes, GAS remains@65 because opener readonly interface unchanged.
- [x] Update CHANGELOG/PITFALLS/DECISIONS/frontmatter/handoff/guide, commit/push Pages, wait release and match assets. Public simulated-volume verification, no formaldata mutation; record evidence and limitations.

## Evidence — 2026-11-07

Core21/readonly3 passed; all56 browser tests passed in343s, including fourwidth short31-person layout,100-person retention/reset,legacysettings,minimum2s,live meter,teacher pause andPNG. Independent spec/quality review passed. Pages4f19824 plus7asset checks passed; realGAS readonly popup matched31avatars and verified minimumhold/recovery/longnoise preservation/newdiscoveries/PNG/refresh/micrelease. Fresh complete11-sheet snapshots equal. GAS remains@65; formal verification used simulated audio and readonly POST allowlist.
