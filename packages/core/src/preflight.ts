/**
 * 推进前可行性判定（T-031）。
 *
 * 与 settle.ts 里「行动前」的三条检查同源：次数 → 体力 → 钱。
 * 纯函数：不读 Date.now / Math.random / DOM / localStorage。
 */
import { ACTION_META, PRESSURE_MAX, STAMINA_MAX, remainingTimes } from './content';
import { previewAction } from './results';
import { nextPendingItem } from './plan';
import type { RunState, ScheduleItem } from './types';

export type PreflightReason = 'ok' | 'stamina' | 'money' | 'times' | 'pressure';

export interface PreflightResult {
  ok: boolean;
  reason: PreflightReason;
  /** 给玩家看的一句话（ok 时为空串） */
  text: string;
  /** 需要多少 / 现在多少（ok 时为 undefined；次数用尽时 need=0） */
  need?: number;
  have?: number;
}

/** 判这一条现在能不能跑：次数 → 体力 → 钱（顺序与 settle 一致） */
export function preflightAction(state: RunState, actionId: string): PreflightResult {
  // T-044：压力到顶，产出行动一律不能做，必须先去减压。
  // 放在最前面：压力满时连「次数」都不该往下判，否则给出的提示会指错方向。
  const meta = ACTION_META[actionId];
  const stress = state.negatives?.stress ?? 0;
  if (meta && meta.category !== 'recover' && stress >= PRESSURE_MAX) {
    return {
      ok: false,
      reason: 'pressure',
      need: PRESSURE_MAX,
      have: stress,
      text: `压力已经满了（${stress}/${PRESSURE_MAX}），这条做不了。先安排一次减压：洗澡、游乐园或旅行。`,
    };
  }

  const left = remainingTimes(state, actionId);
  if (left <= 0) {
    const meta = ACTION_META[actionId];
    const scope = meta?.timesScope ?? 'run';
    const times = meta?.times ?? 0;
    const word = { day: '今天', week: '本周', run: '本局' }[scope] ?? '本局';
    const unit = { day: '天', week: '周', run: '局' }[scope] ?? '局';
    return {
      ok: false,
      reason: 'times',
      need: 0,
      have: 0,
      text: `这条${word}的次数用完了（每${unit} ${times} 次）。删掉它，后面的行程才能接着跑。`,
    };
  }

  const preview = previewAction(state, actionId);
  if (!preview) return { ok: true, reason: 'ok', text: '' };

  // T-042：脏数据里 stamina/money 可能是 undefined，`undefined + x < 0` 恒为 false
  // 等于「永远拦不住」。这里按上限/0 兜底，宁可多拦也不放行。
  const haveStamina = Number.isFinite(state.stamina) ? state.stamina : STAMINA_MAX;
  const haveMoney = Number.isFinite(state.money) ? state.money : 0;

  if (preview.stamina < 0 && haveStamina + preview.stamina < 0) {
    const need = -preview.stamina;
    return {
      ok: false,
      reason: 'stamina',
      need,
      have: haveStamina,
      text: `体力不够：这条要 ${need} 点，你现在 ${haveStamina}。在安排行程里删掉它，或先把它换成恢复。`,
    };
  }
  if (preview.money < 0 && haveMoney + preview.money < 0) {
    const need = -preview.money;
    return {
      ok: false,
      reason: 'money',
      need,
      have: haveMoney,
      text: `钱不够：这条要 ¥${need}，你现在 ¥${haveMoney}。在安排行程里删掉它，或先换成赚钱。`,
    };
  }

  return { ok: true, reason: 'ok', text: '' };
}

/** 队首项预检；没有待执行项或队首是演出项（不可预检）时返回 null */
export function preflightNext(
  schedule: ScheduleItem[],
  state: RunState,
): PreflightResult | null {
  const first = nextPendingItem(schedule);
  if (!first || first.kind === 'show') return null;
  return preflightAction(state, first.actionId);
}
