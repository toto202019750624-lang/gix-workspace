export const NAV: { id?: string; name?: string; ic?: string; sep?: string }[] = [
  { sep: 'ワークスペース' },
  { id: 'home', name: 'ホーム', ic: 'home' },
  { id: 'messenger', name: 'メッセンジャー', ic: 'chat' },
  { id: 'calendar', name: 'カレンダー', ic: 'cal' },
  { id: 'tasks', name: 'タスク', ic: 'task' },
  { id: 'docs', name: 'ドキュメント', ic: 'doc' },
  { id: 'base', name: 'ベース', ic: 'base' },
  { sep: '業務' },
  { id: 'approvals', name: '承認', ic: 'flow' },
  { id: 'meetings', name: '会議', ic: 'meet' },
  { id: 'members', name: 'メンバー・組織図', ic: 'users' },
  { id: 'attendance', name: '勤怠', ic: 'clock' },
  { id: 'okr', name: 'OKR・目標', ic: 'target' },
  { id: 'ai-staff', name: 'AI社員', ic: 'spark' },
];

export const TASK_COLS = [
  ['todo', '未着手', '#9a9aa5'],
  ['doing', '進行中', '#4a90a4'],
  ['review', 'レビュー', '#c39a3e'],
  ['done', '完了', '#5e9c7e'],
] as const;

export const STAGES = ['企画', '撮影', '編集', '確認', '公開'] as const;
export const STAGE_C: Record<string, string> = {
  企画: '#c48a9c',
  撮影: '#4a90a4',
  編集: '#6a6fc4',
  確認: '#c39a3e',
  公開: '#5e9c7e',
};
export const EVENT_COLORS = ['#6a6fc4', '#4a90a4', '#c2697f', '#5e9c7e', '#c39a3e', '#c27a52', '#c48a9c'];
export const EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '🙏', '🚀', '😍', '✅'];
export const PLATFORMS = ['YouTube', 'TikTok', 'Shorts', 'Instagram'];
