# Continuing Garden Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. User approved the written spec and explicitly requested implementation; execute in this session without another execution-choice prompt.

**Goal:** Keep the first eight stages, then continuously reward suitable classroom volume with bounded rotating scenery and eight new sports/gardening activities.

**Architecture:** Keep existing model celebrations as the clock source and expose discoveryCount as its alias. A separate pure DiscoverySession derives themes, unlocks and up to two presenters without touching roster/points. Life accepts optional presentation state, Fixtures manages two fading SVG groups maximum, and the existing painting capture serializes them and props using the screen-coordinate matrix.

**Tech Stack:** Vanilla JS UMD, SVG, CSS, Node assertions, Python unittest/Playwright; existing isolated worktree C:/worktrees/group-points-ledger on codex/secret-garden.

**Approved spec:** docs/superpowers/specs/2026-11-06-garden-continuing-life-design.md. Existing files must be copied to .bak before each edit. No point writes, no avatar-source changes, no new GAS deployment unless the backend interface changes. Existing release authorization applies.

## File map

- garden/discoveries.js: pure catalogs and Session.sync(count,seats)/reset()/snapshot().
- garden/activities.js + activities.css: eight vector props and distinct, bounded body/prop animations; three palette variants.
- garden/core.js: discoveryCount alias, new schema metadata and legacy recognition, original timing retained.
- garden/life.js: optional discovery state, unlock pool, no-repeat actions, two presenters for eight active seconds; preserve ground/plant rules.
- garden/fixtures.js: six primary landscape variants, one stable or at most two fading groups, active-time fade and responsive sprite geometry.
- garden/painting.js: fixture lifecycle integration and unchanged matrix capture for all vector layers.
- garden/app.js + garden.html: session synchronization, discovery labels/history/schema, module loading and reset.
- tests/garden_discoveries_test.js, tests/garden_activities_test.js, existing core/life tests, tests/test_garden.py: acceptance and regressions.

## Task 1: pure discovery rules and varied life

- [x] Write failing pure tests. Exact first expectations:
```js
const assert=require('assert');
const D=require('../garden/discoveries.js');
const session=new D.Session({random:()=>.25});
const s=session.sync(1,[1,2,3]);
assert.equal(s.themeId,'fountain');
assert.deepEqual(s.unlockedIds,['basketball']);
assert.equal(s.activityId,'basketball');
assert.ok(s.presenters.length<=2);
for(let count=2;count<=200;count++){
 const next=session.sync(count,[1,2,3]);
 assert.ok(next.unlockedIds.length<=8);
 assert.ok(next.presenters.length<=2);
}
session.reset();assert.equal(session.snapshot().count,0);
```
- [x] Run `node tests/garden_discoveries_test.js`, confirm missing feature failure; add separate no-repeat theme bag, stable repeated sync, randomized presenter round, departure/new-session cases.
- [x] Implement catalogs (bridge/fountain/rabbit/birdbath/arch/windmill and eight ordered new activity IDs), Fisher-Yates bags, fixed first fountain, theme changes at1/5/9, optional palette variants. State contract:
```js
{count:1,themeId:'fountain',themeName:'小噴水池',activityId:'basketball',activityName:'籃球',unlockedIds:['basketball'],presenters:[2,1],variant:0}
```
- [x] Add new props, distinct CSS movement per activity and bounds within viewBox0..100. Existing watering gets palette variants. Life.frame append optional discovery arg; View.render append same state after stage. Pause/reduced motion must not unlock or age presenter clocks; valid active time controls the8-second showcase. Return `{activity,variant,showcase,...existingFields}`; update props when activity or variant changes.
- [x] Add `model.discoveryCount` getter returning celebrations; stageMetadata returns schema3/current scheme, recordStage accepts both prior eight-stage scheme and current, plus legacy4 unchanged. New summaries carry separate discovery snapshot; no guessing for old records.
- [x] Run all Node garden core/life/roster/new tests. Spec review first, then quality review, resolve findings before final integration release. Root handles embed.

## Task 2: rotating primary SVG scenes

