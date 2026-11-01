import { BALANCE, RAW_ACTIONS, RAW_RESULTS, type RawRequires } from './data';
import { matchesCondition } from './events';
import type { ActionCategory, ActionDef, RunState, StatKey } from './types';

const MIN = 60_000;

/** 一个行动流逝多少游戏分钟 */
export const ACTION_MINUTES = BALANCE.actionMinutes;

/** 每天的行动位 */
export const DAILY_SLOTS = BALANCE.dailySlots;
export const SHOW_SLOTS = BALANCE.showSlots;

/** 游戏内一天 = 3 个行动位的时长（日历按行动走，不按 24 小时走） */
export const DAY_MS = DAILY_SLOTS * ACTION_MINUTES * MIN;

/** 游戏内一周 = 7 天 */
export const WEEK_MS = 7 * DAY_MS;

/** 一周目长度 */
export const RUN_LENGTH_MS = BALANCE.runDays * DAY_MS;

/** 每周房租（结算时自动扣） */
export const RENT_PER_WEEK = BALANCE.rentPerWeek;

/** 开局资金 */
export const START_MONEY = BALANCE.startMoney;

/** 出道门槛：四项属性之和 */
export const DEBUT_THRESHOLD = BALANCE.debutThreshold;

export const SHOW_ACTION_ID = 'show';
export const SHOW_DURATION_MS = SHOW_SLOTS * ACTION_MINUTES * MIN;

/** 行为元信息（不含收益，收益在 action_results.json） */
export interface ActionMeta {
  id: string;
  name: string;
  category: string;
  categoryName: string;
  displayCondition?: RawRequires;
  /** 0 = 无限制 */
  times: number;
  /** run / week / day */
  timesScope: string;
  affectedStats: string[];
  durationMs: number;
}

/** 某个行为「默认结果」（priority 最大的那条，通常 condition 为空） */
function defaultResultOf(actionId: string) {
  const list = RAW_RESULTS.filter((r) => r.actionId === actionId);
  if (list.length === 0) return undefined;
  return [...list].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).pop();
}

export const ACTION_META: Record<string, ActionMeta> = Object.fromEntries(
  RAW_ACTIONS.map((a) => [
    a.id,
    {
      id: a.id,
      name: a.name,
      category: a.category,
      categoryName: a.categoryName ?? a.category,
      displayCondition: a.displayCondition,
      times: a.times ?? 0,
      timesScope: a.timesScope ?? 'run',
      affectedStats: a.affectedStats ?? [],
      durationMs: (a.durationMinutes ?? ACTION_MINUTES) * MIN,
    } satisfies ActionMeta,
  ]),
);

/**
 * 兼容旧结构：界面预览/排程需要「体力、钱、属性成长」这些字段，
 * 这里取默认结果做代表；真正执行时按条件走 results.ts。
 */
export const ACTIONS: Record<string, ActionDef> = Object.fromEntries(
  RAW_ACTIONS.map((a) => {
    const def = defaultResultOf(a.id);
    const stats = def?.effects.stats ?? {};
    const firstKey = Object.keys(stats)[0] as StatKey | undefined;
    const raw = firstKey ? stats[firstKey] : undefined;
    const gain: [number, number] | undefined = Array.isArray(raw)
      ? [raw[0], raw[1]]
      : typeof raw === 'number'
        ? [raw, raw]
        : undefined;
    const money = def?.effects.money ?? 0;

    return [
      a.id,
      {
        id: a.id,
        name: a.name,
        category: a.category as ActionCategory,
        stat: firstKey,
        stamina: def?.effects.stamina ?? 0,
        gain,
        cost: money < 0 ? -money : undefined,
        money: money > 0 ? money : undefined,
        durationMs: (a.durationMinutes ?? ACTION_MINUTES) * MIN,
        text: def?.text ?? '',
      } satisfies ActionDef,
    ];
  }),
);

export const ACTION_LIST = Object.values(ACTIONS);

/** 行动分类中文名（来自 data/actions.json 的 categoryName） */
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  RAW_ACTIONS.map((a) => [a.category, a.categoryName ?? a.category]),
);

/** 这个行为当前是否应该显示在列表里 */
export function canShowAction(state: RunState, actionId: string): boolean {
  const meta = ACTION_META[actionId];
  if (!meta) return false;
  return matchesCondition(state, meta.displayCondition);
}

/** 这个行为今天/本周/本局还能做几次（无限制返回 Infinity） */
export function remainingTimes(state: RunState, actionId: string): number {
  const meta = ACTION_META[actionId];
  if (!meta || meta.times <= 0) return Number.POSITIVE_INFINITY;

  const scope = meta.timesScope;
  const from =
    scope === 'day'
      ? state.at - (state.at % DAY_MS)
      : scope === 'week'
        ? state.at - (state.at % WEEK_MS)
        : 0;

  const used = state.log.filter(
    (l) => l.kind === 'action' && l.actionId === actionId && l.at >= from,
  ).length;

  return Math.max(0, meta.times - used);
}
