# Responsive UI Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開・internalの上部余白をなくし、編集画面の可変ツールバー高を基準に360/2Dとシーン一覧をレスポンシブ配置する。

**Architecture:** GASの`doGet`が安全な初期モードをHTML属性へ渡し、クライアントがトップバーと編集バナーを実測してCSS変数へ反映する。Node製の確認サーバーは本番HTML/CSS/JSを合成し、GASとPannellumの外部境界だけをfixture化してPlaywrightから実ブラウザ検証する。

**Tech Stack:** Google Apps Script HTML Service、HTML/CSS、ES5互換クライアントJavaScript、Node.js built-in test runner、Playwright/Chromium

## Global Constraints

- ブランチは`v2.0.0`を使用する。
- 実装中は単一エージェントとし、最終画面レビューまでサブエージェントを使わない。
- コミット、push、PR作成、GASデプロイを行わない。
- 既存の機能・権限・データ構造を変更しない。
- ホットスポット追加画面のボトムシート化、仮マーカー、添付写真アップロードを実装しない。
- 現行に存在しないライト／ダーク切替はユーザー指示により実装・テストしない。
- 本番処理をブラウザ確認ハーネスへ依存させない。

---

### Task 1: ブラウザ確認環境と修正前証拠

**Files:**
- Create: `package.json`
- Create: `playwright.config.js`
- Create: `tests/browser/harness-server.js`
- Create: `tests/browser/responsive-layout.spec.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `index.html`のGAS include、`styles.html`、`app.html`
- Produces: `GET /?mode=<public|internal|edit>&sceneType=<360|2d>`、`npm run test:browser`

- [ ] **Step 1: Playwright依存関係と既存ブラウザを確認する**

Run: `npm install --save-dev @playwright/test`

Expected: `package.json`と`package-lock.json`にPlaywrightが固定される。Chromiumが未導入なら`npx playwright install chromium`を実行する。

- [ ] **Step 2: 本番テンプレートを合成するハーネスを書く**

`harness-server.js`は`<?!= include("styles") ?>`と`<?!= include("app") ?>`を実ファイル内容へ置換し、`window.__EDIT_TOKEN__`はedit fixtureだけ非空にする。`google.script.run`は`getConfig`と`loadHotspots`へ完全なfixture応答を返し、Pannellum mockは実DOMの360表示面とdrag対象を生成する。

- [ ] **Step 3: 修正前の位置を記録する診断を作る**

公開・internal・edit、360/2D、シーン一覧開閉について`getBoundingClientRect()`、`documentElement.scrollWidth/clientWidth`、可視上部UIをJSONとスクリーンショットへ保存する。診断は現状の60px/100px分散を失敗扱いにせず、before証拠として出力する。

- [ ] **Step 4: 指定5幅で修正前診断を実行する**

Run: `npx playwright test tests/browser/responsive-layout.spec.js --grep "before diagnostics"`

Expected: `output/playwright/before/`に1440×900、1024×768、390×844、360×800、800×360の証拠が生成される。

### Task 2: 上部レイアウト契約の静的回帰テスト

**Files:**
- Create: `tests/responsive-layout.test.js`
- Modify: `Code.js`
- Modify: `index.html`
- Modify: `styles.html`
- Modify: `app.html`

**Interfaces:**
- Produces: `body[data-app-mode]`、`updateAppLayoutMetrics()`、`--app-top-offset`、`--app-viewport-height`

- [ ] **Step 1: 失敗するNodeテストを書く**

テストは次を要求する。

```js
assert.match(styles, /--app-top-offset:/);
assert.match(styles, /--app-viewport-height:/);
assert.match(styles, /100dvh/);
assert.match(styles, /env\(safe-area-inset-top/);
assert.match(index, /data-app-mode=/);
assert.match(app, /function updateAppLayoutMetrics\(/);
assert.match(code, /template\.initialMode/);
```

- [ ] **Step 2: REDを確認する**

Run: `node --test tests/responsive-layout.test.js`

Expected: CSS変数と`initialMode`が未実装のためFAILする。

- [ ] **Step 3: 初期モードと実測レイアウト変数を最小実装する**

`doGet`は`public`、`internal`、`edit`だけを`template.initialMode`へ設定する。`index.html`は値を`data-app-mode`へ出す。`updateAppLayoutMetrics()`は表示中トップバーと表示中編集バナーの`getBoundingClientRect().height`をルート変数へ設定し、ResizeObserverとwindow resizeから再計測する。

- [ ] **Step 4: GREENを確認する**

Run: `node --test tests/responsive-layout.test.js tests/mobile-public-ui.test.js tests/edit-token.test.js`

Expected: 全件PASSし、権限・トークンテストも維持される。

### Task 3: 写真領域とオーバーレイの一元化

**Files:**
- Modify: `styles.html`
- Modify: `app.html`
- Test: `tests/responsive-layout.test.js`
- Test: `tests/browser/responsive-layout.spec.js`

**Interfaces:**
- Consumes: `--app-top-offset`、`--app-viewport-height`
- Produces: 同じ上端契約を使う360、2D、sidebar、loading、transition、expand tab、写真操作群

- [ ] **Step 1: 公開0pxと編集実測高を要求するPlaywright assertionを書く**

公開/internalは`panorama|flat-map-container`、`loading`、`scene-transition-overlay`の`top`が0±1px、editは写真領域の`top`がトップバー/バナー下端と0±1pxであることを要求する。

- [ ] **Step 2: REDを確認する**

Run: `npx playwright test tests/browser/responsive-layout.spec.js --grep "top offset contract"`

Expected: 公開デスクトップsidebarと編集360/2Dが固定値のためFAILする。

- [ ] **Step 3: すべての対象セレクタを共通変数へ置き換える**

`top: 60px`、`top: 100px`、`height: calc(100% - 60px)`を変数参照へ置き換え、mobile sidebar分は`bottom`で差し引く。`100vh`によるモーダルと2D画像の上限は`100dvh` fallback契約へ寄せる。`toggleMode()`は`body.edit-mode-active`を同期する。

- [ ] **Step 4: GREENを確認する**

Run: `node --test tests/responsive-layout.test.js && npx playwright test tests/browser/responsive-layout.spec.js --grep "top offset contract"`

Expected: public/internal/edit、360/2DがPASSする。

### Task 4: 編集ツールバーとタップ操作のレスポンシブ基盤

**Files:**
- Modify: `index.html`
- Modify: `styles.html`
- Modify: `app.html`
- Test: `tests/responsive-layout.test.js`
- Test: `tests/browser/responsive-layout.spec.js`

**Interfaces:**
- Consumes: 既存`toggleMode()`、トップバー各ボタン、シーン一覧
- Produces: 折り返し可能なトップバー、44px操作面、キーボードフォーカス、更新されるaria-label

- [ ] **Step 1: 主要UI座標とはみ出しを要求するテストを書く**

390×844、360×800、800×360のeditで、表示中主要操作の矩形がviewport内、相互に重ならず、`scrollWidth <= clientWidth + 1`、画像領域の幅と高さが正であることを要求する。

- [ ] **Step 2: REDを確認する**

Run: `npx playwright test tests/browser/responsive-layout.spec.js --grep "responsive edit controls"`

Expected: 390px/360pxでトップバー右側が画面外へ出るためFAILする。

- [ ] **Step 3: 折り返しと狭幅表示を実装する**

トップバーをflex-wrap可能にし、420px以下では操作行を独立させる。狭幅でラベルを隠すボタンに`aria-label`と`title`を設定し、表示中ボタンとシーン項目の最小操作面を44pxにする。`:focus-visible`と`:active`を追加する。

- [ ] **Step 4: dragとシーン一覧開閉を操作してGREENを確認する**

Run: `npx playwright test tests/browser/responsive-layout.spec.js --grep "responsive edit controls|scene list states|panorama drag"`

Expected: 縦横3幅でPASSし、drag後もコンソールエラーがない。

### Task 5: 全マトリクス、回帰、最終証拠

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Generate ignored: `output/playwright/after/**`

**Interfaces:**
- Produces: ローカル起動方法、検証コマンド、before/after座標証拠

- [ ] **Step 1: READMEへブラウザ確認手順と対象外範囲を書く**

`npm install`、`npx playwright install chromium`、`npm run preview:ui`、`npm run test:browser`と、ハーネスがGAS/Pannellum境界だけをmockすることを記載する。

- [ ] **Step 2: 指定幅・全モード・360/2D・一覧開閉を実行する**

Run: `npm run test:browser`

Expected: 1440×900、1024×768、390×844、360×800、800×360で全テストPASSし、`output/playwright/after/`へ代表スクリーンショットが保存される。

- [ ] **Step 3: 既存回帰を実行する**

Run: `node --test tests/*.test.js`

Expected: 既存240件と追加テストがすべてPASSする。

- [ ] **Step 4: 最終指定コマンドを新しく実行する**

Run in order:

```powershell
node --check Code.js
node --test tests/*.test.js
npm run test:browser
git diff --check
```

Expected: すべてexit code 0。失敗があれば完了報告を行わず修正へ戻る。
