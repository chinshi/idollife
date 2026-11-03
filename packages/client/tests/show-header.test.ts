import { describe, expect, it } from 'vitest';
import { cityDef } from '@idollife/core';
import { showHeaderText } from '../src/components/show-header';

describe('T-033 演出页头文案', () => {
  it('超一线页头包含周中场次与不限顺位', () => {
    const text = showHeaderText(cityDef(0));
    expect(text).toContain('周中');
    expect(text).toContain('不限顺位');
    expect(text).not.toContain('顺位上限');
  });

  it('三线页头不含周中，显示顺位上限', () => {
    const text = showHeaderText(cityDef(3));
    expect(text).not.toContain('周中');
    expect(text).toContain('本周 1 场');
    expect(text).toContain('顺位上限 7');
  });
});
