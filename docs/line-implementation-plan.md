# LINEシャトル報告連携 実装計画

## 1. この文書の目的

本書は、LINEシャトル報告連携をフェーズ単位で実装するための進行管理文書である。

各Codexタスクは、作業開始前に次のファイルを読む。

1. `AGENTS.md`
2. `docs/line-mvp.md`
3. `docs/line-implementation-plan.md`

機能要件の詳細は `docs/line-mvp.md` を正とし、本書では実装順、依存関係、完了条件、現在地を管理する。

## 2. 現在の開発状態

最終更新日：2026年8月7日

| 項目 | 現在の状態 |
| --- | --- |
| リポジトリ | `/Users/user/dev/shuttle-manager` |
| 作業ブランチ | `feature/line-integration` |
| 現在地 | フェーズ1完了、フェーズ2着手前 |
| 次の作業 | PostgreSQL移行方針とLINE連携用データモデルの実装 |
| 既存DB | SQLite。既存データの移行・保存は不要 |
| LINEメッセージ訂正 | 編集機能には依存せず、送信取消・再送またはWeb編集を利用 |

## 3. 進行ルール

- 同じローカルプロジェクト内で、フェーズごとに新しいCodexタスクを作成する
- 原則としてフェーズを順番に進め、同じファイルを複数タスクで同時編集しない
- MVP完了までは `feature/line-integration` ブランチを使用する
- 各フェーズ開始時に `git status` を確認する
- 各フェーズでは対象外の機能へ着手しない
- 各フェーズ終了時にLint、型チェック、必要なテスト、production buildを実行する
- Codexには原則としてコミットさせず、利用者が差分を確認してからコミットする
- 仕様変更が発生した場合は、コードより先に `docs/line-mvp.md` または本書を更新する
- 秘密情報をコード、Markdown、Git履歴へ記録しない
- PostgreSQL移行時に既存SQLiteデータは引き継がない

## 4. フェーズ一覧

| フェーズ | 内容 | 状態 | 目安 |
| --- | --- | --- | ---: |
| 1 | 調査・MVP仕様・実装計画 | 完了 | 完了済み |
| 2 | PostgreSQL・Prismaデータモデル | 未着手（次） | 3〜6時間 |
| 3 | メッセージ解析・Report保存処理 | 未着手 | 3〜5時間 |
| 4 | LINE公式アカウント・Webhook準備 | 未着手 | 1〜3時間 |
| 5 | Webhook受信・署名・グループ制限 | 未着手 | 4〜7時間 |
| 6 | LINE返信・残量確認・送信取消 | 未着手 | 3〜5時間 |
| 7 | 結合テスト・本番デプロイ | 未着手 | 3〜6時間 |
| 8 | MVP運用確認・改善判断 | 未着手 | 1〜2週間の試験運用 |
| 9 | 購入管理 | MVP後 | 4〜7時間 |
| 10 | 使用量グラフ・在庫警告 | MVP後 | 6〜12時間 |
| 11 | Web認証・権限管理 | MVP後 | 4〜8時間 |

## 5. 実装順と依存関係

```text
フェーズ1：仕様確定
    ↓
フェーズ2：DB基盤
    ↓
フェーズ3：LINEに依存しない解析・保存処理
    ↓
フェーズ4：LINE公式アカウント準備
    ↓
フェーズ5：Webhook接続
    ↓
フェーズ6：返信・残量確認・送信取消
    ↓
フェーズ7：結合テスト・デプロイ
    ↓
フェーズ8：試験運用
    ↓
フェーズ9以降：購入・グラフ・認証
```

フェーズ3まではLINE Developers Consoleの設定がなくてもローカルで実装・テストできる。フェーズ4で取得するChannel secretとChannel access tokenは、フェーズ5以降の実機確認に必要となる。

## 6. フェーズ別計画

### フェーズ1：調査・MVP仕様・実装計画

