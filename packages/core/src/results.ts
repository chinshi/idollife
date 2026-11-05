/**
 * 行为结果表：同一个行为在不同条件下可以有不同收益与文案。
 * 执行时按 priority 从小到大找到第一个条件匹配的结果。
 */
import { RAW_RESULTS, type RawRequires, type RawResult } from './data';
import { settleStamina } from './content';
import { matchesCondition } from './events';
import type { FanType } from './fans';
import { effectiveStats } from './items';
import { randInt } from './rng';
import type { Axes, RunState, Stats } from './types';

export interface ActionResultDef {
  id: string;
  actionId: string;
  actionName: string;
  condition?: RawRequires;
  priority: number;
  effects: RawResult['effects'];
  text: string;
}

export const ACTION_RESULTS: ActionResultDef[] = RAW_RESULTS.map((r) => ({
  id: r.id,
  actionId: r.actionId,
  actionName: r.actionName,
  condition: r.condition,
  priority: r.priority ?? 99,
  effects: r.effects ?? {},
  text: r.text,
}));

const byAction = new Map<string, ActionResultDef[]>();
for (const r of ACTION_RESULTS) {
  const list = byAction.get(r.actionId) ?? [];
  list.push(r);
  byAction.set(r.actionId, list);
}
for (const list of byAction.values()) list.sort((a, b) => a.priority - b.priority);

export function resultsFor(actionId: string): ActionResultDef[] {
  return byAction.get(actionId) ?? [];
}

/** 选出当前状态下生效的结果 */
export function pickActionResult(state: RunState, actionId: string): ActionResultDef | null {
  const list = resultsFor(actionId);
  for (const r of list) {
    if (matchesCondition(state, r.condition)) return r;
  }
  return list[list.length - 1] ?? null;
}

export interface ResolvedAction {
  resultId: string;
  stamina: number;
  money: number;
  /** 心情变化 */
  mood: number;
  /** 饱腹变化 */
  satiety: number;
  /** 健康变化（T-021） */
  health: number;
  /** 粉丝增加量 */
  fans: number;
  stats: Partial<Record<keyof Stats, number>>;
  /** 隐藏轴变化（T-021；只应用，不展示数值） */
  axes: Partial<Record<keyof Axes, number>>;
  text: string;
}

/** 这场演出/行动主要吸引哪类粉丝：看当前最高的显性属性 */
export function showFanType(state: RunState): FanType {
  const s = effectiveStats(state);
  const innate = state.innate ?? {};
  const traits = state.traits ?? {};

  // 六类粉丝各有一个「吸引分」，取最高者
  const scores: Record<FanType, number> = {
    // T-016c：身材比例已删除，身高的舞台加成保留（height 新档为 145–180cm，/4 ≈ 36–45，
    // 与旧公式 height/4 + proportion/4 的总量级相当；老档 height 存的是 40–80 分值，加成偏小，重开即正常）
    stage: s.dance + (innate.height ?? 160) / 4,
    music: s.vocal,
    growth: s.acting + (s.vocal + s.dance) / 4,
    gachi: (innate.appearance ?? 50) + (traits.kind ?? 0) / 2,
    live: s.talk + (traits.passion ?? 0) / 2,
    power: (s.vocal + s.dance) / 2 + (traits.ambitious ?? 0) / 2,
  };

  const best = (Object.entries(scores) as Array<[FanType, number]>).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : 'stage';
}

const rollValue = (v: number | [number, number], rng: () => number): number => {
  if (Array.isArray(v)) return randInt(rng, v[0], v[1]);
  return v;
};

/** 结算一次行为：区间随机取值，返回数值与替换好占位符的文案 */
export function resolveAction(
  state: RunState,
  actionId: string,
  rng: () => number,
): ResolvedAction | null {
  const result = pickActionResult(state, actionId);
  if (!result) return null;

  const stats: Partial<Record<keyof Stats, number>> = {};
  for (const [k, v] of Object.entries(result.effects.stats ?? {})) {
    stats[k as keyof Stats] = rollValue(v, rng);
  }

  const stamina = result.effects.stamina ?? 0;
  const money = result.effects.money ?? 0;
  const fans = result.effects.fans ?? 0;
  const mood = result.effects.mood ?? 0;
  const satiety = result.effects.satiety ?? 0;
  const health = result.effects.health ?? 0;

  const axes: Partial<Record<keyof Axes, number>> = {};
  for (const [k, v] of Object.entries(result.effects.axes ?? {})) {
    axes[k as keyof Axes] = rollValue(v, rng);
  }

  let text = result.text;
  for (const [k, v] of Object.entries(stats)) {
    text = text.split(`{${k}}`).join(String(v));
  }
  const firstStat = Object.values(stats)[0] ?? 0;
  text = text.split('{n}').join(String(firstStat));
  text = text.split('{stamina}').join(String(stamina));
  text = text.split('{money}').join(String(money));

  return { resultId: result.id, stamina, money, mood, satiety, health, fans, stats, axes, text };
}

/** 预览：不消耗随机数，用区间中间值给界面展示 */
export function previewAction(state: RunState, actionId: string): {
  stamina: number;
  /** 这条恢复被「太饿」打了对折（界面可以据此加一句说明） */
  hungerHalved: boolean;
  money: number;
  mood: number;
  satiety: number;
  health: number;
  fans: number;
  stats: Partial<Record<keyof Stats, [number, number]>>;
  /** 隐藏轴：只有配置了才出现（客户端据此决定是否渲染底层） */
  axes: Partial<Record<keyof Axes, [number, number]>>;
  text: string;
} | null {
  const result = pickActionResult(state, actionId);
  if (!result) return null;

  const stats: Partial<Record<keyof Stats, [number, number]>> = {};
  for (const [k, v] of Object.entries(result.effects.stats ?? {})) {
    stats[k as keyof Stats] = Array.isArray(v) ? [v[0], v[1]] : [v, v];
  }

  const axes: Partial<Record<keyof Axes, [number, number]>> = {};
  for (const [k, v] of Object.entries(result.effects.axes ?? {})) {
    axes[k as keyof Axes] = Array.isArray(v) ? [v[0], v[1]] : [v, v];
  }

  // 体力按结算规则折算：积劳放大消耗、太饿恢复减半。
  // 预览、预检、实际结算必须是同一个数，否则就会出现「卡片写 +40、面板只涨 20」。
  const satietyAfter = Math.max(0, Math.min(100, (state.satiety ?? 70) + (result.effects.satiety ?? 0)));
  const staminaRule = settleStamina(
    result.effects.stamina ?? 0,
    satietyAfter,
    state.negatives?.fatigue ?? 0,
  );

  return {
    stamina: staminaRule.applied,
    hungerHalved: staminaRule.halvedByHunger,
    money: result.effects.money ?? 0,
    mood: result.effects.mood ?? 0,
    satiety: result.effects.satiety ?? 0,
    health: result.effects.health ?? 0,
    fans: result.effects.fans ?? 0,
    stats,
    axes,
    text: result.text,
  };
}
