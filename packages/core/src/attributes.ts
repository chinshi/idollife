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

/** 是不是真正的四项能力键（演唱/舞蹈/演技/口才） */
export function isStatKey(key: string): boolean {
  return (STAT_KEYS as readonly string[]).includes(key);
}

/**
 * T-043：只保留四项能力，非法值归 0。
 *
 * 历史事故：任务奖励被写成 `rewards.stats.stamina = 25`，合并时 `undefined + 25 = NaN`，
 * 经 JSON 序列化变成 `null` 落库；`attrValue` 旧实现用 `key in stats` 判定，
 * 于是面板上「体力」永远读 `stats.stamina`（null → 0），把真实的 `run.stamina` 完全盖住。
 */
export function sanitizeStats(raw: unknown): Stats {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out = { vocal: 0, dance: 0, acting: 0, talk: 0 } as Stats;
  for (const k of STAT_KEYS) {
    const v = src[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  return out;
}

/** 读取某个属性在当前存档里的数值（只读，缺省给合理默认） */
export function attrValue(state: RunState, key: string): number {
  const stats = state.stats as unknown as Record<string, number>;
  // T-043：只认四项能力。脏数据里的 stats.stamina / stats.mood 之类不能走这条分支，
  // 否则会把真实字段永久盖成 0（玩家看到 0 体力，实际 100，还能照常执行消耗体力的行动）。
  if (isStatKey(key)) {
    const v = stats[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }

  const axes = state.axes as unknown as Record<string, number>;
  if (key in axes) return axes[key] ?? 50;

  // T-043：体力/心情这类真字段也防一手 null / NaN（旧档可能缺），别把 NaN 直接画到屏幕上
  if (key === 'stamina') return Number.isFinite(state.stamina) ? state.stamina : 0;
  if (key === 'mood') return Number.isFinite(state.mood) ? (state.mood as number) : 70;
  // T-021：健康（旧档缺省按满值）
  if (key === 'health') return Number.isFinite(state.health) ? (state.health as number) : 100;

  const fan = (state.fans.byType as unknown as Record<string, number>)[key];
  if (fan !== undefined) return fan;

  if (state.innate && key in state.innate) return state.innate[key] ?? 50;
  if (state.traits && key in state.traits) return state.traits[key] ?? 0;
  if (state.negatives && key in state.negatives) return state.negatives[key] ?? 0;
  if (state.proficiency && key in state.proficiency) return state.proficiency[key] ?? 0;

  return 0;
}

/**
 * 样貌（颜值）数值 → 区间文案（T-016c 用户口径：50–100，每 10 分一档，四字名）。
 * 样貌是敏感项：界面只显示这段文案，任何地方都不显示数字。
 * < 50 是旧档/越界兜底，正常新档初始值就在 50–100。
 * 越界按最近档兜底（<0 → 兜底档；>100 → 90–100 档），非数字/NaN → '—'。
 */
export function appearanceLabel(v: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  const n = Math.floor(v);
  if (n < 50) return '其貌不扬';
  if (n < 60) return '平平无奇';
  if (n < 70) return '清秀耐看';
  if (n < 80) return '气质出众';
  if (n < 90) return '明艳动人';
  return '惊为天人';
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