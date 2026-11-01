import { describe, expect, it } from 'vitest';
import { availableChoices } from '../src/events';
import { settle } from '../src/settle';
import { createFans } from '../src/fans';
import type { RunState } from '../src/types';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const MIN = 60_000;

const base = (over: Partial<RunState> = {}): RunState =>
  ({
    at: T0, startedAt: T0, stamina: 100, money: 1000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    mood: 70, satiety: 70,
    innate: { height: 60, weight: 60, appearance: 60, proportion: 60 },
    traits: { kind: 0, lead: 0, coop: 0, independent: 0, ambitious: 0, passion: 0 },
    negatives: { stress: 0, restless: 0, fatigue: 0, desire: 0, scandal: 0 },
    proficiency: { stage_prof: 0, song_prof: 0, choreo_prof: 0 },
    fans: createFans(0), debuted: true, parties: [], activePartyId: null,
    friends: [], inventory: [], equipped: {}, flags: {},
    pendingEvent: null, eventQueue: [], log: [],
    ...over,
  }) as RunState;

describe('属性全接入', () => {
  it('性格足够时解锁额外选项', () => {
    const low = availableChoices(base(), 'manager-doubt').map((c) => c.id);
    expect(low).not.toContain('firm');

    const high = availableChoices(
      base({ traits: { kind: 0, lead: 0, coop: 0, independent: 0, ambitious: 5, passion: 0 } }),
      'manager-doubt',
    ).map((c) => c.id);
    expect(high).toContain('firm');
  });

  it('训练会累积歌曲熟练度，且熟练度放大收益', () => {
    const run = base();
    const r = settle(run, [{ id: 's1', actionId: 'vocal-karaoke', startAt: T0, stopAfter: false }] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    expect(r.state.proficiency?.song_prof).toBe(1);

    const skilled = settle(
      base({ proficiency: { stage_prof: 0, song_prof: 100, choreo_prof: 0 } }),
      [{ id: 's1', actionId: 'vocal-karaoke', startAt: T0, stopAfter: false }] as never,
      T0, T0 + 3 * MIN, 'e', { routineChance: 0 },
    );
    expect(skilled.state.stats.vocal).toBeGreaterThanOrEqual(r.state.stats.vocal);
  });

  it('积劳让体力消耗变大', () => {
    const ok = settle(base(), [{ id: 's1', actionId: 'work-part-time', startAt: T0, stopAfter: false }] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    const tired = settle(base({ negatives: { stress: 0, restless: 0, fatigue: 60, desire: 0, scandal: 0 } }), [{ id: 's1', actionId: 'work-part-time', startAt: T0, stopAfter: false }] as never, T0, T0 + 3 * MIN, 'e', { routineChance: 0 });
    expect(tired.state.stamina).toBeLessThan(ok.state.stamina);
  });
});
