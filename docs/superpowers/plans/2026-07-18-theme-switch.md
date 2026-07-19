# Theme Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存のレスポンシブUIと権限制御を維持しながら、初期描画前に決定される共通ライト／ダークテーマと、モード別に相互排他的なテーマ切替を追加する。

**Architecture:** `<head>`内のCSS読込前スクリプトが保存値または初期OS設定から`html[data-theme]`を決定する。`app.html`の共通処理がテーマ適用・保存・二つのボタン表示同期を担い、CSSは意味別トークンと対象を絞ったダーク指定でUI面だけを変更する。既存Playwrightハーネスをそのまま使い、実ブラウザの`localStorage`、`prefers-color-scheme`、要素矩形、JavaScriptエラーを検証する。

**Tech Stack:** Google Apps Script HTML Service、HTML/CSS、ES5互換クライアントJavaScript、Web Storage API、`matchMedia`、Node.js built-in test runner、Playwright/Chromium

## Global Constraints

- ブランチは`v2.0.0`を使用する。
- このチャット内の単一エージェントで実装し、サブエージェントを使用しない。
- コミット、push、PR作成、GASデプロイを行わない。
- 既存の上部余白修正、レスポンシブUI、Playwrightハーネスを維持する。
- 既存の機能、権限、編集トークン、GAS API、データ構造を変更しない。
- OSテーマのページ表示中の動的追従は実装しない。
- 360／2D画像とPannellum描画面へテーマ用フィルターを適用しない。
- 本番処理をブラウザ確認ハーネスへ依存させない。
- 実装はテストを先に書き、対象失敗を確認してから最小コードを追加する。

---

### Task 1: テーマ契約のNodeテストをREDにする

**Files:**
- Create: `tests/theme-switch.test.js`
- Test: `index.html`
- Test: `styles.html`
- Test: `app.html`

**Interfaces:**
- Produces test contract for: `hemisphereTheme`、`html[data-theme]`、`#toolbar-theme-toggle`、`#floating-theme-toggle`、`toggleTheme()`

- [ ] **Step 1: 実装前の対象ソースを読み込む静的テストを書く**

Nodeテストで次を要求する。

```js
assert.ok(index.indexOf('data-theme') < index.indexOf('<?!= include("styles") ?>'));
assert.match(index, /id="toolbar-theme-toggle"/);
assert.match(index, /id="floating-theme-toggle"/);
assert.match(app, /function toggleTheme\(/);
assert.match(styles, /html\[data-theme="dark"\]/);
```

実際のテストは単純な文字列存在だけでなく、次の契約も確認する。

- 初期化スクリプトがCSS includeより前にある。
- 保存値を`light`／`dark`だけに正規化する。
- 保存値なしでは`prefers-color-scheme: dark`を読む。
- 初期テーマを`document.documentElement`へ設定する。
- 二つのボタンに`type="button"`、`aria-label`、`title`がある。
- public／internalと編集トップバーの表示規則が相互排他的である。
- `:focus-visible`とダークテーマの共通トークンがある。
- テーマコードが360／2D画像へ`filter`を設定しない。

- [ ] **Step 2: REDを確認する**

Run: `node --test tests/theme-switch.test.js`

Expected: 初期化スクリプト、ボタン、テーマ処理、ダークCSSが未実装のためFAILする。

### Task 2: Playwrightのテーマ状態・モード表示テストをREDにする

**Files:**
- Modify: `tests/browser/responsive-layout.spec.js`
- Test: `tests/browser/harness-server.js`
- Test: `playwright.config.js`

**Interfaces:**
- Consumes: existing `openHarness()`、`collectLayout()`、5 viewport fixtures
- Produces assertions for: 保存値、OS初期値、モード別可視性、テーマ切替、再読込

- [ ] **Step 1: テーマ初期条件を指定できるブラウザテスト補助を追加する**

既存`openHarness()`を利用し、必要なテストだけ`page.addInitScript()`で`localStorage`を設定または削除し、`page.emulateMedia({ colorScheme })`で初期OSテーマを指定する。本番コードやハーネスへテスト専用テーマ分岐を追加しない。

`collectLayout()`の対象へ次を追加する。

```js
'#toolbar-theme-toggle',
'#floating-theme-toggle'
```

ページ単位で`pageerror`と`console.error`を収集し、操作後に空であることを検証できるようにする。

- [ ] **Step 2: モード別の相互排他的表示テストを書く**

public／internalではトップバー非表示、フローティング版可視、ツールバー版非表示を要求する。editではトップバーとツールバー版可視、フローティング版非表示を要求し、全モードで可視なテーマ切替数が1であることを確認する。

- [ ] **Step 3: 初期値・切替・保存・再読込テストを書く**

次を実ブラウザで要求する。