状態：**完了**

実施済み：

- 現在のNext.js、Prisma、SQLite構成を調査
- 既存画面、API、入力値検証を確認
- Lint、TypeScript、production build、Prisma migrationを確認
- `feature/line-integration` ブランチを作成
- `docs/line-mvp.md` を作成
- LINEメッセージ編集には依存しない方針へ修正
- 既存SQLiteデータは移行不要と決定
- 本実装計画を作成

完了条件：

- [x] MVPの目的と対象範囲が文書化されている
- [x] LINE報告形式が決まっている
- [x] 訂正方法が決まっている
- [x] フェーズと実装順が決まっている

### フェーズ2：PostgreSQL・Prismaデータモデル

状態：**未着手（次に実施）**

目的：

外部公開環境でLINE Webhookから永続的にデータを保存できるDB基盤を作る。

実装内容：

1. 使用するマネージドPostgreSQLを決定する
2. 開発用PostgreSQLデータベースを作成する
3. `DATABASE_URL` をローカル環境変数へ設定する
4. Prisma datasourceをSQLiteからPostgreSQLへ変更する
5. SQLite用migrationをPostgreSQLへ適用しないよう整理する
6. PostgreSQL用の初期migrationを作成する
7. `ReportSource` enumを追加する
8. `Report` にLINE連携用フィールドと `reportedAt`、`updatedAt` を追加する
9. `WebhookReceipt` モデルを追加する
10. ホームと履歴の並び順を `reportedAt` 基準へ変更する
11. 空のPostgreSQL上で既存画面が動作することを確認する

注意事項：

- 現在のSQLite migrationにはSQLite専用SQLが含まれるため、そのままPostgreSQLへ適用しない
- 既存の `prisma/dev.db` のデータは移行しない
- migration履歴やSQLiteファイルを削除・移動する前に、対象を確認する
- DB接続情報をGitへコミットしない

想定変更箇所：

```text
prisma/schema.prisma
prisma/migrations/
prisma.config.ts
src/app/page.tsx
src/app/history/page.tsx
src/app/api/report/route.ts
src/app/api/report/[id]/route.ts
```

完了条件：

- [ ] PostgreSQLへ接続できる
- [ ] PostgreSQL用migrationが適用できる
- [ ] LINE連携用モデルがPrisma schemaに存在する
- [ ] 空DBでWebフォームからReportを登録できる
- [ ] ホームと履歴画面でReportを確認できる
- [ ] Web編集機能が引き続き動作する
- [ ] 型チェック、Lint、production buildが成功する

### フェーズ3：メッセージ解析・Report保存処理

状態：**未着手**

目的：

LINE APIへ接続する前に、純粋なメッセージ解析と、Web・LINE共通の保存処理を完成させる。

実装内容：

1. テスト環境としてVitestを導入する
2. `src/lib/line/parse-message.ts` を作成する
3. NFKC正規化と空白・文末表現の処理を実装する
4. `report`、`status`、`invalid-report`、`ignore` の分類を実装する
5. 0以上・0.5刻みの検証を実装する
6. パーサーの単体テストを作成する
7. `src/lib/report-service.ts` を作成する
8. 前回報告の取得、保存、差分計算を共通化する
9. 既存のWeb APIを共通サービス経由へ変更する
10. Web画面の回帰テストを行う

完了条件：

- [ ] 仕様書に記載した正常形式を解析できる
- [ ] 全角数字と全角空白を処理できる
- [ ] 不正な数値を拒否できる
- [ ] 一般会話を `ignore` に分類できる
- [ ] WebとLINEで利用できる保存サービスが存在する
- [ ] パーサーの単体テストが成功する
- [ ] 既存Web機能が壊れていない

### フェーズ4：LINE公式アカウント・Webhook準備

状態：**未着手**

目的：

LINEグループからWebhookを受け取るためのLINE側設定を完了する。

利用者が行う作業：

