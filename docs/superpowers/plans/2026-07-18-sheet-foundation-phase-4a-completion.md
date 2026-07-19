# Sheet Foundation Phase 4A Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the missing Phase 4A contracts on `v2.0.0` while preserving the already passing Phase 4B marker and movement implementation.

**Architecture:** Keep the existing Apps Script and browser files, but centralize config-only edit URL writes, ScriptProperties-only student sheet resolution, atomic scene settings/rename validation, and display-only image-name normalization. Extend the existing VM and static-contract tests before each production change.

**Tech Stack:** Google Apps Script, browser JavaScript, HTML/CSS, Node.js `node:test` and `vm`.

## Global Constraints

- Work on the existing `v2.0.0` branch with one implementation agent.
- Do not commit, push, create a PR, or deploy Apps Script.
- Do not remove, reimplement, or reduce Phase 4B catalogs, SVG rendering, Pointer Events, RAF movement, cancellation, recovery, or stale-response protection.
- Use `apply_patch` for source and test edits.
- Write each behavioral test first, run it to confirm RED, make the smallest production change, then rerun to GREEN.
- Run final read-only reviews A/B/C only after the full suite passes.

---

### Task 1: Make EDIT_URL explicit and flatten the spreadsheet menu

**Files:**
- Modify: `Code.js`
- Modify: `tests/edit-token.test.js`
- Modify: `tests/sheet-foundation.test.js`
- Modify: `README.md`
- Modify: `README.en.md`

**Interfaces:**
- Produces: config-only `/exec` validation, explicit `generateOrUpdateEditUrlFromMenu`, lightweight `onEdit`, flat `設定` menu.
- Removes: `setWebAppUrl`, `showEditUrl`, `ScriptApp.getService().getUrl()` URL fallback, automatic EDIT_URL refresh.

- [ ] **Step 1: Replace old edit URL/menu expectations with failing Phase 4A tests**

