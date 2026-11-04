import { describe, expect, it } from 'vitest';
import { createFans } from '../src/fans';
import { settle } from '../src/settle';
import {
  SHOW_SLOTS_DEFS,
  canBook,
  canCancel,
  checkBooking,
  cityDef,
  daysUntil,
  entryFee,
  npcOccupied,
  npcFillRatio,
  scheduleWeek,
  showVisibleIn,
} from '../src/shows';
import type { Booking, Party, RunState, ScheduleItem } from '../src/types';

const START_AT = Date.UTC(2026, 0, 1, 9, 0, 0);
const DAY = 30 * 60_000;

function baseRun(over: Partial<RunState> = {}): RunState {
  return {
    at: START_AT,
    startedAt: START_AT,
    stamina: 100,
    money: 5000,
    stats: { vocal: 100, dance: 100, acting: 100, talk: 100 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(100000),
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
    ...over,
  } as RunState;
}

const party: Party = { id: 'p1', name: '组合', members: [] };

function firstOcc(cityTier = 3, week = 0, seed = 's') {
  return scheduleWeek(cityTier, week, seed)[0]!;
}

describe('T-032 shows', () => {
  it('刷新数量：三线 1、一线 4、超一线 5～6；节日周 +1', () => {
    expect(scheduleWeek(3, 0, 'seed-a')).toHaveLength(1);
    expect(scheduleWeek(1, 0, 'seed-a')).toHaveLength(4);
    const top = scheduleWeek(0, 0, 'seed-a').length;
    expect(top).toBeGreaterThanOrEqual(5);
    expect(top).toBeLessThanOrEqual(6);
    expect(scheduleWeek(3, 0, 'seed-a', true)).toHaveLength(1);
    expect(scheduleWeek(1, 0, 'seed-a', true)).toHaveLength(5);
  });

  it('同日互斥：同一天已有报名 → day-taken', () => {
    const occ = firstOcc();
    const booking: Booking = {
      id: 'b1',
      occurrenceId: 'x',
      showId: 'other',
      name: 'other',
      type: 'circuit',
      tier: 'normal',
      slot: 1,
      startAt: occ.startAt,
      fee: 0,
      status: 'booked',
    };
    const r = canBook(baseRun(), party, occ, occ.slots[0]!, occ.startAt - 20 * DAY, [booking]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('day-taken');
  });

  it('宣发锁定：d=6 拒绝，d=8 可报', () => {
    const occ = firstOcc();
    const at6 = occ.startAt - 6 * DAY;
    const r6 = canBook(baseRun(), party, occ, occ.slots[0]!, at6);
    expect(r6.reason).toBe('announced');
    expect(canBook(baseRun(), party, occ, occ.slots[0]!, occ.startAt - 7 * DAY).reason).toBe('announced');
    const at8 = occ.startAt - 8 * DAY;
    const r8 = canBook(baseRun(), party, occ, occ.slots[0]!, at8);
    expect(r8.ok).toBe(true);
  });

  it('NPC 填充单调：d 从 60 递减到 7 空位不增，d=7 为 0', () => {
    const occ = firstOcc();
    let prev = -1;
    for (const d of [60, 21, 15, 14, 12, 10, 8, 7]) {
      const at = occ.startAt - d * DAY;
      const occupied = npcOccupied(occ, at, []).size;
      expect(occupied).toBeGreaterThanOrEqual(prev);
      prev = occupied;
    }
    expect(npcOccupied(occ, occ.startAt - 7 * DAY, []).size).toBe(occ.slots.length);
  });

  it('开场先满：d=11（0.42 档）的已占位是顺位前缀', () => {
    const occ = firstOcc();
    const n = occ.slots.length;
    const at = occ.startAt - 11 * DAY;
    const occupied = [...npcOccupied(occ, at, [])].sort((a, b) => a - b);
    const expected = occ.slots.slice(0, Math.round(n * npcFillRatio(11))).map((s) => s.slot);
    expect(occupied).toEqual(expected);
  });

  it('违约金：d=14 → 60%，d=16 → 0，d=6 → 不可取消', () => {
    const booking: Booking = {
      id: 'b1',
      occurrenceId: 'x',
      showId: 'x',
      name: 'x',
      type: 'circuit',
      tier: 'normal',
      slot: 1,
      startAt: START_AT + 20 * DAY,
      fee: 1000,
      status: 'booked',
    };
    expect(canCancel(booking, START_AT + 6 * DAY).penalty).toBe(600);
    expect(canCancel(booking, START_AT + 4 * DAY).penalty).toBe(0);
    expect(canCancel(booking, START_AT + 14 * DAY).ok).toBe(false);
  });

  it('出场费封顶：属性远超要求 uplift === 0.30', () => {
    const slot = firstOcc().slots[0]!;
    const { uplift } = entryFee(baseRun(), party, slot);
    expect(uplift).toBe(0.3);
  });

  it('老档兼容：缺省 city/bookings 的 RunState 能正常 settle', () => {
    const run = baseRun();
    const schedule: ScheduleItem[] = [
      { id: 's1', actionId: 'vocal-karaoke', startAt: START_AT, endAt: START_AT + 10 * 60_000 },
    ];
    const r = settle(run, schedule, START_AT, START_AT + 60 * 60_000, 'old', {
      routineChance: 0,
      storyEvents: false,
    });
    expect(r.executed).toEqual(['s1']);
    expect(r.state.at).toBeGreaterThan(START_AT);
  });

  it('演出项结算：booking 置 done，日志 kind=show，钱增加', () => {
    const occ = firstOcc();
    const slot = occ.slots[0]!;
    const booking: Booking = {
      id: 'bk1',
      occurrenceId: occ.id,
      showId: slot.showId,
      name: occ.name,
      type: occ.type,
      tier: 'normal',
      slot: slot.slot,
      startAt: occ.startAt,
      fee: 100,
      status: 'booked',
    };
    const run = baseRun({ city: 3, bookings: [booking] });
    const item: ScheduleItem = {
      id: 'sh1',
      actionId: `show:${slot.showId}`,
      kind: 'show',
      bookingId: 'bk1',
      slots: slot.slots,
      fixed: true,
      startAt: occ.startAt,
      endAt: occ.startAt + 10 * 60_000,
    };
    const r = settle(run, [item], occ.startAt, occ.startAt + 60 * 60_000, 'sh', {
      routineChance: 0,
      storyEvents: false,
    });
    expect(r.executed).toEqual(['sh1']);
    expect(r.state.bookings?.[0]?.status).toBe('done');
    expect(r.state.money).toBeGreaterThan(run.money);
    expect(r.state.log.some((l) => l.kind === 'show')).toBe(true);
  });

  it('NPC 留位边界：4 顺位 d=10 至少留 1，d=9 填满；1 顺位同理', () => {
    const four = scheduleWeek(3, 3, 'seed-abc').find((o) => o.slots.length === 4)!;
    expect(four).toBeTruthy();
    const free10 = four.slots.filter((s) => !npcOccupied(four, four.startAt - 10 * DAY, []).has(s.slot));
    expect(free10.length).toBeGreaterThanOrEqual(1);
    expect(npcOccupied(four, four.startAt - 9 * DAY, []).size).toBe(4);

    const single = [...scheduleWeek(2, 0, 'seed-a'), ...scheduleWeek(1, 0, 'seed-a')].find(
      (o) => o.slots.length === 1,
    )!;
    expect(single).toBeTruthy();
    expect(npcOccupied(single, single.startAt - 10 * DAY, []).size).toBe(0);
    expect(npcOccupied(single, single.startAt - 9 * DAY, []).size).toBe(1);
  });

  it('4 顺位 d=10 恰好留 1 个空位（0.65 档不许填满）', () => {
    const four = scheduleWeek(3, 3, 'seed-abc').find((o) => o.slots.length === 4)!;
    const occupied = npcOccupied(four, four.startAt - 10 * DAY, []);
    expect(occupied.size).toBe(3);
    expect(four.slots.filter((s) => !occupied.has(s.slot))).toHaveLength(1);
  });

  it('当天空槽：dayUsedSlots+slots>3 → day-full；2+1 可报', () => {
    const four = scheduleWeek(3, 3, 'seed-abc').find((o) => o.slots.length === 4)!;
    const slot = four.slots[0]!;
    const at = four.startAt - 20 * DAY;
    expect(canBook(baseRun(), party, four, slot, at, [], 3).reason).toBe('day-full');
    const single = [...scheduleWeek(2, 0, 'seed-a'), ...scheduleWeek(1, 0, 'seed-a')].find(
      (o) => o.slots.length === 1,
    )!;
    expect(canBook(baseRun(), party, single, single.slots[0]!, single.startAt - 20 * DAY, [], 3).reason).toBe(
      'day-full',
    );
    expect(canBook(baseRun(), party, single, single.slots[0]!, single.startAt - 20 * DAY, [], 2).ok).toBe(true);
  });

  it('提成逐项门槛：一项差 1 → uplift=0、fee=baseFee；全项过且超 50% → 0.30', () => {
    const four = scheduleWeek(3, 3, 'seed-abc').find((o) => o.slots.length === 4)!;
    const slot = four.slots[0]!;
    const need = slot.reqStats;
    const weak = baseRun({
      stats: {
        vocal: (need.vocal ?? 0) - 1,
        dance: 999,
        acting: 999,
        talk: 999,
      },
    });
    const r = entryFee(weak, party, slot);
    expect(r.uplift).toBe(0);
    expect(r.fee).toBe(slot.baseFee);

    const strong = baseRun({ stats: { vocal: 999, dance: 999, acting: 999, talk: 999 } });
    expect(entryFee(strong, party, slot).uplift).toBe(0.3);
  });

  it('checkBooking 暴露缺口与 daysUntil 天数', () => {    const occ = firstOcc();
    const weak = baseRun({ stats: { vocal: 0, dance: 0, acting: 0, talk: 0 }, fans: createFans(0) });
    const r = checkBooking(weak, null, occ, occ.slots[0]!);
    expect(r.ok).toBe(false);
    expect(daysUntil(occ.startAt, occ.startAt - 6 * DAY)).toBe(6);
  });

  it('T-033 场次数跟随 cities 配置', () => {
    for (let w = 0; w < 30; w += 1) {
      expect(scheduleWeek(3, w, 's')).toHaveLength(cityDef(3).weekend);
      expect(scheduleWeek(2, w, 's')).toHaveLength(cityDef(2).weekend);
      expect(scheduleWeek(1, w, 's')).toHaveLength(cityDef(1).weekend);
      const top = scheduleWeek(0, w, 's').length;
      expect(top).toBeGreaterThanOrEqual(cityDef(0).weekend + cityDef(0).midMin);
      expect(top).toBeLessThanOrEqual(cityDef(0).weekend + cityDef(0).midMax);
    }
  });

  it('T-033 顺位上限生效', () => {
    for (let w = 0; w < 50; w += 1) {
      expect(scheduleWeek(3, w, 's').every((o) => o.slots.length <= 7)).toBe(true);
      expect(scheduleWeek(2, w, 's').every((o) => o.slots.length <= 10)).toBe(true);
      expect(scheduleWeek(1, w, 's').every((o) => o.slots.length <= 15)).toBe(true);
    }
  });

  it('T-033 类型/级别白名单生效', () => {
    for (let w = 0; w < 50; w += 1) {
      for (const o of scheduleWeek(3, w, 's')) {
        expect(['circuit', 'shoot']).toContain(o.type);
        expect(o.tier).toBe('normal');
      }
      for (const o of scheduleWeek(2, w, 's')) {
        expect(['circuit', 'shoot', 'business']).toContain(o.type);
        expect(['normal', 'large']).toContain(o.tier);
      }
    }
    const def = SHOW_SLOTS_DEFS[0]!;
    expect(typeof showVisibleIn(0, def)).toBe('boolean');
  });

  it('T-033 普通级别占大头（权重非均匀）', () => {
    let total = 0;
    let normal = 0;
    for (let w = 0; w < 100; w += 1) {
      for (const o of scheduleWeek(0, w, 's')) {
        total += 1;
        if (o.tier === 'normal') normal += 1;
      }
    }
    expect(total).toBeGreaterThan(400);
    expect(normal / total).toBeGreaterThanOrEqual(0.5);
    expect(normal / total).toBeLessThanOrEqual(0.92);
  });

  it('T-033 同周不重复；同 seed 同结果', () => {
    for (let w = 0; w < 30; w += 1) {
      const ids = scheduleWeek(0, w, 's').map((o) => o.showId);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(scheduleWeek(1, 7, 'x')).toEqual(scheduleWeek(1, 7, 'x'));
  });

  it('T-033 festival 只在节日周出现', () => {
    for (let w = 0; w < 50; w += 1) {
      expect(scheduleWeek(1, w, 's').some((o) => o.tier === 'festival')).toBe(false);
    }
    expect(scheduleWeek(1, 0, 's', true).some((o) => o.tier === 'festival')).toBe(true);
  });

  it('T-033 城市越大池子越大（并集）', () => {
    const one = new Set<string>();
    const two = new Set<string>();
    for (let w = 0; w < 200; w += 1) {
      for (const o of scheduleWeek(1, w, 's')) one.add(o.showId);
      for (const o of scheduleWeek(2, w, 's')) two.add(o.showId);
    }
    for (const id of two) expect(one.has(id)).toBe(true);
  });

  it('T-034 npcFillRatio 曲线边界', () => {
    expect(npcFillRatio(60)).toBe(0);
    expect(npcFillRatio(21)).toBe(0);
    expect(npcFillRatio(15)).toBe(0);
    expect(npcFillRatio(14)).toBe(0.05);
    expect(npcFillRatio(13)).toBe(0.15);
    expect(npcFillRatio(12)).toBe(0.28);
    expect(npcFillRatio(11)).toBe(0.45);
    expect(npcFillRatio(10)).toBe(0.65);
    expect(npcFillRatio(9)).toBe(1);
    expect(npcFillRatio(8)).toBe(1);
    expect(npcFillRatio(7)).toBe(1);
    expect(npcFillRatio(0)).toBe(1);
  });

  it('T-034 集中性：4 顺位 d15=0、d10=3、d9=4、d7=4', () => {
    const four = scheduleWeek(3, 3, 'seed-abc').find((o) => o.slots.length === 4)!;
    const count = (d: number) => npcOccupied(four, four.startAt - d * DAY, []).size;
    expect(count(15)).toBe(0);
    expect(count(10)).toBe(3);
    expect(count(9)).toBe(4);
    expect(count(7)).toBe(4);
  });

  it('T-034 单顺位 d10=0、d9=1', () => {
    const single = [...scheduleWeek(2, 0, 'seed-a'), ...scheduleWeek(1, 0, 'seed-a')].find(
      (o) => o.slots.length === 1,
    )!;
    expect(npcOccupied(single, single.startAt - 10 * DAY, []).size).toBe(0);
    expect(npcOccupied(single, single.startAt - 9 * DAY, []).size).toBe(1);
  });

  it('T-034 可达性：一线 4 顺位 d=9 时 NPC 占满', () => {
    const four = scheduleWeek(1, 3, 'seed-abc').find((o) => o.slots.length >= 4)!;
    const npc = npcOccupied(four, four.startAt - 9 * DAY, []);
    expect(npc.size).toBe(four.slots.length);
  });

  it('T-034 玩家已占顺位不被 NPC 抢', () => {
    const four = scheduleWeek(3, 3, 'seed-abc').find((o) => o.slots.length === 4)!;
    const occupied = npcOccupied(four, four.startAt - 10 * DAY, [1]);
    expect(occupied.has(1)).toBe(false);
    expect(occupied.size).toBe(3);
  });
});
