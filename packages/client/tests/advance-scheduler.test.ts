import { describe, expect, it } from 'vitest';
import { START_AT, createClock, type RunState, type ScheduleItem } from '@idollife/core';
import { shouldFireAdvance } from '../src/components/advance-scheduler';

const T0 = START_AT;
const MIN = 60_000;
const clock = createClock(T0, { status: 'running', wallAnchor: T0 });
const schedule: ScheduleItem[] = [
  { id: 's1', actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + 10 * MIN },
];

describe('T-039-r2 shouldFireAdvance', () => {
  it('未到点 → false', () => {
    expect(shouldFireAdvance({ clock, schedule, serverNow: T0 + 9 * MIN, timeScale: 1 }).fire).toBe(false);
  });
  it('到点 → true 且 targetAt=endAt', () => {
    expect(shouldFireAdvance({ clock, schedule, serverNow: T0 + 10 * MIN, timeScale: 1 })).toEqual({
      fire: true,
      targetAt: T0 + 10 * MIN,
    });
  });
  it('paused → false', () => {
    const paused = createClock(T0);
    expect(shouldFireAdvance({ clock: paused, schedule, serverNow: T0 + 99 * MIN }).fire).toBe(false);
  });
  it('无未完成项 → false', () => {
    expect(
      shouldFireAdvance({ clock, schedule: [{ ...schedule[0]!, done: true }], serverNow: T0 + 99 * MIN }).fire,
    ).toBe(false);
  });
  it('越过停点很久仍 true', () => {
    expect(shouldFireAdvance({ clock, schedule, serverNow: T0 + 999 * MIN, timeScale: 1 }).fire).toBe(true);
  });

});

