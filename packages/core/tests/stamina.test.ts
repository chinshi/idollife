import { describe, expect, it } from 'vitest';
import { STAMINA_MAX, clampStamina } from '../src/content';

describe('体力上限', () => {
  it('上限来自配置表', () => {
    expect(STAMINA_MAX).toBeGreaterThan(0);
  });

  it('超过上限会被夹住', () => {
    expect(clampStamina(STAMINA_MAX + 50)).toBe(STAMINA_MAX);
    expect(clampStamina(-10)).toBe(0);
  });
});
