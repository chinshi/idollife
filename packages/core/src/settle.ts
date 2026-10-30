import { ACTIONS } from './content';
import { ROUTINE_TEMPLATES, findStoryEvent } from './events';
import { hashSeed, mulberry32, randInt } from './rng';
import type { RunState, ScheduleItem, SettleResult, Stats, StopReason } from './types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 每个行动后触发常规事件的概率 */
const ROUTINE_CHANCE = 0.45;

/**
 * 纯结算函数：给定状态、排程、时间区间与种子，算出这段时间发生了什么。
 *
 * 铁律（docs/10-架构与模块.md）：
 * - 不读 Date.now()，时间由参数传入
 * - 不读 Math.random()，随机由 seed 决定
 * - 不碰 DOM / 存储
 */
export interface SettleOptions {
  /** 常规事件触发概率，默认 0.45 */
  routineChance?: number;
  /** 是否检查剧情事件，默认 true */
  storyEvents?: boolean;
}

export function settle(
  run: RunState,
  schedule: ScheduleItem[],
  from: number,
  to: number,
  seed: string,
  opts: SettleOptions = {},
): SettleResult {
  const routineChance = opts.routineChance ?? ROUTINE_CHANCE;
  const storyEvents = opts.storyEvents ?? true;
  const state: RunState = {
    at: run.at,
    stamina: run.stamina,
    stats: { ...run.stats },
    axes: { ...run.axes },
    flags: { ...run.flags },
    pendingEvent: run.pendingEvent,
    log: [...run.log],
  };

  // 有未处理的抉择，时间不走
  if (state.pendingEvent) {
    return { state, executed: [], stoppedReason: 'event' };
  }

  const rng = mulberry32(hashSeed(seed));
  const executed: string[] = [];
  let stoppedReason: StopReason = null;
  let cursor = Math.max(from, run.at);

  const items = [...schedule].sort((a, b) => a.startAt - b.startAt);

  for (const item of items) {
    if (item.startAt < cursor) continue;
    if (item.endAt > to) {
      stoppedReason = 'time';
      break;
    }

    const action = ACTIONS[item.actionId];
    if (!action) continue;
    if (state.stamina + action.stamina < 0) {
      stoppedReason = 'stamina';
      break;
    }

    const gain = action.gain ? randInt(rng, action.gain[0], action.gain[1]) : 0;
    state.stamina = clamp(state.stamina + action.stamina, 0, 100);

    if (action.stat && gain > 0) {
      const before = state.stats[action.stat];
      state.stats[action.stat] = clamp(before + gain, 0, 100);
      const delta = state.stats[action.stat] - before;
      state.log.push({
        at: item.endAt,
        actionId: action.id,
        text: action.text.replace('{n}', String(delta)),
        staminaDelta: action.stamina,
        statDelta: { [action.stat]: delta } as Partial<Stats>,
        kind: 'action',
      });
    } else {
      state.log.push({
        at: item.endAt,
        actionId: action.id,
        text: action.text,
        staminaDelta: action.stamina,
        statDelta: {},
        kind: 'action',
      });
    }

    state.at = item.endAt;
    cursor = item.endAt;
    executed.push(item.id);

    // 常规事件：只改数值，不动三轴
    if (rng() < routineChance) {
      const t = ROUTINE_TEMPLATES[Math.floor(rng() * ROUTINE_TEMPLATES.length)]!;
      state.stamina = clamp(state.stamina + t.stamina, 0, 100);
      if (t.stat && t.gain) {
        state.stats[t.stat] = clamp(state.stats[t.stat] + t.gain, 0, 100);
      }
      state.log.push({
        at: item.endAt,
        actionId: `routine:${t.id}`,
        text: t.text,
        staminaDelta: t.stamina,
        statDelta: t.stat && t.gain ? ({ [t.stat]: t.gain } as Partial<Stats>) : {},
        kind: 'routine',
      });
    }

    // 剧情事件：一旦触发就停下，等玩家抉择
    if (storyEvents) {
      const story = findStoryEvent(state);
      if (story) {
        state.pendingEvent = story.id;
        stoppedReason = 'event';
        break;
      }
    }
  }

  if (!stoppedReason) stoppedReason = 'exhausted';

  return { state, executed, stoppedReason };
}
