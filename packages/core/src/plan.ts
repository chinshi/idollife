/**
 * 行程槽位落位（T-027）。
 *
 * 一天 = slotsPerDay 个槽；一个行动按 ceil(duration/actionMs) 占槽。
 * 规则：先补中间空洞（同一天内连续 span 个空槽），最后才追加到末尾。
 * 纯函数：不读 Date.now / Math.random / DOM。
 */
import { START_AT } from './content';
import type { ScheduleItem } from './types';

/** 排程里下一条要执行的（未完成 + 按 startAt 升序第一条）；没有则 null */
export function nextPendingItem(schedule: ScheduleItem[]): ScheduleItem | null {
  let next: ScheduleItem | null = null;
  for (const item of schedule) {
    if (item.done) continue;
    if (!next || item.startAt < next.startAt) next = item;
  }
  return next;
}

/** 未完成项按 startAt 升序（给 UI 列表/计数用；nextPendingItem 是它的第一项） */
export function sortedPending(schedule: ScheduleItem[]): ScheduleItem[] {
  return schedule.filter((s) => !s.done).sort((a, b) => a.startAt - b.startAt);
}

export interface SlotPlanInput {
  schedule: ScheduleItem[];
  /** 当前游戏时间 run.at */
  at: number;
  durationMs: number;
  dayMs: number;
  actionMs: number;
  slotsPerDay: number;
  /** 最多向后找多少天，默认 60 */
  maxDays?: number;
}

/** 某一天的一个槽位（T-030：弹窗与主界面共用） */
export interface DaySlot {
  item: ScheduleItem | null;
  /** 被上一项跨槽占用（item 为 null 且 covered=true 时不渲染空格） */
  covered: boolean;
  index: number;
}

/**
 * 把一天的排程落成 slots 个槽位；跨槽项用 covered 标记被占位。
 * 同起点重叠时后者丢弃（与旧弹窗行为一致）。
 */
export function buildDaySlots(
  items: ScheduleItem[],
  dayStart: number,
  slots: number,
  actionMs: number,
  spanOf: (item: ScheduleItem) => number,
): DaySlot[] {
  const out: DaySlot[] = Array.from({ length: slots }, (_, i) => ({
    item: null,
    covered: false,
    index: i,
  }));
  for (const s of [...items].sort((a, b) => a.startAt - b.startAt)) {
    const idx = Math.min(slots - 1, Math.max(0, Math.round((s.startAt - dayStart) / actionMs)));
    if (out[idx]!.item) continue;
    out[idx]!.item = s;
    const sp = Math.min(slots, idx + Math.max(1, spanOf(s)));
    for (let i = idx; i < sp; i += 1) out[i]!.covered = true;
  }
  return out;
}

interface Occ {
  startAt: number;
  endAt: number;
}

export function placeAction(input: SlotPlanInput): { startAt: number; filled: boolean } {
  const { schedule, at, durationMs, dayMs, actionMs, slotsPerDay } = input;
  const maxDays = input.maxDays ?? 60;
  const span = Math.max(1, Math.ceil(durationMs / actionMs));
  const base = START_AT;
  const dayOf = (t: number) => Math.floor((t - base) / dayMs);
  const dayStartOf = (d: number) => base + d * dayMs;

  // 1) 实际占用区间（done + pending 都算）
  const occ: Occ[] = schedule.map((s) => ({ startAt: s.startAt, endAt: s.endAt }));

  // 2) 逐日占用表：旧存档可能不对齐，用 round 落槽、并夹在当天内
  const busy = new Map<number, boolean[]>();
  for (const o of occ) {
    const d = dayOf(o.startAt);
    const slots = busy.get(d) ?? new Array<boolean>(slotsPerDay).fill(false);
    const local = o.startAt - dayStartOf(d);
    const startSlot = Math.min(
      slotsPerDay - 1,
      Math.max(0, Math.round(local / actionMs)),
    );
    const itemSpan = Math.max(1, Math.ceil((o.endAt - o.startAt) / actionMs));
    for (let i = startSlot; i < Math.min(slotsPerDay, startSlot + itemSpan); i += 1) {
      slots[i] = true;
    }
    busy.set(d, slots);
  }

  const overlaps = (startAt: number) =>
    occ.some((o) => startAt < o.endAt && startAt + durationMs > o.startAt);

  // 3) 从头扫，找第一段能容纳的连续空槽（同一天内、start >= at）
  const startDay = Math.max(0, dayOf(at));
  for (let d = startDay; d < startDay + maxDays; d += 1) {
    if (span > slotsPerDay) break;
    const slots = busy.get(d) ?? new Array<boolean>(slotsPerDay).fill(false);
    for (let s = 0; s <= slotsPerDay - span; s += 1) {
      const candidate = dayStartOf(d) + s * actionMs;
      if (candidate < at) continue;
      let free = true;
      for (let i = s; i < s + span; i += 1) {
        if (slots[i]) {
          free = false;
          break;
        }
      }
      if (!free) continue;
      if (overlaps(candidate)) continue;
      return { startAt: candidate, filled: candidate !== appendStart() };
    }
  }

  // 4) 兜底：追加到末尾
  return { startAt: appendStart(), filled: false };

  function appendStart(): number {
    let cursor = Math.max(
      at,
      schedule.reduce((m, s) => Math.max(m, s.endAt), 0),
    );
    for (let guard = 0; guard < maxDays; guard += 1) {
      const d = Math.max(0, dayOf(cursor));
      const dayStart = dayStartOf(d);
      const used = busy.get(d)?.filter(Boolean).length ?? 0;
      if (used + span <= slotsPerDay && cursor + durationMs <= dayStart + dayMs) {
        return cursor;
      }
      cursor = dayStart + dayMs;
    }
    return cursor;
  }
}