1. LINE公式アカウントを作成する
2. Messaging APIを有効化する
3. Channel secretを取得する
4. Channel access tokenを発行する
5. Botのグループ参加を許可する
6. 自動応答メッセージを無効化する
7. Webhook利用とWebhook再送を有効化する
8. 秘密情報をローカル環境変数へ設定する

必要な環境変数：

```env
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_ALLOWED_GROUP_ID=
APP_BASE_URL=
```

完了条件：

- [ ] Messaging API channelが作成されている
- [ ] Channel secretとaccess tokenを取得している
- [ ] 秘密情報がGit管理外に保存されている
- [ ] Botをグループへ参加させられる設定になっている

### フェーズ5：Webhook受信・署名・グループ制限

状態：**未着手**

目的：

LINE Platformから安全にWebhookを受信し、有効な報告だけを保存する。

実装内容：

1. `@line/bot-sdk` を追加する
2. `src/app/api/line/webhook/route.ts` を作成する
3. 未加工の本文を使った `x-line-signature` 検証を実装する
4. `events: []` の検証リクエストへHTTP 200を返す
5. イベント種別と `groupId` の判定を実装する
6. 許可していないグループと1対1トークを無視する
7. `webhookEventId` による二重登録防止を実装する
8. ReportとWebhookReceiptをDB transactionで保存する
9. 署名、グループ制限、再送の自動テストを作成する

完了条件：

- [ ] 不正署名をHTTP 401で拒否できる
- [ ] LINEのWebhook URL検証に成功する
- [ ] 許可グループからの報告だけを保存できる
- [ ] 同じWebhookを再送しても二重登録されない
- [ ] DB保存失敗時にHTTP 500を返せる

### フェーズ6：LINE返信・残量確認・送信取消

状態：**未着手**

目的：

LINEだけで登録結果の確認と誤報告の取消ができる状態を作る。

実装内容：

1. 登録成功時の返信を実装する
2. 前回差分の表示を実装する
3. 不正な報告への入力例返信を実装する
4. 一般会話には返信しないようにする
5. `シャトル残量` コマンドを実装する
6. `unsend` イベントで対象Reportを削除する
7. 送信取消後の正しい再送を確認する
8. LINE APIへの返信失敗をログへ記録する

完了条件：

- [ ] 正常登録後に今回値と前回差が返信される
- [ ] 不正な報告にだけ入力例が返信される
- [ ] 一般会話を無視できる
- [ ] `シャトル残量` で両拠点の最新値を取得できる
- [ ] 送信取消されたReportが削除される
- [ ] 取消後に再送した正しいReportだけが有効になる

### フェーズ7：結合テスト・本番デプロイ

状態：**未着手**

目的：

本番相当環境でMVP全体を検証し、実際のLINEグループで利用可能にする。

実装・確認内容：

1. 本番用PostgreSQLを用意する
2. デプロイ先へ環境変数を設定する
3. `prisma migrate deploy` を実行できる構成にする
4. Next.jsアプリをデプロイする
5. LINE Developers Consoleへ本番Webhook URLを設定する
6. Webhook URLのVerifyを実行する
7. 対象グループIDを取得して許可リストへ設定する
8. 実際のグループで報告、残量確認、取消、再送をテストする
9. ログに秘密情報が出ていないことを確認する
10. 既存Web機能の回帰テストを行う

完了条件：

- [ ] `docs/line-mvp.md` の受け入れ条件をすべて満たす
- [ ] 本番環境でReportが永続保存される
- [ ] LINEの実グループで一連の操作が成功する
- [ ] Lint、型チェック、自動テスト、production buildが成功する
- [ ] READMEへセットアップと運用方法を記載している

### フェーズ8：MVP運用確認・改善判断

状態：**未着手**

目的：

実際の練習で試験運用し、追加機能へ進む前にLINE入力の有効性を確認する。

確認項目：

