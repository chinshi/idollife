import { describe, expect, it } from 'vitest';
import { staminaMaxFrom } from '../src/content';

describe('体力上限缺省', () => {
  it('表里没有 staminaMax 时回落到 100', () => {
    expect(staminaMaxFrom({})).toBe(100);
    expect(staminaMaxFrom({ staminaMax: undefined })).toBe(100);
    expect(staminaMaxFrom({ staminaMax: null })).toBe(100);
  });

  it('表里有时以表为准', () => {
    expect(staminaMaxFrom({ staminaMax: 120 })).toBe(120);
    expect(staminaMaxFrom({ staminaMax: '90' })).toBe(90);
  });
});
