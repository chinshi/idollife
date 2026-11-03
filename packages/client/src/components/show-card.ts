import { daysUntil, type ShowOccurrence } from '@idollife/core';

export type ShowCardState = 'open' | 'announced' | 'full';

/** 报名卡状态：d≤7 一定已宣发；否则看是否还有空位 */
export function cardState(
  occ: ShowOccurrence,
  at: number,
  npc: Set<number>,
  mineSlots: number[] = [],
): ShowCardState {
  if (daysUntil(occ.startAt, at) <= 7) return 'announced';
  const mine = new Set(mineSlots);
  const hasOpen = occ.slots.some((s) => !npc.has(s.slot) && !mine.has(s.slot));
  return hasOpen ? 'open' : 'full';
}

/** 默认选中的顺位下标（0-based）；没有空位返回 -1 */
export function firstOpenSlotIndex(
  occ: ShowOccurrence,
  npc: Set<number>,
  mineSlots: number[] = [],
): number {
  const mine = new Set(mineSlots);
  return occ.slots.findIndex((s) => !npc.has(s.slot) && !mine.has(s.slot));
}
