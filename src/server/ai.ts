import { db } from '../lib/prisma';
import { fmtMD, todayYMD } from '../lib/dates';
import { greetName, yen } from '../lib/format';
export async function answerQuestion(userId: string, q: string, channelId?: string) {
  const user = await db().user.findUnique({ where: { id: userId }, include: { dept: true } });
  if (!user) return 'ログインが必要です。';
  const users = await db().user.findMany();
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name || id;

  if (/要約/.test(q)) {
    let chId = channelId;
    if (!chId) {
      const channels = await db().channel.findMany();
      const mentioned = channels.find((c) => q.includes(c.name) || q.includes('#' + c.name));
      chId = mentioned?.id || 'general';
    }
    const channel = await db().channel.findUnique({ where: { id: chId } });
    const member = await db().channelMember.findUnique({ where: { channelId_userId: { channelId: chId!, userId } } });
    if (!channel || !member) return 'そのチャンネルは見られません。';
    const msgs = await db().message.findMany({ where: { channelId: chId, parentId: null }, orderBy: { createdAt: 'asc' } });
    const people = [...new Set(msgs.map((m) => nameOf(m.userId)))];
    const lines = msgs.slice(-4).map((m) => `- **${nameOf(m.userId)}**：${m.text.replace(/\n/g, ' ').slice(0, 40)}${m.text.length > 40 ? '…' : ''}`);
    const label = channel.kind === 'dm' ? 'ダイレクトメッセージ' : `#${channel.name}`;
    return [
      `## ${label} の要約`,
      `- メッセージ ${msgs.length}件 / 参加者 ${people.length}名（${people.slice(0, 4).join('、')}${people.length > 4 ? ' ほか' : ''}）`,
      ...lines,
      '',
      '**ネクストアクション**',
      '- 未返信のスレッドに返信する',
      '- 決定事項をドキュメントに記録する',
    ].join('\n');
  }

  if (/企画|動画/.test(q)) {
    return [
      '## 動画企画ドラフト ✦',
      '**タイトル案**：「AIで1日を自動化したら何時間浮く？【GIX検証】」',
      '',
      '- **媒体**：YouTube（12分）＋TikTok切り抜き 3本',
      '- **ターゲット**：20〜30代のビジネスパーソン',
      '- **フック（0-5秒）**：「今日、仕事の6割をAIに任せてみた」',
      '',
      '### 構成',
      '1. 朝：メール・スケジュールをAIで処理',
      '2. 昼：企画書をAIと共同作成',
      '3. 夜：浮いた時間を集計して発表',
      '',
      '### 担当案',
      '- 企画：佐藤 陽菜 / 撮影：渡辺 結衣 / 編集：山本 翔',
      '- AI監修：林 隼人',
      '',
      '> ベースに「企画」ステータスで追加することもできます。',
    ].join('\n');
  }

  if (/優先|今日/.test(q)) {
    const today = todayYMD();
    const events = await db().calendarEvent.findMany({ where: { date: today }, include: { attendees: true }, orderBy: { start: 'asc' } });
    const mineEvents = user.role === 'ceo' || user.role === 'vp' ? events : events.filter((e) => e.attendees.some((a) => a.userId === userId));
    const tasks = await db().task.findMany({ where: { assigneeId: userId, status: { not: 'done' } }, orderBy: { due: 'asc' }, take: 5 });
    const pending = await db().approvalStep.count({ where: { approverId: userId, status: 'pending' } });
    return [
      `## 今日の優先事項（${greetName(user)}）`,
      '### 予定',
      ...(mineEvents.length ? mineEvents.map((e) => `- ${e.start} ${e.title}`) : ['- なし']),
      '### 自分の未完了タスク',
      ...(tasks.length ? tasks.map((t) => `- ${t.title}（${fmtMD(t.due)}）`) : ['- なし']),
      '### 承認待ち',
      `- ${pending}件`,
    ].join('\n');
  }

  if (/承認|稟議/.test(q)) {
    const steps = await db().approvalStep.findMany({ where: { approverId: userId, status: 'pending' }, include: { approval: { include: { requester: true } } } });
    const lines = steps.map((s) => {
      const a = s.approval;
      return `- **${a.title}**（${a.type}・${a.requester.name}）${a.amount ? yen(a.amount) : ''}`;
    });
    return [`## 承認待ち ${steps.length}件`, ...(lines.length ? lines : ['- ありません']), '', '金額の大きい稟議から確認するのがおすすめです。'].join('\n');
  }

  if (/KPI|分析|数字/.test(q)) {
    const rows = await db().baseRow.findMany();
    const views = rows.reduce((s, r) => s + r.views, 0);
    const top = rows.slice().sort((a, b) => b.views - a.views)[0];
    const published = rows.filter((r) => r.status === '公開').length;
    return [
      '## KPI分析',
      `- パイプライン上の公開動画は **${published}本**、登録再生数の合計は **${views.toLocaleString('ja-JP')}**`,
      top ? `- 牽引は「${top.title}」（${top.views.toLocaleString('ja-JP')}回）` : '- 公開動画はまだありません',
      '- 総再生の物語上の前週比は **+34%**。保存率が高いのは **ハウツー系**',
      '- フォロワーは31.2万人。OKR（50万人）には月 **+3.1万人** ペースが目安',
    ].join('\n');
  }

  return `「${q}」について承知しました。\n※ このアシスタントは社内データに基づくデモ応答です。「要約」「企画」「優先事項」「承認」「KPI」などのキーワードに反応します。APIキーを設定すると、同じ社内データをもとにモデルが答えます。`;
}

