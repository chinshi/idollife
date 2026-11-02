import { describe, expect, it } from 'vitest';
import { taskProgress } from '../src/task-progress';
import { createFans } from '../src/fans';
import type { TaskDef } from '../src/tasks';
import type { RunState } from '../src/types';

/**
 * T-008 · 任务进度条（docs/25 §2.5 D）
 *
 * P1～P7：只认「变量 >= 数字」「变量 > 数字」两种形态，复合条件一律 null；
 * 当前值来自 expr.ts 的 buildExprData（mood/satiety 缺省 70 也生效）。
 */
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

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

function mkTask(completeCondition?: string): TaskDef {
  return {
    id: 't-progress',
    type: 'once',
    name: '演示任务',
    completeCondition,
    rewards: {},
    times: 1,
    content: '',
    brief: '',
    priority: 1,
  };
}

describe('任务进度 taskProgress', () => {
  it('P1. vocal >= 20 + vocal=18 → current 18 / target 20', () => {
    const progress = taskProgress(base({ stats: { vocal: 18, dance: 10, acting: 10, talk: 10 } }), mkTask('vocal >= 20'));
    expect(progress).toMatchObject({ current: 18, target: 20 });
    expect(progress?.label).toBe('演唱');
  });

  it('P2. vocal > 20 + vocal=20 → target 21（严格大于的最小可达值）', () => {
    const progress = taskProgress(base({ stats: { vocal: 20, dance: 10, acting: 10, talk: 10 } }), mkTask('vocal > 20'));
    expect(progress).toMatchObject({ current: 20, target: 21 });
  });

  it('P3. 复合条件（and / 函数 / 两个比较）→ null', () => {
    const state = base();
    expect(taskProgress(state, mkTask('vocal >= 20 and dance >= 10'))).toBeNull();
    expect(taskProgress(state, mkTask('sum(vocal, dance) >= 40'))).toBeNull();
    expect(taskProgress(state, mkTask('vocal >= 20 or dance >= 10'))).toBeNull();
  });

  it('P4. 没有 completeCondition / 空字符串 → null', () => {
    expect(taskProgress(base(), mkTask(undefined))).toBeNull();
    expect(taskProgress(base(), mkTask(''))).toBeNull();
    expect(taskProgress(base(), mkTask('   '))).toBeNull();
  });

  it('P5. hasFlag 这类非数值条件 → null', () => {
    expect(taskProgress(base(), mkTask('hasFlag("ev:debut")'))).toBeNull();
    // 比较号右边不是数字（写成变量）也不猜
    expect(taskProgress(base(), mkTask('vocal >= dance'))).toBeNull();
    // 只认 > 和 >=，其余比较不提供进度
    expect(taskProgress(base(), mkTask('vocal <= 20'))).toBeNull();
  });

  it('P6. current 超过 target 时 core 返回真实值（截断交给 UI）', () => {
    const progress = taskProgress(base({ stats: { vocal: 30, dance: 10, acting: 10, talk: 10 } }), mkTask('vocal >= 20'));
    expect(progress).toEqual({ label: '演唱', current: 30, target: 20 });
  });

  it('P7. mood >= 60 能取到值（复用 buildExprData，缺省 70 生效）', () => {
    const bare = base({ mood: undefined });
    expect(taskProgress(bare, mkTask('mood >= 60'))).toEqual({ label: '心情', current: 70, target: 60 });
    expect(taskProgress(base({ mood: 40 }), mkTask('mood >= 60'))).toEqual({
      label: '心情',
      current: 40,
      target: 60,
    });
  });

  it('P8. target <= 0（如 vocal >= 0）→ null，避免「一步没做就满格」的假达标', () => {
    expect(taskProgress(base(), mkTask('vocal >= 0'))).toBeNull();
    expect(
      taskProgress(base({ stats: { vocal: 0, dance: 0, acting: 0, talk: 0 } }), mkTask('vocal >= 0')),
    ).toBeNull();
    // 「> -1」的 target 也是 0，同样不提供进度
    expect(taskProgress(base(), mkTask('vocal > -1'))).toBeNull();
  });
});
