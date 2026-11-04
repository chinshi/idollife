import { TIME_SCALE, gameAdvance, nextStopAt, type ClockState, type ScheduleItem } from '@idollife/core';

export interface AdvanceFireInput {
  clock: ClockState | null;
  schedule: ScheduleItem[];
  serverNow: number;
  timeScale?: number;
}

/** T-039-r2：到停点才触发 advance；不依赖渲染帧，越过停点多久都要补发 */
export function shouldFireAdvance(
  input: AdvanceFireInput,
): { fire: boolean; targetAt: number | null } {
  const { clock, schedule, serverNow } = input;
  const timeScale = input.timeScale ?? TIME_SCALE;
  if (!clock || clock.status !== 'running') return { fire: false, targetAt: null };
  const next = nextStopAt(schedule);
  if (next == null) return { fire: false, targetAt: null };
  const gameNow = clock.gameAt + gameAdvance(serverNow - clock.wallAnchor, 1, timeScale);
  return gameNow >= next ? { fire: true, targetAt: next } : { fire: false, targetAt: null };
}
