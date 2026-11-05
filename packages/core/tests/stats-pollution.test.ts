import { describe, expect, it } from 'vitest';
import { START_AT } from '../src/content';
import { attrValue, sanitizeStats } from '../src/attributes';
import { createFans } from '../src/fans';
import { TASKS, acceptTask, claimTaskReward, describeRewards, taskStatus } from '../src/tasks';
import type { RunState } from '../src/types';

const T0 = START_AT;

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 6000,
    stats: { vocal: 15, dance: 15, acting: 15, talk: 15 },
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
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...over,
  };
}

/** 脏档：stats 里被写进 stamina:null（线上真实数据长这样） */
const dirty = (over: Partial<RunState> = {}) =>
  base({
    stamina: 100,
    stats: { vocal: 15, dance: 15, acting: 15, talk: 15, stamina: null } as unknown as RunState['stats'],
    ...over,
  });

describe('T-043 面板不被 stats 脏键盖住', () => {
  it('stats 里混进 stamina:null 时，attrValue 仍然返回真实的 run.stamina', () => {
    expect(attrValue(dirty({ stamina: 100 }), 'stamina')).toBe(100);
    expect(attrValue(dirty({ stamina: 42 }), 'stamina')).toBe(42);
  });

  it('stats 里混进 mood:null 时，attrValue 读真实 mood', () => {
    const run = dirty({ mood: 88, stats: { vocal: 15, dance: 15, acting: 15, talk: 15, mood: null } as unknown as RunState['stats'] });
    expect(attrValue(run, 'mood')).toBe(88);
  });

  it('四项能力照常读 stats', () => {
    expect(attrValue(dirty(), 'vocal')).toBe(15);
    expect(attrValue(dirty({ stats: { vocal: Number.NaN, dance: 2, acting: 3, talk: 4 } as RunState['stats'] }), 'vocal')).toBe(0);
  });

  it('sanitizeStats 只留四项能力，非法值归 0', () => {
    const cleaned = sanitizeStats({ vocal: 15, dance: null, acting: Number.NaN, talk: 7, stamina: 25 });
    expect(cleaned).toEqual({ vocal: 15, dance: 0, acting: 0, talk: 7 });
    expect('stamina' in cleaned).toBe(false);
  });
});

describe('T-043 任务奖励不再把体力写进 stats', () => {
  const burnout = TASKS.find((t) => t.id === 'task-burnout')!;

  it('「学会休息」奖励的 25 体力真的到账，且 stats 里不出现 stamina 键', () => {
    let state = base({ stamina: 40, flags: { 'ev:burnout': T0 } });
    const accepted = acceptTask(state, burnout.id);
    expect(accepted.result).toBe('ok');
    state = accepted.state;
    expect(taskStatus(state, burnout)).toBe('completable');

    const claimed = claimTaskReward(state, burnout.id);
    expect(claimed.result).toBe('ok');
    expect(claimed.state.stamina).toBe(65);
    expect('stamina' in claimed.state.stats).toBe(false);
    expect(claimed.state.stats.vocal).toBe(15);
    expect(Number.isFinite(claimed.state.stats.vocal)).toBe(true);
  });

  it('奖励文案与实际发放一致（都认这 25 点体力）', () => {
    expect(describeRewards(burnout)).toContain('体力 +25');
  });
});
