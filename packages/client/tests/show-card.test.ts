import { describe, expect, it } from 'vitest';
import type { ShowOccurrence, ShowSlotDef } from '@idollife/core';
import { cardState, firstOpenSlotIndex } from '../src/components/show-card';

const at = Date.UTC(2026, 0, 1, 9, 0, 0);
const DAY = 30 * 60_000;

function slot(n: number): ShowSlotDef {
  return {
    showId: 'x',
    name: 'x',
    type: 'circuit',
    tier: 'normal',
    slotCount: 4,
    weight: 80,
    slot: n,
    slotName: `${n}`,
    weekday: 'sat',
    slots: 1,
    baseFee: 1,
    ticketBase: 1,
    goodsBase: 1,
    statGain: 1,
    fanGain: 1,
    reqFame: 0,
    reqStats: {},
    reqParty: 0,
    reqFans: 0,
    audience: { stage: 1, gachi: 0, music: 0, live: 0, growth: 0, power: 0 },
    songs: [],
    gift: '',
    visibleCond: {},
    npcWeight: 1,
    festival: 'none',
  };
}

function occ(startAt: number): ShowOccurrence {
  return {
    id: '0:x',
    showId: 'x',
    name: 'x',
    type: 'circuit',
    tier: 'normal',
    slotCount: 4,
    startAt,
    festival: 'none',
    slots: [slot(1), slot(2), slot(3), slot(4)],
  };
}

describe('T-033 报名卡状态', () => {
  it('cardState：d15 有空位 open、d5 announced、d15 全占 full', () => {
    const far = occ(at + 15 * DAY);
    expect(cardState(far, at, new Set([1]), [])).toBe('open');
    expect(cardState(occ(at + 5 * DAY), at, new Set(), [])).toBe('announced');
    expect(cardState(far, at, new Set([1, 2, 3, 4]), [])).toBe('full');
  });

  it('firstOpenSlotIndex：全占 -1；第一个占、第二个空 → 1', () => {
    const o = occ(at + 15 * DAY);
    expect(firstOpenSlotIndex(o, new Set([1, 2, 3, 4]))).toBe(-1);
    expect(firstOpenSlotIndex(o, new Set([1]))).toBe(1);
  });
});
