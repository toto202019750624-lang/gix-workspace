export type StepState = {
  approverId: string;
  position: number;
  status: string;
};

export type DecisionResult = {
  steps: StepState[];
  approvalStatus: 'pending' | 'approved' | 'rejected';
  error?: string;
  nextApproverId?: string;
};

export function applyDecision(steps: StepState[], approverId: string, decision: 'approved' | 'rejected'): DecisionResult {
  const ordered = steps
    .map((s) => ({ ...s }))
    .sort((a, b) => a.position - b.position);
  const current = ordered.find((s) => s.status === 'pending');
  if (!current) return { steps: ordered, approvalStatus: 'approved', error: '承認待ちのステップがありません' };
  if (current.approverId !== approverId) return { steps: ordered, approvalStatus: 'pending', error: '現在の承認者ではありません' };
  if (decision === 'rejected') {
    current.status = 'rejected';
    return { steps: ordered, approvalStatus: 'rejected' };
  }
  current.status = 'approved';
  const next = ordered.find((s) => s.status === 'waiting');
  if (next) {
    next.status = 'pending';
    return { steps: ordered, approvalStatus: 'pending', nextApproverId: next.approverId };
  }
  return { steps: ordered, approvalStatus: 'approved' };
}

export type ApprovalLike = {
  requesterId: string;
  requesterDeptId: string;
  status: string;
  steps: { approverId: string; status: string }[];
};

export type UserLike = { id: string; role: string; deptId: string };

export function canSeeAllApprovals(user: UserLike) {
  return user.role === 'ceo' || user.role === 'vp' || (user.role === 'manager' && user.deptId === 'admin');
}

export function canSeeApproval(user: UserLike, approval: ApprovalLike) {
  if (canSeeAllApprovals(user)) return true;
  if (approval.requesterId === user.id) return true;
  if (approval.steps.some((s) => s.approverId === user.id)) return true;
  if (user.role === 'manager' && approval.requesterDeptId === user.deptId) return true;
  if (user.role === 'manager' && user.deptId === 'prod' && approval.requesterDeptId === 'codex') return true;
  return false;
}

export function currentApproverId(steps: { approverId: string; status: string }[]) {
  return steps.find((s) => s.status === 'pending')?.approverId ?? null;
}
