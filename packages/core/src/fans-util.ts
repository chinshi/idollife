import type { Fans, FanType } from './fans';

/** 取占比最高的粉丝类型 */
export function dominantFanType(fans: Fans): FanType {
  const entries = Object.entries(fans.byType) as [FanType, number][];
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'stage';
}

/** 某类粉丝占总数的比例（0–1） */
export function fanShare(fans: Fans, type: FanType): number {
  const total = Object.values(fans.byType).reduce((a, b) => a + b, 0);
  return total > 0 ? fans.byType[type] / total : 0;
}