- 保存値`dark`で初期表示から`html[data-theme="dark"]`になる。
- 保存値なし、OSダークで`dark`になる。
- 保存値なし、OSライトで`light`になる。
- 保存値はOS設定より優先される。
- クリックでテーマ、`aria-label`、`title`、`aria-pressed`が同期更新される。
- `localStorage`に新しいテーマが保存される。
- 再読み込み後も選択テーマを維持する。

- [ ] **Step 4: REDを確認する**

Run: `npx playwright test tests/browser/responsive-layout.spec.js --grep "theme mode visibility|theme initial state|theme persistence"`

Expected: テーマボタンと共通テーマ処理が未実装のためFAILする。

### Task 3: 初期テーマと共通テーマ操作を実装して状態テストをGREENにする

**Files:**
- Modify: `index.html`
- Modify: `app.html`
- Test: `tests/theme-switch.test.js`
- Test: `tests/browser/responsive-layout.spec.js`

**Interfaces:**
- Produces: `window.__APP_THEME__`、`window.__APP_THEME_STORAGE_KEY__`、`applyTheme()`、`syncThemeToggleButtons()`、`toggleTheme()`

- [ ] **Step 1: CSS読込前の初期化スクリプトを追加する**

`index.html`の`<head>`で`<?!= include("styles") ?>`より前に自己実行関数を置く。保存キーは`hemisphereTheme`とし、`localStorage`アクセスを`try/catch`で保護する。有効保存値がなければ初期`matchMedia('(prefers-color-scheme: dark)')`を一度だけ評価し、`document.documentElement.setAttribute('data-theme', theme)`を呼ぶ。

OSテーマの`change`イベントリスナーは登録しない。

- [ ] **Step 2: モード別の二つのボタンをマークアップする**

`#toolbar-theme-toggle`を`.topbar-right`へ、`#floating-theme-toggle`を`#ui-overlay`へ追加する。両方を`type="button"`、共通クラス、`onclick="toggleTheme()"`、初期`aria-label`、`title`、`aria-pressed`付きにし、アイコンは現在テーマではなく次の操作を表す。

- [ ] **Step 3: 共通テーマ処理を追加する**

`app.html`へ次の責務を持つ小さな関数群を追加する。

- テーマ値を`light`／`dark`へ正規化する。
- 現在の`html[data-theme]`を読む。
- 指定テーマをDOMへ適用し、要求時だけ保存する。
- 両ボタンのアイコン、`aria-label`、`title`、`aria-pressed`を同期する。
- クリック時に現在テーマを反転して保存する。

ストレージ保存が失敗してもDOMへの適用は成功させる。既存`window.load`初期化から表示同期を呼び、GASの設定取得や権限判定へ接続しない。

- [ ] **Step 4: Nodeと状態PlaywrightテストをGREENにする**

Run:

```powershell
node --test tests/theme-switch.test.js
npx playwright test tests/browser/responsive-layout.spec.js --grep "theme mode visibility|theme initial state|theme persistence"
```

Expected: 初期テーマ、相互排他的表示、切替、保存、再読込がPASSする。CSS配色と座標に関する未実装テストだけが残る。

### Task 4: 意味別テーマCSSとモード別配置を実装する

**Files:**
- Modify: `styles.html`
- Test: `tests/theme-switch.test.js`
- Test: `tests/browser/responsive-layout.spec.js`

**Interfaces:**
- Consumes: `html[data-theme]`、既存`body[data-app-mode]`、`--app-safe-*`、右上viewer controls
- Produces: semantic theme variables、theme button placement、dark UI surfaces

- [ ] **Step 1: 配色・フォーカス・配置の失敗するPlaywrightテストを書く**

指定5幅のpublic／internal／editで、ライト／ダーク双方について次を要求する。

- `documentElement.scrollWidth <= clientWidth + 1`
- 可視テーマボタンの矩形がviewport内で、幅・高さがおおむね44px以上
- public／internalのフローティング版が全画面、ホーム、画質、ジャイロの可視ボタンと矩形交差しない
- シーン一覧開閉前後でフローティング版の座標が変わらない
- 360／2D表示領域の幅・高さが正で、利用可能領域を維持する
- `#panorama`、`#flat-map-container`、`#flat-map-img`のテーマ由来`filter`が`none`
- 主要なUI面の算出背景色と前景色がテーマ切替後に変化する
- キーボードフォーカス時に可視なoutlineまたはbox-shadowがある
- 未処理JavaScriptエラーがない

- [ ] **Step 2: REDを確認する**

Run: `npx playwright test tests/browser/responsive-layout.spec.js --grep "theme responsive layout|theme scene list stability|theme image integrity"`

Expected: テーマボタンCSS、ダーク配色、44px配置が未実装のためFAILする。

- [ ] **Step 3: 意味別テーマ変数を追加する**

