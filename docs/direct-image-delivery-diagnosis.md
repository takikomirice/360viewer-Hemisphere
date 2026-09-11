# テストGASの直リンク／Base64配信調査（2026-09-10）

## 共有変更後の再確認

ユーザーが対象画像を「リンクを知っている全員・閲覧者」に変更した後、同じテストGASで再確認した。直リンク固定・標準設定ともに画像を表示でき、標準設定の初期表示もBase64へ切り替わらなかった。共有設定と匿名取得条件の不一致が原因だったことを、設定変更前後で確認できた。

- Drive API: shared=true、type=anyone / role=reader / allowFileDiscovery=falseを確認。
- Cookie・Authorizationなしの同一直リンク取得: HTTP 200、Content-Type=image/jpeg、1,392,777バイト。変更前のログイン画面への転送は解消。
- delivery=direct&perf=1: status=loaded、imagePreloadComplete=760.3ms、pannellumLoad=2498.7ms。
- delivery=auto&perf=1: status=loaded、imagePreloadComplete=6.8ms、directDisplayStart=3437.4ms、pannellumLoad=3557.2ms。autoFallbackStartなし、[image-delivery]ログなし。
- 標準設定は直リンク固定の後に別タブで確認したため、画像取得にはブラウザーキャッシュが効いている可能性がある。各1試行の観測値であり、速度比較のベンチマークにはしない。
- 両方の実画面で読み込みエラーがなく、「全画面表示」「速度優先」が利用可能になった。アプリコード・GASデプロイは変更していない。
- 対象は「0416_1年棟、駐輪場付近.JPG」の初期表示。先読み・サムネイルを含む全通信がBase64を使わなくなったという意味ではない。

## 変更前の結論

テストGAS v22の標準配信（delivery=auto）は、確認した初期シーンで直リンク取得に失敗し、GASのBase64配信へ切り替わって表示された。原因は、対象Drive画像が所有者のみの非共有ファイルである一方、アプリの画像取得がcrossOrigin: anonymousで行われること。画像URLをログイン済みChromeで単独表示できることと、アプリ内で匿名取得できることは別である。

## 今回確認した証拠

- clasp deploymentsとApps Script APIで、既存テストデプロイがバージョン22であることを確認。公開バージョン22の7ファイルを専用フォルダーへ読み戻し、verify-gas-source.jsでローカルとの一致を確認。
- delivery=directの実画面は「画像を読み込めませんでした」「The file ... could not be accessed.」を表示。失敗した画像は「0416_1年棟、駐輪場付近.JPG」。
- 同じ直リンクをログイン済みChromeの独立タブで開くと、4096×2048の画像として復号できた。
- 対象画像のDrive APIメタデータはshared=false、permissionsはtype=user / role=ownerの1件、canDownload=true、image/jpeg、8,300,966バイト。
- 同じ直リンクをCookie・AuthorizationなしでHTTP取得すると、302でGoogle画像ホストを経由し、accounts.google.com/ServiceLogin、続いてログイン画面へ転送された。最終応答は200だがContent-Typeはtext/htmlであり、JPEGではない。転送先の署名付きURLやCookieは記録に掲載しない。
- delivery=auto&perf=1の実ログは、imagePreloadFailure=353.5ms、autoFallbackStart=353.5ms、imagePreparationComplete=4140.4ms、pannellumLoad=4263.6ms。sceneStart基準の1回の観測値であり、通信性能の保証ではない。
- 同試行の[image-delivery]はrequestedQuality=fast、servedQuality=fast、characters=1857059。このログはgetImageDataUri(fileId, 'public', requestedQuality)の成功応答に対して出力される。公開ソースの同経路がdata:image/jpeg;base64を返すことも照合済み。
- 直リンク固定のエラー画面で「互換表示で再試行」をクリックすると表示が復旧し、「全画面表示」が利用可能になった。
- 実デプロイの設定はexecuteAs=USER_DEPLOYING、access=ANYONE_ANONYMOUS。GASはデプロイ実行者の権限とOAuthトークンでDrive画像を取得する。

## 実装との対応

- app.html: preloadSceneImageとcreatePannellumViewerConfigはcrossOriginをanonymousに設定する。
- app.html: fallbackToBase64はGASのgetImageDataUriをpublicモードで呼ぶ。
- Code.js: getFastImageDataUri_は認証付きプレビュー取得後、JPEGをencodeImageBytes_でBase64へ変換する。
- Code.js: getImageDataUriはpublicモードでそのData URIを返す。

anonymousのクロスオリジン画像取得では別オリジンへのCookie等の資格情報が送られない（[MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/crossorigin)）。GASをデプロイ実行者として実行する設定は、閲覧ブラウザーのDrive直リンクへその権限を引き継ぐ設定ではない（[Google Apps Script](https://developers.google.com/apps-script/guides/web)）。

## 範囲

画像の共有設定、アプリのコード、デプロイは変更していない。今回の原因確定対象は上記の初期シーン。全画像・校内回線・生徒アカウントの組合せを網羅した検証ではない。

現在の非共有設定と配信実装を維持する場合、この画像の表示はGAS経由になる。Base64は現在のGASからブラウザーへ画像を渡す実装上の形式であり、画像表示一般の必須条件ではない。
