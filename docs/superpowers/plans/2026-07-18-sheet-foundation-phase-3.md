# Sheet Foundation Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 編集トークンで保護されたシーン種別・northOffset・ホーム設定UIと、アップロード・シート補助・メニュー連携を既存scenes基盤へ追加する。

**Architecture:** 公開APIと内部検証／ホーム処理を分離し、既存upsert・Lock・キャッシュ・部分成功パターンを再利用する。クライアントは正規化sceneを局所反映し、現在シーンだけ既存loadSceneで安全に再生成する。

**Tech Stack:** Google Apps Script V8、HTML/CSS/JavaScript、Node.js `node:test`、VMベースGASモック。

## Global Constraints

- `v2.0.0` の既存差分を破壊しない。
- 実装中は単一エージェント。全テスト成功後の最終レビューだけ最大3サブエージェント。
- コミット、push、PRを作成しない。
- 表示順D&D、独自UUID、再帰同期、自動削除、info構造変更を実装しない。
- 各本体変更の前に失敗テストを実行する。

---

### Task 1: 対象検証とシーン設定API

**Files:**
- Modify: `Code.js`
- Modify: `tests/sheet-foundation.test.js`
- Modify: `tests/edit-token.test.js`

**Interfaces:**
- Produces: `getEditableSceneContext_(fileId)`、`getSceneSettings(payload)`、`updateSceneSettings(payload)`、正規化sceneオブジェクト。

- [x] 登録済み／未登録／ルート外／親不一致／画像以外、token正常・欠落・不正の失敗テストを追加する。
- [x] `node --test tests/sheet-foundation.test.js tests/edit-token.test.js` で期待したREDを確認する。
- [x] 共通対象検証と設定取得APIを実装する。
- [x] 種別 `360` / `2D` とnorthOffset `auto` / `manual` / `none`、0・小数・境界不正を実装する。
- [x] manual明示解除だけを許すupsertフラグとキャッシュ部分成功を実装し、対象テストをGREENにする。

### Task 2: ホームAPIとアップロードホーム指定

**Files:**
- Modify: `Code.js`
- Modify: `tests/sheet-foundation.test.js`

**Interfaces:**
- Consumes: Task 1の対象検証・正規化scene。
- Produces: `setHomeSceneInternal_`、`setHomeScene(payload)`、upload `setAsHome` / `homeSet` / partial warning。

- [x] ルート360/2D、旧ホーム解除、最大1、冪等、サブフォルダ拒否、info不変の失敗テストを追加してREDを確認する。
- [x] Lock内一括ホーム更新とルートキャッシュ無効化を実装してGREENにする。
- [x] ルートアップロードホーム、サブフォルダ事前拒否、ホーム段階失敗の非削除・partialSuccessテストを追加してREDを確認する。
- [x] upload正規化とscenes同期後ホーム処理を実装してGREENにする。

### Task 3: scenes入力補助とonOpen

**Files:**
- Modify: `Code.js`
- Modify: `tests/sheet-foundation.test.js`
- Modify: `tests/edit-token.test.js`

**Interfaces:**
- Produces: `applyScenesDataValidations_`、`bulkImportStudentSheetFromMenu`、`Hemisphere`サブメニュー。

- [x] 4列のデータ検証、既存値・数式保持、冪等setupの失敗テストを追加してREDを確認する。
- [x] GAS DataValidationBuilderを使う入力補助をscenes補修へ追加してGREENにする。
- [x] menu-only、親メニュー、2サブメニュー、全既存項目の失敗テストを追加してREDを確認する。
- [x] `onOpen` と一括取込メニューラッパーを実装してGREENにする。

### Task 4: 右クリックメニューと設定モーダル

**Files:**
- Modify: `index.html`
- Modify: `styles.html`
- Modify: `app.html`
- Create: `tests/scene-settings-ui.test.js`
- Modify: `tests/edit-token.test.js`

**Interfaces:**
- Consumes: Task 1・2の公開APIと正規化scene。
- Produces: `openSceneSettingsModal`、`saveSceneSettings`、`requestSetHomeScene`、ローカルscene反映・再読込ヘルパー。

- [x] メニュー5項目、編集モード制御、モーダル項目、ラベル関連付け、Esc、背景、二重送信、2D/manual無効化の静的失敗テストを追加してREDを確認する。
- [x] index/stylesにレスポンシブでアクセシブルなモーダルとuploadホームUIを追加する。
- [x] token付き取得・保存・ホーム呼出し、エラー保持、フォーカス復帰を実装する。
- [x] 正規化sceneのallImages反映、ホーム局所反映、現在360のYaw/Pitch保持、種別切替の安全な再読込を実装してGREENにする。

### Task 5: アップロードUIと全回帰

**Files:**
- Modify: `app.html`
- Modify as needed: `tests/*.test.js`

**Interfaces:**
- Consumes: Task 2のupload `setAsHome`。

- [x] ルートアップロードだけホーム指定可、サブフォルダ時の理由表示、複数選択時の最終成功画像、payload検査をGREENにする。
- [x] `node --check Code.js`、`node --test tests/*.test.js`、`git diff --check` を実行する。

### Task 6: 並列最終レビューと修正

**Files:**
- Read-only review: 全変更ファイル
- Modify by main agent only: 再現・確認済み指摘の対象ファイル

- [x] A（権限・セキュリティ）、B（データ・同期）、C（フロント・回帰）を最大3サブエージェントで並列レビューする。
- [x] 根拠付き指摘を統合・重複排除し、採否と理由を記録する。
- [x] 採用指摘ごとに失敗テストを追加し、メインエージェントが順番に修正する。
- [x] 修正箇所を短く再レビューする。
- [x] `node --test tests/*.test.js`、`node --check Code.js`、`git diff --check` を再実行し、失敗0を確認する。
