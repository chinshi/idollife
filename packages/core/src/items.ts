/**
 * 道具系统（T-019）：消耗品 / 四槽装备 / 背包条目。
 *
 * 数据来源：content/all.xlsx 的 items / equipments 表 → data/items.json、data/equipments.json。
 * 铁口径（T-016c/d）：隐藏属性（self/others/fit/desire/scandal）**任何界面都不显示数值**——
 * 本文件提供 `isHiddenEffectKey()` 给客户端 tooltip 过滤，日志也只写显性部分；隐藏效果照常写进 axes/负向。
 * 纯函数：不碰 Date.now / Math.random / DOM / localStorage。
 */
import equipsJson from '../data/equipments.json';
import itemsJson from '../data/items.json';
import { STAMINA_MAX } from './content';
import { matchesCondition, type RawRequires } from './expr';
import type {
  EquipCategory,
  EquipItem,
  EquipSlot,
  InventoryEntry,
  Rarity,
  RunState,
  Stats,
} from './types';

export const RARITY_LABEL: Record<Rarity, string> = {
  common: '普通',
  uncommon: '常见',
  rare: '稀有',
  legendary: '传说',
};

/** 客户端 CSS 类用的 key（颜色在 styles.css） */
export const RARITY_COLOR_KEY: Record<Rarity, string> = {
  common: 'common',
  uncommon: 'uncommon',
  rare: 'rare',
  legendary: 'legendary',
};

/**
 * 槽位/类别中文名（T-022）。
 * 键同时覆盖「角色槽位」（7 个）与「装备类别」（accessory 兜底）：
 * - 库存背包里的装备展示用类别（`EquipDef.slot` 是 category）；
 * - 装备面板的状态展示用具体槽位（accessory1..4）。
 */
export const EQUIP_SLOT_LABEL: Record<string, string> = {
  outfit: '服装',
  hair: '发型',
  haircolor: '发色',
  accessory1: '饰品一',
  accessory2: '饰品二',
  accessory3: '饰品三',
  accessory4: '饰品四',
  accessory: '饰品',
};

/** 7 个角色槽位（展示/遍历用；不含类别兜底） */
export const EQUIP_SLOTS: EquipSlot[] = [
  'outfit',
  'hair',
  'haircolor',
  'accessory1',
  'accessory2',
  'accessory3',
  'accessory4',
];

/** 饰品可用的 4 个通用槽 */
export const ACCESSORY_SLOTS: EquipSlot[] = [
  'accessory1',
  'accessory2',
  'accessory3',
  'accessory4',
];

/** 单槽类别 → 角色槽位（饰品不在内） */
const SINGLE_SLOT: Record<Exclude<EquipCategory, 'accessory'>, EquipSlot> = {
  outfit: 'outfit',
  hair: 'hair',
  haircolor: 'haircolor',
};

/** 哪个角色槽位允许放某类装备（饰品 4 槽通用） */
export function slotsForCategory(category: EquipCategory): EquipSlot[] {
  return category === 'accessory' ? ACCESSORY_SLOTS : [SINGLE_SLOT[category]];
}

export interface ConsumeDef {
  id: string;
  type: 'food' | 'medicine';
  name: string;
  rarity: Rarity;
  icon: string;
  /** 显性效果（可能含 weight/appearance/fatigue 等恢复量） */
  effects: Record<string, number>;
  /** 负面效果 */
  negative: Record<string, number>;
  /** 隐藏效果（只应用、不展示） */
  hidden: Record<string, number>;
  text: string;
  source: string;
  price: number;
}

export interface EquipDef {
  id: string;
  /** 配置表的 slot 语义是「类别」（EquipCategory），不是角色槽位（EquipSlot） */
  slot: EquipCategory;
  name: string;
  rarity: Rarity;
  icon: string;
  requirement?: RawRequires | string;
  /** 显性加成（四维） */
  bonus: Record<string, number>;
  /** 隐形加成（只应用、用 hiddenText 表达） */
  hidden: Record<string, number>;
  hiddenText: string;
  text: string;
  source: string;
  price: number;
}

export const ITEMS: ConsumeDef[] = itemsJson.items as unknown as ConsumeDef[];
export const EQUIPS: EquipDef[] = equipsJson.equipments as unknown as EquipDef[];

export const ITEMS_MAP: Record<string, ConsumeDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const EQUIPS_MAP: Record<string, EquipDef> = Object.fromEntries(EQUIPS.map((e) => [e.id, e]));

/** 隐藏属性域：tooltip / 日志 / 面板都不显示这些数值 */
export const HIDDEN_EFFECT_KEYS = ['self', 'others', 'fit', 'desire', 'scandal'];

export function isHiddenEffectKey(key: string): boolean {
  return HIDDEN_EFFECT_KEYS.includes(key);
}

