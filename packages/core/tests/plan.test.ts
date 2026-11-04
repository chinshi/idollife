import { describe, expect, it } from 'vitest';
import { ACTION_MS, DAILY_SLOTS, DAY_MS, START_AT } from '../src/content';
import { placeAction, buildDaySlots, nextPendingItem } from '../src/plan';
import type { ScheduleItem } from '../src/types';

const T0 = START_AT;
const A = ACTION_MS; // 10 分钟
const DAY = DAY_MS; // 3 槽

function item(id: string, slot: number, day = 0, duration = A): ScheduleItem {
  const startAt = T0 + day * DAY + slot * A;
  return { id, actionId: 'vocal-karaoke', startAt, endAt: startAt + duration };
}

const base = { at: T0, durationMs: A, dayMs: DAY, actionMs: A, slotsPerDay: DAILY_SLOTS };

describe('T-027 placeAction', () => {
  it('空排程 → 当前日第 1 槽，filled=false（追加等价）', () => {
    const r = placeAction({ ...base, schedule: [] });
    expect(r).toEqual({ startAt: T0, filled: false });
  });

  it('今天 3 槽排满 → 落在次日第 1 槽', () => {
    const schedule = [item('a0', 0), item('a1', 1), item('a2', 2)];
    const r = placeAction({ ...base, schedule });
    expect(r.startAt).toBe(T0 + DAY);
    expect(r.filled).toBe(false);
  });

  it('删掉今天第 2 条后再加 → 落在第 2 槽（补位），第 3 条时间不变', () => {
    // 原排程 3 条，删掉第 2 条（slot1）后剩 slot0 / slot2
    const schedule = [item('a0', 0), item('a2', 2)];
    const r = placeAction({ ...base, schedule });
    expect(r.startAt).toBe(T0 + A); // 第 2 槽
    expect(r.filled).toBe(true);
    // 已有项时间不动
    expect(schedule[1]!.startAt).toBe(T0 + 2 * A);
  });

  it('空洞只有 1 槽、但新行动要 3 槽 → 跳过该洞，落到能容纳的位置', () => {
    const schedule = [item('a0', 0), item('a2', 2)]; // slot1 空
    const r = placeAction({ ...base, schedule, durationMs: 3 * A });
    expect(r.startAt).toBe(T0 + DAY);
    expect(r.filled).toBe(false);
    // 与已有项无重叠
    for (const s of schedule) {
      expect(r.startAt < s.endAt && r.startAt + 3 * A > s.startAt).toBe(false);
    }
  });

  it('全满 → 追加到末尾，且与已有项无时间重叠', () => {
    const schedule = [
      item('d0s0', 0, 0),
      item('d0s1', 1, 0),
      item('d0s2', 2, 0),
      item('d1s0', 0, 1),
      item('d1s1', 1, 1),
      item('d1s2', 2, 1),
    ];
    const r = placeAction({ ...base, schedule });
    expect(r.startAt).toBe(T0 + 2 * DAY);
    for (const s of schedule) {
      expect(r.startAt < s.endAt && r.startAt + A > s.startAt).toBe(false);
    }
  });

  it('旧存档槽位不对齐（startAt 不落在整槽上）→ 不产生重叠', () => {
    const oddStart = T0 + 3 * 60_000; // 第 1 槽内偏移 3 分钟
    const schedule: ScheduleItem[] = [
      { id: 'odd', actionId: 'vocal-karaoke', startAt: oddStart, endAt: oddStart + A },
    ];
    const r = placeAction({ ...base, schedule });
    expect(r.startAt).toBeGreaterThanOrEqual(T0);
    expect(r.startAt < oddStart + A && r.startAt + A > oddStart).toBe(false);
  });
});

describe('T-030 buildDaySlots', () => {
  it('空天 → 3 个槽，全部 item=null、covered=false', () => {
    const out = buildDaySlots([], T0, 3, A, () => 1);
    expect(out).toHaveLength(3);
    expect(out.every((s) => s.item === null && s.covered === false)).toBe(true);
  });

  it('一条跨 3 槽的项 → slot0 有值，slot1/2 covered 且 item=null', () => {
    const schedule = [{ id: 'show1', actionId: 'show', startAt: T0, endAt: T0 + 3 * A }];
    const out = buildDaySlots(schedule, T0, 3, A, () => 3);
    expect(out[0]!.item?.id).toBe('show1');
    expect(out[1]!.item).toBeNull();
    expect(out[2]!.item).toBeNull();
    expect(out[1]!.covered).toBe(true);
    expect(out[2]!.covered).toBe(true);
  });

  it('两条同起点重叠 → 后者被丢弃（不覆盖前一条）', () => {
    const schedule = [
      { id: 'a', actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + A },
      { id: 'b', actionId: 'dance-otaku', startAt: T0, endAt: T0 + A },
    ];
    const out = buildDaySlots(schedule, T0, 3, A, () => 1);
    expect(out[0]!.item?.id).toBe('a');
    expect(out.map((s) => s.item?.id).filter(Boolean)).toEqual(['a']);
  });
});

describe('T-035 nextPendingItem', () => {
  it('乱序 3/1/2 → 返回 startAt 最早的 1；空/all done → null', () => {
    const a = item('3', 2);
    const b = item('1', 0);
    const c = item('2', 1);
    expect(nextPendingItem([a, b, c])?.id).toBe('1');
    expect(nextPendingItem([])).toBeNull();
    expect(nextPendingItem([{ ...a, done: true }, { ...b, done: true }])).toBeNull();
  });
});
