# シート基盤改善 第2段階 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This request explicitly forbids subagents, approval waits, commits, pushes, and pull requests.

**Goal:** Drive のフォルダ単位一覧と `scenes` を安全・冪等に同期し、一覧表示と画像操作を scenes 中心へ移行する。

**Architecture:** Drive 列挙を I/O 境界、scenes スナップショットから更新配列と結合一覧を作る処理を純粋変換として分離する。Drive 成功後だけロック内で一括 upsert し、削除は明示操作専用の別経路に保つ。

**Tech Stack:** Google Apps Script V8、Drive/Sheets/Cache/Lock API、HTML/JavaScript、Node.js `node:test` と `vm`。

## Global Constraints

- `v2.0.0` 上で単一エージェントとして実装する。
- コミット、プッシュ、PR作成を行わない。
- 同期は対象フォルダ直下だけで、再帰全走査を行わない。
- Drive の失敗・空結果・一覧欠落から scenes/info を削除しない。
- 編集 API のトークン検証を維持する。
- `northOffset=0` を有限な有効値として保持する。
- 新しい本番コードより先に失敗テストを実行する。

---

### Task 1: Drive/Sheet テストハーネスと同期 RED

**Files:**
- Modify: `tests/sheet-foundation.test.js`
- Modify: `Code.js`

**Interfaces:**
- Produces: Drive file/folder iterator、可変 Cache、Blob 読込回数、Trash/rename/create 履歴を観測できるモック。
- Tests: `getConfigFromFolder_(folderId, options)`、`buildSceneFolderSyncPlan_(driveImages, snapshot, options)`。

- [x] Drive モックとシート一括読書き回数の観測をテストハーネスへ追加する。
- [x] 未登録一括追加、再実行非重複、親フォルダ、Blob 非読込のテストを書く。
- [x] Drive 失敗と一覧欠落で scenes/info が変化しないテストを書く。
- [x] `node --test tests/sheet-foundation.test.js` を実行し、同期関数未実装による失敗を確認する。

### Task 2: フォルダ単位同期 GREEN

**Files:**
- Modify: `Code.js`
- Test: `tests/sheet-foundation.test.js`

**Interfaces:**
- Produces: `listDriveFolderItems_`, `buildSceneFolderSyncPlan_`, `syncDriveFolderToScenes_`, `joinDriveImageWithScene_`。
- Consumes: `readSceneRows_`, `upsertScenes_`, `acquireLock_`, folder cache helpers。

- [x] 日付・真偽値・種別・表示順の正規化関数を実装する。
- [x] Drive 列挙成功後だけ scenes を一度読み、更新配列を作る純粋同期計画を実装する。
- [x] 新規行に同フォルダ末尾の連番を与え、既存行の種別・ホーム・順序を保持する。
- [x] 一括 upsert 後に結合済み一覧をキャッシュして返す。
- [x] 対象テストを再実行し GREEN を確認する。

### Task 3: 初回タグ、ホーム、表示順

**Files:**
- Modify: `Code.js`
- Modify: `app.html`
- Test: `tests/sheet-foundation.test.js`
- Create: `tests/scene-foundation-ui.test.js`

**Interfaces:**
- Produces: `parseLegacySceneTags_`, `compareSceneImages_`, client `getExplicitSceneType`, `compareSceneListItems`, `isSceneHome`。

- [x] 新規 `[2D]` / `[HOME]`、既存行へのタグ追加・削除非反映、ホーム最大一件の失敗テストを書く。
- [x] 表示順同値・不正時の名前/ID安定順をテストする。
- [x] フロントの明示 `2D` / `360` 優先、ホーム利用、northOffset 0保持の失敗テストを書く。
- [x] タグ解析とルート限定ホーム正規化を同期計画へ実装する。
- [x] クライアントの表示種別、名称、並び替えを共通関数へ集約して GREEN にする。

### Task 4: アップロード整合性

**Files:**
- Modify: `Code.js`
- Modify: `app.html`
- Test: `tests/sheet-foundation.test.js`

**Interfaces:**
- `uploadImageToDrive` returns `{success, partialSuccess?, file, sceneRegistered, warning?, error?}`。
- Sync option `newSceneOverridesByFileId[fileId].type` carries the UI-selected `360` or `2D` value.

