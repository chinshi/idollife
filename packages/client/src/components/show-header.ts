import type { RawCity } from '@idollife/core';

/** 演出页头容量文案（T-033；纯函数，便于测试） */
export function showHeaderText(city: RawCity): string {
  const count =
    city.midMax > 0
      ? `周末 ${city.weekend} 场 · 周中 ${city.midMin}~${city.midMax} 场`
      : `本周 ${city.weekend} 场`;
  const cap = city.maxSlots >= 99 ? '不限顺位' : `顺位上限 ${city.maxSlots}`;
  return `${count} · ${cap}`;
}