- 報告者が従来より面倒と感じないか
- 誤認識や未登録が発生していないか
- 返信内容が分かりやすいか
- 数え間違いの発見に前回差分が役立つか
- 一般会話へ誤反応していないか
- 会計係がWeb履歴を確認しやすいか
- `0.5` の表現を今後も維持するか

フェーズ8の結果を基に、購入管理、グラフ、認証の優先順位を決める。

### フェーズ9：購入管理（MVP後）

状態：**MVP後**

主な内容：

- `シャトル1箱購入しました。` の解析
- Purchaseモデル
- 箱当たり筒数の保存
- 保管場所の選択
- 購入履歴表示

着手前に、1箱の筒数、購入品の保管場所、共通倉庫の扱いを決定する。

### フェーズ10：使用量グラフ・在庫警告（MVP後）

状態：**MVP後**

主な内容：

- 拠点別残量推移
- 月別概算使用量
- 購入量
- 急激な増減の警告
- 在庫下限警告

`0.5` は実際の半筒ではないため、使用量は概算と表示する。

### フェーズ11：Web認証・権限管理（MVP後）

状態：**MVP後**

主な内容：

- 閲覧者と編集者の権限分離
- 会計係だけが履歴を編集できる認証
- 公開APIの保護

公開範囲によっては、MVP公開前に優先度を繰り上げる。

## 7. 現在地

```text
[完了] フェーズ1：調査・MVP仕様・実装計画
   ↓
[次]   フェーズ2：PostgreSQL・Prismaデータモデル
   ↓
[待機] フェーズ3：メッセージ解析・Report保存処理
   ↓
[待機] フェーズ4：LINE公式アカウント・Webhook準備
   ↓
[待機] フェーズ5：Webhook受信・署名・グループ制限
   ↓
[待機] フェーズ6：LINE返信・残量確認・送信取消
   ↓
[待機] フェーズ7：結合テスト・本番デプロイ
```

## 8. 次のCodexタスクに渡す指示

フェーズ2の新しいタスクでは、次のプロンプトを使用する。

```text
/Users/user/dev/shuttle-manager を対象に、LINE連携のフェーズ2だけを進めてください。

最初に以下を読んでください。
- AGENTS.md
- docs/line-mvp.md
- docs/line-implementation-plan.md

現在のブランチとGit状態を確認してください。

今回の対象：
- PostgreSQL移行方針の確定
- PostgreSQL用Prisma schemaとmigration
- ReportSource、LINE連携用Reportフィールド、WebhookReceipt
- reportedAt基準への変更
- 既存Web機能の回帰確認

既存SQLiteデータの移行は不要です。
LINE Webhook、メッセージ解析、LINE返信にはまだ着手しないでください。
SQLite migrationやDBファイルを削除・移動する前に対象を確認してください。

実装後にLint、TypeScript型チェック、必要なDB確認、production buildを実行してください。
コミットはせず、変更内容と検証結果を報告してください。
```

## 9. フェーズ終了時の共通チェック

各フェーズの最後に次を確認する。

```bash
git status --short --branch
git diff --check
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

自動テスト導入後は、テストコマンドも実行する。

差分と検証結果に問題がなければ、利用者が対象ファイルをステージしてコミットする。

## 10. 決定事項

| 日付 | 決定 |
| --- | --- |
| 2026-08-07 | 従来と同じLINE報告形式を維持する |
| 2026-08-07 | 数値は0以上・0.5刻みとする |
| 2026-08-07 | LINE一般会話には反応しない |
| 2026-08-07 | WebフォームはMVPでも残す |
| 2026-08-07 | LINEメッセージ編集機能には依存しない |
| 2026-08-07 | 誤報告は送信取消・再送、またはWeb履歴から修正する |
| 2026-08-07 | 既存SQLiteデータはPostgreSQLへ移行しない |
| 2026-08-07 | MVP完成前に購入管理とグラフを実装しない |
