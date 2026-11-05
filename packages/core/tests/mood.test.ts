import { START_AT } from '../src/content';
import { describe, expect, it } from 'vitest';
import { settle } from '../src/settle';
import { createFans } from '../src/fans';
import type { RunState } from '../src/types';

const T0 = START_AT;
const MIN = 60_000;

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0, startedAt: T0, stamina: 100, money: 1000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    mood: 70,
    fans: createFans(0), debuted: true, parties: [], activePartyId: null,
    friends: [], inventory: [], equipped: {}, flags: {},
    negatives: { stress: 0, restless: 0, fatigue: 0, desire: 0, scandal: 0 },
    pendingEvent: null, eventQueue: [], log: [],
    ...over,
  } as RunState;
}

const item = (start: number) => ({
  id: 's1', actionId: 'vocal-karaoke', startAt: T0 + start * 3 * MIN, stopAfter: false,
});

describe('心情 / 压力（T-044 饱腹退役）', () => {
  it('训练会积累压力，也计入心情', () => {
    const r = settle(base(), [item(0)] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    const stress = r.state.negatives?.stress ?? 0;
    const mood = r.state.mood ?? 70;
    expect(stress).toBeGreaterThan(0);
    expect(stress).toBeLessThanOrEqual(10);
    expect(mood).toBeLessThanOrEqual(70);
    expect(70 - mood).toBeLessThanOrEqual(10);
  });

  it('心情低时收益下降', () => {
    const normal = settle(base(), [item(0)] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    const sad = settle(base({ mood: 10 }), [item(0)] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    expect(sad.state.stats.vocal).toBeLessThan(normal.state.stats.vocal);
  });

  it('爆睡固定 +40 体力，不再受任何饥饿类规则打折', () => {
    const r = settle(
      base({ stamina: 40 }),
      [{ id: 's1', actionId: 'rest-sleep', startAt: T0, stopAfter: false }] as never,
      T0,
      T0 + 3 * MIN,
      'e',
      { routineChance: 0 },
    );
    expect(r.state.stamina).toBe(80);
  });

  it('压力记录在 negatives.stress，不会写进 stats', () => {
    const r = settle(base(), [item(0)] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    expect('stress' in r.state.stats).toBe(false);
    expect(typeof r.state.negatives?.stress).toBe('number');
  });
});
