import { describe, expect, it } from 'vitest';
import { START_AT, isExecuting, reconcileSchedule, type ScheduleItem } from '../src/index';

const MIN = 60_000;
const ACTION = 10 * MIN;
const T0 = START_AT;

const item = (id: string, from: number, span = ACTION, extra: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id,
  actionId: 'vocal-karaoke',
  startAt: T0 + from,
  endAt: T0 + from + span,
  ...extra,
});

/**
 * T-040 守卫：清空/删行程不能碰正在执行的那条，
 * 提交排程时要按服务端执行结果对齐（保 done、保正在执行、丢掉已错过窗口的）。
 */
describe('isExecuting', () => {
  it('已开始未结束、未 done → 正在执行', () => {
    const s = item('a', 0); // T0 .. T0+10min
    expect(isExecuting(s, T0 + 5 * MIN)).toBe(true);
    expect(isExecuting(s, T0)).toBe(true); // 刚开始那一刻也算
  });

  it('还没开始 / 已经结束 / 已标记完成 → 都不是', () => {
    const s = item('a', 0);
    expect(isExecuting(s, T0 - 1)).toBe(false);
    expect(isExecuting(s, T0 + ACTION)).toBe(false); // 右开区间
    expect(isExecuting({ ...s, done: true }, T0 + 5 * MIN)).toBe(false);
  });

  it('done 的条目即使时间落在区间内也不算在跑', () => {
    const s = item('a', 0, ACTION, { done: true });
    expect(isExecuting(s, T0 + MIN)).toBe(false);
  });
});

describe('reconcileSchedule', () => {
  const at = T0 + 15 * MIN; // 第 1 条(0–10)已过，第 2 条(10–20)正在跑

  it('保留正在执行的那条，丢掉已经错过窗口的未完成项', () => {
    const local = [
      item('past', 0), // 0–10，未 done，已过期
      item('running', ACTION), // 10–20，正在跑
      item('future', 2 * ACTION), // 20–30
    ];
    const out = reconcileSchedule(local, [], at);
    expect(out.map((s) => s.id)).toEqual(['running', 'future']);
  });

  it('服务端已确认执行完的条目补上 done 并保留（哪怕 endAt <= at）', () => {
    const local = [item('past', 0), item('future', 2 * ACTION)];
    const out = reconcileSchedule(local, ['past'], at);
    expect(out.map((s) => s.id)).toEqual(['past', 'future']);
    expect(out[0]?.done).toBe(true);
  });

  it('不修改入参（纯函数）', () => {
    const local = [item('past', 0)];
    const before = JSON.stringify(local);
    reconcileSchedule(local, ['past'], at);
    expect(JSON.stringify(local)).toBe(before);
  });

  it('清空后只剩「正在执行的 + 已完成的」，不会把正在跑的也清掉', () => {
    const local = [
      item('done1', -2 * ACTION, ACTION, { done: true }),
      item('past', 0),
      item('running', ACTION),
      item('future', 2 * ACTION),
    ];
    // 模拟 clearPlan 的口径：done 或 isExecuting 才留
    const kept = local.filter((s) => s.done || isExecuting(s, at));
    expect(kept.map((s) => s.id)).toEqual(['done1', 'running']);
  });
});
