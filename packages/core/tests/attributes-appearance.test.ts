import { describe, expect, it } from 'vitest';
import { appearanceLabel } from '../src/attributes';

/**
 * T-016c：样貌数值 → 区间文案（用户口径：50–100，每 10 分一档，四字名，50–59 = 平平无奇）。
 * 覆盖 6 档、边界值 49/50/59/60/89/90/100、越界 -5/120（兜底档），以及 NaN/undefined 兜底。
 */
describe('appearanceLabel 颜值文案', () => {
  it('6 档各一条精确断言（四字名）', () => {
    expect(appearanceLabel(40)).toBe('其貌不扬'); // <50 兜底档（旧档数值）
    expect(appearanceLabel(50)).toBe('平平无奇');
    expect(appearanceLabel(65)).toBe('清秀耐看');
    expect(appearanceLabel(75)).toBe('气质出众');
    expect(appearanceLabel(85)).toBe('明艳动人');
    expect(appearanceLabel(95)).toBe('惊为天人');
  });

  it('边界值 49/50/59/60/69/70/89/90/100 落在正确档位', () => {
    expect(appearanceLabel(49)).toBe('其貌不扬');
    expect(appearanceLabel(50)).toBe('平平无奇');
    expect(appearanceLabel(59)).toBe('平平无奇');
    expect(appearanceLabel(60)).toBe('清秀耐看');
    expect(appearanceLabel(69)).toBe('清秀耐看');
    expect(appearanceLabel(70)).toBe('气质出众');
    expect(appearanceLabel(79)).toBe('气质出众');
    expect(appearanceLabel(80)).toBe('明艳动人');
    expect(appearanceLabel(89)).toBe('明艳动人');
    expect(appearanceLabel(90)).toBe('惊为天人');
    expect(appearanceLabel(100)).toBe('惊为天人');
  });

  it('越界兜底：-5 与 49 一样进兜底档、120 按最后一档', () => {
    expect(appearanceLabel(-5)).toBe('其貌不扬');
    expect(appearanceLabel(120)).toBe('惊为天人');
  });

  it('小数按 Math.floor 取整', () => {
    expect(appearanceLabel(59.9)).toBe('平平无奇');
    expect(appearanceLabel(89.9)).toBe('明艳动人');
  });

  it('NaN / undefined / 非数字 → —', () => {
    expect(appearanceLabel(Number.NaN)).toBe('—');
    expect(appearanceLabel(undefined as unknown as number)).toBe('—');
    expect(appearanceLabel(null as unknown as number)).toBe('—');
  });
});
