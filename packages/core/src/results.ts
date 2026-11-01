/**
 * 行为结果表：同一个行为在不同条件下可以有不同收益与文案。
 * 执行时按 priority 从小到大找到第一个条件匹配的结果。
 */
import { RAW_RESULTS, type RawRequires, type RawResult } from './data';
import { matchesCondition } from './events';
import type { FanType } from './fans';
import { effectiveStats } from './shop';
import { randInt } from './rng';
import type { RunState, Stats } from './types';

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
  /** 粉丝增加量 */
  fans: number;
  stats: Partial<Record<keyof Stats, number>>;
  text: string;
}

/** 这场演出/行动主要吸引哪类粉丝：看当前最高的显性属性 */
export function showFanType(state: RunState): FanType {
  const s = effectiveStats(state);
  if (s.dance >= s.vocal && s.dance >= s.acting && s.dance >= s.talk) return 'stage';
  if (s.vocal >= s.acting && s.vocal >= s.talk) return 'music';
  if (s.acting >= s.talk) return 'growth';
  return 'gachi';
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

  let text = result.text;
  for (const [k, v] of Object.entries(stats)) {
    text = text.split(`{${k}}`).join(String(v));
  }
  const firstStat = Object.values(stats)[0] ?? 0;
  text = text.split('{n}').join(String(firstStat));
  text = text.split('{stamina}').join(String(stamina));
  text = text.split('{money}').join(String(money));

  return { resultId: result.id, stamina, money, fans, stats, text };
}

/** 预览：不消耗随机数，用区间中间值给界面展示 */
export function previewAction(state: RunState, actionId: string): {
  stamina: number;
  money: number;
  fans: number;
  stats: Partial<Record<keyof Stats, [number, number]>>;
  text: string;
} | null {
  const result = pickActionResult(state, actionId);
  if (!result) return null;

  const stats: Partial<Record<keyof Stats, [number, number]>> = {};
  for (const [k, v] of Object.entries(result.effects.stats ?? {})) {
    stats[k as keyof Stats] = Array.isArray(v) ? [v[0], v[1]] : [v, v];
  }

  return {
    stamina: result.effects.stamina ?? 0,
    money: result.effects.money ?? 0,
    fans: result.effects.fans ?? 0,
    stats,
    text: result.text,
  };
}
