import { describe, expect, it } from 'vitest';
import { settle } from '../src/settle';
import { applyChoice } from '../src/events';
import { createFans } from '../src/fans';
import type { RunState, ScheduleItem } from '../src/types';

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const PURE = { routineChance: 0, storyEvents: false };

function baseRun(): RunState {
  return {
    at: T0,
    stamina: 100,
    money: 5000,
    parties: [],
    activePartyId: null,
    debuted: false,
    inventory: [],
    equipped: {},
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(100),
    flags: {},
    pendingEvent: null,
    log: [],
  };
}

function item(id: string, actionId: string, offsetMin: number, durationMin = 10): ScheduleItem {
  const startAt = T0 + offsetMin * MIN;
  return { id, actionId, startAt, endAt: startAt + durationMin * MIN };
}

describe('settle', () => {
  it('跑完排程，时间推进到最后一个行动的结束点', () => {
    const schedule = [
      item('s1', 'vocal-karaoke', 0),
      item('s2', 'dance-otaku', 10),
      item('s3', 'rest-sleep', 20),
    ];

    const r = settle(baseRun(), schedule, T0, T0 + 60 * MIN, 'run-1', PURE);

    expect(r.executed).toEqual(['s1', 's2', 's3']);
    expect(r.stoppedReason).toBe('exhausted');
    expect(r.state.at).toBe(T0 + 30 * MIN);
    expect(r.state.stats.vocal).toBeGreaterThan(10);
    expect(r.state.stats.dance).toBeGreaterThan(10);
    expect(r.state.log).toHaveLength(3);
  });

  it('体力不足时停下，不执行后面的行动', () => {
    const run = baseRun();
    run.stamina = 15;

    const schedule = [
      item('s1', 'vocal-karaoke', 0),
      item('s2', 'dance-otaku', 10),
      item('s3', 'talk-selftalk', 20),
    ];

    const r = settle(run, schedule, T0, T0 + 60 * MIN, 'run-1', PURE);

    expect(r.stoppedReason).toBe('stamina');
    expect(r.executed).toEqual(['s1']);
    expect(r.state.stamina).toBeLessThanOrEqual(5);
  });

  it('金钱不足时停下，不执行需要花钱的行动', () => {
    const run = baseRun();
    run.money = 10;

    const r = settle(run, [item('s1', 'vocal-karaoke', 0)], T0, T0 + 60 * MIN, 'm', PURE);

    expect(r.stoppedReason).toBe('money');
    expect(r.executed).toEqual([]);
    expect(r.state.money).toBe(10);
  });

  it('打工赚钱，唱 K 花钱', () => {
    const run = baseRun();
    run.money = 1000;

    const r = settle(
      run,
      [item('s1', 'work-part-time', 0), item('s2', 'vocal-karaoke', 10)],
      T0,
      T0 + 60 * MIN,
      'm2',
      PURE,
    );

    expect(r.state.money).toBe(1270);
  });

  it('同一输入 + 同一种子 → 结果完全一致', () => {
    const schedule = [item('s1', 'vocal-karaoke', 0), item('s2', 'vocal-karaoke', 10)];

    const a = settle(baseRun(), schedule, T0, T0 + 60 * MIN, 'seed-A');
    const b = settle(baseRun(), schedule, T0, T0 + 60 * MIN, 'seed-A');

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('常规事件只改数值，不改三轴', () => {
    const r = settle(baseRun(), [item('s1', 'vocal-karaoke', 0)], T0, T0 + 60 * MIN, 'r', {
      routineChance: 1,
      storyEvents: false,
    });

    expect(r.state.log.some((l) => l.kind === 'routine')).toBe(true);
    expect(r.state.axes).toEqual({ self: 50, others: 50, fit: 50 });
  });
});

describe('剧情事件', () => {
  it('满足条件时触发，并停下等抉择', () => {
    const run = baseRun();
    run.stats.dance = 15;

    const r = settle(run, [item('s1', 'vocal-karaoke', 0)], T0, T0 + 60 * MIN, 'e', {
      routineChance: 0,
    });

    expect(r.stoppedReason).toBe('event');
    expect(r.state.pendingEvent).toBe('first-audition');
  });

  it('抉择会改变三轴、打上标记，并清空待处理', () => {
    const run = baseRun();
    run.pendingEvent = 'first-audition';

    const next = applyChoice(run, 'first-audition', 'go');

    expect(next.pendingEvent).toBeNull();
    expect(next.axes.self).toBeGreaterThan(run.axes.self);
    expect(next.flags['ev:first-audition']).toBe(true);
    expect(next.log.at(-1)?.kind).toBe('choice');
  });

  it('有待处理事件时，时间不推进', () => {
    const run = baseRun();
    run.pendingEvent = 'first-audition';

    const r = settle(run, [item('s1', 'vocal-karaoke', 0)], T0, T0 + 60 * MIN, 'e');

    expect(r.executed).toEqual([]);
    expect(r.stoppedReason).toBe('event');
    expect(r.state.at).toBe(run.at);
  });
});
