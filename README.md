# GIX Workspace

株式会社GIX（埼玉のAI動画プロダクション、架空）の社内グループウェアです。承認済みプロトタイプの白基調・インディゴ `#4452d6`・セリフ数字の見た目を保ったまま、ログイン・共有データベース・リアルタイム更新に対応しています。

## 起動（この1行）

```bash
npm install && npm run dev
```

`npm run dev` がデータベースの作成、初期データの投入、開発サーバーの起動まで行います。ブラウザで <http://localhost:3000> を開いてください。

本番と同じビルドで動かす場合:

```bash
npm run build && npm start
```

## デモアカウント

パスワードは全員 **`gix2026`** です。ログイン画面のボタンからも入れます。

| 名前 | メール | ロール |
| --- | --- | --- |
| ちま | chima@gix.example | 社長 |
| GIX副社長Bot | vp@gix.example | 副社長 |
| 佐藤 陽菜 | sato@gix.example | 部長（企画部） |
| 田中 大輝 | tanaka@gix.example | 部長（制作部） |
| 吉田 健太 | yoshida@gix.example | 出向者（Codex） |
| 加藤 葵 | kato@gix.example | 一般 |

全21名（経営2名 + 社員16名 + Codex出向3名）。部署は企画部3、制作部6、Codex出向3、SNSマーケティング部3、AI・テック部2、管理部2です。

会社情報: 設立 2026-11-23、本店 埼玉県、資本金 300万円。

## できること

- ホーム（今日の予定、マイタスク、自分の承認待ち、制作KPI、お知らせ、勤怠打刻）
- メッセンジャー（部署チャンネル、DM、スレッド、リアクション、メンション、検索、ファイル添付）。副社長BotはDMに返答します
- カレンダー（月 / 週 / 日、参加者つき予定）
- タスク（カンバンのドラッグ＆ドロップ、リスト、ガント、サブタスク）。「自分」で担当分だけに絞れます
- ドキュメント（Markdown の編集 / 分割 / プレビュー、フォルダ、ファイル添付）
- ベース（動画パイプラインのフィルタ、ソート、ステータス別グループ、CSV）
- 承認（経費 / 稟議 / 休暇）。複数承認者を順に回し、今の承認者だけが承認・却下できます
- 会議と議事録（テンプレート、AI下書き、デモ通話画面）
- メンバーと組織図
- 勤怠（自分の打刻と履歴。社長・副社長・管理部長は他メンバーを参照可能）
- OKR
- Ctrl / ⌘ + K のコマンドパレット、通知、AIパネル（Ctrl / ⌘ + J）、ダークモード

データはサーバーのデータベースに保存され、ログインした全員で共有されます。タスクのバッジと「自分」フィルタ、承認の「承認待ち」「自分の申請」、勤怠、通知、DMはユーザーごとに分かれます。

## 技術

- Next.js（App Router）+ TypeScript
- Prisma + SQLite（ローカル既定）
- セッションは HttpOnly Cookie。パスワードは scrypt
- メッセンジャーと通知は Server-Sent Events。届かない環境では約8秒のポーリングにフォールバックします
- 添付ファイルは `UPLOAD_DIR`（既定 `./data/uploads`）

見た目は承認済みプロトタイプのスタイルシートを移植しています。ロゴ以外にグラデーションは使いません。

## テスト

```bash
npm test
```

日付計算、承認ルート、メンション、Markdownのエスケープ、シードの人数、ログインから承認・メッセージ・添付までのAPIを検証します。

## 環境変数

`.env.example` を参照してください。`npm run dev` は `.env` が無いときこれをコピーします。

| 変数 | 説明 |
| --- | --- |
| `DATABASE_URL` | 既定 `file:./dev.db`（prisma ディレクトリ基準） |
| `AUTH_SECRET` | 本番では必ず変更 |
| `UPLOAD_DIR` | 添付の保存先 |
| `PORT` | 既定 3000 |

## デプロイ

長時間プロセスで動かすのが確実です（Railway、Fly.io、Render、VPS、同梱の Dockerfile）。SSEとローカル添付がそのまま動きます。

```bash
docker build -t gix-workspace .
docker run -p 3000:3000 -v gix-data:/app/prisma -v gix-uploads:/app/data/uploads gix-workspace
```

SQLiteファイルをボリュームに残してください。コンテナを作り直すたびに初期データへ戻したくない場合は、`prisma/dev.db` を永続化します。

### Vercel + ホストされた Postgres

サーバーレスでは SQLite ファイルとローカル添付は残りません。次の手順で Postgres に切り替えます。

1. Neon や Supabase で Postgres を作り、接続文字列を `DATABASE_URL` に設定する
2. `npm run db:use-postgres` で `prisma/schema.prisma` の provider を `postgresql` にする
3. `npx prisma db push && npx tsx prisma/seed.ts`
4. Vercel に `DATABASE_URL` と `AUTH_SECRET` を設定してデプロイする

この構成ではリアルタイムはポーリングになります。添付を残すには S3 や Vercel Blob など、オブジェクトストレージへの置き換えが必要です（未実装）。

## 既知の差分・制限

- AIアシスタントは社内データに基づく定型応答です。外部の大規模言語モデルには接続していません
- 会議の「参加する」は通話UIのデモで、WebRTC通信は行いません
- リアルタイム配信は単一Nodeプロセスのメモリです。複数インスタンスではポーリングが更新を担います
- ユーザーの自己登録、パスワード再設定メール、監査ログはありません
- 社長の「データ初期化」は共有データをシード状態に戻します
