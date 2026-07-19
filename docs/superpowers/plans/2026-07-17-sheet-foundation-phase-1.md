# シート基盤改善 第1段階 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This request explicitly forbids subagents and commits.

**Goal:** config/scenes の再実行可能な基盤、Student Sheet URL 管理、EDIT_URL生成、northOffset移行を既存データと編集安全性を保ったまま実装する。

**Architecture:** `Code.js` にシート責務別の内部関数を追加し、config と scenes は一括配列処理で更新する。既存の公開API・UI動作は維持し、northOffset の読み書きだけを scenes 優先へ切り替える。

**Tech Stack:** Google Apps Script V8、Google Sheets/Drive/Properties/Lock API、Node.js `node:test` と `vm`。

**Execution Status:** 2026-07-17に単一エージェントで実装し、`node --test tests/*.test.js` 88件成功、`node --check Code.js` と `git diff --check` 成功を確認済み。コミット・プッシュ・PRは未実施。

## Global Constraints

- マルチエージェントを使用しない。
- コミット、プッシュ、PR作成を行わない。
- 既存 `info` データとホットスポット機能を壊さない。
- 編集トークン検証を弱めず、通常・公開URLから編集APIを実行可能にしない。
- setup と移行を冪等にする。
- Drive全体同期と新UIは実装しない。

---

### Task 1: 新仕様テストハーネス

**Files:**
- Create: `tests/sheet-foundation.test.js`
- Modify: `tests/edit-token.test.js`

**Interfaces:**
- Consumes: Apps Script のグローバル関数を `vm` で実行する既存方式。
- Produces: シート、Range、Spreadsheet、Properties、Lock、UI の状態確認可能なモック。

- [ ] config/scenes/info と Range の一括読み書き、列追加、内容消去を再現するモックを作る。
- [ ] setup 2回実行、info保持、config保持・順序・数式保持の失敗テストを書く。
- [ ] `node --test tests/sheet-foundation.test.js` を実行し、未実装関数または不足仕様による失敗を確認する。

### Task 2: config 正規化と EDIT_URL

**Files:**
- Modify: `Code.js`
- Test: `tests/sheet-foundation.test.js`
- Test: `tests/edit-token.test.js`

**Interfaces:**
- Produces: `readConfigRows_`, `writeConfigRows_`, `repairConfigSheet_`, `buildEditUrl_`, `refreshEditUrlConfig_`。

- [ ] 基本5項目の順序、既存値・数式・その他設定保持を検証するテストをREDにする。
- [ ] config の一括読込・正規化・一括書込を実装する。
- [ ] EDIT_URL のURLエンコード、fallback、WEB_APP_URL/EDIT_KEY変更後更新を実装する。
- [ ] 対象テストをGREENにし、既存 edit-token テストの構造依存を新しい共通生成関数へ更新する。

### Task 3: STUDENT_SHEET_URL

**Files:**
- Modify: `Code.js`
- Test: `tests/sheet-foundation.test.js`
- Modify: `README.md`
- Modify: `README.en.md`

**Interfaces:**
- Produces: `extractSpreadsheetId_`, `getStudentSheetId_`, `getStudentSheetContext_`, `ensureStudentSheetHeaders_`, `migrateStudentSheetUrlConfig_`。

- [ ] URL/ID抽出、config優先、ScriptProperties fallback、setup移行のテストをREDにする。
- [ ] 共通ID抽出と参照順位を実装する。
- [ ] openById、シート存在、ヘッダー検証・安全補修を共通化する。
- [ ] 新規作成時に config URL と ScriptProperties ID を保存する。
- [ ] README の参照元と手動設定手順を config 中心へ更新する。

### Task 4: scenes 基盤

**Files:**
- Modify: `Code.js`
- Test: `tests/sheet-foundation.test.js`

**Interfaces:**
- Produces: `SCENES_HEADERS`, `getOrCreateScenesSheet_`, `repairScenesSheet_`, `readSceneRows_`, `findSceneRowsByFileId_`, `upsertScenes_`。

- [ ] 作成・不足ヘッダー補修・再実行非重複・既存重複検出のテストをREDにする。
- [ ] ヘッダー定数と列索引を実装する。
- [ ] 一括読み取り索引と重複一覧を実装する。
- [ ] 既存行更新と新規行一括追加を実装し、manual northOffset保護をテストする。

### Task 5: northOffset 読み書きと NORTH 移行

**Files:**
- Modify: `Code.js`
- Test: `tests/sheet-foundation.test.js`
- Modify: `tests/delivery-mode.test.js`

**Interfaces:**
- Consumes: scenes upsert と config 一括処理。
- Produces: scenes優先の `getCachedNorthOffset_`、scenes保存の `setCachedNorthOffset_`、`migrateLegacyNorthOffsets_`。

- [ ] scenes→legacy config→XMP→null、0度、none、manual保護のテストをREDにする。
- [ ] `getCachedNorthOffset_` を scenes 優先・legacy fallback に変更する。
- [ ] `setCachedNorthOffset_` をロック付き scenes upsert に変更する。
- [ ] `loadHotspots` と画像プロパティ取得でXMP結果を共通保存する。
- [ ] NORTH数値/NONEの移行確認後削除、不正値と失敗値保持を実装する。
- [ ] 読込時に旧configへ書かないことを維持し、scenesへの内部キャッシュ保存をテストへ反映する。

### Task 6: setup と info 安全補修

**Files:**
- Modify: `Code.js`
- Test: `tests/sheet-foundation.test.js`

**Interfaces:**
- Consumes: config、Student、scenes、NORTH移行の各内部関数。
- Produces: 再実行可能な `setupSheets` と安全な `migrateSheetIfNeeded_`。

- [ ] setup がロック内で不足補修と移行を順に実行し、結果メッセージを集約する。
- [ ] 既知infoスキーマのみ構造変更し、未知ヘッダーを破壊しない検証を追加する。
- [ ] setup 2回後の全シート状態が同一であることを確認する。

### Task 7: 回帰・品質検証

**Files:**
- Modify as needed: `Code.js`, `README.md`, `README.en.md`, `tests/*.test.js`

- [ ] `node --check Code.js` を実行し構文エラーがないことを確認する。
- [ ] `node --test tests/sheet-foundation.test.js` を実行する。
- [ ] `node --test tests/*.test.js` を実行し全件成功を確認する。
- [ ] `rg` で config への新規 `NORTH_` 書込、`northOffset || null`、onOpen の重処理、編集APIガード欠落がないことを確認する。
- [ ] `git diff --check` と `git diff` で空白・意図外差分・ユーザー変更の破壊がないことを確認する。
