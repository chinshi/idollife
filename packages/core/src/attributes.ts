/**
 * 属性表派生：分类、标签、可见性
 */
import { RAW_ATTRIBUTES, type RawAttribute } from './data';
import type { Axes, Stats } from './types';

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
export const ATTRIBUTE_CATEGORIES = ['visible', 'hidden', 'status', 'fans'] as const;
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
