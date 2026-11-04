import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveBootSave } from '../src/state/save';
import { blockReadonlyWrite } from '../src/state/readonly';
import { buildSignedOutState } from '../src/state/signout';
import { syncRun } from '../src/api/sync';

const boot = {
  version: 2,
  runId: 'r1',
  revision: 1,
  updatedAt: 0,
  seed: 's',
  run: {} as never,
  schedule: [],
};

describe('T-036 账号/只读/403', () => {
  it('resolveBootSave：老档/同账号保留，异账号丢弃', () => {
    expect(resolveBootSave(boot as never, 'u1')).toBe(boot);
    expect(resolveBootSave({ ...boot, ownerId: 'u1' } as never, 'u1')).not.toBeNull();
    expect(resolveBootSave({ ...boot, ownerId: 'u2' } as never, 'u1')).toBeNull();
    expect(resolveBootSave(boot as never, null)).toBe(boot);
  });

  it('只读态拦截并提示', () => {
    const notices: string[] = [];
    expect(blockReadonlyWrite(true, (t) => notices.push(t))).toBe(true);
    expect(notices[0]).toContain('在本设备继续');
    expect(blockReadonlyWrite(false, () => {})).toBe(false);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('403 归类 forbidden 而非 error', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    );
    const res = await syncRun({} as never, 'token');
    expect(res.kind).toBe('forbidden');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('登出重置内存态：新 runId / 空排程 / revision 0', () => {
    const baseRun = {
      at: 0,
      startedAt: 0,
      stamina: 100,
      money: 0,
      stats: { vocal: 0, dance: 0, acting: 0, talk: 0 },
      axes: { self: 50, others: 50, fit: 50 },
      fans: { byType: {}, loyalty: {}, affection: {} },
      debuted: false,
      parties: [],
      activePartyId: null,
      friends: [],
      inventory: [],
      equipped: {},
      flags: {},
      pendingEvent: null,
      eventQueue: [],
      log: [],
    } as never;
    const first = buildSignedOutState(baseRun);
    const second = buildSignedOutState(baseRun);
    // 每次登出都必须换新 runId，绝不能沿用旧档的 id
    expect(typeof first.runId).toBe('string');
    expect(first.runId).toMatch(/^run-/);
    expect(first.runId).not.toBe(second.runId);
    expect(first.schedule).toEqual([]);
    expect(first.revision).toBe(0);
    expect(first.savedAt).toBeNull();
  });

  it('onForbidden 不再原地 retryClockSession，而是延时 reload', () => {
    const src = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const start = src.indexOf('onForbidden:');
    const body = src.slice(start, src.indexOf('},', start));
    expect(body).not.toContain('retryClockSession');
    expect(body).toContain('location.reload');
  });
});
