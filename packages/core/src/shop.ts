import { WEEK_MS } from './content';
import { hashSeed, mulberry32 } from './rng';
import type { EquipItem, RunState, StatKey, Stats } from './types';

export const SLOT_LABEL = '服装';
const COMMON_PRICE = 800;
const RARE_PRICE = 2000;

const OUTFITS = [
  { name: '素色练习服', stat: 'dance' as StatKey, value: 2 },
  { name: '旧卫衣', stat: 'dance' as StatKey, value: 2 },
  { name: '白衬衫', stat: 'acting' as StatKey, value: 2 },
  { name: '针织开衫', stat: 'vocal' as StatKey, value: 2 },
  { name: '运动外套', stat: 'dance' as StatKey, value: 2 },
  { name: '宽松T恤', stat: 'talk' as StatKey, value: 2 },
];

const RARE_OUTFITS = [
  { name: '打歌服·初版', stat: 'dance' as StatKey, value: 5 },
  { name: '古风长裙', stat: 'acting' as StatKey, value: 5 },
  { name: 'Lolita 套装', stat: 'talk' as StatKey, value: 5 },
  { name: '摇滚夹克', stat: 'vocal' as StatKey, value: 5 },
];

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

  return {
    state: {
      ...state,
      money: state.money - item.price,
      inventory: [...state.inventory, item],
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

export function equipItem(state: RunState, itemId: string): RunState {
  const item = state.inventory.find((i) => i.id === itemId);
  if (!item) return state;
  return {
    ...state,
    equipped: { ...state.equipped, [item.slot]: item.id },
  };
}

/** 装备加成后的实际属性（演出评分用它） */
export function effectiveStats(state: RunState): Stats {
  const stats: Stats = { ...state.stats };
  for (const slot of Object.keys(state.equipped) as (keyof typeof state.equipped)[]) {
    const id = state.equipped[slot];
    if (!id) continue;
    const item = state.inventory.find((i) => i.id === id);
    if (!item) continue;
    stats[item.affix.stat] = Math.min(100, stats[item.affix.stat] + item.affix.value);
  }
  return stats;
}
