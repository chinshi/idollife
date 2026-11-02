import { describe, expect, it } from 'vitest';
import { createFans } from '../src/fans';
import { compileExpression } from '../src/expr';
import { describeCondition } from '../src/tasks';
import {
  STAGES,
  STAGE_REACHED_KEY,
  advanceStage,
  canAdvance,
  currentStage,
  derivedStageSeq,
  nextStage,
  stageBadgeClass,
  syncStageReached,
} from '../src/stages';
import type { RunState } from '../src/types';

/**
 * T-018：成长阶段推导 / 晋级 / fansTotal 表达式变量。
 */
const T0 = 3 * 1_800_000; // 随便一个游戏时间；阶段逻辑不看时间

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 6000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
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

function withFans(stage: number, gachi = 0): RunState {
  const fans = createFans(0);
  fans.byType.stage = stage;
  fans.byType.gachi = gachi;
  return base({ fans });
}

describe('T-018 成长阶段', () => {
  it('STAGES：8 条、seq 1..8 连续、样式 s1–s8', () => {
    expect(STAGES.length).toBe(8);
    expect(STAGES.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(STAGES.map((s) => s.style)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']);
    expect(STAGES[7]?.id).toBe('legend');
  });

  it('currentStage：无 flag 的旧档按进入条件推导', () => {
    expect(currentStage(base()).seq).toBe(1); // total 40
    expect(currentStage(base({ stats: { vocal: 20, dance: 20, acting: 10, talk: 10 } })).seq).toBe(2); // total 60
    expect(currentStage(base({ stats: { vocal: 30, dance: 30, acting: 30, talk: 30 } })).seq).toBe(3); // total 120
    expect(currentStage(base({ flags: { 'ev:debut': true } })).seq).toBe(4);
    expect(currentStage(withFans(300)).seq).toBe(5); // fansTotal >= 300
    expect(currentStage(withFans(299)).seq).toBe(1);
  });

  it('currentStage：flags 记录优先（有记录时不再按条件自动跳阶）', () => {
    const state = base({ flags: { [STAGE_REACHED_KEY]: 6 } });
    expect(currentStage(state).seq).toBe(6);
    expect(currentStage(base({ flags: { [STAGE_REACHED_KEY]: 99 } })).seq).toBe(8);
    // 有记录时，即使条件已经满足下一阶段也不会自己跳（等玩家点晋级）
    const reached1ButMet = base({
      flags: { [STAGE_REACHED_KEY]: 1 },
      stats: { vocal: 20, dance: 20, acting: 10, talk: 10 },
    });
    expect(currentStage(reached1ButMet).seq).toBe(1);
    expect(canAdvance(reached1ButMet)).toBe(true);
  });

  it('nextStage / canAdvance：下一阶段条件满足才可晋级', () => {
    expect(nextStage(base())?.seq).toBe(2);
    expect(nextStage(base({ flags: { [STAGE_REACHED_KEY]: 8 } }))).toBeNull();
    expect(canAdvance(base())).toBe(false);

    const reached1 = base({
      flags: { [STAGE_REACHED_KEY]: 1 },
      stats: { vocal: 20, dance: 20, acting: 10, talk: 10 },
    });
    expect(canAdvance(reached1)).toBe(true);
  });

  it('advanceStage：写 stage:reached + 日志 + notice', () => {
    const reached1 = base({
      flags: { [STAGE_REACHED_KEY]: 1 },
      stats: { vocal: 20, dance: 20, acting: 10, talk: 10 },
    });
    const result = advanceStage(reached1);

    expect(result.result).toBe('ok');
    expect(result.notice).toBe('晋级：见习练习生！');
    expect(result.state.flags[STAGE_REACHED_KEY]).toBe(2);
    expect(result.state.log.at(-1)?.text).toBe('阶段提升：新人练习生 → 见习练习生。');
    // 不改变数值
    expect(result.state.stats).toEqual(reached1.stats);
  });

  it('advanceStage：下一阶段是 seq4 时返回 debut-required（走出道演出流程）', () => {
    const preDebut = base({
      flags: { [STAGE_REACHED_KEY]: 3, 'ev:debut': true },
      stats: { vocal: 30, dance: 30, acting: 30, talk: 30 },
    });
    expect(currentStage(preDebut).seq).toBe(3);

    const result = advanceStage(preDebut);
    expect(result.result).toBe('debut-required');
    expect(result.state.flags[STAGE_REACHED_KEY]).toBe(3);
    expect(result.state.log.length).toBe(preDebut.log.length);
  });

  it('syncStageReached：出道事件落 flag 后把推导结果补进 stage:reached', () => {
    const afterDebut = base({
      flags: { [STAGE_REACHED_KEY]: 3, 'ev:debut': true },
      stats: { vocal: 30, dance: 30, acting: 30, talk: 30 },
    });
    const synced = syncStageReached(afterDebut);
    expect(synced.flags[STAGE_REACHED_KEY]).toBe(4);
    expect(currentStage(synced).seq).toBe(4);
    // 不降级
    expect(syncStageReached(base({ flags: { [STAGE_REACHED_KEY]: 6 } })).flags[STAGE_REACHED_KEY]).toBe(6);
  });

  it('advanceStage：条件不满足 / 终阶', () => {
    expect(advanceStage(base()).result).toBe('locked');
    expect(advanceStage(base({ flags: { [STAGE_REACHED_KEY]: 8 } })).result).toBe('final');
  });

  it('derivedStageSeq：旧档迁移推导（有 ev:debut → ≥4）', () => {
    expect(derivedStageSeq(base({ flags: { 'ev:debut': true } }))).toBe(4);
    expect(derivedStageSeq(base())).toBe(1);
  });

  it('stageBadgeClass：返回 stage-badge s{n}', () => {
    expect(stageBadgeClass(STAGES[0]!)).toBe('stage-badge s1');
    expect(stageBadgeClass(STAGES[4]!)).toBe('stage-badge s5');
    expect(stageBadgeClass(STAGES[7]!)).toBe('stage-badge s8');
  });

  it('fansTotal 进表达式域：可编译、可求值、可翻中文', () => {
    const fn = compileExpression('fansTotal >= 300');
    expect(fn(withFans(300, 0))).toBe(true);
    expect(fn(withFans(299, 0))).toBe(false);
    expect(fn(withFans(200, 100))).toBe(true); // 六类之和

    expect(describeCondition('fansTotal >= 300')).toBe('粉丝总数 ≥ 300');
    expect(describeCondition('粉丝总数 >= 300')).toBe('粉丝总数 ≥ 300');
  });
});
