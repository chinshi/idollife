import { describe, expect, it } from 'vitest';
import { createFans } from '../src/fans';
import { activeParty, createParty, recruit, RECRUIT_COST } from '../src/members';
import type { Member, RunState } from '../src/types';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

function base(): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 5000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(0),
    debuted: true,
    parties: [],
    activePartyId: null,
    friends: [],
    inventory: [],
    equipped: {},
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
  };
}

describe('测试 D：recruit 组合人数上限', () => {
  it('组合满 10 人（主角 + 9 名成员）时拒绝招募，且不扣钱', () => {
    let state = createParty(base(), '满员组').state;
    const members: Member[] = Array.from({ length: 9 }, (_, i) => ({
      id: `npc-${i}`,
      name: `成员${i}`,
      bias: 'balanced',
      dupCount: 0,
    }));
    state = {
      ...state,
      parties: state.parties.map((p) => ({ ...p, members })),
    };

    const moneyBefore = state.money;
    const logBefore = state.log.length;
    const result = recruit(state, 'seed-limit');

    expect(result.result).toBe('full');
    expect(result.state.money).toBe(moneyBefore);
    expect(result.state.log).toHaveLength(logBefore);
    expect(activeParty(result.state)?.members).toHaveLength(9);
    expect(RECRUIT_COST).toBeGreaterThan(0);
  });
});
