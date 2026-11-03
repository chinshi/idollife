import { START_AT } from '../src/content';
import { describe, expect, it } from 'vitest';
import { matchesCondition } from '../src/expr';
import { createFans } from '../src/fans';
import type { RunState } from '../src/types';

/**
 * T-006：mood / satiety 接入表达式变量域（D-013 第 2 条）。
 *
 * 白名单在 expr-rules.js 的 FIXED_NAMES 里（与校验器同源），取值与缺省 70 在 expr.ts 的 toData 里。
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
    satiety: 70,
    fans: createFans(0),
    debuted: false,
    parties: [],
    activePartyId: null,
    friends: [],
    inventory: [],
    equipped: {},
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...over,
  } as RunState;
}

describe('mood / satiety 作为表达式变量', () => {
  it('A. mood >= 60：mood=70 为真、mood=50 为假', () => {
    expect(matchesCondition(mk({ mood: 70 }), 'mood >= 60')).toBe(true);
    expect(matchesCondition(mk({ mood: 50 }), 'mood >= 60')).toBe(false);
  });

  it('B. satiety < 30：satiety=20 为真、satiety=40 为假', () => {
    expect(matchesCondition(mk({ satiety: 20 }), 'satiety < 30')).toBe(true);
    expect(matchesCondition(mk({ satiety: 40 }), 'satiety < 30')).toBe(false);
  });

  it('C. 缺省值 70：state.mood / state.satiety 为 undefined 时按 70 求值', () => {
    const bare = mk({ mood: undefined, satiety: undefined });
    expect(matchesCondition(bare, 'mood >= 70')).toBe(true);
    expect(matchesCondition(bare, 'mood > 70')).toBe(false);
    expect(matchesCondition(bare, 'satiety >= 70')).toBe(true);
    expect(matchesCondition(bare, 'satiety > 70')).toBe(false);
  });

  it('D. 复合条件 mood >= 60 and satiety < 50', () => {
    expect(matchesCondition(mk({ mood: 70, satiety: 40 }), 'mood >= 60 and satiety < 50')).toBe(true);
    expect(matchesCondition(mk({ mood: 70, satiety: 60 }), 'mood >= 60 and satiety < 50')).toBe(false);
    expect(matchesCondition(mk({ mood: 50, satiety: 40 }), 'mood >= 60 and satiety < 50')).toBe(false);
  });

  it('E. 中文别名：心情 / 饱腹 等价于 mood / satiety', () => {
    expect(matchesCondition(mk({ mood: 70 }), '心情 >= 60')).toBe(true);
    expect(matchesCondition(mk({ mood: 50 }), '心情 >= 60')).toBe(false);
    expect(matchesCondition(mk({ satiety: 20 }), '饱腹 < 30')).toBe(true);
    expect(matchesCondition(mk({ satiety: 40 }), '饱腹 < 30')).toBe(false);
  });
});