`:root`へライト既定の背景、面、文字、補助文字、境界線、入力、ボタン、オーバーレイ、フォーカス、状態色を追加し、`html[data-theme="dark"]`で上書きする。`html`の`color-scheme`もテーマに合わせる。

- [ ] **Step 4: 必須UIへテーマを適用する**

既存CSS構造を維持したまま、次へ変数または対象を絞ったダーク指定を適用する。

- トップバー、タイトル、モード表示
- サイドバー、シーン項目、開閉操作
- 編集バナー
- 埋め込み、アップロード、クイズ、ホットスポット等のモーダル／ポップアップ
- 入力、select、textarea、通常・アイコン・無効ボタン
- ヒント、ヘルプ、トースト、アクセス通知
- コンテキストメニューと編集補助UI
- テーマ切替と`:focus-visible`

360／2D画像、サムネイル、Pannellum canvasにはテーマ用`filter`、`opacity`、`mix-blend-mode`を追加しない。

- [ ] **Step 5: モード別表示と右上配置を実装する**

ツールバー版は既存flex折り返し内で44px操作面を持たせる。フローティング版は`position: fixed`でレイアウト高を消費せず、`--app-safe-top`／`--app-safe-right`を参照し、右上viewer操作列の左隣へ44pxと十分な間隔で置く。

public／internalではフローティング版だけ、トップバーが表示される画面ではツールバー版だけを表示する。public／internalの全画面中もフローティング版を維持する。

- [ ] **Step 6: CSSと座標テストをGREENにする**

Run:

```powershell
node --test tests/theme-switch.test.js tests/responsive-layout.test.js
npx playwright test tests/browser/responsive-layout.spec.js --grep "theme responsive layout|theme scene list stability|theme image integrity"
```

Expected: 5幅・全モード・両テーマの配色、座標、重なり、画像保護がPASSする。

### Task 5: 全ブラウザマトリクスと既存回帰を通す

**Files:**
- Modify as needed: `tests/browser/responsive-layout.spec.js`
- Generate ignored: `output/playwright/after/theme/**`

**Interfaces:**
- Produces: 5 viewport × mode × scene type browser evidence and final regression result

- [ ] **Step 1: 全テーマ検証を指定5幅へ展開する**

1440×900、1024×768、390×844、360×800、800×360について、public／internal／edit、360／2D、ライト／ダークを実ブラウザで確認する。シーン一覧の開閉は各モードと両テーマで少なくとも一度操作し、主要な縦横スマホ条件では全組合せを確認する。

- [ ] **Step 2: 代表スクリーンショットを保存する**

既存のGit管理対象外`output/playwright/after/`配下へ、各幅のpublicライト／ダーク、internal代表、editライト／ダーク、360／2D、シーン一覧開閉の証拠を保存する。バイナリをGit管理へ追加しない。

- [ ] **Step 3: Playwright全件を実行して修正する**

Run: `npm run test:browser`

Expected: 既存43件、条件付き診断、追加テーマテストがすべて成功する。失敗時は最初の根本原因を特定し、対象テストをREDからGREENへ戻してから全件を再実行する。

- [ ] **Step 4: Node全回帰を実行する**

Run: `node --test tests/*.test.js`

Expected: 既存246件と追加テーマテストがすべてPASSし、権限、編集トークン、360／2D、シーン、アップロード、ホットスポット、マーカーの回帰がない。

### Task 6: 差分レビューと最終指定コマンド

**Files:**
- Review: `index.html`
- Review: `styles.html`
- Review: `app.html`
- Review: `tests/theme-switch.test.js`
- Review: `tests/browser/responsive-layout.spec.js`
- Review: `docs/superpowers/specs/2026-07-18-theme-switch-design.md`
- Review: `docs/superpowers/plans/2026-07-18-theme-switch.md`

- [ ] **Step 1: 権限・データ構造・既存レイアウトの差分を確認する**

`git diff`で`Code.js`、GAS API呼び出し、編集トークン、データ書式が変更されていないことを確認する。public／internalのトップバー非表示と`--app-top-offset: 0px`、editの実測上部オフセットが維持されていることを確認する。

- [ ] **Step 2: 最終指定コマンドを新しく順番に実行する**

```powershell
node --check Code.js
node --test tests/*.test.js
npm run test:browser
git diff --check
```

Expected: すべてexit code 0。失敗、未処理JavaScriptエラー、オーバーフロー、重なりが残る場合は完了報告を行わず、修正と再検証へ戻る。

- [ ] **Step 3: コミットせず完了報告を作る**

変更ファイル、テーマ保存方式、モード別表示、確認した5画面幅と状態、Playwrightの起動方法と結果、Nodeテスト結果、残課題（OSテーマ動的追従は対象外）を報告する。コミット、push、PR、GASデプロイは行わない。
