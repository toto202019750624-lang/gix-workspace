# GIX Workspace

株式会社GIX（埼玉のAI動画プロダクション、架空）の社内グループウェアです。白基調・インディゴ `#4452d6`・セリフ数字の見た目はプロトタイプのままです。

## ローカル起動

Postgres が必要です。Docker がある場合はこれだけで足ります。

```bash
npm install && npm run dev
```

`npm run dev` は `docker compose up -d`、マイグレーション、初期データの投入（既にあれば何もしない）、開発サーバー起動を順に行います。ブラウザで <http://localhost:3000> を開いてください。

Docker が無い場合は、先に Postgres 16 を用意し `.env` の `DATABASE_URL` と `DIRECT_URL` を合わせてから同じコマンドを実行してください。

```bash
docker compose up -d
```

## デモアカウント

パスワードは全員 **`gix2026`** です。

| 名前 | メール | ロール |
| --- | --- | --- |
| ちま | chima@gix.example | 社長 |
| GIX副社長Bot | vp@gix.example | 副社長 |
| 佐藤 陽菜 | sato@gix.example | 部長（企画部） |
| 田中 大輝 | tanaka@gix.example | 部長（制作部） |
| 吉田 健太 | yoshida@gix.example | 出向者（Codex） |
| 加藤 葵 | kato@gix.example | 一般 |

全21名。設立 2026-11-23、本店 埼玉県、資本金 300万円。

新規のデータベースへ入れる初期データは、会社情報・社員・部署・チャンネルだけです。メッセージやタスクなどのサンプルは入りません。デモ一式が欲しいときは `npx tsx prisma/seed.ts --demo` です。`npm run db:seed` はデータが既にあると何もしません。消して入れ直すのは `npm run db:reset`（クリーン）か `npm run db:reset -- --demo`（デモ）です。本番（`NODE_ENV=production` または Vercel）では `ALLOW_SEED_RESET=true` が無い限り、この全消去はできません。

## できること

- ホーム、メッセンジャー（チャンネル、DM、スレッド、リアクション、メンション、検索、添付）
- カレンダー（重なる予定は横に並べる）、タスク、ドキュメント、ベース、承認（複数承認者）、会議、組織図、勤怠、OKR
- Ctrl/Cmd+K、通知、AIパネル、ダークモード
- 担当タスク、承認待ち、勤怠、通知、DMはログインユーザーごと

## 技術

- Next.js + TypeScript + Prisma + PostgreSQL
- リアルタイムは DB の `RealtimeEvent` を短時間ポーリング。単一プロセスでは SSE も併用します。Vercel ではポーリングのみです
- AI は OpenAI 互換 API。キーが無いときは定型応答
- 添付は `local` / `s3` / Vercel Blob

## テスト

```bash
npm test
```

Postgres が `postgresql://gix:gix@127.0.0.1:5432/gix_test` で起動している必要があります。CI はサービスの Postgres を使います。

## オーナーが用意するもの（こちらでは作りません）

| もの | 必須 | 用途 |
| --- | --- | --- |
| Vercel アカウントとプロジェクト | 本番公開するなら必須 | ホスティング |
| Postgres（Neon、Supabase、Vercel Postgres のいずれか） | 必須 | `DATABASE_URL` と `DIRECT_URL` |
| 長いランダム文字列 | 必須 | `AUTH_SECRET` |
| OpenAI または xAI の API キー | 任意 | 実AI。無ければ定型応答 |
| Vercel Blob ストア、または S3 / R2 バケット | 任意 | 添付を永続化。無ければデプロイ先のディスク（Vercel では消える） |

### 環境変数

必須:

- `DATABASE_URL` — アプリ用。プール接続でも可
- `DIRECT_URL` — `prisma migrate deploy` 用の直接接続。プールしない URL。ローカルでは `DATABASE_URL` と同じでよい
- `AUTH_SECRET` — セッション用の秘密。本番では必ず変更

任意:

- `AI_API_KEY` または `OPENAI_API_KEY` または `XAI_API_KEY`
- `AI_BASE_URL` — 既定 `https://api.openai.com/v1`。xAI だけを置いたときは `https://api.x.ai/v1`
- `AI_MODEL` — 既定 `gpt-4o-mini`（xAI 既定は `grok-3`）
- `STORAGE_DRIVER` — `local`（既定） / `blob` / `s3`
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob
- `S3_ENDPOINT` `S3_BUCKET` `S3_REGION` `S3_ACCESS_KEY_ID` `S3_SECRET_ACCESS_KEY`
- `REALTIME_MODE` — `auto`（既定。Vercel では poll） / `poll` / `sse`
- `UPLOAD_DIR` — local の保存先
- `ALLOW_SEED_RESET` — `true` のときだけ本番で全消去できる。通常は設定しない

