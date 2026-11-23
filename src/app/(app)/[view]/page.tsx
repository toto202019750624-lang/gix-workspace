import { Suspense } from 'react';
import { ViewSwitch } from '@/components/ViewSwitch';

export default function ViewPage() {
  return (
    <Suspense fallback={<div className="empty">読み込み中…</div>}>
      <ViewSwitch />
    </Suspense>
  );
}