Cover setup non-generation, existing EDIT_URL preservation, no ScriptApp fallback, valid `/exec` query/hash stripping, invalid URL clearing, toast/no dialog behavior, onEdit clearing only for direct config key edits, key-regeneration valid/invalid URL outcomes, exact menu order and separators, and absence of old public functions.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test tests/edit-token.test.js tests/sheet-foundation.test.js`

Expected: failures describe the old automatic generation, fallback, dialog, and submenu behavior.

- [ ] **Step 3: Implement config-only URL helpers and explicit menu operation**

Make `normalizeWebAppUrl_` accept only normalized HTTPS Apps Script `/exec` URLs for operational use. Make the shared EDIT_URL writer always write either the generated URL or `''`. Ensure `ensureEditKeyConfig_`, `setConfigValue_`, and `setupSheets()` do not refresh EDIT_URL.

- [ ] **Step 4: Add lightweight onEdit invalidation and exact flat menu**

Inspect only the edited config key range and clear the EDIT_URL value cell. Build `設定` with seven items and two separators, without submenus or work beyond menu creation.

- [ ] **Step 5: Adapt fail-closed key regeneration and documentation**

Preserve legacy ScriptProperties key synchronization, then refresh/clear EDIT_URL from config inputs and direct users to the config EDIT_URL cell. Remove fallback/dialog instructions from both READMEs.

- [ ] **Step 6: Run focused tests GREEN**

Run: `node --test tests/edit-token.test.js tests/sheet-foundation.test.js`

Expected: all focused tests pass.

### Task 2: Make ScriptProperties the sole student-sheet authority

**Files:**
- Modify: `Code.js`
- Modify: `tests/sheet-foundation.test.js`
- Modify: `tests/edit-token.test.js`

**Interfaces:**
- Consumes: `STUDENT_SHEET_ID`, existing header repair, validation, and import behavior.
- Produces: official-ID context with config URL repair, menu-only idempotent creation, toast menu wrappers.
- Removes: config URL adoption, public `createStudentSheet(payload)`, linked-sheet dialog/menu.

- [ ] **Step 1: Add failing authority, idempotence, repair, and API-surface tests**

Cover property-only resolution, config-only non-linking, conflicting config ignored, existing-ID duplicate creation prevention, invalid existing ID failure without new creation, URL repair on create/update/import, row preservation during update, and public create API absence.

- [ ] **Step 2: Run the focused foundation tests and confirm RED**

Run: `node --test tests/sheet-foundation.test.js tests/edit-token.test.js`

Expected: failures expose config-first resolution and always-create behavior.

- [ ] **Step 3: Implement official-ID resolution and config URL repair**

Read only `PropertiesService.getScriptProperties().getProperty('STUDENT_SHEET_ID')` for linkage. Open that ID, validate the expected sheet, optionally repair only blank headers, and write its actual URL to config without changing the property ID.

- [ ] **Step 4: Make creation menu-only and idempotent**

If an official ID exists, validate and repair it, update validations, and toast “already created.” Create only when the property is absent; move the new spreadsheet beside the container, initialize schema/widths/validations, save ID then URL, and toast the result.

- [ ] **Step 5: Convert update/import menu feedback to toast and preserve data**

Route both operations through the official context and retain existing import status/skipped-row behavior. Do not clear student input rows during update.

- [ ] **Step 6: Run focused tests GREEN**

Run: `node --test tests/sheet-foundation.test.js tests/edit-token.test.js`

Expected: all focused tests pass.

### Task 3: Integrate file naming into scene settings atomically

**Files:**
- Modify: `Code.js`
- Modify: `tests/sheet-foundation.test.js`

**Interfaces:**
- Extends: `updateSceneSettings(payload)` with `name`.
- Produces: validated MIME/extension-preserving Drive name, combined scenes update, partial-success response.
- Retires: independently callable rename path from the browser.

- [ ] **Step 1: Add failing server tests for name normalization and mutation order**

Cover blank/control-character rejection, supported final extension extraction, same-extension de-duplication, different-extension rejection, MIME/extension match, no Drive call when unchanged, Drive failure leaving scenes unchanged, scenes failure after Drive yielding partial success, and combined type/northOffset/name save.

- [ ] **Step 2: Run focused scene tests and confirm RED**

Run: `node --test tests/sheet-foundation.test.js`

Expected: existing settings API ignores name and standalone rename owns the only Drive mutation.

- [ ] **Step 3: Implement pure name-validation helpers**

Return a normalized base display name and full Drive name without side effects. Treat `.jpg` and `.jpeg` as valid `image/jpeg` variants; require exact supported extensions for PNG, GIF, and WebP; reject unsupported or mismatched suffixes.

- [ ] **Step 4: Implement the required validation/lock/mutation order**

Validate token, target, and every input before the lock; reacquire the current scene context inside the lock; rename Drive only when full name changes; upsert displayName/type/northOffset together; disclose post-Drive scenes or cache failures; return the normalized scene.

- [ ] **Step 5: Run focused tests GREEN**

Run: `node --test tests/sheet-foundation.test.js`

Expected: all server mutation tests pass.

### Task 4: Complete settings, display-name, and jump-marker UI

**Files:**
- Modify: `index.html`
- Modify: `app.html`
- Modify: `styles.html`
- Modify: `tests/scene-settings-ui.test.js`
- Modify: `tests/scene-foundation-ui.test.js`
- Modify: `tests/marker-style-move.test.js`

**Interfaces:**
- Produces: `設定の変更` name input, common supported-extension stripping helper, required jump destination and latest-name tooltip fallback.
- Removes: rename context item, `requestSceneRename`, browser `.renameImageFile(...)` call.

- [ ] **Step 1: Add failing HTML/client behavior tests**

Cover the new labels/title/input, removed rename action, tokenized combined settings payload, multiple-dot and uppercase extension stripping, list/photo/jump/home display usage, unchanged properties full name, jump label hide/disable and preservation, required destination, explanation text, and tooltip fallback order in both 360 and 2D.

- [ ] **Step 2: Run focused UI tests and confirm RED**

Run: `node --test tests/scene-settings-ui.test.js tests/scene-foundation-ui.test.js tests/marker-style-move.test.js`

Expected: missing editable name, raw names in display surfaces, and optional jump select failures.

- [ ] **Step 3: Integrate the settings name input and local result application**

Populate the stripped name from the server scene, validate the obvious blank/control cases client-side, send it with type/northOffset in one request, apply the returned normalized scene, and surface partial success without a second rename call.

- [ ] **Step 4: Route display surfaces through one helper**

Strip only the final supported image extension for scene list text, settings, photo/jump options, tooltip, and home messages. Keep scene objects and the properties dialog’s Drive name unchanged.

- [ ] **Step 5: Finish jump-mode form and tooltip behavior**

Hide and disable label input in jump mode without clearing its value; clear a new draft label before entering jump mode; require a destination; add the explanatory text; pass saved label into tooltip calls and use latest stripped target name, saved label, then ID.

- [ ] **Step 6: Run focused UI tests GREEN**

Run: `node --test tests/scene-settings-ui.test.js tests/scene-foundation-ui.test.js tests/marker-style-move.test.js tests/hotspot-data-integrity.test.js`

Expected: all focused UI/data tests pass, including Phase 4B movement and catalogs.

### Task 5: Full verification, read-only review, and evidence-based corrections

**Files:**
- Test: all `tests/*.test.js`
- Review: all modified production/test/documentation files

- [ ] **Step 1: Run syntax and full regression verification**

Run: `node --check Code.js`

Expected: exit code 0.

Run: `node --test tests/*.test.js`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Inspect the final diff and Phase 4B invariants**

Run: `git diff --check`

Run: `git diff --stat`

Confirm the 3/12/10 catalogs and movement state machine remain present and their tests unchanged except for Phase 4A-compatible assertions.

- [ ] **Step 3: Dispatch final read-only reviewers A/B/C in parallel**

- A: EDIT_URL, edit token, public API, student-sheet authority.
- B: config/scenes/info, rename, sync, Lock, partial success.
- C: extension display, jump UI, marker appearance, 360/2D movement, mobile.

Reviewers cite file/function/line evidence and make no changes.

- [ ] **Step 4: Reproduce accepted findings with a failing test and fix sequentially**

Reject speculative or non-reproducible findings with a recorded rationale. For every accepted issue, add/adjust a test first, see it fail, then patch production code and rerun the focused suite.

- [ ] **Step 5: Run final verification from a clean command invocation**

Run: `node --check Code.js`

Run: `node --test tests/*.test.js`

Run: `git diff --check`

Expected: syntax success, zero test failures, and no whitespace errors.

- [ ] **Step 6: Prepare the required 15-item report**

Report changed files, cause, EDIT_URL, menu, official student-sheet source, integrated rename, display names, jump input, preserved Phase 4B, commands/results, reviewer assignments/findings, accepted/rejected decisions, final tests, GAS manual checks, and remaining work.
