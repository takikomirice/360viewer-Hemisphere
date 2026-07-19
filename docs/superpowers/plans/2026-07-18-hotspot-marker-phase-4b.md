# Hotspot Marker Phase 4B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace star markers, add the specified 12 colors and 10 SVG icons, and provide leak-free pointer-following move previews for both 360 and 2D scenes.

**Architecture:** Server and client normalize marker values against exact catalogs. All renderers share marker appearance helpers, while one generation-guarded move state machine owns pointer listeners, RAF work, preview DOM, persistence, and cleanup across 360 and 2D.

**Tech Stack:** Google Apps Script, browser JavaScript, Pannellum, HTML/CSS, Node.js `node:test`.

## Global Constraints

- Work on the existing `v2.0.0` branch with one implementation agent.
- Do not commit, push, or create a PR.
- Do not add video/audio playback or external icon libraries.
- Preserve stored `star` rows and normalize them to `circle` only when read.
- Defaults are exactly `circle`, `blue`, and `info`.
- Run final read-only reviews A/B/C only after all tests pass.

---

### Task 1: Lock marker catalogs and Phase A jump compatibility

**Files:**
- Modify: `Code.js`
- Modify: `index.html`
- Test: `tests/marker-style-move.test.js`
- Test: `tests/hotspot-data-integrity.test.js`

**Interfaces:**
- Consumes: existing `loadHotspots`, `saveHotspot`, `updateHotspot` and info-sheet schema.
- Produces: exact `ALLOWED_MARKER_SHAPES`, `ALLOWED_MARKER_COLORS`, `ALLOWED_MARKER_ICONS`; normalization to defaults; blank-label jump preservation.

- [ ] **Step 1: Write failing catalog and old-data tests**

```js
assert.deepEqual(serverConstants.ALLOWED_MARKER_SHAPES, ['circle', 'square', 'diamond']);
assert.deepEqual(serverConstants.ALLOWED_MARKER_COLORS, ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'purple', 'gray', 'white']);
assert.deepEqual(serverConstants.ALLOWED_MARKER_ICONS, ['info', 'photo', 'video', 'audio', 'link', 'wifi', 'quiz', 'eye', 'warning', 'flag']);
assert.equal(normalizeMarkerShape_('star'), 'circle');
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test tests/marker-style-move.test.js tests/hotspot-data-integrity.test.js`

Expected: failures for the old four/eight/four catalogs and blank jump rejection.

- [ ] **Step 3: Implement exact server catalogs and conditional label validation**

```js
const ALLOWED_MARKER_SHAPES = ['circle', 'square', 'diamond'];
const ALLOWED_MARKER_COLORS = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'purple', 'gray', 'white'];
const ALLOWED_MARKER_ICONS = ['info', 'photo', 'video', 'audio', 'link', 'wifi', 'quiz', 'eye', 'warning', 'flag'];

function hasHotspotLabelOrJump_(data) {
  return !!(String(data && data.label || '').trim() || String(data && data.jumpSceneId || '').trim());
}
```

Update load filtering and both mutation functions to use this rule without writing during load.

- [ ] **Step 4: Update static UI options and run focused tests GREEN**

Run: `node --test tests/marker-style-move.test.js tests/hotspot-data-integrity.test.js`

Expected: all focused tests pass.

### Task 2: Share SVG marker appearance across preview, 360, and 2D

**Files:**
- Modify: `app.html`
- Modify: `styles.html`
- Test: `tests/marker-style-move.test.js`

**Interfaces:**
- Consumes: client marker label maps and normalization helpers.
- Produces: `MARKER_ICON_SVGS`, `createMarkerIconSvg`, `applyMarkerClasses`, `applyMarkerIconClass`, `createStandaloneMarkerElement`.

- [ ] **Step 1: Add failing client normalization, SVG, contrast, and shared-render tests**

