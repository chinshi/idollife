import { describe, expect, it } from 'vitest';
import { PRESSURE_MAX, START_AT } from '../src/content';
import { createFans } from '../src/fans';
import { preflightAction } from '../src/preflight';
import { previewAction } from '../src/results';
import { settle } from '../src/settle';
import type { RunState, ScheduleItem } from '../src/types';

/**
 * T-044 守卫：压力（stress）取代饱腹，成为第二条长线轴。
 *
 * 产品口径（用户 2026-11-05 拍板）：
 * - 从 0 涨到 100，普通行动 15~20 条左右需要恢复一次
 * - 到顶就不能干活，必须先减压
 * - 减压走「一次清空，低频大额」：旅行一次清零，睡觉不解压
 */

const MIN = 60_000;
const T0 = START_AT;
const PURE = { routineChance: 0, storyEvents: false };

function baseRun(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 100000,
    mood: 70,
    health: 100,
    parties: [],
    friends: [],
    activePartyId: null,
    debuted: false,
    inventory: [],
    equipped: {},
    stats: { vocal: 20, dance: 20, acting: 20, talk: 20 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(0),
    flags: {},
    negatives: { stress: 0, restless: 0, fatigue: 0, desire: 0, scandal: 0 },
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...over,
  } as RunState;
}

function one(state: RunState, actionId: string): ReturnType<typeof settle> {
  const item: ScheduleItem = {
    id: `i-${state.at}`,
    actionId,
    startAt: state.at,
    endAt: state.at + 10 * MIN,
  };
  return settle(state, [item], state.at, state.at + 10 * MIN, 'seed-pressure', PURE);
}

/**
 * 模拟一个真实玩家：体力见底就爆睡、否则继续做同一条产出行动。
 * 返回「做了多少条产出行动」和终止原因。
 */
function playUntil(actionId: string, stepLimit = 120) {
  let state = baseRun();
  let productions = 0;
  let sleeps = 0;
  for (let i = 0; i < stepLimit; i++) {
    const pv = previewAction(state, actionId);
    if (!pv) throw new Error(`no preview for ${actionId}`);
    const need = Math.max(0, -pv.stamina);
    const act = state.stamina < need ? 'rest-sleep' : actionId;
    const res = one(state, act);
    if (res.executed.length === 0) {
      return { productions, sleeps, stress: state.negatives?.stress ?? 0, stopped: res.stoppedReason };
    }
    state = res.state;
    if (act === 'rest-sleep') sleeps += 1;
    else {
      productions += 1;
      if ((state.negatives?.stress ?? 0) >= PRESSURE_MAX) {
        return { productions, sleeps, stress: state.negatives?.stress ?? 0, stopped: null };
      }
    }
  }
  return { productions, sleeps, stress: state.negatives?.stress ?? 0, stopped: 'loop-limit' as const };
}

describe('压力增长节奏：15~20 个普通行动到顶', () => {
  it('中档打工（-20 体力 / +6 压力）约 17 条到 100', () => {
    const r = playUntil('work-part-time');
    expect(r.stress).toBeGreaterThanOrEqual(PRESSURE_MAX);
    expect(r.productions).toBeGreaterThanOrEqual(15);
    expect(r.productions).toBeLessThanOrEqual(20);
  });

  it('轻活（-10 体力 / +5 压力）约 20 条到 100', () => {
    const r = playUntil('vocal-karaoke');
    expect(r.stress).toBeGreaterThanOrEqual(PRESSURE_MAX);
    expect(r.productions).toBeGreaterThanOrEqual(15);
    expect(r.productions).toBeLessThanOrEqual(22);
  });

  it('重活（-28 体力 / +7 压力）到顶时做的条数更少', () => {
    const heavy = playUntil('vocal-coach');
    const light = playUntil('vocal-karaoke');
    expect(heavy.productions).toBeLessThan(light.productions);
    expect(heavy.stress).toBeGreaterThanOrEqual(PRESSURE_MAX);
  });
});

