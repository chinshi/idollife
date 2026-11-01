import { BALANCE, RAW_ACTIONS } from './data';
import type { ActionCategory, ActionDef, StatKey } from './types';

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

/** 行动表（来自 data/actions.json） */
export const ACTIONS: Record<string, ActionDef> = Object.fromEntries(
  RAW_ACTIONS.map((a) => [
    a.id,
    {
      id: a.id,
      name: a.name,
      category: a.category as ActionCategory,
      stat: a.stat as StatKey | undefined,
      stamina: a.stamina,
      gain: a.gain as [number, number] | undefined,
      cost: a.cost,
      money: a.money,
      durationMs: ACTION_MINUTES * MIN,
      text: a.text,
    } satisfies ActionDef,
  ]),
);

export const ACTION_LIST = Object.values(ACTIONS);

/** 行动分类中文名（来自 data/actions.json 的 categoryName） */
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  RAW_ACTIONS.map((a) => [a.category, a.categoryName ?? a.category]),
);
