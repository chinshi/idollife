import { describe, expect, it } from 'vitest';
import { settle } from '../src/settle';
import { ACTION_MINUTES, DAY_MS, START_MONEY } from '../src/content';
import { createFans } from '../src/fans';
import type { RunState, ScheduleItem } from '../src/types';

const T0 = 1767300000000;
const MIN = 60_000;

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: START_MONEY,
    stats: { vocal: 5, dance: 5, acting: 5, talk: 5 },
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
    ...over,
  } as RunState;
}

describe('连续推进', () => {
  it('两条行动能连续执行', () => {
    const run = base();
    const d = ACTION_MINUTES * MIN;
    const a1: ScheduleItem = { id: 'a1', actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + d };
    const a2: ScheduleItem = { id: 'a2', actionId: 'dance-otaku', startAt: T0 + d, endAt: T0 + 2 * d };

    const r = settle(run, [a1, a2], T0, T0 + 2 * d, 'seed', { routineChance: 0, storyEvents: false });
    expect(r.executed).toEqual(['a1', 'a2']);
    expect(r.stoppedReason).toBe('exhausted');
  });

  it('跳过已完成的、从第二条继续', () => {
    const run = base({ at: T0 + MIN });
    const d = ACTION_MINUTES * MIN;
    const a1: ScheduleItem = {
      id: 'a1',
      actionId: 'vocal-karaoke',
      startAt: T0,
      endAt: T0 + d,
      done: true,
    };
    const a2: ScheduleItem = { id: 'a2', actionId: 'dance-otaku', startAt: T0 + d, endAt: T0 + 2 * d };

    const r = settle(run, [a1, a2], T0 + MIN, T0 + 2 * d, 'seed', {
      routineChance: 0,
      storyEvents: false,
    });
    expect(r.executed).toEqual(['a2']);
  });
});
