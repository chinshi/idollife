import { describe, expect, it } from 'vitest';
import { ACTION_LIST, ACTION_META, createFans, previewAction, settle } from '../src';
import { preflightAction } from '../src/preflight';
import type { RunState, ScheduleItem } from '../src/types';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const MIN = 60_000;

function baseRun(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 5000,
    parties: [],
    friends: [],
    activePartyId: null,
    debuted: false,
    inventory: [],
    equipped: {},
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(0),
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...over,
  } as RunState;
}

function findAction(pred: (id: string) => boolean): string {
  const id = ACTION_LIST.map((a) => a.id).find(pred);
  if (!id) throw new Error('no matching action');
  return id;
}

const staminaAction = findAction((id) => (previewAction(baseRun(), id)?.stamina ?? 0) < 0);
const moneyAction = findAction((id) => (previewAction(baseRun(), id)?.money ?? 0) < 0);

describe('T-031 preflightAction', () => {
  it('体力不足：stamina=0、行动耗 20 → stamina', () => {
    const need = -(previewAction(baseRun(), staminaAction)?.stamina ?? 0);
    const state = baseRun({ stamina: 0 });
    const r = preflightAction(state, staminaAction);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('stamina');
    expect(r.need).toBe(need);
    expect(r.have).toBe(0);
    expect(r.text).toContain('体力不够');
  });

  it('边界：stamina=need → ok:true（正好够，允许跑空）', () => {
    const need = -(previewAction(baseRun(), staminaAction)?.stamina ?? 0);
    const r = preflightAction(baseRun({ stamina: need }), staminaAction);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('钱不足：钱 0、行动要花钱 → money', () => {
    const need = -(previewAction(baseRun(), moneyAction)?.money ?? 0);
    const r = preflightAction(baseRun({ money: 0 }), moneyAction);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('money');
    expect(r.need).toBe(need);
    expect(r.text).toContain('钱不够');
  });

  it('次数用尽：本周已做满 → times', () => {
    const id = 'street-live';
    const times = ACTION_META[id]?.times ?? 2;
    const logs = Array.from({ length: times }, (_, i) => ({
      at: T0 + i * MIN,
      actionId: id,
      text: 'x',
      staminaDelta: 0,
      statDelta: {},
      kind: 'action' as const,
    }));
    const r = preflightAction(baseRun({ log: logs as never }), id);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('times');
    expect(r.need).toBe(0);
    expect(r.text).toContain('次数用完了');
  });

  it('times 文案按 ACTION_META 派生：street-live 每周 2 次，不出现「每局」', () => {
    const id = 'street-live';
    const meta = ACTION_META[id]!;
    expect(meta.timesScope).toBe('week');
    const logs = Array.from({ length: meta.times }, (_, i) => ({
      at: T0 + i * MIN,
      actionId: id,
      text: 'x',
      staminaDelta: 0,
      statDelta: {},
      kind: 'action' as const,
    }));
    const r = preflightAction(baseRun({ log: logs as never }), id);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('times');
    expect(r.text).toContain(`每周 ${meta.times} 次`);
    expect(r.text).not.toContain('每局');
  });

  it('settle 侧：第一条体力不足 → executed=[] 且 state.at 不前进', () => {
    const schedule: ScheduleItem[] = [
      { id: 's1', actionId: staminaAction, startAt: T0, endAt: T0 + 10 * MIN },
    ];
    const r = settle(baseRun({ stamina: 0 }), schedule, T0, T0 + 60 * MIN, 'pf-seed', {
      routineChance: 0,
      storyEvents: false,
    });
    expect(r.executed).toEqual([]);
    expect(r.state.at).toBe(T0);
    expect(r.stoppedReason).toBe('stamina');
  });
});
