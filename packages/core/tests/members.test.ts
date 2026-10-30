import { describe, expect, it } from 'vitest';
import { addOrUpgradeMember, memberStats, recruit, RECRUIT_COST } from '../src/members';
import { createFans } from '../src/fans';
import type { RunState } from '../src/types';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

function base(money = 1000, party: RunState['party'] = []): RunState {
  return {
    at: T0,
    stamina: 100,
    money,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(0),
    party,
    flags: {},
    pendingEvent: null,
    log: [],
  };
}

describe('招募', () => {
  it('花钱招募一个新成员', () => {
    const { state, result } = recruit(base(1000), 'seed-1');
    expect(result.kind).toBe('new');
    expect(state.money).toBe(1000 - RECRUIT_COST);
    expect(state.party).toHaveLength(1);
  });

  it('钱不够时不招募', () => {
    const { state, result } = recruit(base(100), 'seed-1');
    expect(result.kind).toBe('poor');
    expect(state.money).toBe(100);
    expect(state.party).toHaveLength(0);
  });

  it('同名成员重复招募 → 默契 +1%（上限 +10%）', () => {
    let party: RunState['party'] = [];
    for (let i = 0; i < 12; i++) {
      party = addOrUpgradeMember({ ...base(), party }, '林小满', 'vocal').party;
    }
    expect(party).toHaveLength(1);
    expect(party[0]!.dupCount).toBe(10);
  });

  it('成员能力 ≈ 主角 90%，偏向项更高', () => {
    const player = { vocal: 40, dance: 40, acting: 40, talk: 40 };
    const s = memberStats({ id: 'x', name: 'x', bias: 'dance', dupCount: 0 }, player);

    const avg = s.vocal + s.dance + s.acting + s.talk;
    expect(s.dance).toBeGreaterThan(s.vocal);
    expect(avg / 4).toBeGreaterThan(40 * 0.85);
    expect(avg / 4).toBeLessThan(40 * 0.95);
  });
});
