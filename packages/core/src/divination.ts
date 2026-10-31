import { DAY_MS } from './content';
import type { RunState, Tier } from './types';
import { tierOf } from './types';

/** 第一次占卜 100，同一天内每再占一次翻倍 */
import { BALANCE } from './data';

export const DIVINATION_BASE = BALANCE.divinationBase;

/** 今天已经占了几次（跨天自动归零） */
export function divinationCountToday(state: RunState): number {
  const day = Math.floor(state.at / DAY_MS);
  const flagDay = typeof state.flags['divination-day'] === 'number' ? state.flags['divination-day'] : -1;
  if (flagDay !== day) return 0;
  return typeof state.flags['divination-count'] === 'number' ? state.flags['divination-count'] : 0;
}

export function divinationCost(state: RunState): number {
  const count = divinationCountToday(state);
  return DIVINATION_BASE * Math.pow(2, count);
}

export interface DivinationResult {
  self: Tier;
  others: Tier;
  fit: Tier;
}

/** 占卜结果：只给档位，不给数字 */
export function divinationReading(state: RunState): DivinationResult {
  return {
    self: tierOf(state.axes.self),
    others: tierOf(state.axes.others),
    fit: tierOf(state.axes.fit),
  };
}

export type DivinationOutcome = 'ok' | 'poor';

export function divine(state: RunState): { state: RunState; result: DivinationOutcome; cost: number } {
  const cost = divinationCost(state);
  if (state.money < cost) return { state, result: 'poor', cost };

  const day = Math.floor(state.at / DAY_MS);
  const count = divinationCountToday(state);
  const reading = divinationReading(state);

  return {
    state: {
      ...state,
      money: state.money - cost,
      flags: {
        ...state.flags,
        'divination-day': day,
        'divination-count': count + 1,
      },
      log: [
        ...state.log,
        {
          at: state.at,
          actionId: 'divination',
          text: `占卜：自我${tierText(reading.self)} / 他人${tierText(reading.others)} / 适配${tierText(reading.fit)}。`,
          staminaDelta: 0,
          statDelta: {},
          kind: 'action',
        },
      ],
    },
    result: 'ok',
    cost,
  };
}

export function tierText(tier: Tier): string {
  return tier === 'high' ? '高' : tier === 'mid' ? '中' : '低';
}
