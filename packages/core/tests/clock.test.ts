import { describe, expect, it } from 'vitest';
import {
  advanceAnchor,
  catchUp,
  createClock,
  gameAdvance,
  markDone,
  maxTargetAt,
  nextStopAt,
  CLAMP_TOLERANCE_MS,
} from '../src/clock';
import type { RunState, ScheduleItem } from '../src/types';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const MIN = 60_000;

function baseRun(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 5000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: { byType: { stage: 0, gachi: 0, music: 0, live: 0, growth: 0, power: 0 }, loyalty: { casual: 0, dd: 0, group: 0, solo: 0 }, affection: { stage: 0, gachi: 0, music: 0, live: 0, growth: 0, power: 0 } },
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
    ...over,
  } as RunState;
}

const item = (id: string, start: number, end: number): ScheduleItem => ({
  id,
  actionId: 'vocal-karaoke',
  startAt: T0 + start * MIN,
  endAt: T0 + end * MIN,
});

describe('T-039 clock pure functions', () => {
  it('maxTargetAt：running 用 serverNow-wallAnchor，paused 等于 gameAt', () => {
    const running = createClock(T0, { status: 'running', wallAnchor: T0, updatedAt: T0 });
    expect(maxTargetAt(running, T0 + 1000, 20)).toBe(T0 + 20_000 + CLAMP_TOLERANCE_MS);
    const paused = createClock(T0, { status: 'paused', wallAnchor: T0 });
    expect(maxTargetAt(paused, T0 + 99999, 20)).toBe(T0);
  });

  it('advanceAnchor 前移已推进量（不是重置 serverNow）', () => {
    const clock = createClock(T0, { status: 'running', wallAnchor: 1000 });
    expect(advanceAnchor(clock, T0 + 20_000, 20)).toBe(2000);
    expect(advanceAnchor(createClock(T0), T0 + 20_000)).toBe(0);
  });

  it('nextStopAt 取最早未完成 endAt；空/全 done → null', () => {
    expect(nextStopAt([item('b', 20, 30), item('a', 10, 20)])).toBe(T0 + 20 * MIN);
    const done = [{ ...item('a', 10, 20), done: true }];
    expect(nextStopAt(done)).toBeNull();
    expect(nextStopAt([])).toBeNull();
  });

  it('gameAdvance 恒 1×：elapsed × timeScale', () => {
    expect(gameAdvance(1000, 1, 20)).toBe(20_000);
  });

  it('catchUp 是薄包装：running 推进到上界，paused 不动', () => {
    const schedule = [item('s1', 0, 1)];
    const running = createClock(T0, { status: 'running', wallAnchor: T0 });
    const r = catchUp(baseRun(), schedule, running, T0 + 60_000, 'seed', {
      timeScale: 20,
      endAt: T0 + 999 * MIN,
    });
    expect(r.advanced).toBeGreaterThan(0);
    expect(r.clock.gameAt).toBe(r.state.at);
    const paused = createClock(T0);
    expect(catchUp(baseRun(), schedule, paused, T0 + 60_000, 'seed').advanced).toBe(0);
  });

  it('markDone 保留最近完成项', () => {
    expect(markDone([item('a', 0, 1), item('b', 1, 2)], ['a'])[0]!.done).toBe(true);
  });
});
