import { describe, expect, it } from 'vitest';
import { compileExpression, matchesCondition } from '../src/expr';
import { createFans } from '../src/fans';
import type { RunState } from '../src/types';

const T0 = 1767300000000;

function mk(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 60,
    money: 5000,
    stats: { vocal: 100, dance: 40, acting: 40, talk: 40 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: {
      ...createFans(120),
      byType: { ...createFans(0).byType, stage: 120 },
    },
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

describe('条件表达式', () => {
  it('三个条件 AND 组合', () => {
    const fn = compileExpression('vocal >= 100 and dance < 50 and total > 200');
    expect(fn(mk())).toBe(true);
    expect(fn(mk({ stats: { vocal: 99, dance: 40, acting: 40, talk: 40 } }))).toBe(false);
    expect(fn(mk({ stats: { vocal: 100, dance: 50, acting: 40, talk: 40 } }))).toBe(false);
  });

  it('支持中文属性名与 && ||', () => {
    const fn = compileExpression('演唱 >= 100 && (舞蹈 < 50 || 演技 > 60)');
    expect(fn(mk())).toBe(true);
    expect(fn(mk({ stats: { vocal: 100, dance: 60, acting: 30, talk: 30 } }))).toBe(false);
  });

  it('支持 not / 括号', () => {
    const fn = compileExpression('not (money < 1000)');
    expect(fn(mk())).toBe(true);
    expect(fn(mk({ money: 500 }))).toBe(false);
  });

  it('支持 fans.xxx 与 hasFlag', () => {
    expect(matchesCondition(mk(), 'fans.stage >= 100')).toBe(true);
    expect(matchesCondition(mk(), 'hasFlag("ev:debut")')).toBe(false);
    expect(matchesCondition(mk({ flags: { 'ev:debut': true } }), 'hasFlag("ev:debut")')).toBe(true);
  });

  it('支持 sum / max / min 函数和算术', () => {
    expect(matchesCondition(mk(), 'sum(vocal, dance) >= 140')).toBe(true);
    expect(matchesCondition(mk(), 'max(vocal, dance) > dance')).toBe(true);
    expect(matchesCondition(mk(), 'vocal - dance >= 60')).toBe(true);
  });

  it('旧的 JSON 条件仍然可用', () => {
    expect(matchesCondition(mk(), { statsAtLeast: { vocal: 100 } })).toBe(true);
    expect(matchesCondition(mk(), { statsBelow: { dance: 50 } })).toBe(true);
    expect(matchesCondition(mk(), { statsSumAtLeast: 201 })).toBe(true);
  });

  it('写错时抛出明确错误', () => {
    expect(() => compileExpression('vocal >=')).toThrow();
    expect(() => compileExpression('unknownVar > 1')).toThrow(/未知变量/);
    expect(() => compileExpression('vocal > 1 extra')).toThrow();
  });
});
