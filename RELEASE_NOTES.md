# Release Notes

## v2.0.1 - 2026-07-19

Hemisphere v2.0.1 は、左サイドパネルのシーン写真を安全に並び替えられるようにするパッチリリースです。

### シーン並び替え

- 編集権限のある画面で編集モードを有効にした場合に限り、現在のフォルダ直下の写真をドラッグ＆ドロップで並び替えられるようになりました。
- 写真項目へドラッグハンドルと挿入位置表示を追加しました。サブフォルダはドラッグ対象外で、写真より前に固定されます。
- ドロップ直後に既存の一覧DOMだけを移動するため、表示中シーンを維持し、シーン画像の再読み込みを行いません。
- 共有URL、閲覧モード、幅600px以下の画面、タッチ操作を主とする端末では並び替えハンドルを表示せず、通常のシーン選択を維持します。

### 保存と競合対策

- `reorderScenes` 一括更新APIを追加し、フォルダ内の全写真IDと順序を1回の呼び出しで保存します。
- 編集トークン、対象フォルダ、重複・空ID、Drive直下の現在画像との完全一致を検証し、同時更新で一覧が変わった場合は保存を拒否します。
- `LockService` による排他制御下で、既存 `scenes` 行の「表示順」列だけを連続整数へ正規化して一括更新し、対象フォルダの一覧キャッシュを無効化します。
- 保存中の二重D&Dと二重送信を防止し、失敗時は画面を保存前の順序へ戻します。古い非同期応答が新しい状態を上書きしないよう世代管理を行います。

### 互換性と更新方法

- `scenes` シートの新しい列や別の順序管理データは追加しません。既存の「表示順」と `displayOrder` をそのまま利用します。
- シーン切り替え、右クリックメニュー、シーン設定・削除、サブフォルダ移動、閲覧専用表示との互換性を維持します。
- ホットスポット音声機能は本リリースの対象外です。
- Apps Scriptの `Code.js`、`styles.html`、`app.html` を更新し、Webアプリを新しいバージョンとして再デプロイしてください。シート構成の追加作業は不要です。

## v2.0.0 - 2026-07-19

Hemisphere v2.0.0 は、360度画像と2D平面画像を一つのビューアで管理し、シーン設定・ホットスポット編集・写真添付・レスポンシブ表示を強化する正式リリースです。

### 主な新機能

- 360度画像と2D平面画像を混在管理できるようになりました。`scenes` シートで表示名、種別、ホーム、表示順、北方向補正を画像単位で管理します。
- ホットスポットの追加、編集、移動、削除に対応しました。丸・四角・菱形の3形状、12色、12アイコン（動物、葉っぱ、花、史跡を含む）を選択できます。
- ホットスポット写真を保存時にアップロードし、差し替え・解除できるようになりました。閲覧時は写真の拡大表示、ズーム、ドラッグ、ピンチ操作に対応します。
- 編集画面から、シーンを保存するDriveフォルダとホットスポット写真専用フォルダを直接開けるようになりました。
- 実装済みの一括入出力として、一括入力用スプレッドシートの作成・候補更新・ホットスポット取り込みを利用できます。

### 表示・操作性の改善

- 公開、内部閲覧、編集の各モードに応じて、表示する操作と編集導線を整理しました。
- ライト／ダークテーマを追加し、端末設定との連動と利用者による切り替えに対応しました。
- PC、スマートフォン、横向き画面で、360度画像と2D平面画像の双方を操作しやすいレイアウトに改善しました。
- サイドバー、モバイル用シーン一覧、シーン設定、ホットスポット編集フォームを再構成しました。
- 編集中の競合操作、同一対象への重複操作、保存ボタンの二重送信を抑止し、通信失敗時は入力内容と未保存写真を保持します。
- 編集モードへ入る際は全画面表示を解除し、編集中は全画面操作を無効化するようにしました。

### パフォーマンスと安定性

- シーン画像とホットスポット情報を並列に読み込み、先に準備できた結果を安全に反映するよう改善しました。
- Drive直リンク配信を優先し、必要な場合のみBase64へ切り替えるfallbackを強化しました。
- `delivery=auto` はシーン単位の単一デッドラインで制御し、直リンク失敗や読み込み停止時のBase64切り替え待ちを重複させません。
- シーン切り替え後に届いた古い画像・ホットスポット応答が現在の表示を上書きしないよう、世代管理を追加しました。
- フォルダ一覧キャッシュ、シーン切り替え、非同期処理、部分成功とエラー復旧を改善しました。

