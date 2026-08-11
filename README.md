# シャトル管理システム

バドミントン部のシャトル残量、購入配分、拠点間移動を、WebとLINEグループから登録・確認するNext.jsアプリです。

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

## LINEでの購入・移動管理

購入時は、箱数と豊中・吹田への筒数配分を1件のメッセージで送信します。1箱は10筒で、配分の合計が購入した筒数と一致する必要があります。

```text
シャトル1箱購入しました。豊中6筒、吹田4筒です。
シャトル1箱購入しました。豊中10筒です。
シャトル2箱購入しました。豊中10筒、吹田10筒です。
シャトル1箱購入しました
シャトル1箱購入しました豊中6吹田4
```

拠点配分を省略した場合は、購入した全筒を豊中へ配分します。配分の `筒`、拠点間の区切り、文末の `。` は省略できます。購入した筒は、配分先のニュー残量へ加算されます。

拠点間移動は次の形式で送信します。移動量は0より大きい0.5筒刻みです。

```text
シャトルを豊中から吹田へ2筒移動しました。
吹田に2筒移動しました
豊中から吹田へ2移動しました
```

移動先だけを書いた場合は、もう一方の拠点を移動元として補完します。先頭の `シャトル`、数量後の `筒`、文末の `。` は省略できます。移動はニュー残量を拠点間で付け替え、移動元の残量が不足する場合は登録しません。

通常報告・購入・移動が登録されると、Botは登録内容に続けて処理後の豊中・吹田の現在残量を返信します。`シャトル残量` または `残量` だけを送った場合と、Webホームも同じ現在残量を表示します。

現在残量は、拠点ごとの最新の通常報告を基準に、それ以降の購入と移動を反映して算出します。購入・移動はニューだけを変更し、通常報告を行うと、その拠点のニュー・セミが新しい基準になります。

登録した報告・購入・移動は `/history` で種類を切り替えて確認できます。それぞれ全体・豊中・吹田で絞り込めます。購入・移動履歴には、その操作直後の豊中・吹田のニュー・セミ残量も表示されます。購入・移動メッセージを送信取消した場合は、対応する記録も削除されます。

DB取得を伴うページ遷移や履歴フィルターの切り替え中は `読み込み中...`、Webフォームの登録・更新中は `登録中...`・`更新中...` と表示されます。処理中は入力と二重送信を無効化し、次画面が表示されるまで処理中表示を維持します。

送信取消期限後にLINE報告を削除する場合は、対象の報告メッセージへLINEの「リプライ」で次を送信します。

```text
シャトル報告削除
報告削除
削除
```

許可グループ内で引用したLINE報告だけがDBから削除されます。LINE上の元メッセージ自体は削除されません。WebからのReport削除は認証を追加するフェーズ11まで行いません。

## 結合テスト

最終的な `LINE_ALLOWED_GROUP_ID` を設定した後、テストグループで次を順番に確認します。

1. `吹田ニュー2セミ3です。` を送信し、登録成功と前回差が返信される
2. 全角数字を含む報告を登録できる
3. `0.1`、負数などの不正値が保存されず、入力例が返信される
4. 一般会話が保存されず、返信もない
5. `シャトル残量` または `残量` で豊中・吹田の最新値を確認できる
6. 報告メッセージを送信取消し、Web履歴から削除される
7. 正しい報告を再送し、そのReportだけが有効になる
8. 同じWebhookが再送されてもReportが重複しない
9. 未許可グループと1対1トークから登録できない
10. 送信取消期限後の報告へ引用返信し、`シャトル報告削除`、`報告削除`、`削除` でDB上のReportを削除できる
11. 購入メッセージで豊中・吹田への配分を登録し、`/history?type=purchase` で確認できる
12. 不正な配分合計は保存されず、入力例が返信される
13. 完全形または移動先だけの短縮形で拠点間移動を登録し、`/history?type=transfer` で確認できる
14. 移動元のニュー残量を超える移動が登録されない
15. 通常報告・購入・移動の各成功返信に、処理後の両拠点の現在残量が表示される
16. 購入・移動後にWebホームを再読み込みし、Bot返信と同じ現在残量が表示される
17. 購入・移動メッセージの送信取消で対応する記録が削除される
18. `/history` で報告・購入・移動を切り替え、それぞれ全体・豊中・吹田で絞り込める
19. 購入・移動履歴に、各操作直後の両拠点のニュー・セミ残量が表示される
20. Webフォームで登録・報告履歴表示・拠点絞り込み・編集ができる

本番運用グループへ切り替える場合は `LINE_ALLOWED_GROUP_ID` を差し替えて再デプロイし、そのグループでも登録・残量確認・送信取消の最小疎通テストを行います。

## ログと障害確認

- Channel secret、access token、DB接続URL、メッセージ本文をログへ出さない
- LINE返信エラーはイベントID・エラー名・安全なエラーコードだけを確認する
- DB処理失敗時はWebhookがHTTP 500を返し、LINEの再送対象になる
- DB保存後のLINE返信失敗ではReportを維持する
- 発見モードのログからグループIDを取得した後は、発見モードを無効化する

問題が起きた場合は、まずVercelの対象deploymentとNeonの接続先がProduction用であること、6個の環境変数が欠けていないことを確認してください。
