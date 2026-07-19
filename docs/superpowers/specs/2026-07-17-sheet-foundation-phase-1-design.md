# シート基盤改善 第1段階 設計

## 目的と範囲

既存の `info` データ、ホットスポット機能、編集トークン検証を維持しながら、設定値を正規化した `config` と画像単位設定を持つ `scenes` を整備する。今回は Drive 全体同期やシーン設定 UI には踏み込まず、今後の同期処理が利用できる内部 API と既存データ移行だけを追加する。

## 検討した方式

1. **既存 `Code.js` 内に責務別の内部関数を追加する（採用）**
   - 現行の Apps Script 配置・デプロイ方法・VM テストを維持できる。
   - config/scenes の読み書きを配列単位にまとめ、既存公開 API のシグネチャを変えずに移行できる。
2. **シート基盤を別 `.gs` / `.js` ファイルへ分離する**
   - 責務は明確になるが、手動配置手順、clasp 対象、現在の単一ファイル VM テストを同時に変更する必要があり、第1段階としては影響が大きい。
3. **既存関数へ個別条件を追加するだけに留める**
   - 差分は小さいが、config の反復読み込み、行単位更新、EDIT_URL 生成重複、NORTH 移行の検証不足が残る。

## config 設計

`CONFIG_PRIMARY_KEYS` を次の順で定義する。

1. `IMAGE_DRIVE_URL`
2. `STUDENT_SHEET_URL`
3. `WEB_APP_URL`
4. `EDIT_URL`
5. `EDIT_KEY`

config はヘッダーを含む3列として一括取得する。値セルに数式がある場合は数式文字列を保持して再配置し、手入力値も保持する。基本項目は先頭に1行ずつ正規化し、その他の有効な設定行は元の順序で後ろへ残す。既存値が空でない基本行を優先し、不足行だけを追加する。スキーマバージョンは追加しない。

`EDIT_URL` は `buildEditUrl_` だけで生成し、`WEB_APP_URL` は config、未設定時は `ScriptApp.getService().getUrl()` を使用する。`EDIT_KEY` は既存の有効キー取得規則を維持し、setup、URL設定、キー生成・再生成、表示の各経路から同じ更新関数を呼ぶ。

## STUDENT_SHEET_URL 設計

`extractSpreadsheetId_` は Google Sheets URL と生IDを受け付け、許容文字と最低長を検証する。参照は config の `STUDENT_SHEET_URL` から抽出できるIDを優先し、抽出不能な場合のみ ScriptProperties の `STUDENT_SHEET_ID` を使う。

利用時は共通オープン関数で `SpreadsheetApp.openById`、対象シートの存在、8列の必須ヘッダーを検証する。空のヘッダーセルは期待値で補修できるが、非空の異なるヘッダーはデータ解釈を変えないようエラーにする。新規作成時は config に URL、ScriptProperties に ID を保存する。setup 時は config が空で ScriptProperties のIDが開ける場合に URL を補完する。

## scenes 設計

`scenes` の列は定数で一元管理する。

1. DriveファイルID
2. 表示名
3. 親フォルダID
4. 種別
5. ホーム設定
6. 表示順
7. northOffset
8. northOffset取得元
9. Drive更新日時
10. scenes行の更新日時

シート取得・作成時は不足列とヘッダーだけを補修し、データ行を移動しない。一括読み取りでファイルID索引と重複一覧を作る。upsert は同一呼び出し内の更新をIDでまとめ、既存の最初の行だけを更新し、重複既存行は削除せず警告する。未登録IDは末尾へ一括追加する。自動 northOffset 更新は取得元 `manual` の行を上書きしない。

## northOffset と移行

読み取り順は scenes、config の `NORTH_<ID>`、JPEG XMP、`null` とする。有限数値だけを値として扱い、`0` は有効値にする。XMP結果は `xmp`、情報なしは空欄と `none` で scenes に保存する。保存はロック内の upsert を通す。

setup の移行は config の全 `NORTH_` 行を解析し、有限数値または `NONE` だけを scenes へ一括 upsert する。書き込み後に scenes を再読込し、同じ意味の値を確認できた元行だけを config から除外して一括再書き込みする。不正値、manual 値との衝突、書き込み・検証失敗は警告し、元行を残す。これにより再実行時も結果が変わらない。

## info と安全性

既知の旧 info ヘッダーだけを構造移行する。現行列位置と一致する空ヘッダーは補修するが、未知の非空ヘッダーを上書き・移動しない。データ行は既存の一括処理を維持し、空IDだけを補完する。

`onOpen` は既存メニュー作成だけを行う。編集API入口の `assertEditToken_` 呼び出しと `doGet` のキー検証は変更しない。公開読込から行われる書き込みは northOffset の内部メタデータキャッシュに限定する。

## テスト方針

Node 標準テストへシート用インメモリモックを追加し、config 冪等性・値/数式保持・順序、info 保持、Student URL優先順位とID抽出、EDIT_URL更新、scenes 作成/補修/upsert/重複検出、NORTH移行、不正値保持、0度、scenes 保存を振る舞いとして検証する。既存72件は回帰テストとして全件維持し、編集トークンと公開URL安全性を引き続き確認する。
