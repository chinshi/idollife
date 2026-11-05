import {
  ACTIONS,
  PRESSURE_MAX,
  RENT_PER_WEEK,
  STAMINA_MAX,
  STRESS_EFFICIENCY_MUL,
  STRESS_EFFICIENCY_THRESHOLD,
  clampStamina,
  settleStamina,
  WEEK_MS,
} from './content';
import { isStatKey } from './attributes';
import { previewAction, resolveAction, showFanType } from './results';
import { preflightAction } from './preflight';
import { settleShow } from './shows';
import { BALANCE } from './data';
import { createFans } from './fans';
import { applyFanAction } from './fans';
import { ROUTINE_TEMPLATES, findStoryEvent } from './events';
import { hashSeed, mulberry32, randInt } from './rng';
import { expireTasks, autoAcceptTasks } from './tasks';
import { syncStageReached } from './stages';
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
  /** 单次最多结算条数，默认不限制 */
  maxSteps?: number;
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
  let state: RunState = {
    ...run,
    // T-042：老档 / 脏数据可能没有 stamina，之前会算出 NaN 再写回库；
    // 而 NaN 参与 `stamina + cost < 0` 恒为 false，等于「体力无限」。
    stamina: clampStamina(Number.isFinite(run.stamina) ? run.stamina : STAMINA_MAX),
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

  const executed: string[] = [];
  let stoppedReason: StopReason = null;
  let cursor = Math.max(from, run.at);

  const items = [...schedule].sort((a, b) => a.startAt - b.startAt);
  const maxSteps = opts.maxSteps ?? Number.POSITIVE_INFINITY;
  let steps = 0;

  for (const item of items) {
    if (steps >= maxSteps) {
      stoppedReason = 'time';
      break;
    }
    if (item.startAt < cursor) continue;
    if (item.endAt > to) {
      stoppedReason = 'time';
      break;
    }

    if (item.kind === 'show') {
      // T-044：演出不走 preflightAction，压力满了也要拦下来
      if ((state.negatives?.stress ?? 0) >= PRESSURE_MAX) {
        stoppedReason = 'pressure';
        break;
      }
      const booking = (state.bookings ?? []).find((b) => b.id === item.bookingId);
      state = booking ? settleShow(state, item, booking) : { ...state, at: item.endAt };
      executed.push(item.id);
      steps += 1;
      continue;
    }

    const action = ACTIONS[item.actionId];
    if (!action) continue;

    // D-010：随机流按「行动实例」派生，全局 seed + 行动稳定 id。
    // 这样同一条排程无论一次算完还是拆成多次算，单条行动的随机序列都不变。
    const rng = mulberry32(hashSeed(`${seed}:action:${item.id}`));

    // 次数/体力/钱：与入口 preflightAction 同源（T-031）
    const pf = preflightAction(state, item.actionId);
    if (!pf.ok) {
      stoppedReason =
        pf.reason === 'times'
          ? 'stopped'
          : pf.reason === 'stamina'
            ? 'stamina'
            : pf.reason === 'money'
              ? 'money'
              : pf.reason === 'pressure'
                ? 'pressure'
                : null;
      break;
    }

    const preview = previewAction(state, item.actionId);
    if (!preview) continue;

    // 按条件匹配结果表：数值与文案都可能和预览不同
    const resolved = resolveAction(state, item.actionId, rng);
    if (!resolved) continue;

    // 心情 / 压力：先结算变化，再算它对本条行动的影响（T-044 饱腹退役）
    const nextMood = Math.max(0, Math.min(100, (state.mood ?? 70) + resolved.mood));
    const nextStress = clamp((state.negatives?.stress ?? 0) + resolved.stress, 0, PRESSURE_MAX);

    const negatives = state.negatives ?? {};
    const proficiency = state.proficiency ?? {};

    let efficiency = 1;
    if (nextMood < 30) efficiency *= 0.7;
    else if (nextMood > 70) efficiency *= 1.05;
    if ((negatives.restless ?? 0) > 50) efficiency *= 0.95;
    // 压力过高效率打折：本条按「行动开始时」的压力判定（压力满了根本不让做，见 preflight）
    if ((negatives.stress ?? 0) > STRESS_EFFICIENCY_THRESHOLD) efficiency *= STRESS_EFFICIENCY_MUL;

    // 积劳：体力消耗更大。规则与预览 / 预检共用（T-042 / T-044）
    const staminaRule = settleStamina(resolved.stamina, negatives.fatigue ?? 0);
    const staminaApplied = staminaRule.applied;

    state.stamina = clampStamina(state.stamina + staminaApplied);
    state.money += resolved.money;
    state.mood = nextMood;
    state.negatives = { ...negatives, stress: nextStress };
    // T-021：健康 0–100（旧档缺省 100）；隐藏轴变化 clamp 后写回（不展示数值）
    state.health = clamp((state.health ?? 100) + resolved.health, 0, 100);
    for (const [k, v] of Object.entries(resolved.axes)) {
      const key = k as keyof typeof state.axes;
      state.axes[key] = clamp((state.axes[key] ?? 50) + v, 0, 100);
    }

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
      // T-043：数据表可能把非四项能力写进 stats（如 stamina），写进 stats 会变成 NaN 并永久污染存档
      if (!isStatKey(k)) continue;
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
      stressDelta: nextStress - (negatives.stress ?? 0),
      statDelta,
      kind: 'action',
    });

    state.at = item.endAt;
    cursor = item.endAt;
    executed.push(item.id);
    steps += 1;

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

    // T-017：本行动结算完后，自动领取「刚好可领」的引导/限时任务。
    // 放在每条行动之后而不是结算末尾——这样「一次算完」与「分多次算」的 acceptedAt 一致，
    // 保持 D-010 的结算确定性（T-002 的确定性测试覆盖这点）。
    state = autoAcceptTasks(state);

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

  // T-007 A：时间推进后统一结算任务超时（写冷却日 + 日志；无 deadlineDays 时不做任何事）
  // T-017 的自动领取在每条行动后已经跑过（见循环内），这里只收尾超时。
  // T-018：事件驱动阶段（如出道）落 flag 后，把推导出的更高阶段补进 stage:reached。
  return { state: syncStageReached(expireTasks(state)), executed, stoppedReason };
}
