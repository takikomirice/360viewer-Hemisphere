# CodexからGASを編集する

この作業フォルダは `.clasp.json` でユーザー指定のGASへ接続済み。
認証にはインストール済みの `clasp` のログインを使う。
認証ファイルやアクセストークンをリポジトリへコピーしない。

- 作業ブランチ: `improve/quality-audit-20260908`
- 検証用Webアプリ: https://script.google.com/macros/s/AKfycbzZaFfkHQJELtoeZAYVZxVWQGg_vS8oAdU0htYqvSO_AG9VkvU2pOUFAPVgIaQAZmTF/exec
- 編集用URLはスプレッドシートのconfigにある `EDIT_URL` を利用する。編集キーを含むためGitや公開レポートには記載しない。

## 通常の更新

1. `git status --short` と `git branch --show-current` で作業状態を確認する。
2. ローカルの `Code.js`、`index.html`、`styles.html`、`app.html` を編集する。
3. `node --test tests/*.test.js` と、変更に関係する `npm run test:browser` のテストを実行する。
4. `clasp status` で送信対象が上記4ファイルと `appsscript.json` の計5ファイルであることを確認する。
5. `clasp push` で反映する。非対話環境で `Skipping push.` になる場合は、リモートのマニフェスト差分を確認してから `clasp push --force` を使う。成功メッセージの `Pushed 5 files.` を確認する。
6. 下記の手順で読み戻し照合し、変更と検証結果をブランチへコミット・プッシュする。

`clasp push` はGASの編集ソースを更新する。公開Webアプリのバージョン更新とは別操作。
公開前には対象デプロイとアクセス範囲を確認し、実際のWebアプリでも動作確認する。

## 安全な読み戻し

作業フォルダ直下で `clasp pull` するとローカルの修正が上書きされる。
読み戻し先はGit対象外の `output/quality-audit/verified/` を使う。
別の確認を残す場合は、新しい監査用サブフォルダを作る。

```powershell
New-Item -ItemType Directory -Force output/quality-audit/verified
Copy-Item -LiteralPath .clasp.json -Destination output/quality-audit/verified/.clasp.json
Push-Location output/quality-audit/verified
clasp -P .clasp.json pull
Pop-Location
npm run verify:gas -- output/quality-audit/verified
```

`verify:gas` は5ファイルを比較し、欠落・不一致があれば終了コード1を返す。
BOM・CRLF/LF・ファイル末尾の空白だけを正規化する。GASの取得内容を実行せず、内容や認証情報も出力しない。
ソース一致は公開デプロイの一致や実行時権限の確認を代替しない。

## 初回実行

GoogleによるGASの初回権限認可は、claspのソース編集用ログインとは別。
初期設定やDrive/Sheets操作には、対象GASの実行者による初回認可が必要。
Google Driveコネクタは別の接続であり、この環境では対象スプレッドシートの読み取りが403だった。
接続できるChromeから実画面を確認する。

速度優先の縮小画像とJPEGの部分取得には `UrlFetchApp` による外部接続権限も使う。
2026-09-08にユーザーの承認を受け、今回指定されたGASで追加認可を完了した。
別の実行者や別GASではその環境に応じた認可が必要になる。
取得先はGoogleのDrive APIと検証済み画像ホストに限定し、OAuthトークンや画像取得URLをクライアントへ返さない。

ネットワーク制限でCLI通信が失敗した場合は、対象と操作を明示して環境の承認付き実行を使う。
