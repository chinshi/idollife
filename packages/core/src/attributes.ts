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

const byCategory = (cat: string) => ATTRIBUTES.filter((a) => a.category === cat);

/** 显性属性（演唱/舞蹈/演技/口才） */
export const STAT_KEYS = byCategory('显性属性').map((a) => a.key) as (keyof Stats)[];
/** 隐藏属性（自我/他人/适配） */
export const AXIS_KEYS = byCategory('隐藏属性').map((a) => a.key) as (keyof Axes)[];
/** 粉丝属性 */
export const FAN_KEYS = byCategory('粉丝属性').map((a) => a.key);

export const STAT_LABEL: Record<string, string> = Object.fromEntries(
  ATTRIBUTES.map((a) => [a.key, a.name]),
);
export const AXIS_LABEL = STAT_LABEL;
export const FAN_LABEL = STAT_LABEL;

/** 该属性是否对玩家完全隐藏 */
export function isHidden(key: string): boolean {
  const a = ATTRIBUTE_MAP[key];
  return !a || a.hidden || a.linked === 0;
}