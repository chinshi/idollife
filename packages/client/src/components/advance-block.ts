import type { PreflightResult } from '@idollife/core';

export interface AdvanceBlock {
  reason: string;
  text: string;
  /** 绑定的队首行程项；条目被删/完成后横幅自动失效 */
  itemId?: string;
}

const UNIT: Record<string, string> = { 今天: '天', 本周: '周', 本局: '局' };

/** 推进受阻文案：完整版给主区横幅，compact 给行程页短提示（同一来源） */
export function advanceBlockText(
  pf: PreflightResult,
  actionName: string,
  scopeWord = '本局',
  opts: { compact?: boolean; times?: number } = {},
): string {
  if (pf.ok) return '';
  const gap = Math.max(0, (pf.need ?? 0) - (pf.have ?? 0));
  if (pf.reason === 'stamina') {
    return opts.compact
      ? `下一条「${actionName}」体力差 ${gap}`
      : `「${actionName}」体力差 ${gap}，这一条排在队首，推不动。`;
  }
  if (pf.reason === 'money') {
    return opts.compact
      ? `下一条「${actionName}」钱差 ¥${gap}`
      : `「${actionName}」钱差 ¥${gap}，这一条排在队首，推不动。`;
  }
  const unit = UNIT[scopeWord] ?? '局';
  const times = opts.times ? `（每${unit} ${opts.times} 次）` : '';
  return opts.compact
    ? `下一条「${actionName}」${scopeWord}次数已用完`
    : `「${actionName}」${scopeWord}次数已用完${times}，删掉它，后面的行程才能走。`;
}

/**
 * T-038：推进入口门禁。
 *
 * `advance()` 里任何 return 都必须走这里，由主区横幅给出可见原因——
 * 不允许出现"点了没反应"（T-035 只治了 preflight 那一条出口，另外四条仍静默）。
 * 返回 null = 放行。
 */
export interface AdvanceGateInput {
  /** 已有一批在跑 */
  running: boolean;
  /** 未完成行程条数 */
  pendingCount: number;
  /** 有未处理的重点事件 */
  hasPendingEvent: boolean;
}

export function advanceGate(i: AdvanceGateInput): AdvanceBlock | null {
  if (i.running) {
    return { reason: 'running', text: '正在推进中，等这一批走完，或点「停止」再改行程。' };
  }
  if (i.pendingCount === 0) {
    return { reason: 'empty', text: '没有待执行的行程，点「去安排行程」至少加一条。' };
  }
  if (i.hasPendingEvent) {
    return { reason: 'event', text: '有一条重点事件还没处理，先处理它才能继续推进。' };
  }
  return null;
}

/** 统一生成横幅状态与顶栏徽章 reason（保证 lastStop 非空） */
export function makeAdvanceBlock(
  pf: PreflightResult,
  actionName: string,
  scopeWord = '本局',
  times?: number,
  itemId?: string,
): AdvanceBlock & { lastStop: string } {
  return {
    reason: pf.reason,
    text: advanceBlockText(pf, actionName, scopeWord, { times }),
    itemId,
    lastStop: pf.reason,
  };
}
