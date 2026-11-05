import { BALANCE, RAW_ACTIONS, RAW_RESULTS, type RawRequires } from './data';
import { matchesCondition } from './events';
import type { ActionCategory, ActionDef, RunState, StatKey } from './types';

const MIN = 60_000;

/** 一个行动流逝多少游戏分钟 */
export const ACTION_MINUTES = BALANCE.actionMinutes;

/** 一个行动对应的游戏毫秒（= actionMinutes 分钟 × 60s）；倒计时按它换算剩余行动次数 */
export const ACTION_MS = ACTION_MINUTES * MIN;

/**
 * 时间尺度系数（D-017）：1 真实毫秒推进多少游戏毫秒。
 * 倍速 speed 乘在它之上，两者正交；旧 balance.json 没有该字段时回落 20。
 */
export const TIME_SCALE = Math.max(1, Number(BALANCE.timeScale ?? 20));

/** 每天的行动位 */
export const DAILY_SLOTS = BALANCE.dailySlots;
export const SHOW_SLOTS = BALANCE.showSlots;

/** 游戏内一天 = 3 个行动位的时长（日历按行动走，不按 24 小时走） */
export const DAY_MS = DAILY_SLOTS * ACTION_MINUTES * MIN;

/** 游戏内一周 = 7 天 */
export const WEEK_MS = 7 * DAY_MS;

/** 一周目长度 */
export const RUN_LENGTH_MS = BALANCE.runDays * DAY_MS;

/** 周目起点（与客户端 T0 同值；服务端 catchUp 需要绝对结束点） */
export const START_AT = Date.UTC(2026, 0, 1, 9, 0, 0);
/** 周目结束点（绝对游戏时间）：START_AT + RUN_LENGTH_MS */
export const RUN_END_AT = START_AT + RUN_LENGTH_MS;

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
  displayCondition?: RawRequires | string;
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

/** 行动三层解锁的层级（T-021 界面角标用）：无条件=1；条件里出现 >=40=3；其余带条件=2 */
export function actionTier(actionId: string): 1 | 2 | 3 {
  const meta = ACTION_META[actionId];
  if (!meta) return 1;
  const cond = meta.displayCondition as unknown;
  const text =
    typeof cond === 'string'
      ? cond
      : cond && typeof cond === 'object'
        ? JSON.stringify(cond)
        : '';
  if (!text || text === '{}') return 1;
  return />=\s*40/.test(text) ? 3 : 2;
}

/** 体力上限：表里有 staminaMax 就用表里的，没有回落 100 */
export function staminaMaxFrom(balance: Record<string, unknown>): number {
  const v = Number(balance?.staminaMax);
  return Number.isFinite(v) && v > 0 ? v : 100;
}

/** 体力上限（配置表 balance.staminaMax，缺省 100） */
export const STAMINA_MAX: number = staminaMaxFrom(BALANCE as unknown as Record<string, unknown>);

/** 把体力夹到 0~上限 */
export function clampStamina(v: number): number {
  return Math.max(0, Math.min(STAMINA_MAX, Math.round(v)));
}

/** 行动结束后饱腹低于这个值，恢复类效果打折 */
export const HUNGRY_SATIETY = 20;
/** 饿了的时候恢复打几折 */
export const HUNGRY_RECOVERY_MUL = 0.5;
/** 积劳超过这个值，体力消耗放大 */
export const FATIGUE_THRESHOLD = 50;
/** 积劳过高时消耗放大倍数 */
export const FATIGUE_COST_MUL = 1.2;

export interface StaminaRuleResult {
  /** 真正生效的体力变化（已含积劳放大 / 饥饿减半） */
  applied: number;
  /** 负向消耗被积劳放大 */
  scaledByFatigue: boolean;
  /** 正向恢复因为太饿被减半 */
  halvedByHunger: boolean;
}

/**
 * 体力结算规则：积劳放大消耗、太饿时恢复减半。
 *
 * settle / previewAction / preflightAction 三处必须完全一致 ——
 * 之前只有 settle 应用了这两条，预览按配置原值显示「体力 +40」，
 * 实际只加 20，玩家看到的就是「睡了一觉体力没怎么涨 / 数值对不上」。
 */
export function settleStamina(raw: number, satietyAfter: number, fatigue: number): StaminaRuleResult {
  const scaledByFatigue = raw < 0 && fatigue > FATIGUE_THRESHOLD;
  const cost = scaledByFatigue ? Math.round(raw * FATIGUE_COST_MUL) : raw;
  if (cost > 0 && satietyAfter < HUNGRY_SATIETY) {
    return {
      applied: Math.round(cost * HUNGRY_RECOVERY_MUL),
      scaledByFatigue,
      halvedByHunger: true,
    };
  }
  return { applied: cost, scaledByFatigue, halvedByHunger: false };
}