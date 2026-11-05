import { START_AT } from '../src/content';
import { describe, expect, it } from 'vitest';
import { matchesCondition } from '../src/expr';
import { createFans } from '../src/fans';
import type { RunState } from '../src/types';

/**
 * T-006：mood / stress 接入表达式变量域（D-013 第 2 条）。
 * T-044：饱腹退役，stress（压力）接替它的表达式位置。
 *
 * 白名单在 expr-rules.js 的 FIXED_NAMES 里（与校验器同源），
 * 取值与缺省（mood 70 / stress 0）在 expr.ts 的 buildExprData 里。
 */

const T0 = START_AT;

function mk(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 60,
    money: 5000,
    stats: { vocal: 100, dance: 40, acting: 40, talk: 40 },
    axes: { self: 50, others: 50, fit: 50 },
    mood: 70,
    fans: createFans(0),
    debuted: false,
    parties: [],
    activePartyId: null,
    friends: [],
    inventory: [],
    equipped: {},
    flags: {},
    negatives: { stress: 0, restless: 0, fatigue: 0, desire: 0, scandal: 0 },
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...over,
  } as RunState;
}

const withStress = (v: number) =>
  mk({ negatives: { stress: v, restless: 0, fatigue: 0, desire: 0, scandal: 0 } });

describe('mood / stress 作为表达式变量', () => {
  it('A. mood >= 60：mood=70 为真、mood=50 为假', () => {
    expect(matchesCondition(mk({ mood: 70 }), 'mood >= 60')).toBe(true);
    expect(matchesCondition(mk({ mood: 50 }), 'mood >= 60')).toBe(false);
  });

  it('B. stress >= 80：80 为真、40 为假', () => {
    expect(matchesCondition(withStress(80), 'stress >= 80')).toBe(true);
    expect(matchesCondition(withStress(40), 'stress >= 80')).toBe(false);
  });

  it('C. 缺省值：mood 缺省 70、stress 缺省 0', () => {
    const bare = mk({ mood: undefined });
    expect(matchesCondition(bare, 'mood >= 70')).toBe(true);
    expect(matchesCondition(bare, 'mood > 70')).toBe(false);
    expect(matchesCondition(bare, 'stress == 0')).toBe(true);
  });

  it('D. 复合条件 mood >= 60 and stress >= 80', () => {
    expect(matchesCondition(withStress(90), 'mood >= 60 and stress >= 80')).toBe(true);
    expect(matchesCondition(withStress(40), 'mood >= 60 and stress >= 80')).toBe(false);
    expect(matchesCondition(mk({ mood: 50 }), 'mood >= 60 and stress >= 80')).toBe(false);
  });

  it('E. 中文别名：心情 / 压力 等价于 mood / stress', () => {
    expect(matchesCondition(mk({ mood: 70 }), '心情 >= 60')).toBe(true);
    expect(matchesCondition(mk({ mood: 50 }), '心情 >= 60')).toBe(false);
    expect(matchesCondition(withStress(90), '压力 >= 80')).toBe(true);
    expect(matchesCondition(withStress(40), '压力 >= 80')).toBe(false);
  });
});
