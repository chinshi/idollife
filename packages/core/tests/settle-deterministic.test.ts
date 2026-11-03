import { START_AT } from '../src/content';
import { describe, expect, it } from 'vitest';
import { settle } from '../src/settle';
import { createFans } from '../src/fans';
import type { RunState, ScheduleItem } from '../src/types';

const MIN = 60_000;
const T0 = START_AT;

function base(): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 5000,
    stats: { vocal: 30, dance: 30, acting: 30, talk: 30 },
    axes: { self: 50, others: 50, fit: 50 },
    mood: 70,
    satiety: 70,
    fans: createFans(0),
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
  };
}

function item(id: string, actionId: string, offsetMin: number, durationMin: number): ScheduleItem {
  const startAt = T0 + offsetMin * MIN;
  return { id, actionId, startAt, endAt: startAt + durationMin * MIN };
}

describe('测试 A：结算确定性', () => {
  it('同一 seed + 同一排程，一次结算与分 3 次结算结果完全一致', () => {
    const schedule = [
      item('a1', 'show', 0, 3),
      item('a2', 'vocal-karaoke', 3, 10),
      item('a3', 'dance-otaku', 13, 10),
    ];
    const endAt = T0 + 23 * MIN;
    const opts = { routineChance: 1, storyEvents: false };

    const once = settle(base(), schedule, T0, endAt, 'seed-A', opts);

    let state = base();
    const executed: string[] = [];
    const windows: Array<[number, number]> = [
      [T0, T0 + 3 * MIN],
      [T0 + 3 * MIN, T0 + 13 * MIN],
      [T0 + 13 * MIN, endAt],
    ];
    for (const [from, to] of windows) {
      const part = settle(state, schedule, from, to, 'seed-A', opts);
      state = part.state;
      executed.push(...part.executed);
    }

    expect(executed).toEqual(once.executed);
    expect(state.stats).toEqual(once.state.stats);
    expect(state.money).toBe(once.state.money);
    expect(state.fans).toEqual(once.state.fans);
    expect(state.log).toEqual(once.state.log);
    // 时间 / 体力 / 心情 / 饱腹也应完全一致
    expect(state).toEqual(once.state);
  });
});