export const MAX_STACK = 99;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const AXIS_KEYS: Array<keyof RunState['axes']> = ['self', 'others', 'fit'];
const NEGATIVE_KEYS: Array<keyof NonNullable<RunState['negatives']>> = [
  'stress',
  'restless',
  'fatigue',
  'desire',
  'scandal',
];

/** ---------- 背包条目解析 ---------- */

export function consumeDefOf(entry: InventoryEntry): ConsumeDef | null {
  return entry.itemId ? (ITEMS_MAP[entry.itemId] ?? null) : null;
}

export function equipDefOf(entry: InventoryEntry): EquipDef | null {
  return entry.itemId ? (EQUIPS_MAP[entry.itemId] ?? null) : null;
}

export function isEquipmentEntry(entry: InventoryEntry): boolean {
  return !!equipDefOf(entry) || !!entry.legacy;
}

export function entryName(entry: InventoryEntry): string {
  return equipDefOf(entry)?.name ?? consumeDefOf(entry)?.name ?? entry.legacy?.name ?? entry.itemId;
}

export function entryRarity(entry: InventoryEntry): Rarity {
  const def = equipDefOf(entry) ?? consumeDefOf(entry);
  if (def) return def.rarity;
  // 旧 shop 装备：common → 白，rare → 绿（T-019 迁移口径）
  return entry.legacy?.rarity === 'rare' ? 'uncommon' : 'common';
}

export function entryTypeLabel(entry: InventoryEntry): string {
  const consume = consumeDefOf(entry);
  if (consume) return consume.type === 'food' ? '食物' : '药品';
  const equip = equipDefOf(entry);
  if (equip) return `装备·${EQUIP_SLOT_LABEL[equip.slot] ?? equip.slot}`;
  if (entry.legacy) return `装备·${EQUIP_SLOT_LABEL.outfit}`;
  return '物品';
}

/** 显性效果逐行（消耗品：显性 + 负面，过滤掉隐藏属性；delta 正负由客户端着色） */
export function visibleEffectLines(entry: InventoryEntry): Array<{ key: string; delta: number }> {
  const def = consumeDefOf(entry);
  if (!def) return [];
  const out: Array<{ key: string; delta: number }> = [];
  for (const [key, delta] of [...Object.entries(def.effects), ...Object.entries(def.negative)]) {
    if (isHiddenEffectKey(key)) continue;
    out.push({ key, delta });
  }
  return out;
}

/** 装备的显性加成逐行（只四维） */
export function equipBonusLines(def: EquipDef): Array<{ key: string; delta: number }> {
  return Object.entries(def.bonus).map(([key, delta]) => ({ key, delta }));
}

/** 装备要求是否满足 */
export function meetsEquipRequirement(state: RunState, def: EquipDef): boolean {
  const req = def.requirement;
  if (req === undefined || req === null) return true;
  if (typeof req === 'object' && Object.keys(req).length === 0) return true;
  return matchesCondition(state, req);
}

/** ---------- 数值应用 ---------- */

interface AppliedDelta {
  key: string;
  delta: number;
}

/** 应用显性/负面效果（状态/钱/四维里的 stamina/mood 夹到上限） */
function applyVisible(state: RunState, effects: Record<string, number>): RunState {
  const next: RunState = {
    ...state,
    stats: { ...state.stats },
    innate: { ...(state.innate ?? {}) },
    negatives: { ...(state.negatives ?? {}) },
  };
  for (const [key, raw] of Object.entries(effects)) {
    const delta = Number(raw) || 0;
    if (!delta) continue;
    if (key === 'stamina') next.stamina = clamp(next.stamina + delta, 0, STAMINA_MAX);
    else if (key === 'mood') next.mood = clamp((next.mood ?? 70) + delta, 0, 100);
    else if (key === 'weight') next.innate = { ...next.innate, weight: (next.innate?.weight ?? 60) + delta };
    else if (key === 'appearance')
      next.innate = { ...next.innate, appearance: (next.innate?.appearance ?? 60) + delta };
    else if ((STAT_EFFECT_KEYS as string[]).includes(key)) {
      next.stats[key as keyof Stats] = clamp(next.stats[key as keyof Stats] + delta, 0, 100);
    } else if (NEGATIVE_KEYS.includes(key as (typeof NEGATIVE_KEYS)[number])) {
      next.negatives![key as (typeof NEGATIVE_KEYS)[number]] = clamp(
        (next.negatives![key as (typeof NEGATIVE_KEYS)[number]] ?? 0) + delta,
        0,
        100,
      );
    } else {
      // 未知键：忽略（check:data 会拦住）
    }
  }
  return next;
}
const STAT_EFFECT_KEYS: Array<keyof Stats> = ['vocal', 'dance', 'acting', 'talk'];

