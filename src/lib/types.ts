export type Member = {
  id: string;
  email: string;
  name: string;
  deptId: string;
  deptName: string;
  deptColor: string;
  role: string;
  roleLabel: string;
  title: string;
  skills: string[];
  bio: string;
  ext: string;
  status: string;
  grad: string | null;
  isBot: boolean;
  theme: string;
  sidebarCollapsed: boolean;
};

export type Dept = { id: string; name: string; color: string; sort: number };

export type Note = { id: string; icon: string; text: string; read: boolean; go: string; ts: string };

export type Bootstrap = {
  me: Member;
  members: Member[];
  departments: Dept[];
  company: { name: string; founded: string; hq: string; capitalYen: number } | null;
  notifications: Note[];
  counts: { messages: number; approvals: number; tasks: number };
  clockedIn: { inTime: string } | null;
};

export type Task = {
  id: string;
  title: string;
  status: string;
  assigneeId: string;
  creatorId: string;
  start: string;
  due: string;
  priority: string;
  tag: string;
  subtasks: { id: string; title: string; done: boolean }[];
};

export type CalEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  color: string;
  place: string;
  desc: string;
  attendees: string[];
};

export type Approval = {
  id: string;
  type: string;
  title: string;
  amount: number;
  requesterId: string;
  date: string;
  status: string;
  note: string;
  currentApproverId: string | null;
  steps: { id: string; approverId: string; order: number; status: string; decidedAt: string | null }[];
};

export type Channel = {
  id: string;
  name: string;
  kind: string;
  desc: string;
  memberIds: string[];
  peerId: string | null;
  unread: number;
};

export type Attachment = { id: string; filename: string; mime: string; size: number };

export type ChatMessage = {
  id: string;
  channelId: string;
  userId: string;
  text: string;
  ts: string;
  reactions: Record<string, string[]>;
  attachments: Attachment[];
  replies: ChatMessage[];
};

export type Doc = {
  id: string;
  folderId: string;
  title: string;
  body: string;
  updatedBy: string;
  updatedOn: string;
  attachments?: Attachment[];
};

export type Folder = { id: string; name: string; open: boolean; sort: number };

export type BaseRow = {
  id: string;
  title: string;
  platform: string;
  status: string;
  ownerId: string;
  publish: string;
  tag: string;
  views: number;
  sort: number;
};

export type Meeting = {
  id: string;
  title: string;
  date: string;
  time: string;
  status: string;
  minutes: string;
  attendees: string[];
};

export type Okr = {
  id: string;
  ownerId: string;
  objective: string;
  krs: { id: string; title: string; current: number; target: number; inverse: boolean }[];
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  authorId: string;
  date: string;
  pin: boolean;
  tag: string;
};
