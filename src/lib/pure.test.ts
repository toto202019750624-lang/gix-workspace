import { describe, expect, test } from 'vitest';
import { addDaysStr, fmtMD, todayYMD } from './dates';
import { applyDecision, canSeeApproval } from './approvals';
import { extractMentions } from './mentions';
import { md } from './markdown';
import { hashPassword, verifyPassword, DEMO_PASSWORD, demoPasswordHash } from './password';
import { buildSeed, SEED_USERS } from './seed-data';
import { initials, yen } from './format';
import { resetAllowed } from './seed-guard';
import { placeEvents } from './calendar-layout';
import { llmConfig, streamChat } from '../server/llm';
import { deleteObject, getObject, putObject, storageDriver } from '../server/storage';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('dates', () => {
  test('adds days across a month boundary', () => {
    expect(addDaysStr('2026-11-23', 8)).toBe('2026-12-01');
    expect(addDaysStr('2026-11-23', -2)).toBe('2026-11-21');
  });
  test('formats the founding Monday', () => {
    expect(fmtMD('2026-11-23')).toBe('11/23(月)');
  });
  test('today is a calendar date', () => {
    expect(todayYMD()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('approvals', () => {
  const steps = [
    { approverId: 'saito', position: 0, status: 'pending' },
    { approverId: 'chima', position: 1, status: 'waiting' },
  ];
  test('advances to the next approver', () => {
    const first = applyDecision(steps, 'saito', 'approved');
    expect(first.error).toBeUndefined();
    expect(first.approvalStatus).toBe('pending');
    expect(first.nextApproverId).toBe('chima');
    expect(first.steps.find((s) => s.approverId === 'chima')?.status).toBe('pending');
    const early = applyDecision(steps, 'chima', 'approved');
    expect(early.error).toBeTruthy();
    const done = applyDecision(first.steps, 'chima', 'approved');
    expect(done.approvalStatus).toBe('approved');
  });
  test('reject stops the route', () => {
    const rejected = applyDecision(steps, 'saito', 'rejected');
    expect(rejected.approvalStatus).toBe('rejected');
  });
  test('scopes visibility', () => {
    const approval = {
      requesterId: 'kobayashi',
      requesterDeptId: 'prod',
      status: 'pending',
      steps: [{ approverId: 'chima', status: 'pending' }],
    };
    expect(canSeeApproval({ id: 'kato', role: 'member', deptId: 'prod' }, approval)).toBe(false);
    expect(canSeeApproval({ id: 'tanaka', role: 'manager', deptId: 'prod' }, approval)).toBe(true);
    expect(canSeeApproval({ id: 'tanaka', role: 'manager', deptId: 'prod' }, { ...approval, requesterDeptId: 'codex' })).toBe(true);
    expect(canSeeApproval({ id: 'sato', role: 'manager', deptId: 'plan' }, approval)).toBe(false);
    expect(canSeeApproval({ id: 'chima', role: 'ceo', deptId: 'exec' }, approval)).toBe(true);
    expect(canSeeApproval({ id: 'saito', role: 'manager', deptId: 'admin' }, approval)).toBe(true);
    expect(canSeeApproval({ id: 'kobayashi', role: 'member', deptId: 'prod' }, approval)).toBe(true);
  });
});

describe('mentions and markdown', () => {
  const members = [{ id: 'sato', name: '佐藤 陽菜' }, { id: 'chima', name: 'ちま' }];
  test('finds names and everyone', () => {
    expect(extractMentions('@佐藤 陽菜 よろしく', members).ids).toEqual(['sato']);
    expect(extractMentions('@佐藤陽菜 よろしく', members).ids).toEqual(['sato']);
    expect(extractMentions('@全員 勤怠', members).all).toBe(true);
    expect(extractMentions('@ちま 確認', members).ids).toEqual(['chima']);
  });
  test('escapes html', () => {
    const html = md('# 見出し\n\n<script>alert(1)</script>\n\n**太字** と `code`\n\n[x](javascript:alert(1))');
    expect(html).toContain('<h1>見出し</h1>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<b>太字</b>');
    expect(html).not.toContain('javascript:');
  });
});

describe('password and seed shape', () => {
  test('verifies the demo password', () => {
    const hash = hashPassword('secret-pass');
    expect(verifyPassword('secret-pass', hash)).toBe(true);
    expect(verifyPassword('nope', hash)).toBe(false);
    expect(verifyPassword(DEMO_PASSWORD, demoPasswordHash())).toBe(true);
  });
  test('builds the company and the 21-person roster', () => {
    const seed = buildSeed('2026-11-23');
    expect(seed.users).toHaveLength(21);
    expect(SEED_USERS.filter((u) => !['exec'].includes(u.deptId))).toHaveLength(19);
    expect(seed.users.filter((u) => u.deptId === 'plan')).toHaveLength(3);
    expect(seed.users.filter((u) => u.deptId === 'prod')).toHaveLength(6);
    expect(seed.users.filter((u) => u.deptId === 'codex' && u.role === 'seconded')).toHaveLength(3);
    expect(seed.users.filter((u) => u.deptId === 'sns')).toHaveLength(3);
    expect(seed.users.filter((u) => u.deptId === 'ai')).toHaveLength(2);
    expect(seed.users.filter((u) => u.deptId === 'admin')).toHaveLength(2);
    expect(seed.company).toMatchObject({ name: '株式会社GIX', founded: '2026-11-23', hq: '埼玉県', capitalYen: 3_000_000 });
    expect(seed.events.find((e) => e.title === '経営定例')?.date).toBe('2026-11-23');
    expect(seed.events.find((e) => e.title === '全社キックオフ')?.date).toBe('2026-12-01');
    expect(seed.approvals.find((a) => a.id === 'ap-camera')?.steps.map((s) => s.approverId)).toEqual(['saito', 'chima']);
    expect(seed.attendance.some((a) => a.date === '2026-11-23')).toBe(false);
    expect(initials('佐藤 陽菜')).toBe('佐');
    expect(initials('ちま')).toBe('ちま');
    expect(yen(680000)).toBe('¥680,000');
  });
});

describe('production helpers', () => {
  test('blocks destructive seed on Vercel and production', () => {
    expect(resetAllowed({ NODE_ENV: 'development' })).toBe(true);
    expect(resetAllowed({ NODE_ENV: 'test' })).toBe(true);
    expect(resetAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(resetAllowed({ NODE_ENV: 'production', ALLOW_SEED_RESET: 'true' })).toBe(true);
    expect(resetAllowed({ NODE_ENV: 'development', VERCEL: '1' })).toBe(false);
  });

  test('places overlapping events side by side', () => {
    const placed = placeEvents([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 90 },
      { id: 'c', start: 120, end: 150 },
    ]);
    const a = placed.find((e) => e.id === 'a')!;
    const b = placed.find((e) => e.id === 'b')!;
    const c = placed.find((e) => e.id === 'c')!;
    expect(a.cols).toBe(2);
    expect(b.cols).toBe(2);
    expect(a.col).not.toBe(b.col);
    expect(c.cols).toBe(1);
    expect(c.col).toBe(0);
  });

  test('llm config is empty without a key and parses a stream', async () => {
    expect(llmConfig({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(llmConfig({ XAI_API_KEY: 'x' } as unknown as NodeJS.ProcessEnv)?.base).toBe('https://api.x.ai/v1');
    expect(llmConfig({ OPENAI_API_KEY: 'o', AI_MODEL: 'gpt-4o-mini' } as unknown as NodeJS.ProcessEnv)?.model).toBe('gpt-4o-mini');
    const payload = [
      'data: {"choices":[{"delta":{"content":"こん"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"にちは"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const fetchImpl = (async () => new Response(payload, { status: 200 })) as typeof fetch;
    let text = '';
    for await (const delta of streamChat({ key: 'k', base: 'https://example.test/v1', model: 'm' }, 'sys', 'user', fetchImpl)) text += delta;
    expect(text).toBe('こんにちは');
  });

  test('local storage round trip', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gix-store-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.UPLOAD_DIR = dir;
    expect(storageDriver()).toBe('local');
    const key = await putObject('file1', Buffer.from('hello-gix'), 'text/plain');
    expect(key).toBe('local:file1');
    const got = await getObject(key);
    expect(got?.body.toString()).toBe('hello-gix');
    await deleteObject(key);
    expect(await getObject(key)).toBeNull();
  });
});