/** 应用隐藏效果：self/others/fit 进三轴，desire/scandal 等进负向；sign=1 生效 / -1 卸下 */
function applyHidden(state: RunState, effects: Record<string, number>, sign = 1): RunState {
  const next: RunState = {
    ...state,
    axes: { ...state.axes },
    negatives: { ...(state.negatives ?? {}) },
  };
  for (const [key, raw] of Object.entries(effects)) {
    const delta = (Number(raw) || 0) * sign;
    if (!delta) continue;
    if (AXIS_KEYS.includes(key as keyof RunState['axes'])) {
      next.axes[key as keyof RunState['axes']] = next.axes[key as keyof RunState['axes']] + delta;
    } else if (NEGATIVE_KEYS.includes(key as (typeof NEGATIVE_KEYS)[number])) {
      next.negatives![key as (typeof NEGATIVE_KEYS)[number]] = clamp(
        (next.negatives![key as (typeof NEGATIVE_KEYS)[number]] ?? 0) + delta,
        0,
        100,
      );
    }
  }
  return next;
}

function visibleSummary(lines: AppliedDelta[]): string {
  const LABELS: Record<string, string> = {
    stamina: '体力',
    mood: '心情',
    stress: '压力',
    weight: '体重',
    appearance: '样貌',
    fatigue: '积劳',
    restless: '焦躁',
  };
  return lines
    .map(({ key, delta }) => `${LABELS[key] ?? key} ${delta > 0 ? '+' : ''}${delta}`)
    .join('、');
}

/** ---------- 背包操作 ---------- */

/** 加一件消耗品（同 itemId 堆叠，上限 99） */
export function addConsumable(state: RunState, itemId: string, count = 1): RunState {
  const list = [...(state.inventory ?? [])];
  const idx = list.findIndex((e) => e.itemId === itemId && !e.legacy);
  if (idx >= 0) {
    list[idx] = { ...list[idx]!, count: Math.min(MAX_STACK, list[idx]!.count + count) };
  } else {
    list.push({ id: `inv-${itemId}-${list.length}`, itemId, count: Math.min(MAX_STACK, count) });
  }
  return { ...state, inventory: list };
}

/** 加一件装备（每件一条，count 恒 1） */
export function addEquipment(state: RunState, itemId: string): RunState {
  const list = [...(state.inventory ?? [])];
  list.push({ id: `inv-${itemId}-${list.length}`, itemId, count: 1 });
  return { ...state, inventory: list };
}

/** ---------- 使用消耗品 ---------- */

export type UseItemResult = 'ok' | 'not-found' | 'not-usable';

export interface UseItemOutcome {
  state: RunState;
  result: UseItemResult;
  notice: string;
}

export function useItem(state: RunState, invId: string): UseItemOutcome {
  const list = state.inventory ?? [];
  const idx = list.findIndex((e) => e.id === invId);
  if (idx < 0) return { state, result: 'not-found', notice: '找不到这个物品。' };
  const entry = list[idx]!;
  const def = consumeDefOf(entry);
  if (!def) return { state, result: 'not-usable', notice: '这个东西不能使用。' };

  // 显性 + 负面一起进状态；隐藏效果单独应用（不写日志、不进 notice）
  let next = applyVisible(state, { ...def.effects, ...def.negative });
  next = applyHidden(next, def.hidden);

  const lines = visibleEffectLines(entry);
  const summary = visibleSummary(lines);
  const notice = `使用了「${def.name}」${summary ? '：' + summary : ''}。`;

  const inv = [...(next.inventory ?? [])];
  const cur = inv[idx]!;
  if (cur.count <= 1) inv.splice(idx, 1);
  else inv[idx] = { ...cur, count: cur.count - 1 };
  next = {
    ...next,
    inventory: inv,
    log: [
      ...next.log,
      {
        at: next.at,
        actionId: `use-item:${def.id}`,
        text: notice,
        staminaDelta: Number(def.effects.stamina ?? 0) + Number(def.negative.stamina ?? 0),
        statDelta: {},
        kind: 'action',
      },
    ],
  };
  return { state: next, result: 'ok', notice };
}

/** ---------- 装备 ---------- */

export type EquipResult = 'ok' | 'not-found' | 'not-equipment' | 'requirement';

export interface EquipOutcome {
  state: RunState;
  result: EquipResult;
  notice: string;
}

function hiddenOfEquipped(state: RunState, entryId: string): Record<string, number> {
  const entry = (state.inventory ?? []).find((e) => e.id === entryId);
  if (!entry) return {};
  return equipDefOf(entry)?.hidden ?? {};
}

