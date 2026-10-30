import { describe, expect, it } from 'vitest';
import { settle } from '../src/settle';
import type { RunState, ScheduleItem } from '../src/types';

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

function baseRun(): RunState {
  return {
    at: T0,
    stamina: 100,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
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

    const r = settle(baseRun(), schedule, T0, T0 + 60 * MIN, 'run-1');

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

    const r = settle(run, schedule, T0, T0 + 60 * MIN, 'run-1');

    expect(r.stoppedReason).toBe('stamina');
    expect(r.executed).toEqual(['s1']);
    expect(r.state.stamina).toBeLessThanOrEqual(5);
  });

  it('同一输入 + 同一种子 → 结果完全一致；换种子可能不同', () => {
    const schedule = [item('s1', 'vocal-karaoke', 0), item('s2', 'vocal-karaoke', 10)];

    const a = settle(baseRun(), schedule, T0, T0 + 60 * MIN, 'seed-A');
    const b = settle(baseRun(), schedule, T0, T0 + 60 * MIN, 'seed-A');
    const c = settle(baseRun(), schedule, T0, T0 + 60 * MIN, 'seed-B');

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // 种子不同不保证一定不同，但至少结构一致
    expect(c.executed).toEqual(a.executed);
  });
});