### Drive・スプレッドシート連携

- `config` の基本行を整理し、既存の値、数式、独自設定行を保持しながら不足行だけを補修します。
- ホットスポット写真専用フォルダの表示用設定として `HOTSPOT_PHOTO_FOLDER_URL` を追加しました。
- 専用写真フォルダは、写真付きホットスポットを初めて保存するときに遅延作成されます。保存ボタンを押す前やキャンセル時にはDriveファイルを作成しません。
- 写真フォルダIDはScript Propertiesを正本として管理し、`config` の表示URLが改変・欠落した場合は安全に修復します。
- 写真の差し替え、解除、ホットスポット／シーン削除時に参照状況を確認し、公式フォルダ内の孤立ファイルだけを整理します。
- `config`、`info`、`scenes` の補修では、既存値、数式、独自行を維持し、Drive上の一時的な欠落だけで既存データを削除しません。

### 互換性と注意事項

- 既存ホットスポットを維持し、旧シート構成には必要な補修を適用します。既知の破壊的変更はありません。
- 旧 `video`／`audio` アイコンは既存データの表示・編集互換のためだけに維持され、新規ホットスポットでは選択できません。動画・音声の再生機能は搭載していません。
- 未知のアイコン値は `info` へフォールバックします。旧 `star` 形状は読み込み時に丸として表示されます。
- 既存環境では、Apps Scriptの5ファイルを更新後、スプレッドシートの「設定」→「初期設定・更新」を実行し、Webアプリを新しいバージョンとして再デプロイしてください。

### 更新方法

1. 必要に応じてスプレッドシートをバックアップします。
2. Apps Scriptの `Code.js`、`index.html`、`styles.html`、`app.html`、`appsscript.json` をv2.0.0の内容へ更新します。
3. スプレッドシートを再読み込みし、「設定」→「初期設定・更新」を実行して `config`、`info`、`scenes` を補修します。
4. Webアプリを新しいバージョンとして再デプロイし、`WEB_APP_URL`、公開URL、編集URLを確認します。
5. ホットスポット写真専用フォルダは最初の写真保存時に自動作成されるため、通常は手動作成不要です。

## v1.1.0 - 2026-07-05

Feature and security-focused release for public sharing, edit protection, mobile viewing, and delivery performance.

### Highlights

- Added edit-token protection for mutating server calls, with edit-key setup and regeneration support.
- Added public share URL, iframe embed, and QR code generation flows that do not expose edit keys.
- Improved image delivery with direct URL loading, auto fallback, and explicit Base64 fallback mode.
- Added mobile public-viewing UI improvements, including bottom-sheet scene and hotspot details.
- Centralized gyro state shutdown and UI state handling for more predictable viewer interaction.
- Added read-only access notices and edit-key warnings for safer shared links.
- Added folder-listing and read-only hotspot caching, with invalidation after edits.
- Added configurable `WEB_APP_URL` support for stable edit and share URL generation.
- Expanded automated test coverage across edit tokens, sharing, QR codes, delivery, gyro, mobile UI, and caching.

### Notes

- For stable share and edit URLs, set `WEB_APP_URL` in the config sheet after deployment.
- Public share URLs and QR codes are intentionally generated without `editKey`.
- Base64 delivery remains available as a fallback, but public viewing uses direct delivery by default.

## v1.0.0 - 2026-07-04

Initial public release of 360° Viewer - Hemisphere.

### Highlights

- Embeddable Google Apps Script 360° panorama viewer for Google Sites.
- Hotspot editing with labels, descriptions, links, marker shapes, colors, and icons.
- Photo attachment and scene-jump support for multi-image folder tours.
- 2D flat-map mode using `[2D]` image filename prefixes.
- Home scene support using `[HOME]` image filename tags.
- Quiz mode with flip-card question and answer hotspots.
- Google Drive folder browsing with subfolder navigation and scene refresh.
- Teacher workflow for uploading, renaming, deleting, and inspecting scene images.
- Bulk input spreadsheet integration for registering hotspots from a separate sheet.
- Japanese README and English README for public setup and usage.

### Notes

- The project runs as a container-bound Google Apps Script attached to a Google Spreadsheet.
- Images are currently served through a Googleusercontent direct URL format. If Google changes that behavior, switch the image delivery code back to Base64 data URI generation as described in the README.
- The UI text is currently Japanese.
