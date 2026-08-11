# シャトル管理システム

バドミントン部のシャトル残量を、WebフォームとLINEグループの両方から登録・確認するNext.jsアプリです。

LINE連携のMVP仕様は [`docs/line-mvp.md`](docs/line-mvp.md)、進行状況は [`docs/line-implementation-plan.md`](docs/line-implementation-plan.md) を参照してください。

## 必要環境

- Node.js 20以降
- npm
- PostgreSQL（本番・開発ともNeonを使用）
- LINE Messaging API channel
- Vercel project

## 環境変数

`.env.example` を `.env` へコピーし、Git管理外で値を設定します。

| 変数 | 用途 |
| --- | --- |
| `DATABASE_URL` | アプリ実行時のPostgreSQL接続。Neonのpooled接続を使用する |
| `DIRECT_URL` | Prisma migration用のdirect接続 |
| `LINE_CHANNEL_SECRET` | Webhook署名検証用のChannel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE返信用のChannel access token |
| `LINE_ALLOWED_GROUP_ID` | 処理を許可するLINEグループID |
| `APP_BASE_URL` | 公開アプリのURL（例：`https://example.vercel.app`） |

秘密情報や実際のグループIDを、コード・Markdown・Git履歴へ記録しないでください。

## ローカル開発

```bash
npm ci
npm run dev
```

`http://localhost:3000` を開きます。

品質チェックは次のコマンドで実行します。

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## PostgreSQL migration

PostgreSQL用migrationは `prisma/migrations-postgresql/` で管理しています。SQLite用の既存migrationは履歴として `prisma/migrations/` に残してありますが、本番PostgreSQLには適用しません。

本番DBでは、`DIRECT_URL` が本番Neonのdirect接続を指していることを確認してから実行します。

```bash
npm run db:migrate:deploy
```

このコマンドは `prisma.config.ts` を通じて `prisma/migrations-postgresql/` の未適用migrationだけを適用します。アプリ実行時の `DATABASE_URL` にはpooled接続を使用します。

## Vercelへのデプロイ

1. GitHubリポジトリをVercel projectへ接続します。
2. Production環境だけに、6個の環境変数を設定します。
3. `DIRECT_URL` を使って `npm run db:migrate:deploy` を実行します。
4. Production deploymentを作成します。
5. `/`、`/report`、`/history` が表示できることを確認します。

Vercelでは `vercel-build` がPrisma Clientを生成してからNext.jsをbuildします。migrationはPreview deploymentから本番DBを変更しないよう、buildとは分離して手動で実行します。ProductionのDB接続情報をPreview環境へ設定しないでください。

環境変数を変更した場合、既存deploymentには反映されないため、新しいProduction deploymentを作成します。

## LINE Webhookの設定

Webhook URLは次の形式です。

```text
https://<本番ドメイン>/api/line/webhook
```

LINE Developers ConsoleのMessaging API設定で、次を行います。

1. Webhook URLを設定する
2. Verifyを実行し、成功することを確認する
3. Webhookの利用を有効にする
4. Webhook再送を有効にする
5. Botのグループ参加が許可されていることを確認する
6. LINE公式アカウント側の自動応答を無効にする

### テストグループIDの取得

グループIDの取得中だけ、Vercelの `LINE_ALLOWED_GROUP_ID` を次の値にします。

```text
discover
```

新しいProduction deploymentを作成し、Botをテストグループへ招待して、個人情報を含まないテストメッセージを1件送信します。署名検証済みWebhookから、Vercelログに次の形式でグループIDだけが記録されます。

```text
LINE group ID discovered { groupId: "..." }
```

発見モードではReportの保存もLINE返信も行いません。IDを取得したら、直ちに `LINE_ALLOWED_GROUP_ID` を取得した値へ置き換え、再度Production deploymentを作成します。`discover` のまま運用しないでください。

## 結合テスト

最終的な `LINE_ALLOWED_GROUP_ID` を設定した後、テストグループで次を順番に確認します。

1. `吹田ニュー2セミ3です。` を送信し、登録成功と前回差が返信される
2. 全角数字を含む報告を登録できる
3. `0.1`、負数などの不正値が保存されず、入力例が返信される
4. 一般会話が保存されず、返信もない
5. `シャトル残量` で豊中・吹田の最新値を確認できる
6. 報告メッセージを送信取消し、Web履歴から削除される
7. 正しい報告を再送し、そのReportだけが有効になる
8. 同じWebhookが再送されてもReportが重複しない
9. 未許可グループと1対1トークから登録できない
10. Webフォームで登録・履歴表示・拠点絞り込み・編集ができる

本番運用グループへ切り替える場合は `LINE_ALLOWED_GROUP_ID` を差し替えて再デプロイし、そのグループでも登録・残量確認・送信取消の最小疎通テストを行います。

## ログと障害確認

- Channel secret、access token、DB接続URL、メッセージ本文をログへ出さない
- LINE返信エラーはイベントID・エラー名・安全なエラーコードだけを確認する
- DB処理失敗時はWebhookがHTTP 500を返し、LINEの再送対象になる
- DB保存後のLINE返信失敗ではReportを維持する
- 発見モードのログからグループIDを取得した後は、発見モードを無効化する

問題が起きた場合は、まずVercelの対象deploymentとNeonの接続先がProduction用であること、6個の環境変数が欠けていないことを確認してください。
