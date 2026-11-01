import { ACTIONS, RENT_PER_WEEK, clampStamina, remainingTimes, WEEK_MS } from './content';
import { previewAction, resolveAction, showFanType } from './results';
import { BALANCE } from './data';
import { createFans } from './fans';
import { applyFanAction } from './fans';
import { ROUTINE_TEMPLATES, findStoryEvent } from './events';
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

    // 心情 / 饱腹：先结算变化，再算它对本条行动的影响
    const nextMood = Math.max(0, Math.min(100, (state.mood ?? 100) + resolved.mood));
    const nextSatiety = Math.max(0, Math.min(100, (state.satiety ?? 100) + resolved.satiety));

    const negatives = state.negatives ?? {};
    const proficiency = state.proficiency ?? {};

    let efficiency = 1;
    if (nextMood < 30) efficiency *= 0.7;
    else if (nextMood > 70) efficiency *= 1.05;
    if (nextSatiety < 20) efficiency *= 0.8;
    if ((negatives.restless ?? 0) > 50) efficiency *= 0.95;
    if ((negatives.stress ?? 0) > 60) efficiency *= 0.95;

    // 积劳：体力消耗更大
    const fatigueMul = (negatives.fatigue ?? 0) > 50 ? 1.2 : 1;
    const staminaCost =
      resolved.stamina < 0 ? Math.round(resolved.stamina * fatigueMul) : resolved.stamina;

    const staminaApplied =
      staminaCost > 0 && nextSatiety < 20 ? Math.round(staminaCost * 0.5) : staminaCost;

    state.stamina = clampStamina(state.stamina + staminaApplied);
    state.money += resolved.money;
    state.mood = nextMood;
    state.satiety = nextSatiety;

    if (resolved.fans > 0) {
      state.fans = applyFanAction(state.fans, showFanType(state), resolved.fans, 0.3);
    }

    // 熟练度：放大对应能力的训练收益（乘区，上限 +50%）
    const profFor: Partial<Record<keyof Stats, string>> = {
      vocal: 'song_prof',
      dance: 'choreo_prof',
    };
    const nextProf = { ...proficiency };

    const statDelta: Partial<Stats> = {};
    for (const [k, v] of Object.entries(resolved.stats)) {
      const key = k as keyof Stats;
      const before = state.stats[key];
      const raw = v ?? 0;
      const profKey = profFor[key];
      const profMul = profKey ? 1 + (nextProf[profKey] ?? 0) / 200 : 1;
      const gained = raw > 0 ? Math.floor(raw * efficiency * profMul) : raw;
      state.stats[key] = clamp(before + gained, 0, 100);
      statDelta[key] = state.stats[key] - before;

      if (gained > 0 && profKey) {
        nextProf[profKey] = Math.min(100, (nextProf[profKey] ?? 0) + 1);
      }
    }

    if (resolved.fans > 0) {
      nextProf.stage_prof = Math.min(100, (nextProf.stage_prof ?? 0) + 2);
    }
    state.proficiency = nextProf;

    state.log.push({
      at: item.endAt,
      actionId: action.id,
      text: resolved.text,
      staminaDelta: staminaApplied,
      statDelta,
      kind: 'action',
    });

    state.at = item.endAt;
    cursor = item.endAt;
    executed.push(item.id);

    // 常规事件：只改数值，不动三轴
    if (rng() < routineChance) {
      const t = ROUTINE_TEMPLATES[Math.floor(rng() * ROUTINE_TEMPLATES.length)]!;
      state.stamina = clampStamina(state.stamina + t.stamina);
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

  return { state, executed, stoppedReason };
}
