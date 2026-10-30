import { describe, expect, it } from 'vitest';
import { applyFanAction, createFans, loseFans, totalFans } from '../src/fans';

describe('fans', () => {
  it('做喜欢的事会涨粉，好感累积到 100 触发向上转化', () => {
    let fans = createFans(1000);

    // 每次 +10 好感，10 次刚好满
    for (let i = 0; i < 10; i++) {
      fans = applyFanAction(fans, 'stage', 10, 10);
    }

    expect(fans.byType.stage).toBe(100);
    expect(fans.affection.stage).toBe(0);
    expect(fans.loyalty.dd).toBeGreaterThan(0);
    expect(fans.loyalty.casual).toBeLessThan(1100);
  });

  it('转化过程中总人数守恒', () => {
    let fans = createFans(500);
    for (let i = 0; i < 30; i++) {
      fans = applyFanAction(fans, 'gachi', 5, 10);
    }
    expect(totalFans(fans)).toBe(500 + 150);
  });

  it('掉粉从低层开始扣，总数正确', () => {
    const fans = createFans(100);
    const next = loseFans(fans, 30);
    expect(totalFans(next)).toBe(70);
    expect(next.loyalty.casual).toBe(70);
  });
});
