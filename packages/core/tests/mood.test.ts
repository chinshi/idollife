import { describe, expect, it } from 'vitest';
import { settle } from '../src/settle';
import { createFans } from '../src/fans';
import type { RunState } from '../src/types';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const MIN = 60_000;

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0, startedAt: T0, stamina: 100, money: 1000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    mood: 70, satiety: 70,
    fans: createFans(0), debuted: true, parties: [], activePartyId: null,
    friends: [], inventory: [], equipped: {}, flags: {},
    pendingEvent: null, eventQueue: [], log: [],
    ...over,
  } as RunState;
}

const item = (start: number) => ({
  id: 's1', actionId: 'vocal-karaoke', startAt: T0 + start * 3 * MIN, stopAfter: false,
});

describe('心情 / 饱腹', () => {
  it('训练会消耗饱腹，也计入心情', () => {
    const r = settle(base(), [item(0)] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    expect(r.state.satiety).toBe(64);
    expect(r.state.mood).toBe(69);
  });

  it('心情低时收益下降', () => {
    const normal = settle(base(), [item(0)] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    const sad = settle(base({ mood: 10, satiety: 10 }), [item(0)] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    expect(sad.state.stats.vocal).toBeLessThan(normal.state.stats.vocal);
  });

  it('饱腹低时恢复变慢', () => {
    const ok = settle(base({ stamina: 40 }), [{ id: 's1', actionId: 'rest-sleep', startAt: T0, stopAfter: false }] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    const hungry = settle(base({ stamina: 40, satiety: 10 }), [{ id: 's1', actionId: 'rest-sleep', startAt: T0, stopAfter: false }] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    expect(hungry.state.stamina).toBeLessThan(ok.state.stamina);
  });
});
