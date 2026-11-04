import type { RunState } from '@idollife/core';

/** T-039-r4：compute 必须收到服务端对齐后的 run；无对齐结果才回退本地 */
export function freshBase(aligned: RunState | null, fallback: RunState): RunState {
  return aligned ?? fallback;
}

/** compute 返回同一引用 = 主动放弃，不写 UI/库 */
export function shouldWriteFresh(base: RunState, next: RunState): boolean {
  return next !== base;
}
