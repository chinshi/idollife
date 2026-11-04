import { describe, expect, it } from 'vitest';
import { DAY_MS, START_AT } from '../src/content';
import { ENDINGS, decidedEnding, judgeEnding, recordEnding } from '../src/endings';
import { createFans } from '../src/fans';
import { RECRUIT_COOLDOWN_DAYS, kickMember } from '../src/friends';
import type { RunState } from '../src/types';

const T0 = START_AT;

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 5000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(100),
    debuted: true,
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

function withParty(): RunState {
  return base({
    parties: [
      {
        id: 'p1',
        name: '测试团',
        members: [{ id: 'm-f1', name: '小明', bias: 'vocal', dupCount: 3 }],
      },
    ],
    activePartyId: 'p1',
    friends: [
      {
        id: 'f1',
        name: '小明',
        bias: 'vocal',
        from: 'school',
        metAt: T0,
        quality: 1,
        partyId: 'p1',
        dupCount: 3,
      },
    ],
  });
}

/**
 * T-041 守卫：结局抉择与踢人都必须真的写进状态。
 *
 * 这两件事原来都只在客户端改内存（`commitRun` / `pushFresh((b) => b)`），
 * 刷新页面就还原 —— 玩家看到的是"结局白看了""人还在团里"。
 */
describe('recordEnding', () => {
  it('写入抉择与当时游戏时间', () => {
    const s = recordEnding(base(), 'leave');
    expect(s.ending).toEqual({ decision: 'leave', at: T0 });
  });

  it('已有抉择的档不再被覆盖（幂等，连点不会换结局）', () => {
    const first = recordEnding(base(), 'stay');
    const second = recordEnding(first, 'leave');
    expect(second).toBe(first);
    expect(second.ending?.decision).toBe('stay');
  });

  it('不改入参', () => {
    const s = base();
    recordEnding(s, 'backstage');
    expect(s.ending).toBeUndefined();
  });
});

describe('decidedEnding', () => {
  it('没做过抉择 → null', () => {
    expect(decidedEnding(base())).toBeNull();
  });

  it('做过抉择 → 与 judgeEnding 用同一决策算出的结果一致', () => {
    const s = recordEnding(base(), 'backstage');
    const got = decidedEnding(s);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(judgeEnding(s, 'backstage').id);
    expect(ENDINGS[got!.id]).toBeTruthy();
  });
});

describe('kickMember', () => {
  it('从组合里移除成员，并把人退回朋友圈 + 进招募冷却', () => {
    const s = withParty();
    const r = kickMember(s, 'm-f1');
    expect(r.result).toBe('ok');
    expect(r.state.parties[0]!.members).toHaveLength(0);
    const f = r.state.friends.find((x) => x.id === 'f1')!;
    expect(f.partyId).toBeNull();
    expect(f.cooldownUntil).toBe(T0 + RECRUIT_COOLDOWN_DAYS * DAY_MS);
    expect(r.state.log.at(-1)?.actionId).toBe('kick');
  });

  it('成员不在这个组合里 → not-found，状态原样返回', () => {
    const s = withParty();
    const r = kickMember(s, 'm-nope');
    expect(r.result).toBe('not-found');
    expect(r.state).toBe(s);
  });

  it('没有当前组合 → no-party', () => {
    const s = base();
    expect(kickMember(s, 'm-f1').result).toBe('no-party');
  });
});