- [x] Add browser failing acceptance before production edits:
```python
self.assertTrue(p.evaluate('!!window.GardenFixtures'))
p.clock.run_for(73000) #31 arrivals+7 upgrades+1 discovery with1s/5s settings
self.assertEqual(p.locator('[data-fixture="fountain"]').count(),1)
self.assertIn('新發現',p.inner_text('#garden-stage-label'))
```
- [x] Fixture View extracts existing pond+bridge as initial template. At stage0..7 that template keeps original layer gating. On discovery themes, replace entire reserved scenery zone rather than stacking features. New scene IDs are fountain/rabbit/birdbath/arch/windmill; at most3 jets/2birds. Main sprite transform compensates root SVG nonuniform scaling around its ground anchor so portrait assets stay legible.
- [x] View.render(themeId,dt,active,reduced,immediate) advances fade only with valid active dt<=1500; six-second fade removes outgoing group, reduced/immediate settles instantly. More requests while fading prune to two maximum. Bridge template can be restored after later cycles and new session.
- [x] Call fixtures on every painting update before cached stage early-return, pass presentation state and actual active dt; stage styles still apply to retained legacy pond/bridge groups. Capture already copies the main vector SVG with all fixture groups.
- [x] Browser checks each theme, pause/fade-resume, reduced motion, resize,200 discover-count rotations and <=2 group bound.

## Task 3: integration, history and PNG

- [x] Instantiate one DiscoverySession per activity. In render sync with model.discoveryCount and visible seats before life/painting; reset on successful new start and again. Repeated render never reselects presenters or advances bags.
- [x] Render next label as next discovery after stage8. Footer contains count/theme; show the latest activity name as a modest caption. Existing paused/no-signal captions retain priority.
- [x] Archive schema3 plus `discovery:{count,themeId,themeName,unlockedIds}` snapshot. History only displays discovery data actually present in that new record; old eight-stage blessings retain old interpretation. No PNG in localStorage.
- [x] Browser tests unlock all8 activities, noise departure/refill, pause/no signal, late roster replies, old4/schema2/schema3 histories, quota failure, fullscreen and frozen-end retry.
- [x] Download PNG for every primary scene and activity, compare actual inner-shape geometry for left-facing and rotated assets, ensure no HUD/privateURL/externalimage. Inspect desktop/portrait screenshots.

## Task 4: publish and record evidence

- [x] Run Node garden tests and `python -m unittest discover -s tests -p test_garden.py -v`; all pass with no page errors. Four widths1366/1024/640/390,31 and100 remain grounded and within activity cells.
- [x] Run `python tools/embed_garden.py`, assert root/gas mirrors identical; universal version v1.28 dated2026-11-06. Original avatars and GAS backend diff must be empty.
- [x] Update CHANGELOG/PITFALLS/DECISIONS, guide/handoff/frontmatter with actual checks. Commit only scoped files, push HEAD:master under existing authorization, wait Pages built and compare release assets.
- [x] Adapt private readonly real-GAS verifier: block POST exceptgetGardenRoster, simulate volume,31 live-avatar match, first fountain and later rotation,PNG/pause; compare fresh11-sheet snapshots before/after. No writes or credentials in public repo. Record actual results and any real-iPad limitation.

## Plan self-review

All approved spec sections map to tasks1-4. Main-scene replacement is bounded during fades, planting uses hand-held pots rather than increasing flower count, first new discovery visibly differs, all clocks share active state, old record schemes remain distinct, and current matrix PNG capture includes all vector props and primary groups. No day/night cycle, sound effects, external image generation or point-system refactor included.

## Execution evidence — 2026-11-06

Implemented d2dd238, Pages13 assets matched. Core16/life22/readonly3 plus discovery200/property and activity vector suites passed;49 browser tests passed in232s. Independent spec and code-quality review passed after gradual-arrival presenter shuffle and per-actor palette fixes. Real GAS readonly popup matched31 current avatars, first fountain+basketball presenters,9 discoveries and changed theme,PNG/refresh/pause. Fresh complete11-sheet snapshots equal. GAS stays@65; no backend/point writes.
