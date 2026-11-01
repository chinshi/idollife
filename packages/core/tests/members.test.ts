import { describe, expect, it, test } from 'vitest';
import {
  activeParty,
  canDebut,
  createParty,
  debut,
  memberStats,
  recruit,
  RECRUIT_COST,
} from '../src/members';
import { createFans } from '../src/fans';
import type { RunState } from '../src/types';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

function base(overrides: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 1000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(0),
    debuted: false,
    parties: [],
    activePartyId: null,
    inventory: [],
    equipped: {},
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...overrides,
  };
}

describe('出道', () => {
  it('属性总和达到门槛才能出道', () => {
    expect(canDebut(base())).toBe(false);
    const strong = base({ stats: { vocal: 30, dance: 30, acting: 30, talk: 30 } });
    expect(canDebut(strong)).toBe(true);
    expect(debut(strong).debuted).toBe(true);
  });

  it('未出道不能创建组合', () => {
    const { result, state } = createParty(base(), '测试组合');
    expect(result).toBe('not-debuted');
    expect(state.parties).toHaveLength(0);
  });

  it('出道后可以创建多个组合，新创建的成为当前组合', () => {
    let s = base({ debuted: true });
    s = createParty(s, 'A 组').state;
    s = createParty(s, 'B 组').state;

    expect(s.parties).toHaveLength(2);
    expect(activeParty(s)?.name).toBe('B 组');
  });
});

describe('招募', () => {
  it('没有组合时不能招募', () => {
    const { result } = recruit(base({ debuted: true }), 'seed-1');
    expect(result).toBe('no-party');
  });

  it('有组合时花钱招募', () => {
    let s = base({ debuted: true });
    s = createParty(s, 'A 组').state;

    const { state, result } = recruit(s, 'seed-1');
    expect(result).toBe('new');
    expect(state.money).toBe(1000 - RECRUIT_COST);
    expect(activeParty(state)?.members).toHaveLength(1);
  });

  it('钱不够不招募', () => {
    let s = base({ debuted: true, money: 10 });
    s = createParty(s, 'A 组').state;
    const { result, state } = recruit(s, 'seed-1');
    expect(result).toBe('poor');
    expect(state.money).toBe(10);
  });

  it('成员能力 ≈ 主角 90%，偏向项更高', () => {
    const player = { vocal: 40, dance: 40, acting: 40, talk: 40 };
    const s = memberStats({ id: 'x', name: 'x', bias: 'dance', dupCount: 0 }, player);
    const avg = (s.vocal + s.dance + s.acting + s.talk) / 4;

    expect(s.dance).toBeGreaterThan(s.vocal);
    expect(avg).toBeGreaterThan(36 * 0.95);
    expect(avg).toBeLessThan(40);
  });
});

test('旧存档缺少 parties 字段也不会崩', () => {
  const bare = { ...base() } as Record<string, unknown>;
  delete bare.parties;
  delete bare.activePartyId;
  expect(activeParty(bare as never)).toBeNull();
});