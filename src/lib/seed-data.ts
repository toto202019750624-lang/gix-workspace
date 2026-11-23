import { addDaysStr, minutesToHM, utcDow } from './dates';

export const SEED_VERSION = 1;

export type SeedUser = {
  id: string;
  name: string;
  deptId: string;
  role: 'ceo' | 'vp' | 'manager' | 'member' | 'seconded';
  title: string;
  skills: string[];
  bio: string;
  status?: 'online' | 'away' | 'busy' | 'offline';
  grad?: string;
  isBot?: boolean;
};

const U = (
  id: string,
  name: string,
  deptId: string,
  role: SeedUser['role'],
  title: string,
  skills: string[],
  bio: string,
  extra: Partial<SeedUser> = {},
): SeedUser => ({ id, name, deptId, role, title, skills, bio, ...extra });

export const SEED_USERS: SeedUser[] = [
  U('chima', 'ちま', 'exec', 'ceo', '代表取締役社長', ['経営', '事業戦略', '動画プロデュース'], 'GIX発起人。「AI×クリエイティブで、伝わるを最速に。」', { grad: '#26272e' }),
  U('vp', 'GIX副社長Bot', 'exec', 'vp', '執行役員兼副社長', ['経営企画', 'AI活用', 'プロジェクト管理'], 'GIXのAI副社長。全部署の進行管理とAI導入をリード。', { grad: '#4452d6', isBot: true }),
  U('sato', '佐藤 陽菜', 'plan', 'manager', '企画部 部長', ['企画立案', '台本', 'ブランディング'], '元テレビ局ディレクター。バズる企画の設計担当。'),
  U('takahashi', '高橋 蓮', 'plan', 'member', 'プランナー', ['ショート企画', 'トレンド分析'], 'TikTok企画を年間300本手がける。'),
  U('ito', '伊藤 美咲', 'plan', 'member', '構成作家', ['台本', 'ナレーション原稿'], 'ドキュメンタリー系の構成が得意。', { status: 'away' }),
  U('tanaka', '田中 大輝', 'prod', 'manager', '制作部 部長', ['撮影', 'ディレクション', 'カラーグレーディング'], '映像制作15年。GIX制作ラインの責任者。'),
  U('watanabe', '渡辺 結衣', 'prod', 'member', 'ディレクター', ['撮影', 'インタビュー'], '人物取材とVlog撮影が得意。'),
  U('yamamoto', '山本 翔', 'prod', 'member', 'エディター', ['Premiere', 'After Effects'], 'テンポ感のあるショート編集職人。'),
  U('nakamura', '中村 さくら', 'prod', 'member', 'モーショングラフィックス', ['AE', 'Blender'], 'テロップとモーションのデザイン担当。', { status: 'busy' }),
  U('kobayashi', '小林 拓海', 'prod', 'member', 'カメラマン', ['撮影', '照明', 'ドローン'], 'ドローン資格保有。'),
  U('kato', '加藤 葵', 'prod', 'member', 'エディター', ['DaVinci', 'サムネイル'], 'サムネイルのCTR改善が得意。', { status: 'offline' }),
  U('yoshida', '吉田 健太', 'codex', 'seconded', 'シニアエディター（Codex出向）', ['長尺編集', 'MA'], '制作会社Codexより出向。長尺案件のリード。'),
  U('yamada', '山田 莉子', 'codex', 'seconded', 'ディレクター（Codex出向）', ['企業VP', '進行管理'], '制作会社Codexより出向。企業案件の進行担当。'),
  U('sasaki', '佐々木 悠真', 'codex', 'seconded', 'CGアーティスト（Codex出向）', ['3DCG', 'VFX'], '制作会社Codexより出向。CG/VFX担当。', { status: 'away' }),
  U('matsumoto', '松本 彩花', 'sns', 'manager', 'SNSマーケティング部 部長', ['SNS戦略', '広告運用'], 'フォロワー100万超アカウントの運用経験。'),
  U('inoue', '井上 颯', 'sns', 'member', 'SNS運用', ['TikTok', '分析'], 'TikTok運用と数値分析の担当。'),
  U('kimura', '木村 七海', 'sns', 'member', 'インフルエンサーマーケ', ['キャスティング', 'PR'], 'クリエイターとのタイアップ窓口。'),
  U('hayashi', '林 隼人', 'ai', 'manager', 'AI・テック部 部長', ['生成AI', 'Python', 'ワークフロー自動化'], 'AI編集パイプラインの開発責任者。'),
  U('shimizu', '清水 千尋', 'ai', 'member', 'AIエンジニア', ['音声合成', 'LLM', 'フロントエンド'], '自動字幕・AIナレーション担当。'),
  U('saito', '斎藤 真由美', 'admin', 'manager', '管理部 部長', ['経理', '労務', '法務'], 'バックオフィス全般を統括。'),
  U('mori', '森 誠', 'admin', 'member', '総務・人事', ['採用', '総務'], '採用と社内イベント担当。', { status: 'offline' }),
];

