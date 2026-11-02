import shopJson from '../data/shop.json';
import { WEEK_MS } from './content';
import { migrateEquipItem } from './items';
import { hashSeed, mulberry32 } from './rng';
import type { EquipItem, RunState, StatKey } from './types';

export const SLOT_LABEL = '服装';
const COMMON_PRICE = shopJson.shop.commonPrice;
const RARE_PRICE = shopJson.shop.rarePrice;

const OUTFITS = shopJson.shop.common.map((o) => ({
  name: o.name,
  stat: o.stat as StatKey,
  statName: o.statName,
  value: o.value,
}));

const RARE_OUTFITS = shopJson.shop.rare.map((o) => ({
  name: o.name,
  stat: o.stat as StatKey,
  statName: o.statName,
  value: o.value,
}));

/** 当前游戏周（从 0 起） */
export function weekOf(at: number): number {
  return Math.floor(at / WEEK_MS);
}

/**
 * 本周货架：按「种子 + 游戏周」确定性生成，
 * 同一周内重复调用结果一致（不需要存库）。
 */
export function getShop(state: RunState, seed: string): EquipItem[] {
  const week = weekOf(state.at);
  const rng = mulberry32(hashSeed(`${seed}:shop:${week}`));

  const items: EquipItem[] = [];
  const used = new Set<number>();

  for (let i = 0; i < 3; i++) {
    let idx = Math.floor(rng() * OUTFITS.length);
    let guard = 0;
    while (used.has(idx) && guard++ < 10) idx = Math.floor(rng() * OUTFITS.length);
    used.add(idx);
    const base = OUTFITS[idx]!;
    items.push({
      id: `w${week}-c${i}`,
      name: base.name,
      slot: 'outfit',
      rarity: 'common',
      price: COMMON_PRICE,
      affix: { stat: base.stat, value: base.value },
    });
  }

  const rare = RARE_OUTFITS[Math.floor(rng() * RARE_OUTFITS.length)]!;
  items.push({
    id: `w${week}-r`,
    name: rare.name,
    slot: 'outfit',
    rarity: 'rare',
    price: RARE_PRICE,
    affix: { stat: rare.stat, value: rare.value },
  });

  return items;
}

export type BuyResult = 'ok' | 'poor' | 'not-found';

export function buyItem(state: RunState, item: EquipItem): { state: RunState; result: BuyResult } {
  if (state.money < item.price) return { state, result: 'poor' };

  // T-019：旧商店买到的装备按名称映射进新装备表（migrateEquipItem），映射不到保留 legacy
  const entry = migrateEquipItem(item, state.inventory.length);
  return {
    state: {
      ...state,
      money: state.money - item.price,
      inventory: [...state.inventory, entry],
      log: [
        ...state.log,
        {
          at: state.at,
          actionId: 'buy',
          text: `买下了「${item.name}」（${item.affix.stat} +${item.affix.value}）。`,
          staminaDelta: 0,
          statDelta: {},
          kind: 'action',
        },
      ],
    },
    result: 'ok',
  };
}
