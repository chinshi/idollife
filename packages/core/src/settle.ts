import { ACTIONS, RENT_PER_WEEK, remainingTimes, WEEK_MS } from './content';
import { previewAction, resolveAction, showFanType } from './results';
import { BALANCE } from './data';
import { createFans } from './fans';
import { applyFanAction } from './fans';
import { ROUTINE_TEMPLATES, findStoryEvent } from './events';
import { checkTaskCompletions } from './tasks';
import { hashSeed, mulberry32, randInt } from './rng';
import type { RunState, ScheduleItem, SettleResult, Stats, StopReason } from './types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 每个行动后触发常规事件的概率 */
const ROUTINE_CHANCE = BALANCE.routineChance;

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
  /** 周目结束时间点；到达即停止并提示结局 */
  endAt?: number;
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
    ...run,
    money: typeof run.money === 'number' ? run.money : 0,
    stats: { ...run.stats },
    axes: { ...(run.axes ?? { self: 50, others: 50, fit: 50 }) },
    fans: { ...(run.fans ?? createFans(0)) },
    debuted: run.debuted ?? false,
    parties: run.parties ?? [],
    activePartyId: run.activePartyId ?? null,
    flags: { ...run.flags },
    pendingEvent: run.pendingEvent,
    eventQueue: [...(run.eventQueue ?? [])],
    log: [...run.log],
  };

  // 周目到点：不再推进
  if (opts.endAt !== undefined && state.at >= opts.endAt) {
    return { state, executed: [], stoppedReason: 'ending' };
  }

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

    // 次数限制（0 = 无限制）
    if (remainingTimes(state, item.actionId) <= 0) {
      stoppedReason = 'stopped';
      break;
    }

    const preview = previewAction(state, item.actionId);
    if (!preview) continue;

    if (preview.stamina < 0 && state.stamina + preview.stamina < 0) {
      stoppedReason = 'stamina';
      break;
    }
    if (preview.money < 0 && state.money + preview.money < 0) {
      stoppedReason = 'money';
      break;
    }

    // 按条件匹配结果表：数值与文案都可能和预览不同
    const resolved = resolveAction(state, item.actionId, rng);
    if (!resolved) continue;

    state.stamina = clamp(state.stamina + resolved.stamina, 0, 100);
    state.money += resolved.money;

    if (resolved.fans > 0) {
      state.fans = applyFanAction(state.fans, showFanType(state), resolved.fans, 0.3);
    }

    const statDelta: Partial<Stats> = {};
    for (const [k, v] of Object.entries(resolved.stats)) {
      const key = k as keyof Stats;
      const before = state.stats[key];
      state.stats[key] = clamp(before + (v ?? 0), 0, 100);
      statDelta[key] = state.stats[key] - before;
    }

    state.log.push({
      at: item.endAt,
      actionId: action.id,
      text: resolved.text,
      staminaDelta: resolved.stamina,
      statDelta,
      kind: 'action',
    });

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

    // 剧情事件：重点事件暂停时间，普通事件进队列不打断
    if (storyEvents) {
      const story = findStoryEvent(state);
      if (story) {
        if (story.major) {
          state.pendingEvent = story.id;
          stoppedReason = 'event';
          break;
        }
        state.eventQueue = [...(state.eventQueue ?? []), story.id];
        state.flags = { ...state.flags, ['ev:' + story.id + ':queued']: true };
      }
    }

    // 玩家在这一条上打了「到此为止」
    if (item.stopAfter) {
      stoppedReason = 'stopped';
      break;
    }
  }

  // 跨周扣房租
  const origin = state.startedAt ?? run.at;
  const weeks = Math.floor((state.at - origin) / WEEK_MS) - Math.floor((run.at - origin) / WEEK_MS);
  if (weeks > 0) {
    state.money -= weeks * RENT_PER_WEEK;
    state.log.push({
      at: state.at,
      actionId: 'rent',
      text: '房租扣了 ' + String(weeks * RENT_PER_WEEK) + '。',      staminaDelta: 0,
      statDelta: {},
      kind: 'routine',
    });
  }

  if (!stoppedReason) stoppedReason = 'exhausted';

  if (opts.endAt !== undefined && state.at >= opts.endAt) {
    stoppedReason = 'ending';
  }

  // 任务：进行中的任务若满足完成条件，自动完成并发奖
  return { state: checkTaskCompletions(state), executed, stoppedReason };
}
