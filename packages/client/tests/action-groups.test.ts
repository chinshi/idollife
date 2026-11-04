import { describe, expect, it } from 'vitest';
import { ACTION_LIST, type RunState } from '@idollife/core';
import { PLAN_CATEGORIES, groupPlanActions } from '../src/components/action-groups';

/**
 * T-037 回归守卫：`安排行程`的分组必须按 actions.category 分组。
 * 修复前这里只判「不是演出」，导致每个分类标题下都渲染了全部 27 条行动。
 */
function fakeRun(): RunState {
  return {
    at: 0,
    startedAt: 0,
    stamina: 100,
    money: 5000,
    stats: { vocal: 20, dance: 20, acting: 20, talk: 20 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: { byType: {}, loyalty: {}, affection: {} },
    debuted: false,
    parties: [],
    activePartyId: null,
    friends: [],
    inventory: [],
    equipped: {},
    flags: {},
  } as unknown as RunState;
}

describe('groupPlanActions', () => {
  it('每个分组只包含本分类的行动', () => {
    const groups = groupPlanActions(fakeRun());
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      for (const a of g.items) {
        expect(a.category).toBe(g.cat);
      }
    }
  });

  it('同一行动不会出现在两个分组里', () => {
    const groups = groupPlanActions(fakeRun());
    const ids = groups.flatMap((g) => g.items.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('三个分类都非空，且不含演出', () => {
    const groups = groupPlanActions(fakeRun());
    expect(groups.map((g) => g.cat)).toEqual(PLAN_CATEGORIES);
    const ids = new Set(groups.flatMap((g) => g.items.map((a) => a.id)));
    for (const a of ACTION_LIST) {
      if (a.category === 'performance') expect(ids.has(a.id)).toBe(false);
    }
  });

  it('当前一条都做不了的分组不渲染', () => {
    const run = { ...fakeRun(), money: 0, stamina: 10, stats: { vocal: 0, dance: 0, acting: 0, talk: 0 } } as unknown as RunState;
    const groups = groupPlanActions(run);
    for (const g of groups) expect(g.items.length).toBeGreaterThan(0);
  });
});
