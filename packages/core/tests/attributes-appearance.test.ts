import { describe, expect, it } from 'vitest';
import { appearanceLabel } from '../src/attributes';

/**
 * T-014：样貌数值 → 区间文案（策划定的文案，照抄）。
 * 覆盖 6 档、边界值 19/20/39/40/89/90、越界 -5/120，以及 NaN/undefined 兜底。
 */
describe('appearanceLabel 颜值文案', () => {
  it('6 档各一条精确断言', () => {
    expect(appearanceLabel(0)).toBe('不上镜');
    expect(appearanceLabel(25)).toBe('普通');
    expect(appearanceLabel(50)).toBe('耐看');
    expect(appearanceLabel(70)).toBe('上镜');
    expect(appearanceLabel(85)).toBe('很上镜');
    expect(appearanceLabel(95)).toBe('镜头会追着你');
  });

  it('边界值 19/20/39/40/79/80/89/90 落在正确档位', () => {
    expect(appearanceLabel(19)).toBe('不上镜');
    expect(appearanceLabel(20)).toBe('普通');
    expect(appearanceLabel(39)).toBe('普通');
    expect(appearanceLabel(40)).toBe('耐看');
    expect(appearanceLabel(59)).toBe('耐看');
    expect(appearanceLabel(60)).toBe('上镜');
    expect(appearanceLabel(79)).toBe('上镜');
    expect(appearanceLabel(80)).toBe('很上镜');
    expect(appearanceLabel(89)).toBe('很上镜');
    expect(appearanceLabel(90)).toBe('镜头会追着你');
    expect(appearanceLabel(100)).toBe('镜头会追着你');
  });

  it('越界兜底：-5 按第一档、120 按最后一档', () => {
    expect(appearanceLabel(-5)).toBe('不上镜');
    expect(appearanceLabel(120)).toBe('镜头会追着你');
  });

  it('小数按 Math.floor 取整', () => {
    expect(appearanceLabel(19.9)).toBe('不上镜');
    expect(appearanceLabel(89.9)).toBe('很上镜');
  });

  it('NaN / undefined / 非数字 → —', () => {
    expect(appearanceLabel(Number.NaN)).toBe('—');
    expect(appearanceLabel(undefined as unknown as number)).toBe('—');
    expect(appearanceLabel(null as unknown as number)).toBe('—');
  });
});