## Vercel へのデプロイ

1. 上記の Postgres を作り、接続文字列を2つ控える（プール用と直接接続用）
2. Vercel にこのリポジトリをインポートする
3. 環境変数に少なくとも `DATABASE_URL`、`DIRECT_URL`、`AUTH_SECRET` を Production と Preview の両方へ入れる
4. 添付を残すなら Blob をリンクして `BLOB_READ_WRITE_TOKEN` を入れ、`STORAGE_DRIVER=blob` にする。または S3 互換の4変数と `STORAGE_DRIVER=s3`
5. AI社員を無人で出勤させるなら `CRON_SECRET` を入れる。文章を書かせる Grok Bot 用に `AGENT_API_TOKEN` も入れる。チャット欄のAIは任意で、`OPENAI_API_KEY` か `XAI_API_KEY` が無いときは定型応答のままです
6. デプロイする。本番（`VERCEL_ENV=production`）のビルドだけがマイグレーションと初期データ投入を行い、そのあと `next build` します。プレビューは `prisma generate` と `next build` だけです。データが既にある本番デプロイではシードは何もしません。手元から本番の Postgres に接続する必要はありません。AI社員は最初からオンです

Vercel 上のリアルタイムは約2.5秒のポーリングです。SSE は使いません。

## AI社員とエージェント API

AI社員はデプロイ直後からオンです。有料の LLM キーは不要です。

- Vercel Hobby の Cron は1日1回です。`vercel.json` は平日 09:00 JST（UTC 0:00）に `/api/cron/ai-employees` を呼び、その時刻の出勤だけを付けます。退勤は、誰かがアプリを開いたとき（最短 `AI_TICK_MINUTES`、既定20分）か、外部の無料 Cron で同じ URL を叩くと進みます
- 昼のチャット、タスク、承認、議事録は、外部の Grok Bot が下の API に文章を渡して行います。組み込み Cron は出勤・退勤しかしません
- 画面の「AI社員」で今日の記録を見られます。オン／オフは社長だけ。手動の「AI社員を動かす」は社長と副社長です
- 投稿・申請・文書には `AI` バッジが付きます

Hobby の1日1回では一日のリズムが足りないので、[cron-job.org](https://cron-job.org) などの無料 Cron で、平日の 9–19時 JST に20分おきへ次を設定できます。

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/ai-employees
```

状況の取得:

```bash
curl -s -H "Authorization: Bearer $AGENT_API_TOKEN" \
  https://<your-app>.vercel.app/api/agent/context
```

動作の記録（社員になりきった文章は Bot 側で書く）:

```bash
curl -s -X POST -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  https://<your-app>.vercel.app/api/agent/actions \
  -d '{"actions":[
    {"employeeId":"sato","type":"post","channelId":"plan","text":"おはようございます。今日は年末特番の構成を進めます。"},
    {"employeeId":"sato","type":"task","title":"朝会のアジェンダ","assigneeId":"takahashi","priority":"高"},
    {"employeeId":"sato","type":"task","taskId":"<task-id>","status":"doing","comment":"構成案を先に固めます。"},
    {"employeeId":"sato","type":"clock","action":"in"}
  ]}'
```

`type` は `post`（`parentId` でスレッド返信）、`react`、`task`（`title` で新規、`taskId` で更新）、`approval`、`decide`、`doc`、`minutes`、`clock` です。`employeeId` に社長（`chima`）は指定できません。

本番にデモデータが残っているときは、次で業務データだけを消します。会社・社員・部署・チャンネルは残ります。同じリクエストを重ねても結果は同じです。画面では社長の「業務データを初期化」からも実行できます。

```bash
curl -s -X POST -H "Authorization: Bearer $AGENT_API_TOKEN" \
  https://<your-app>.vercel.app/api/agent/reset-business-data
```

## 既知の制限

- 会議の「参加する」は画面デモで、通話はしません
- AIキーが無い、または接続に失敗したときは定型の社内データ応答に戻ります
- ユーザーの自己登録とパスワード再設定メールはありません
- Vercel のサーバーレスではローカルディスクの添付は残りません。Blob か S3 を設定してください
