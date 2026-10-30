import { describe, expect, it } from 'vitest';
import { ENDINGS, judgeEnding } from '../src/endings';
import { createFans } from '../src/fans';
import { settle } from '../src/settle';
import type { RunState } from '../src/types';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

function run(overrides: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    stamina: 100,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(100),
    flags: {},
    pendingEvent: null,
    log: [],
    ...overrides,
  };
}

describe('结局判定', () => {
  it('一共有 42 个结局，标题都是 4 个字', () => {
    const all = Object.values(ENDINGS);
    expect(all).toHaveLength(42);
    for (const e of all) expect(e.title).toHaveLength(4);
  });

  it('适配低 → 未达标组', () => {
    const e = judgeEnding(run({ axes: { self: 50, others: 50, fit: 10 } }), 'stay');
    expect(e.group).toBe('stage-low');
  });

  it('属性突出且粉丝占比够 → 属性型结局', () => {
    const fans = createFans(1000);
    fans.byType.stage = 600;
    const e = judgeEnding(
      run({ stats: { vocal: 70, dance: 20, acting: 20, talk: 20 }, fans }),
      'stay',
    );
    expect(e.id).toBe('stat-vocal');
  });

  it('离开且他人低 → 坏结局', () => {
    const e = judgeEnding(run({ axes: { self: 50, others: 10, fit: 50 } }), 'leave');
    expect(e.group).toBe('bad');
  });

  it('转幕后 → 按最强属性选岗', () => {
    const e = judgeEnding(
      run({ stats: { vocal: 20, dance: 70, acting: 20, talk: 20 } }),
      'backstage',
    );
    expect(e.id).toBe('back-dance');
  });
});

describe('周目结束', () => {
  it('到达 endAt 时停止并标记 ending', () => {
    const r = settle(
      run(),
      [{ id: 's1', actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + 600000 }],
      T0,
      T0 + 600000,
      'end',
      { routineChance: 0, storyEvents: false, endAt: T0 + 300000 },
    );

    expect(r.stoppedReason).toBe('ending');
  });
});