- [x] 2D/360 の scenes 登録、`[2D]` 非付与、同期失敗時に Trash しないテストを RED にする。
- [x] 元ファイル名のまま Drive ファイルを作り、保存先フォルダを明示種別付きで強制同期する。
- [x] 部分成功でも Drive ファイル情報と警告を返し、クライアントが一覧へ反映して警告表示する。
- [x] 対象テストを GREEN にする。

### Task 5: 名前変更と明示削除

**Files:**
- Modify: `Code.js`
- Modify: `app.html`
- Test: `tests/sheet-foundation.test.js`

**Interfaces:**
- Produces: `deleteInfoRowsForImage_`, `deleteSceneRowsForFileId_`, parent-folder cache invalidation by captured IDs.
- Mutation results expose `driveUpdated`/`driveDeleted`, `sceneUpdated`/`sceneDeleted`, `infoDeleted`, `partialSuccess`, and `warnings`.

- [x] Drive rename 成功後の scenes 表示名、Drive rename 失敗時の scenes 非変更をテストする。
- [x] 明示削除の Drive→info→scenes 順、Drive 失敗時のシート非変更、部分成功をテストする。
- [x] 名前変更をロック内の段階処理へ変更し、成功した Drive 状態を部分失敗でも返す。
- [x] 削除用シート関数を分離し、同期から呼ばれない明示削除経路だけに接続する。
- [x] クライアントへ部分成功警告を表示し、対象テストを GREEN にする。

### Task 6: キャッシュ、文書、回帰検証

**Files:**
- Modify: `Code.js`
- Modify: `app.html`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify as needed: `tests/*.test.js`

- [x] 初期表示・一覧更新・サブフォルダ表示が必要なフォルダだけを強制同期する呼出しを確認する。
- [x] 自動登録、ホーム、アップロード、改名、削除後の対象フォルダ無効化を確認する。
- [x] README に同期、初回タグ、部分成功、非再帰、安全条件を追記する。
- [x] `node --check Code.js` を実行する。
- [x] `node --test tests/sheet-foundation.test.js tests/scene-foundation-ui.test.js` を実行する。
- [x] `node --test tests/*.test.js` を実行し全件成功を確認する。
- [x] `git diff --check`、`git status --short`、`git diff --stat` と差分レビューを実行する。

### Task 7: 公開northOffset経路と2D境界

**Files:**
- Modify: `Code.js`
- Modify: `app.html`
- Test: `tests/sheet-foundation.test.js`
- Test: `tests/delivery-mode.test.js`

**Interfaces:**
- Produces: `getNorthOffsetAccessContext_`, `updateExistingSceneNorthOffset_`, object-compatible `loadHotspots` request.
- `getOrExtractNorthOffset_` returns `null` before Drive Blob access for denied, unregistered, root-outside, `2D`, or non-JPEG targets.

- [x] 未登録・ルート外・2D・360 JPEG・0・manual・単一画像一致の失敗テストを追加してREDを確認する。
- [x] 公開対象判定と既存行限定保存を実装し、ホットスポット読取を失敗から分離する。
- [x] 単一画像クライアントだけ、表示ファイルIDと空の従来ホットスポットIDをpayloadで送る。
- [x] 対象テストをGREENにする。

### Task 8: プロパティAPI認可

**Files:**
- Modify: `Code.js`
- Modify: `app.html`
- Test: `tests/edit-token.test.js`
- Test: `tests/sheet-foundation.test.js`

- [x] 正常・欠落・無効トークンとクライアントpayloadの失敗テストを追加してREDを確認する。
- [x] `getImageFileProperties` の先頭で `assertEditToken_` を実行し、payloadからfileIdを読む。
- [x] 編集画面呼出しを `withEditToken({fileId})` へ変更してGREENにする。

### Task 9: フォルダ移動キャッシュと最終回帰

**Files:**
- Modify: `Code.js`
- Modify: `README.md`
- Modify: `README.en.md`
- Test: `tests/sheet-foundation.test.js`

- [x] A→B移動、重複なし、info非変更、新旧キャッシュ、失敗警告のテストを追加してREDを確認する。
- [x] 同期計画から旧親IDを返し、新旧キャッシュをベストエフォート無効化する。
- [x] READMEへ公開northOffset、プロパティ認可、移動キャッシュを追記する。
- [x] `node --check Code.js`、`node --test tests/*.test.js`、`git diff --check` を実行する。