/** Compact company context handed to the LLM. Facts only, no invented numbers. */
export async function buildAiContext(userId: string, q: string, channelId?: string) {
  const user = await db().user.findUnique({ where: { id: userId }, include: { dept: true } });
  if (!user) return 'ユーザー不明';
  const today = todayYMD();
  const [events, tasks, steps, rows] = await Promise.all([
    db().calendarEvent.findMany({ where: { date: today }, include: { attendees: true }, orderBy: { start: 'asc' } }),
    db().task.findMany({ where: { assigneeId: userId, status: { not: 'done' } }, orderBy: { due: 'asc' }, take: 8 }),
    db().approvalStep.findMany({ where: { approverId: userId, status: 'pending' }, include: { approval: { include: { requester: true } } }, take: 8 }),
    db().baseRow.findMany(),
  ]);
  const mineEvents = user.role === 'ceo' || user.role === 'vp' ? events : events.filter((e) => e.attendees.some((a) => a.userId === userId));
  const views = rows.reduce((sum, row) => sum + row.views, 0);
  const top = rows.slice().sort((a, b) => b.views - a.views)[0];
  let channelBlock = '';
  if (channelId || /要約/.test(q)) {
    const channels = await db().channel.findMany();
    const chId = channelId || channels.find((c) => q.includes(c.name))?.id || 'general';
    const member = await db().channelMember.findUnique({ where: { channelId_userId: { channelId: chId, userId } } });
    if (member) {
      const msgs = await db().message.findMany({ where: { channelId: chId, parentId: null }, orderBy: { createdAt: 'desc' }, take: 8, include: { user: true } });
      const channel = channels.find((c) => c.id === chId);
      channelBlock = `\nチャンネル ${channel?.name || chId} の直近:\n${msgs.reverse().map((m) => `- ${m.user.name}: ${m.text.replace(/\n/g, ' ').slice(0, 80)}`).join('\n')}`;
    }
  }
  return [
    `ユーザー: ${greetName(user)}（${user.title} / ${user.dept?.name || ''}）`,
    `今日 ${today} の予定:`,
    ...(mineEvents.length ? mineEvents.map((e) => `- ${e.start}-${e.end} ${e.title} ${e.place}`) : ['- なし']),
    '自分の未完了タスク:',
    ...(tasks.length ? tasks.map((t) => `- ${t.title} 期限${fmtMD(t.due)} 優先度${t.priority} ${t.status}`) : ['- なし']),
    '自分の承認待ち:',
    ...(steps.length ? steps.map((s) => `- ${s.approval.title}（${s.approval.type}・${s.approval.requester.name}${s.approval.amount ? ' ' + yen(s.approval.amount) : ''}）`) : ['- なし']),
    `パイプライン: 公開${rows.filter((r) => r.status === '公開').length}本 / 再生合計${views.toLocaleString('ja-JP')}${top ? ` / 最多「${top.title}」${top.views.toLocaleString('ja-JP')}` : ''}`,
    channelBlock,
  ].join('\n');
}
