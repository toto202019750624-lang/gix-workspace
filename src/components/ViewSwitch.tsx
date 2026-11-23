'use client';

import { useParams } from 'next/navigation';
import { HomeView } from './views/HomeView';
import { MessengerView } from './views/MessengerView';
import { CalendarView } from './views/CalendarView';
import { TasksView } from './views/TasksView';
import { DocsView } from './views/DocsView';
import { BaseView } from './views/BaseView';
import { ApprovalsView } from './views/ApprovalsView';
import { MeetingsView } from './views/MeetingsView';
import { MembersView } from './views/MembersView';
import { AttendanceView } from './views/AttendanceView';
import { OkrView } from './views/OkrView';

const VIEWS: Record<string, () => React.JSX.Element> = {
  home: HomeView,
  messenger: MessengerView,
  calendar: CalendarView,
  tasks: TasksView,
  docs: DocsView,
  base: BaseView,
  approvals: ApprovalsView,
  meetings: MeetingsView,
  members: MembersView,
  attendance: AttendanceView,
  okr: OkrView,
};

export function ViewSwitch() {
  const params = useParams<{ view: string }>();
  const view = params.view || 'home';
  const View = VIEWS[view];
  if (!View) return <div className="empty">ページがありません</div>;
  return <View />;
}
