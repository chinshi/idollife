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
