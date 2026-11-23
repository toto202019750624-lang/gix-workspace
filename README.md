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

`npm run db:seed` はデータが既にあると何もしません。消して入れ直すのは `npm run db:reset` です。本番（`NODE_ENV=production` または Vercel）では `ALLOW_SEED_RESET=true` が無い限りリセットできません。

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
5. 実AIを使うなら `OPENAI_API_KEY` か `XAI_API_KEY`（と必要なら `AI_BASE_URL` / `AI_MODEL`）
6. デプロイする。`vercel.json` のビルドは `prisma migrate deploy` のあと `next build` です。初回はデータベースが空でもマイグレーションだけが走ります
7. 初回だけ、手元から初期データを入れる（既存ユーザーがいると何もしません）

```bash
DATABASE_URL="postgres://..." DIRECT_URL="postgres://..." npx tsx prisma/seed.ts
```

Vercel 上のリアルタイムは約2.5秒のポーリングです。SSE は使いません。

## 既知の制限

- 会議の「参加する」は画面デモで、通話はしません
- AIキーが無い、または接続に失敗したときは定型の社内データ応答に戻ります
- ユーザーの自己登録とパスワード再設定メールはありません
- Vercel のサーバーレスではローカルディスクの添付は残りません。Blob か S3 を設定してください
