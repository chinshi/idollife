import { ACTIONS } from './content';
import { hashSeed, mulberry32, randInt } from './rng';
import type { RunState, ScheduleItem, SettleResult, Stats, StopReason } from './types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * 纯结算函数：给定状态、排程、时间区间与种子，算出这段时间发生了什么。
 *
 * 铁律（见 docs/10-架构与模块.md）：
 * - 不读 Date.now()，时间由参数传入
 * - 不读 Math.random()，随机由 seed 决定
 * - 不碰 DOM / 存储
 */
export function settle(
  run: RunState,
  schedule: ScheduleItem[],
  from: number,
  to: number,
  seed: string,
): SettleResult {
  const state: RunState = {
    at: run.at,
    stamina: run.stamina,
    stats: { ...run.stats },
    log: [...run.log],
  };

  const rng = mulberry32(hashSeed(seed));
  const executed: string[] = [];
  let stoppedReason: StopReason = null;
  let cursor = Math.max(from, run.at);

  const items = [...schedule].sort((a, b) => a.startAt - b.startAt);

  for (const item of items) {
    // 已经发生过的不要再跑
    if (item.startAt < cursor) continue;

    // 超出结算窗口：留到下次
    if (item.endAt > to) {
      stoppedReason = 'time';
      break;
    }

    const action = ACTIONS[item.actionId];
    if (!action) continue;

    // 体力不够：停下，等玩家处理
    if (state.stamina + action.stamina < 0) {
      stoppedReason = 'stamina';
      break;
    }

    const gain = action.gain ? randInt(rng, action.gain[0], action.gain[1]) : 0;

    state.stamina = clamp(state.stamina + action.stamina, 0, 100);
    if (action.stat && gain > 0) {
      const next = clamp(state.stats[action.stat] + gain, 0, 100);
      const delta = next - state.stats[action.stat];
      state.stats[action.stat] = next;
      state.log.push({
        at: item.endAt,
        actionId: action.id,
        text: action.text.replace('{n}', String(delta)),
        staminaDelta: action.stamina,
        statDelta: { [action.stat]: delta } as Partial<Stats>,
      });
    } else {
      state.log.push({
        at: item.endAt,
        actionId: action.id,
        text: action.text,
        staminaDelta: action.stamina,
        statDelta: {},
      });
    }

    state.at = item.endAt;
    cursor = item.endAt;
    executed.push(item.id);
  }

  if (!stoppedReason) stoppedReason = 'exhausted';

  return { state, executed, stoppedReason };
}