```js
for (const id of expectedIcons) assert.match(app, new RegExp(`${id}:\\s*'`));
assert.equal(client.normalizeMarkerShape('star'), 'circle');
assert.match(styles, /\.marker-color-white[^}]*--marker-ink:\s*#[0-9a-f]{6}/i);
assert.match(getFunctionSource(app, 'render2DHotspots'), /createStandaloneMarkerElement/);
```

- [ ] **Step 2: Run the focused file and confirm RED**

Run: `node --test tests/marker-style-move.test.js`

Expected: missing new labels, SVGs, colors, and shared 2D renderer.

- [ ] **Step 3: Implement labels, normalized class application, and common SVG wrapper**

```js
function createMarkerIconSvg(icon) {
  var normalized = normalizeMarkerIcon(icon);
  return '<svg class="marker-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    MARKER_ICON_SVGS[normalized] + '</svg>';
}
```

- [ ] **Step 4: Add the 12 CSS variable palettes and interaction states**

Use dark ink for `cyan`, `lime`, `yellow`, and `white`; light ink for the remaining colors. Add selected, moving-source, and preview outlines/shadows.

- [ ] **Step 5: Route marker preview, Pannellum, and 2D through the common helpers**

2D must use an outer `.flat-hs-marker` positioner containing a common `.hs-marker` child so diamond rotation does not replace percentage-position translation.

- [ ] **Step 6: Run focused tests GREEN**

Run: `node --test tests/marker-style-move.test.js`

Expected: all catalog/render/contrast tests pass.

### Task 3: Implement the pointer-following move state machine

**Files:**
- Modify: `app.html`
- Modify: `styles.html`
- Test: `tests/marker-style-move.test.js`

**Interfaces:**
- Consumes: `viewer.mouseEventToCoords`, `updateHotspot`, `updateSpotInViewer`, `EDIT_MODE_DRAG_THRESHOLD_PX`.
- Produces: `startHotspotMovePreview(target, sourceElement)`, `updateHotspotMovePreview(event)`, `get2DHotspotCoordinates(clientX, clientY, image)`, `commitHotspotMove(event)`, `cancelHotspotMove(message, options)`, `cleanupHotspotMovePreview()`.

- [ ] **Step 1: Add failing pure-coordinate, start, RAF, cleanup, and stale-response tests**

```js
assert.deepEqual(get2DHotspotCoordinates(150, 100, imageRect), { pitch: 50, yaw: 50 });
assert.equal(get2DHotspotCoordinates(99, 100, imageRect), null);
startHotspotMovePreview(target, source);
assert.equal(source.classList.contains('hs-marker-moving-source'), true);
assert.equal(preview.style.pointerEvents, 'none');
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test tests/marker-style-move.test.js`

Expected: missing state-machine functions and preview behavior.

- [ ] **Step 3: Implement centralized state, preview construction, and listener lifecycle**

```js
var hotspotMoveState = {
  active: false, target: null, sourceElement: null, previewElement: null,
  pointerPosition: null, rafId: null, startSceneId: '', generation: 0,
  saving: false, pointerDown: null
};
```

Register `pointerdown`, `pointermove`, `pointerup`, and `pointercancel` only while active and remove the same handlers during cleanup.

- [ ] **Step 4: Implement 360/2D preview positioning and drag discrimination**

RAF renders fixed screen coordinates in 360 and image-relative container coordinates in 2D. A movement distance greater than 5px leaves move mode active and does not save.

- [ ] **Step 5: Implement generation-guarded persistence and rollback**

Copy every non-coordinate field into the existing tokenized `updateHotspot` payload. Change real args only after a successful response whose generation and scene still match.

- [ ] **Step 6: Wire every cancellation boundary**

Call the shared cancellation path from Escape, scene load, edit-mode exit, modal opening, scene-list refresh, popup opening, and `pointercancel`.

- [ ] **Step 7: Run focused tests GREEN**

Run: `node --test tests/marker-style-move.test.js tests/hotspot-data-integrity.test.js`

Expected: all move and data tests pass with no retained listeners or preview DOM.

### Task 4: Documentation, regression, and review

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Test: all `tests/*.test.js`

**Interfaces:**
- Consumes: completed implementation and existing regression suite.
- Produces: documented catalogs/legacy behavior, fresh full-suite evidence, review findings.

- [ ] **Step 1: Update README marker tables and move behavior**

Document exact shape/color/icon IDs, `star` read fallback without automatic sheet writes, and pointer-following 360/2D movement.

- [ ] **Step 2: Run syntax and full regression verification**

Run: `node --check Code.js`

Expected: exit code 0.

Run: `node --test tests/*.test.js`

Expected: all tests pass, zero failures.

- [ ] **Step 3: Dispatch final read-only reviewers A/B/C in parallel**

Review A covers authorization/server validation, B covers data/sync/partial success, and C covers UI/input/360/2D/touch regressions. Reviewers must cite file/function/line evidence and make no changes.

- [ ] **Step 4: Reproduce accepted findings with a failing test, fix sequentially, and rerun full tests**

Run: `node --test tests/*.test.js`

Expected: all tests pass after every accepted correction.

- [ ] **Step 5: Perform a short read-only re-review and prepare the 16-item completion report**

Report changed files, catalogs, legacy behavior, contrast, 360/2D/touch movement, rollback, tests, reviewer findings, final results, GAS manual checks, and remaining constraints.