function unequipSlot(state: RunState, slot: EquipSlot): RunState {
  const current = state.equipped?.[slot];
  if (!current) return state;
  const next = applyHidden(state, hiddenOfEquipped(state, current), -1);
  const equipped = { ...next.equipped };
  delete equipped[slot];
  return { ...next, equipped };
}

export function equippedSlotOf(state: RunState, invId: string): EquipSlot | null {
  for (const slot of EQUIP_SLOTS) {
    if (state.equipped?.[slot] === invId) return slot;
  }
  return null;
}

/** 给某类装备挑一个落点：单槽类别固定；饰品优先空槽，四槽全满则替换 accessory1 */
function resolveTargetSlot(state: RunState, category: EquipCategory, targetSlot?: EquipSlot): EquipSlot {
  if (category !== 'accessory') return SINGLE_SLOT[category];
  if (targetSlot && ACCESSORY_SLOTS.includes(targetSlot)) return targetSlot;
  const empty = ACCESSORY_SLOTS.find((s) => !state.equipped?.[s]);
  return empty ?? 'accessory1';
}

/**
 * 装备（T-022）：
 * - outfit/hair/haircolor 固定各自的槽，同槽换装自动卸下旧的（含隐形加成还原）
 * - accessory 传入 targetSlot（accessory1..4）就装该槽；不传则填第一个空槽，四槽全满替换 accessory1
 * - 同一件装备不会同时出现在两个槽：若已装备在别的槽，先卸下原槽
 */
export function equipItem(state: RunState, invId: string, targetSlot?: EquipSlot): EquipOutcome {
  const entry = (state.inventory ?? []).find((e) => e.id === invId);
  if (!entry) return { state, result: 'not-found', notice: '找不到这个装备。' };
  const def = equipDefOf(entry);
  if (!def) return { state, result: 'not-equipment', notice: '这个东西不能装备。' };
  if (!meetsEquipRequirement(state, def)) {
    return { state, result: 'requirement', notice: `装备要求未满足：${entryName(entry)}` };
  }

  const slot = resolveTargetSlot(state, def.slot, targetSlot);
  if (state.equipped?.[slot] === invId) {
    return { state, result: 'ok', notice: `已装备「${def.name}」。` };
  }

  // 去重：该件装备已在别的槽 → 先卸下原槽
  let next = state;
  const already = equippedSlotOf(next, invId);
  if (already) next = unequipSlot(next, already);

  // 同槽旧装备（若有）先卸下，再挂新的
  next = unequipSlot(next, slot);
  next = applyHidden(next, def.hidden);
  next = { ...next, equipped: { ...next.equipped, [slot]: invId } };
  return { state: next, result: 'ok', notice: `装备了「${def.name}」。` };
}

/**
 * 卸下装备（T-022）：接受 7 个角色槽位；
 * 兼容传入类别（'accessory' 会挑第一个已装备的饰品槽，供旧调用/测试使用）。
 */
export function unequipItem(
  state: RunState,
  slot: EquipSlot | EquipCategory,
): { state: RunState; notice: string } {
  const actual: EquipSlot =
    slot === 'accessory'
      ? (ACCESSORY_SLOTS.find((s) => !!state.equipped?.[s]) ?? 'accessory1')
      : slot;
  const current = state.equipped?.[actual];
  if (!current) return { state, notice: '这个槽位没有装备。' };
  const next = unequipSlot(state, actual);
  return { state: next, notice: '已卸下装备。' };
}

/** 装备加成后的实际属性（演出评分用它）：7 槽显性加成并入四维；旧装备用 legacy.affix 兜底 */
export function effectiveStats(state: RunState): Stats {
  const stats: Stats = { ...state.stats };
  for (const slot of EQUIP_SLOTS) {
    const invId = state.equipped?.[slot];
    if (!invId) continue;
    const entry = (state.inventory ?? []).find((e) => e.id === invId);
    if (!entry) continue;
    const def = equipDefOf(entry);
    if (def) {
      for (const [key, value] of Object.entries(def.bonus)) {
        if ((STAT_EFFECT_KEYS as string[]).includes(key)) {
          stats[key as keyof Stats] = Math.min(100, stats[key as keyof Stats] + value);
        }
      }
    } else if (entry.legacy) {
      const { stat, value } = entry.legacy.affix;
      stats[stat] = Math.min(100, stats[stat] + value);
    }
  }
  return stats;
}

/** 旧 shop 装备 → 新背包条目（按名称映射到 equipments；映射不到就保留 legacy 原样渲染） */
export function migrateEquipItem(item: EquipItem, index: number): InventoryEntry {
  const mapped = EQUIPS.find((e) => e.name === item.name);
  return {
    id: item.id || `legacy-${index}`,
    itemId: mapped?.id ?? '',
    count: 1,
    legacy: mapped ? undefined : item,
  };
}