export const DEPARTMENTS = [
  { id: 'exec', name: '経営', color: '#8a86b8', sort: 0 },
  { id: 'plan', name: '企画部', color: '#c48a9c', sort: 1 },
  { id: 'prod', name: '制作部', color: '#4a90a4', sort: 2 },
  { id: 'codex', name: '制作部（Codex出向）', color: '#6b93b8', sort: 3 },
  { id: 'sns', name: 'SNSマーケティング部', color: '#c39a3e', sort: 4 },
  { id: 'ai', name: 'AI・テック部', color: '#5e9c7e', sort: 5 },
  { id: 'admin', name: '管理部', color: '#c27a52', sort: 6 },
];

type ReactMap = Record<string, string[]>;
type Msg = {
  id: string;
  channelId: string;
  userId: string;
  text: string;
  minutesAgo: number;
  reactions?: ReactMap;
  replies?: { id: string; userId: string; text: string; minutesAgo: number; reactions?: ReactMap }[];
};

const ALL = SEED_USERS.map((u) => u.id);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function buildSeed(today: string) {
  const T = (n: number) => addDaysStr(today, n);
  const channels = [
    { id: 'general', name: '全社', kind: 'channel', desc: '全社アナウンス・雑談', sort: 0, memberIds: ALL },
    { id: 'plan', name: '企画部', kind: 'channel', desc: '企画会議・ネタ出し', sort: 1, memberIds: ALL },
    { id: 'prod', name: '制作部', kind: 'channel', desc: '撮影・編集の進行', sort: 2, memberIds: ALL },
    { id: 'sns', name: 'SNSマーケ', kind: 'channel', desc: '運用・数値共有', sort: 3, memberIds: ALL },
    { id: 'ai', name: 'AI・テック', kind: 'channel', desc: 'AIツール開発', sort: 4, memberIds: ALL },
    { id: 'admin', name: '管理部', kind: 'channel', desc: '経理・労務・総務', sort: 5, memberIds: ALL },
    { id: 'random', name: '雑談', kind: 'channel', desc: 'なんでも', sort: 6, memberIds: ALL },
    { id: 'dm-vp', name: 'dm:chima:vp', kind: 'dm', desc: '', sort: 10, memberIds: ['chima', 'vp'] },
    { id: 'dm-sato', name: 'dm:chima:sato', kind: 'dm', desc: '', sort: 11, memberIds: ['chima', 'sato'] },
    { id: 'dm-tanaka', name: 'dm:chima:tanaka', kind: 'dm', desc: '', sort: 12, memberIds: ['chima', 'tanaka'] },
    { id: 'dm-matsumoto', name: 'dm:chima:matsumoto', kind: 'dm', desc: '', sort: 13, memberIds: ['chima', 'matsumoto'] },
  ];

  const messages: Msg[] = [
    { id: 'm-general-1', channelId: 'general', userId: 'chima', minutesAgo: 300, text: 'みなさん、株式会社GIX本日設立です！AI×動画でいちばん速くて面白い会社にしましょう🔥', reactions: { '🎉': ['vp', 'sato', 'tanaka', 'matsumoto', 'hayashi', 'saito'], '🔥': ['yamamoto', 'inoue'] } },
    { id: 'm-general-2', channelId: 'general', userId: 'vp', minutesAgo: 280, text: '社長、おめでとうございます。社内ミッション第1号「GIX Workspace」を本日リリースしました。チャット・タスク・承認・勤怠まで全部ここで完結します。', reactions: { '🙌': ['chima', 'hayashi', 'shimizu'] }, replies: [
      { id: 'm-general-2r1', userId: 'hayashi', text: 'AI・テック部でもフィードバック集めます！', minutesAgo: 270 },
      { id: 'm-general-2r2', userId: 'chima', text: 'ありがとう、どんどん改善していこう', minutesAgo: 265 },
    ] },
    { id: 'm-general-3', channelId: 'general', userId: 'saito', minutesAgo: 200, text: '@全員 勤怠は「勤怠」タブから打刻をお願いします。月末締めです。' },
    { id: 'm-general-4', channelId: 'general', userId: 'yoshida', minutesAgo: 120, text: 'Codexから出向の吉田です。長尺編集担当です、よろしくお願いします！', reactions: { '👋': ['tanaka', 'watanabe', 'kato'] } },
    { id: 'm-general-5', channelId: 'general', userId: 'mori', minutesAgo: 40, text: '12/1のキックオフ、ランチはお弁当手配します🍱 アレルギーある方DMください' },
    { id: 'm-plan-1', channelId: 'plan', userId: 'sato', minutesAgo: 500, text: '来週の企画会議、テーマは「AIで作る60秒解説」です。各自3案持ち寄りで！' },
    { id: 'm-plan-2', channelId: 'plan', userId: 'takahashi', minutesAgo: 420, text: 'TikTokで「職業あるある×AI」系が伸びてます。参考リンクまとめました', reactions: { '👀': ['sato', 'ito'] } },
    { id: 'm-plan-3', channelId: 'plan', userId: 'ito', minutesAgo: 200, text: '台本テンプレをドキュメントに上げました📄' },
    { id: 'm-plan-4', channelId: 'plan', userId: 'chima', minutesAgo: 60, text: '@佐藤 陽菜 年末特番の企画、方向性いいね。予算感だけ詰めよう' },
    { id: 'm-prod-1', channelId: 'prod', userId: 'tanaka', minutesAgo: 600, text: '今週の撮影：水曜スタジオ、金曜ロケ（川越）。機材リストはベースに入れてます' },
    { id: 'm-prod-2', channelId: 'prod', userId: 'kobayashi', minutesAgo: 400, text: 'ドローン許可、川越の分は申請済みです✈️', reactions: { '👍': ['tanaka'] } },
    { id: 'm-prod-3', channelId: 'prod', userId: 'yamamoto', minutesAgo: 90, text: '「AIツール10選」編集v2上がりました。確認お願いします🙏', replies: [
      { id: 'm-prod-3r1', userId: 'tanaka', text: 'テロップのサイズだけ少し大きく', minutesAgo: 80 },
      { id: 'm-prod-3r2', userId: 'yamamoto', text: '了解です、v3で直します', minutesAgo: 70 },
    ] },
    { id: 'm-prod-4', channelId: 'prod', userId: 'sasaki', minutesAgo: 30, text: 'CGオープニング案3パターン作りました', reactions: { '😍': ['nakamura', 'yamamoto', 'chima'] } },
    { id: 'm-sns-1', channelId: 'sns', userId: 'matsumoto', minutesAgo: 300, text: '先週のTikTok総再生 182万回、前週比+34%です📈', reactions: { '🚀': ['chima', 'vp', 'inoue'] } },
    { id: 'm-sns-2', channelId: 'sns', userId: 'inoue', minutesAgo: 200, text: '保存率が高いのは「ハウツー系」。来週は3本追加でいきます' },
    { id: 'm-sns-3', channelId: 'sns', userId: 'kimura', minutesAgo: 50, text: 'インフルエンサー3名とタイアップ合意しました' },
    { id: 'm-ai-1', channelId: 'ai', userId: 'hayashi', minutesAgo: 400, text: '自動字幕パイプライン、精度98.2%まで来ました' },
    { id: 'm-ai-2', channelId: 'ai', userId: 'shimizu', minutesAgo: 100, text: 'AIナレーションの新ボイス2種類追加。サンプルはドキュメントへ' },
    { id: 'm-admin-1', channelId: 'admin', userId: 'saito', minutesAgo: 300, text: '11月分の経費精算は12/3締めです' },
    { id: 'm-admin-2', channelId: 'admin', userId: 'mori', minutesAgo: 100, text: '新オフィスの座席表を共有しました' },
    { id: 'm-random-1', channelId: 'random', userId: 'watanabe', minutesAgo: 200, text: '大宮の新しいカフェ、撮影にも使えそうでした☕', reactions: { '☕': ['kato', 'nakamura'] } },
    { id: 'm-dm-vp-1', channelId: 'dm-vp', userId: 'vp', minutesAgo: 30, text: '社長、今日のサマリーです：未承認3件、期限が近いタスク4件、TikTok再生は前週比+34%です。' },
    { id: 'm-dm-sato-1', channelId: 'dm-sato', userId: 'sato', minutesAgo: 90, text: '年末特番の企画書、ドキュメントに置きました！' },
    { id: 'm-dm-tanaka-1', channelId: 'dm-tanaka', userId: 'tanaka', minutesAgo: 150, text: '撮影機材の追加購入、稟議あげました' },
    { id: 'm-dm-matsumoto-1', channelId: 'dm-matsumoto', userId: 'matsumoto', minutesAgo: 240, text: '来月の広告予算について相談させてください' },
  ];

  // minutesAgo of lastRead: messages newer than this (and not self) count as unread.
  // chima: plan 2, prod 3, sns 1, dm-sato 1 → nav badge 7
  const readOverrides = [
    { userId: 'chima', channelId: 'plan', minutesAgo: 450 },
    { userId: 'chima', channelId: 'prod', minutesAgo: 500 },
    { userId: 'chima', channelId: 'sns', minutesAgo: 100 },
    { userId: 'chima', channelId: 'dm-sato', minutesAgo: 100000 },
    { userId: 'sato', channelId: 'general', minutesAgo: 50 },
    { userId: 'tanaka', channelId: 'general', minutesAgo: 50 },
  ];

  const events = [
    { id: 'ev-keiei', title: '経営定例', date: T(0), start: '09:30', end: '10:30', color: '#6a6fc4', attendees: ['chima', 'vp', 'sato', 'tanaka', 'matsumoto', 'hayashi', 'saito'], place: '大会議室', desc: '週次の経営状況共有' },
    { id: 'ev-edit', title: '「AIツール10選」編集チェック', date: T(0), start: '13:00', end: '14:00', color: '#4a90a4', attendees: ['chima', 'tanaka', 'yamamoto'], place: '編集室A', desc: '' },
    { id: 'ev-client', title: 'クライアントMTG（飲料メーカー）', date: T(0), start: '15:30', end: '16:30', color: '#c2697f', attendees: ['chima', 'matsumoto', 'yamada'], place: 'オンライン', desc: 'TikTokタイアップ提案' },
    { id: 'ev-plan', title: '企画会議', date: T(1), start: '10:00', end: '11:30', color: '#c48a9c', attendees: ['sato', 'takahashi', 'ito', 'chima'], place: '会議室B', desc: '' },
    { id: 'ev-studio', title: 'スタジオ撮影', date: T(2), start: '10:00', end: '17:00', color: '#4a90a4', attendees: ['tanaka', 'watanabe', 'kobayashi', 'nakamura'], place: 'さいたまスタジオ', desc: '' },
    { id: 'ev-ai', title: 'AI字幕デモ', date: T(2), start: '16:00', end: '17:00', color: '#5e9c7e', attendees: ['hayashi', 'shimizu', 'chima', 'vp'], place: 'オンライン', desc: '' },
    { id: 'ev-kawagoe', title: '川越ロケ', date: T(4), start: '08:00', end: '15:00', color: '#4a90a4', attendees: ['tanaka', 'kobayashi', 'watanabe'], place: '川越', desc: 'ドローン撮影あり' },
    { id: 'ev-sns', title: 'SNS月次レビュー', date: T(3), start: '14:00', end: '15:00', color: '#c39a3e', attendees: ['matsumoto', 'inoue', 'kimura', 'chima'], place: '会議室B', desc: '' },
    { id: 'ev-kickoff', title: '全社キックオフ', date: T(8), start: '10:00', end: '12:00', color: '#6a6fc4', attendees: ALL, place: '大会議室', desc: '' },
    { id: 'ev-expense', title: '経費締め', date: T(10), start: '17:00', end: '18:00', color: '#c27a52', attendees: ['saito', 'mori'], place: '', desc: '' },
    { id: 'ev-1on1', title: '1on1 佐藤', date: T(-2), start: '11:00', end: '11:30', color: '#8a86b8', attendees: ['chima', 'sato'], place: '', desc: '' },
    { id: 'ev-party', title: '忘年会', date: T(25), start: '19:00', end: '21:00', color: '#c2697f', attendees: ALL, place: '大宮', desc: '' },
  ];

  const sub = (title: string, done: boolean) => ({ title, done });
  const tasks = [
    { id: 'task-workspace', title: 'GIX Workspace 全社展開', status: 'doing', assigneeId: 'vp', creatorId: 'chima', due: T(2), start: T(-3), priority: '高', tag: '社内', sort: 0, subtasks: [sub('アカウント発行', true), sub('操作説明会', false), sub('フィードバック収集', false)] },
    { id: 'task-nenmatsu', title: '年末特番 企画書レビュー', status: 'todo', assigneeId: 'chima', creatorId: 'sato', due: T(1), start: T(0), priority: '高', tag: '企画', sort: 1, subtasks: [sub('予算確認', false), sub('出演者案', false)] },
    { id: 'task-drink', title: '飲料メーカー提案資料', status: 'doing', assigneeId: 'matsumoto', creatorId: 'matsumoto', due: T(0), start: T(-4), priority: '高', tag: '営業', sort: 2, subtasks: [sub('事例ページ', true), sub('見積', false)] },
    { id: 'task-edit', title: '「AIツール10選」v3 編集', status: 'review', assigneeId: 'yamamoto', creatorId: 'tanaka', due: T(1), start: T(-5), priority: '中', tag: '制作', sort: 3, subtasks: [sub('テロップ修正', true), sub('BGM差し替え', true), sub('書き出し', false)] },
    { id: 'task-cg', title: 'CGオープニング制作', status: 'doing', assigneeId: 'sasaki', creatorId: 'tanaka', due: T(5), start: T(-2), priority: '中', tag: '制作', sort: 4, subtasks: [] as { title: string; done: boolean }[] },
    { id: 'task-kawagoe', title: '川越ロケ 香盤表作成', status: 'todo', assigneeId: 'watanabe', creatorId: 'tanaka', due: T(3), start: T(1), priority: '中', tag: '制作', sort: 5, subtasks: [] },
    { id: 'task-tiktok', title: 'TikTok 週次レポート', status: 'done', assigneeId: 'inoue', creatorId: 'matsumoto', due: T(-1), start: T(-3), priority: '低', tag: 'SNS', sort: 6, subtasks: [sub('数値集計', true), sub('考察', true)] },
    { id: 'task-subs', title: '自動字幕 v2 リリース', status: 'review', assigneeId: 'hayashi', creatorId: 'hayashi', due: T(4), start: T(-6), priority: '高', tag: 'AI', sort: 7, subtasks: [sub('精度検証', true), sub('UI', false)] },
    { id: 'task-voice', title: 'AIナレーション新ボイス評価', status: 'todo', assigneeId: 'shimizu', creatorId: 'hayashi', due: T(6), start: T(2), priority: '低', tag: 'AI', sort: 8, subtasks: [] },
    { id: 'task-contract', title: '出向契約書の確認', status: 'done', assigneeId: 'saito', creatorId: 'saito', due: T(-2), start: T(-6), priority: '中', tag: '管理', sort: 9, subtasks: [] },
    { id: 'task-kickoff', title: '12月キックオフ準備', status: 'todo', assigneeId: 'mori', creatorId: 'mori', due: T(7), start: T(2), priority: '中', tag: '総務', sort: 10, subtasks: [sub('会場', true), sub('お弁当', false), sub('アジェンダ', false)] },
    { id: 'task-influencer', title: 'インフルエンサー契約書', status: 'doing', assigneeId: 'kimura', creatorId: 'matsumoto', due: T(3), start: T(-1), priority: '中', tag: 'SNS', sort: 11, subtasks: [] },
    { id: 'task-thumb', title: 'サムネイルA/Bテスト', status: 'todo', assigneeId: 'kato', creatorId: 'tanaka', due: T(4), start: T(1), priority: '低', tag: '制作', sort: 12, subtasks: [] },
  ];

  const folders = [
    { id: 'f1', name: '全社・ルール', open: true, sort: 0 },
    { id: 'f2', name: '企画', open: true, sort: 1 },
    { id: 'f3', name: '制作マニュアル', open: true, sort: 2 },
    { id: 'f4', name: 'AI・テック', open: false, sort: 3 },
  ];

  const docs = [
    { id: 'd1', folderId: 'f1', title: 'GIX ミッション・バリュー', updatedOn: T(0), updatedBy: 'chima', body: [
      '# GIX ミッション・バリュー',
      '',
      '> **AI×クリエイティブで、「伝わる」を最速に。**',
      '',
      '## バリュー',
      '1. **Speed is Kindness** — 速さは相手への優しさ',
      '2. **Data × Heart** — 数字と感性の両方で判断する',
      '3. **AI First** — まずAIで試し、人が磨く',
      '4. **One Team** — 出向メンバーも含めてワンチーム',
      '',
      '## 会社情報',
      '| 項目 | 内容 |',
      '|---|---|',
      '| 商号 | 株式会社GIX |',
      '| 設立 | 2026年11月23日（創業記念日） |',
      '| 本店 | 埼玉県 |',
      '| 資本金 | 300万円 |',
      '',
    ].join('\n') },
    { id: 'd2', folderId: 'f1', title: 'GIX Workspace 使い方', updatedOn: T(0), updatedBy: 'vp', body: [
      '# GIX Workspace 使い方',
      '',
      '- **Ctrl/⌘ + K** でどこからでも検索',
      '- 右上の ✦ から **AIアシスタント** を呼び出せます',
      '- タスクはカンバンで**ドラッグ&ドロップ**',
      '- ベースで動画制作パイプラインを管理',
      '- メッセージとドキュメントにファイルを添付できます',
      '- 承認は複数の承認者を順番に回せます',
      '',
      'データはサーバーに保存され、ログインした全員で共有されます。',
      '',
    ].join('\n') },
    { id: 'd3', folderId: 'f2', title: '年末特番 企画書（ドラフト）', updatedOn: T(-1), updatedBy: 'sato', body: [
      '# 年末特番「AIが選ぶ2026年バズ動画大賞」',
      '',
      '## 概要',
      '- 尺：YouTube 25分 + TikTok切り抜き 10本',
      '- 公開：12/28',
      '',
      '## 構成',
      '1. オープニング（CG）',
      '2. 部門別ランキング',
      '3. 大賞発表',
      '',
      '## 予算',
      '- 制作費：**80万円**（稟議中）',
      '',
    ].join('\n') },
    { id: 'd4', folderId: 'f2', title: '台本テンプレート（ショート）', updatedOn: T(-2), updatedBy: 'ito', body: [
      '# ショート動画 台本テンプレ',
      '',
      '## 0-3秒：フック',
      '- 例：「これ知らないと損します」',
      '',
      '## 3-45秒：本編',
      '- ポイントは3つまで',
      '',
      '## 45-60秒：CTA',
      '- フォロー・保存を促す',
      '',
    ].join('\n') },
    { id: 'd5', folderId: 'f3', title: '編集レギュレーション', updatedOn: T(-3), updatedBy: 'tanaka', body: [
      '# 編集レギュレーション',
      '',
      '- 解像度：**4K / 1080p**',
      '- テロップ：Noto Sans JP Black、白＋黒フチ',
      '- ラウドネス：-14 LUFS',
      '- 書き出し：H.264 / ProRes(納品)',
      '',
    ].join('\n') },
    { id: 'd6', folderId: 'f4', title: '自動字幕パイプライン設計', updatedOn: T(-1), updatedBy: 'hayashi', body: [
      '# 自動字幕パイプライン',
      '',
      '1. 音声抽出',
      '2. 文字起こし（`ASR`）',
      '3. 話者分離',
      '4. LLMで整形・誤字修正',
      '5. SRT出力 → 編集ソフトへ',
      '',
      '精度：**98.2%**',
      '',
    ].join('\n') },
  ];

  const base = [
    ['base-1', 'AIツール10選【2026年版】', 'YouTube', '確認', 'yamamoto', T(1), 'tech-guide', 420000],
    ['base-2', '60秒でわかる生成AI', 'TikTok', '公開', 'inoue', T(-3), 'how-to', 1850000],
    ['base-3', '社長の1日ルーティン', 'YouTube', '編集', 'kato', T(3), 'vlog', 0],
    ['base-4', '年末特番 バズ動画大賞', 'YouTube', '企画', 'sato', T(35), 'special', 0],
    ['base-5', '職業あるある×AI #1', 'TikTok', '撮影', 'watanabe', T(4), 'series', 0],
    ['base-6', '職業あるある×AI #2', 'TikTok', '企画', 'takahashi', T(6), 'series', 0],
    ['base-7', '飲料メーカー タイアップ', 'TikTok', '企画', 'matsumoto', T(12), 'tie-up', 0],
    ['base-8', '川越 ドローン空撮Vlog', 'YouTube', '撮影', 'kobayashi', T(5), 'vlog', 0],
    ['base-9', 'CGで作る会社紹介', 'YouTube', '編集', 'sasaki', T(7), 'corporate', 0],
    ['base-10', 'AIナレーション比較', 'YouTube', '公開', 'shimizu', T(-6), 'tech-guide', 96000],
    ['base-11', 'サムネで再生数は変わる？', 'Shorts', '確認', 'kato', T(2), 'how-to', 0],
    ['base-12', 'GIX設立記念ムービー', 'YouTube', '公開', 'yoshida', T(0), 'corporate', 58000],
  ].map((r, i) => ({
    id: r[0] as string,
    title: r[1] as string,
    platform: r[2] as string,
    status: r[3] as string,
    ownerId: r[4] as string,
    publish: r[5] as string,
    tag: r[6] as string,
    views: r[7] as number,
    sort: i,
  }));

  const approvals = [
    { id: 'ap-camera', type: '稟議', title: '撮影機材（シネマカメラ）購入', amount: 680000, requesterId: 'tanaka', date: T(-1), status: 'pending', note: '4K120p対応機材。年末特番から使用。', steps: [
      { approverId: 'saito', status: 'approved', position: 0 },
      { approverId: 'chima', status: 'pending', position: 1 },
    ] },
    { id: 'ap-kawagoe', type: '経費', title: '川越ロケ 交通費・駐車場', amount: 12400, requesterId: 'kobayashi', date: T(-1), status: 'pending', note: '', steps: [
      { approverId: 'chima', status: 'pending', position: 0 },
    ] },
    { id: 'ap-budget', type: '稟議', title: '年末特番 制作予算', amount: 800000, requesterId: 'sato', date: T(0), status: 'pending', note: '外部出演者2名含む', steps: [
      { approverId: 'vp', status: 'approved', position: 0 },
      { approverId: 'chima', status: 'pending', position: 1 },
    ] },
    { id: 'ap-leave-ito', type: '休暇', title: '有給休暇 12/26', amount: 0, requesterId: 'ito', date: T(-2), status: 'approved', note: '私用のため', steps: [
      { approverId: 'sato', status: 'approved', position: 0 },
    ] },
    { id: 'ap-api', type: '経費', title: 'AI APIクレジット（11月分）', amount: 45000, requesterId: 'hayashi', date: T(-3), status: 'approved', note: '', steps: [
      { approverId: 'chima', status: 'approved', position: 0 },
    ] },
    { id: 'ap-food', type: '経費', title: '打合せ飲食代', amount: 8800, requesterId: 'kimura', date: T(-4), status: 'rejected', note: '領収書不備', steps: [
      { approverId: 'matsumoto', status: 'rejected', position: 0 },
    ] },
    { id: 'ap-leave-kato', type: '休暇', title: '午前休 11/27', amount: 0, requesterId: 'kato', date: T(0), status: 'pending', note: '通院', steps: [
      { approverId: 'tanaka', status: 'pending', position: 0 },
    ] },
  ];

  const meetings = [
    { id: 'mt-keiei', title: '経営定例', date: T(0), time: '09:30', attendees: ['chima', 'vp', 'sato', 'tanaka', 'matsumoto', 'hayashi', 'saito'], status: 'done', minutes: [
      '## 決定事項',
      '- GIX Workspaceを本日より全社導入',
      '- 年末特番は予算80万円で稟議へ',
      '',
      '## ToDo',
      '- [ ] 副社長Bot：操作説明会の設定',
      '- [ ] 松本：広告予算案を来週提出',
      '',
    ].join('\n') },
    { id: 'mt-plan', title: '企画会議', date: T(1), time: '10:00', attendees: ['sato', 'takahashi', 'ito', 'chima'], status: 'upcoming', minutes: '' },
    { id: 'mt-sns', title: 'SNS月次レビュー', date: T(3), time: '14:00', attendees: ['matsumoto', 'inoue', 'kimura', 'chima'], status: 'upcoming', minutes: '' },
    { id: 'mt-prod', title: '制作進行MTG', date: T(-1), time: '17:00', attendees: ['tanaka', 'yamamoto', 'yoshida', 'yamada', 'sasaki'], status: 'done', minutes: [
      '## 共有',
      '- 「AIツール10選」v3で確定予定',
      '- CGオープニング3案から選定',
      '',
      '## 決定事項',
      '- 案Bで進行',
      '',
    ].join('\n') },
  ];

  const okrs = [
    { id: 'okr-chima', ownerId: 'chima', objective: 'GIXをSNS動画制作で「埼玉No.1」にする', krs: [
      { title: '月間制作本数 120本', current: 74, target: 120, inverse: false },
      { title: 'TikTok総フォロワー 50万人', current: 31, target: 50, inverse: false },
      { title: '取引社数 20社', current: 9, target: 20, inverse: false },
    ] },
    { id: 'okr-hayashi', ownerId: 'hayashi', objective: 'AIで制作時間を半分にする', krs: [
      { title: '自動字幕 精度99%', current: 98.2, target: 99, inverse: false },
      { title: '1本あたり編集時間 -50%', current: 32, target: 50, inverse: false },
      { title: 'AIツール社内利用率 100%', current: 80, target: 100, inverse: false },
    ] },
    { id: 'okr-matsumoto', ownerId: 'matsumoto', objective: 'クライアントのSNS成果を最大化', krs: [
      { title: '平均エンゲージ率 8%', current: 6.4, target: 8, inverse: false },
      { title: 'タイアップ案件 月5件', current: 3, target: 5, inverse: false },
    ] },
    { id: 'okr-saito', ownerId: 'saito', objective: '働きやすいバックオフィスを作る', krs: [
      { title: '経費精算リードタイム 2日以内', current: 3, target: 2, inverse: true },
      { title: '勤怠打刻率 100%', current: 92, target: 100, inverse: false },
    ] },
  ];

  const hour = 3600000;
  const notifications = [
    { id: 'nt-chima-1', userId: 'chima', icon: 'flow', text: '田中 大輝さんが稟議「撮影機材購入」を申請しました', minutesAgo: 60, read: false, go: 'approvals' },
    { id: 'nt-chima-2', userId: 'chima', icon: 'chat', text: '佐藤 陽菜さんがあなたをメンションしました（#企画部）', minutesAgo: 60, read: false, go: 'messenger' },
    { id: 'nt-chima-3', userId: 'chima', icon: 'task', text: '「年末特番 企画書レビュー」の期限は明日です', minutesAgo: 120, read: false, go: 'tasks' },
    { id: 'nt-chima-4', userId: 'chima', icon: 'cal', text: '09:30 経営定例 が始まります', minutesAgo: 300, read: true, go: 'calendar' },
    { id: 'nt-chima-5', userId: 'chima', icon: 'trend', text: '「60秒でわかる生成AI」が185万再生を突破', minutesAgo: 26 * 60, read: true, go: 'base' },
    { id: 'nt-sato-1', userId: 'sato', icon: 'chat', text: 'ちまさんがあなたをメンションしました（#企画部）', minutesAgo: 60, read: false, go: 'messenger' },
    { id: 'nt-tanaka-1', userId: 'tanaka', icon: 'flow', text: '加藤 葵さんが休暇「午前休 11/27」を申請しました', minutesAgo: 30, read: false, go: 'approvals' },
    { id: 'nt-hayashi-1', userId: 'hayashi', icon: 'task', text: '「自動字幕 v2 リリース」のレビューをお願いします', minutesAgo: 180, read: false, go: 'tasks' },
  ].map((n) => ({ ...n, ageMs: n.minutesAgo * 60 * 1000, hour }));

  const announcements = [
    { id: 'an-1', title: '株式会社GIX 本日設立！', body: '2026年11月23日、GIXは正式にスタートしました。創業記念日として毎年お祝いします🎉', authorId: 'chima', date: '2026-11-23', pin: true, tag: '全社' },
    { id: 'an-2', title: 'GIX Workspace を全社導入', body: '社内ミッション第1号として、新グループウェア「GIX Workspace」を導入しました。チャット・タスク・承認はすべてこちらへ。', authorId: 'vp', date: T(0), pin: false, tag: 'IT' },
    { id: 'an-3', title: 'Codex社からの出向メンバー着任', body: '吉田さん・山田さん・佐々木さんが制作部に着任されました。', authorId: 'saito', date: T(-1), pin: false, tag: '人事' },
    { id: 'an-4', title: '12月 全社キックオフ', body: '12/1(火) 10:00〜 さいたまオフィス大会議室にて。', authorId: 'mori', date: T(-2), pin: false, tag: 'イベント' },
  ];

  const attendance = [];
  for (const user of SEED_USERS) {
    for (let i = 1; i <= 14; i++) {
      const date = addDaysStr(today, -i);
      const dow = utcDow(date);
      if (dow === 0 || dow === 6) continue;
      const h = hash(user.id + date);
      const inMin = 9 * 60 + (h % 25) - 10;
      const outMin = 18 * 60 + ((h >>> 8) % 90);
      attendance.push({
        userId: user.id,
        date,
        inTime: minutesToHM(inMin),
        outTime: minutesToHM(outMin),
        breakMin: 60,
      });
    }
  }

  return {
    company: {
      id: 'gix',
      name: '株式会社GIX',
      founded: '2026-11-23',
      hq: '埼玉県',
      capitalYen: 3_000_000,
      seedVersion: SEED_VERSION,
    },
    departments: DEPARTMENTS,
    users: SEED_USERS,
    channels,
    messages,
    readOverrides,
    events,
    tasks,
    folders,
    docs,
    base,
    approvals,
    meetings,
    okrs,
    notifications,
    announcements,
    attendance,
  };
}