describe('压力到顶就干不了活', () => {
  it('压力 100：产出行动 preflight 拦下，reason=pressure', () => {
    const run = baseRun({ negatives: { stress: 100, restless: 0, fatigue: 0, desire: 0, scandal: 0 } });
    for (const id of ['vocal-karaoke', 'work-part-time', 'show']) {
      const pf = preflightAction(run, id);
      expect(pf.ok).toBe(false);
      expect(pf.reason).toBe('pressure');
      expect(pf.text).toContain('压力');
    }
  });

  it('压力 100：恢复类仍然能做（否则玩家会被锁死）', () => {
    const run = baseRun({ negatives: { stress: 100, restless: 0, fatigue: 0, desire: 0, scandal: 0 } });
    for (const id of ['rest-sleep', 'recover-bath', 'fun-trip', 'fun-park']) {
      expect(preflightAction(run, id).ok).toBe(true);
    }
  });

  it('压力 99 还能做，100 才拦（边界）', () => {
    const mk = (v: number) =>
      baseRun({ negatives: { stress: v, restless: 0, fatigue: 0, desire: 0, scandal: 0 } });
    expect(preflightAction(mk(99), 'vocal-karaoke').ok).toBe(true);
    expect(preflightAction(mk(100), 'vocal-karaoke').ok).toBe(false);
  });

  it('排程跑到压力满会停下，stopped=pressure（不会一路跑到底）', () => {
    const run = baseRun({
      stamina: 100,
      negatives: { stress: 96, restless: 0, fatigue: 0, desire: 0, scandal: 0 },
    });
    // 排两条唱 K（每条 +5）：第一条会把压力顶到 100，第二条必须被拦
    const items: ScheduleItem[] = [
      { id: 'a', actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + 10 * MIN },
      { id: 'b', actionId: 'vocal-karaoke', startAt: T0 + 10 * MIN, endAt: T0 + 20 * MIN },
    ];
    const res = settle(run, items, T0, T0 + 30 * MIN, 'seed', PURE);
    expect(res.executed).toEqual(['a']);
    expect(res.stoppedReason).toBe('pressure');
    expect(res.state.negatives?.stress).toBe(100);
  });
});

describe('减压口径：一次清空、低频大额', () => {
  it('爆睡不解压（否则体力补给会把压力一起清掉，这条轴永远满不了）', () => {
    const res = one(baseRun({ stamina: 40 }), 'rest-sleep');
    expect(res.state.log.find((l) => l.actionId === 'rest-sleep')?.stressDelta).toBe(0);
    expect(res.state.negatives?.stress).toBe(0);
  });

  it('旅行（¥1800）一次把 100 压力清空', () => {
    const run = baseRun({
      negatives: { stress: 100, restless: 0, fatigue: 0, desire: 0, scandal: 0 },
    });
    const res = one(run, 'fun-trip');
    expect(res.executed).toHaveLength(1);
    expect(res.state.negatives?.stress).toBe(0);
  });

  it('洗澡只降一点，游乐园降一半', () => {
    const full = () =>
      baseRun({ negatives: { stress: 80, restless: 0, fatigue: 0, desire: 0, scandal: 0 } });
    const bath = one(full(), 'recover-bath');
    const park = one(full(), 'fun-park');
    expect(bath.state.negatives?.stress).toBe(72);
    expect(park.state.negatives?.stress).toBe(30);
  });

  it('吃饭能减压（便宜少、贵多），且仍然回体力', () => {
    const run = baseRun({
      stamina: 50,
      negatives: { stress: 100, restless: 0, fatigue: 0, desire: 0, scandal: 0 },
    });
    const cheap = one(run, 'food-saizeriya');
    const fine = one(run, 'food-nice');
    expect(cheap.state.negatives?.stress).toBe(88);
    expect(fine.state.negatives?.stress).toBe(68);
    expect(cheap.state.stamina).toBe(58);
    expect(fine.state.stamina).toBe(78);
  });

  it('减压不会把压力压成负数', () => {
    const res = one(
      baseRun({ negatives: { stress: 10, restless: 0, fatigue: 0, desire: 0, scandal: 0 } }),
      'fun-trip',
    );
    expect(res.state.negatives?.stress).toBe(0);
  });
});

describe('压力不能污染 stats（T-043 的教训）', () => {
  it('结算后 stats 里不出现 stress 键', () => {
    const res = one(baseRun(), 'vocal-karaoke');
    expect('stress' in res.state.stats).toBe(false);
    expect(typeof res.state.negatives?.stress).toBe('number');
  });

  it('压力超过 60 时行动收益打折（既有规则，T-044 起才有机会触发）', () => {
    const calm = one(baseRun({ negatives: { stress: 0, restless: 0, fatigue: 0, desire: 0, scandal: 0 } }), 'vocal-coach');
    const tense = one(
      baseRun({ negatives: { stress: 80, restless: 0, fatigue: 0, desire: 0, scandal: 0 } }),
      'vocal-coach',
    );
    expect(tense.state.stats.vocal).toBeLessThanOrEqual(calm.state.stats.vocal);
  });
});
