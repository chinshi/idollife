import { describe, expect, it } from 'vitest';
import { buyItem, effectiveStats, equipItem, getShop, weekOf } from '../src/shop';
import { createFans } from '../src/fans';
import { WEEK_MS } from '../src/content';
import type { RunState } from '../src/types';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

function base(overrides: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 5000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(0),
    parties: [],
    friends: [],
    activePartyId: null,
    debuted: false,
    inventory: [],
    equipped: {},
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...overrides,
  };
}

describe('商店与装备', () => {
  it('同一游戏周货架相同，下一周不同', () => {
    const a = getShop(base(), 's1');
    const b = getShop(base(), 's1');
    const next = getShop(base({ at: T0 + WEEK_MS }), 's1');

    expect(a.map((i) => i.name)).toEqual(b.map((i) => i.name));
    expect(weekOf(T0 + WEEK_MS)).toBe(weekOf(T0) + 1);
    expect(next[0]!.id).not.toBe(a[0]!.id);
  });

  it('钱不够买不了', () => {
    const item = getShop(base(), 's1')[0]!;
    const { state, result } = buyItem(base({ money: 10 }), item);
    expect(result).toBe('poor');
    expect(state.inventory).toHaveLength(0);
  });

  it('买下后扣钱并入背包', () => {
    const item = getShop(base(), 's1')[0]!;
    const { state, result } = buyItem(base(), item);
    expect(result).toBe('ok');
    expect(state.money).toBe(5000 - item.price);
    expect(state.inventory).toHaveLength(1);
  });

  it('装备后 effectiveStats 生效', () => {
    const item = getShop(base(), 's1').find((i) => i.rarity === 'rare')!;
    const bought = buyItem(base(), item).state;
    const equipped = equipItem(bought, item.id);

    const eff = effectiveStats(equipped);
    expect(eff[item.affix.stat]).toBe(10 + item.affix.value);
  });
});
