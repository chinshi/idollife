/**
 * 属性表派生：分类、标签、可见性
 */
import { RAW_ATTRIBUTES, type RawAttribute } from './data';
import type { Axes, RunState, Stats } from './types';

export interface AttributeDef extends RawAttribute {
  /** 是否在主界面显示 */
  visible: boolean;
}

export const ATTRIBUTES: AttributeDef[] = RAW_ATTRIBUTES.map((a) => ({
  ...a,
  visible: !a.hidden && a.linked !== 0,
}));

export const ATTRIBUTE_MAP: Record<string, AttributeDef> = Object.fromEntries(
  ATTRIBUTES.map((a) => [a.key, a]),
);

/** 分类英文名 */
export const ATTRIBUTE_CATEGORIES = [
  'innate',
  'visible',
  'status',
  'trait',
  'negative',
  'proficient',
  'hidden',
  'fans',
] as const;
export type AttributeCategory = (typeof ATTRIBUTE_CATEGORIES)[number];

const byCategory = (cat: AttributeCategory) => ATTRIBUTES.filter((a) => a.category === cat);

/** 显性属性（演唱/舞蹈/演技/口才） */
export const STAT_KEYS = byCategory('visible').map((a) => a.key) as (keyof Stats)[];
/** 隐藏属性（自我/他人/适配） */
export const AXIS_KEYS = byCategory('hidden').map((a) => a.key) as (keyof Axes)[];
/** 粉丝属性 */
export const FAN_KEYS = byCategory('fans').map((a) => a.key);

export const STAT_LABEL: Record<string, string> = Object.fromEntries(
  ATTRIBUTES.map((a) => [a.key, a.name]),
);
export const AXIS_LABEL = STAT_LABEL;
export const FAN_LABEL = STAT_LABEL;

/** 0=完全隐藏，1=完全可见，2=隐藏仅占卜可见 */
export const LINKED = { HIDDEN: 0, VISIBLE: 1, DIVINE_ONLY: 2 } as const;

/** 该属性是否对玩家完全隐藏 */
export function isHidden(key: string): boolean {
  const a = ATTRIBUTE_MAP[key];
  return !a || a.hidden || a.linked === LINKED.HIDDEN;
}

/** 该属性是否只有占卜才可见 */
export function isDivineOnly(key: string): boolean {
  return ATTRIBUTE_MAP[key]?.linked === LINKED.DIVINE_ONLY;
}

/** 读取某个属性在当前存档里的数值（只读，缺省给合理默认） */
export function attrValue(state: RunState, key: string): number {
  const stats = state.stats as unknown as Record<string, number>;
  if (key in stats) return stats[key] ?? 0;

  const axes = state.axes as unknown as Record<string, number>;
  if (key in axes) return axes[key] ?? 50;

  if (key === 'stamina') return state.stamina;
  if (key === 'mood') return state.mood ?? 70;
  if (key === 'satiety') return state.satiety ?? 70;

  const fan = (state.fans.byType as unknown as Record<string, number>)[key];
  if (fan !== undefined) return fan;

  if (state.innate && key in state.innate) return state.innate[key] ?? 50;
  if (state.traits && key in state.traits) return state.traits[key] ?? 0;
  if (state.negatives && key in state.negatives) return state.negatives[key] ?? 0;
  if (state.proficiency && key in state.proficiency) return state.proficiency[key] ?? 0;

  return 0;
}

/** 按分类列出属性（含数值） */
export function attributesByCategory(state: RunState): Array<{
  category: string;
  categoryName: string;
  items: Array<{ key: string; name: string; value: number; hidden: boolean }>;
}> {
  const groups = new Map<string, { category: string; categoryName: string; items: never[] }>();
  for (const a of ATTRIBUTES) {
    const g = groups.get(a.category) ?? {
      category: a.category,
      categoryName: a.categoryName,
      items: [] as never[],
    };
    (g.items as unknown as Array<{ key: string; name: string; value: number; hidden: boolean }>).push({
      key: a.key,
      name: a.name,
      value: attrValue(state, a.key),
      hidden: isHidden(a.key),
    });
    groups.set(a.category, g);
  }
  return [...groups.values()];
}