import { START_AT, TIME_SCALE } from '../src/content';
import { describe, expect, it } from 'vitest';
import { catchUp, clockTarget, createClock, elapsedBudget, gameAdvance, markDone } from '../src/clock';
import { createFans } from '../src/fans';
import type { RunState, ScheduleItem } from '../src/types';

/**
 * T-025：catchUp 纯函数单测（固定输入；不依赖真实时钟）。
 */
const MIN = 60_000;
const T0 = START_AT;
const WALL = 1_800_000_000_000;

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
    fans: createFans(100),
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...over,
  } as RunState;
}

function item(id: string, actionId: string, offsetMin: number, durationMin = 10): ScheduleItem {
  const startAt = T0 + offsetMin * MIN;
  return { id, actionId, startAt, endAt: startAt + durationMin * MIN };
}

function runningClock(gameAt = T0, overrides: Record<string, unknown> = {}) {
  return createClock(gameAt, {
    status: 'running',
    wallAnchor: WALL,
    speed: 1,
    sessionId: 'sess-1',
    ...overrides,
  });
}

describe('T-025 catchUp', () => {
  it('paused / idle 不推进：advanced=0、状态原样', () => {
    const schedule = [item('s1', 'vocal-karaoke', 0)];
    for (const status of ['paused', 'idle'] as const) {
      const clock = createClock(T0, { status, wallAnchor: 0, speed: 1 });
      const r = catchUp(baseRun(), schedule, clock, WALL + 60 * MIN, 'seed', { timeScale: 1, endAt: T0 + 10 * 60 * MIN });
      expect(r.executed).toEqual([]);
      expect(r.advanced).toBe(0);
      expect(r.state.at).toBe(T0);
      expect(r.clock.status).toBe(status);
    }
  });

  it('离线 30 分钟、3 条排程 → 全部执行，gameAt 为最后一条 endAt', () => {
    const schedule = [
      item('s1', 'talk-selftalk', 0),
      item('s2', 'talk-selftalk', 10),
      item('s3', 'talk-selftalk', 20),
    ];
    const clock = runningClock();
    const r = catchUp(baseRun(), schedule, clock, WALL + 30 * MIN, 'seed-a', {
      endAt: T0 + 240 * MIN,
    });

    expect(r.executed).toEqual(['s1', 's2', 's3']);
    expect(r.state.at).toBe(T0 + 30 * MIN);
    expect(r.clock.gameAt).toBe(T0 + 30 * MIN);
    expect(r.clock.status).toBe('idle');
    expect(r.advanced).toBe(30 * MIN);
    expect(r.schedule.every((s) => s.done)).toBe(true);
  });

  it('命中 A 级事件 → stoppedReason=event、idle、pendingEvent 有值', () => {
    const run = baseRun();
    run.stats.dance = 15; // 触发 first-audition（settle 测试同口径）
    const r = catchUp(run, [item('s1', 'vocal-karaoke', 0)], runningClock(), WALL + 10 * MIN, 'event-seed', {
      endAt: T0 + 240 * MIN,
    });

    expect(r.stoppedReason).toBe('event');
    expect(r.clock.status).toBe('idle');
    expect(r.state.pendingEvent).toBeTruthy();
  });

  it('体力不足 → stoppedReason=stamina、idle、停在失败那条之前', () => {
    // 强度指导课体力 -28；stamina 20 不足以支付 → 在行动前停下
    const run = baseRun({ stamina: 20 });
    const schedule = [
      item('s1', 'vocal-coach', 0),
      item('s2', 'talk-selftalk', 10),
    ];
    const r = catchUp(run, schedule, runningClock(), WALL + 30 * MIN, 'stam-seed', {
      endAt: T0 + 240 * MIN,
    });

    expect(r.stoppedReason).toBe('stamina');
    expect(r.clock.status).toBe('idle');
    expect(r.executed).toEqual([]);
    expect(r.state.at).toBe(T0);
  });

  it('时间落在行动中间 → 不执行该条、running，锚点保留零头', () => {
    const schedule = [item('s1', 'vocal-karaoke', 0), item('s2', 'dance-otaku', 10)];
    // 15 分钟后：s1 已结束，s2 只跑了 5 分钟 → 不执行 s2
    const now = WALL + 15 * MIN;
    const r = catchUp(baseRun(), schedule, runningClock(), now, 'mid-seed', {
      timeScale: 1,
      endAt: T0 + 240 * MIN,
    });

    expect(r.executed).toEqual(['s1']);
    expect(r.state.at).toBe(T0 + 10 * MIN);
    expect(r.clock.status).toBe('running');
    const target = T0 + 15 * MIN;
    expect(r.clock.gameAt + (now - r.clock.wallAnchor) * r.clock.speed).toBe(target);
  });

  it('时钟回拨（nowWall < wallAnchor）→ 不推进', () => {
    const schedule = [item('s1', 'vocal-karaoke', 0)];
    const r = catchUp(baseRun(), schedule, runningClock(), WALL - 5 * MIN, 'back-seed', {
      endAt: T0 + 240 * MIN,
    });
    expect(r.executed).toEqual([]);
    expect(r.advanced).toBe(0);
    expect(r.state.at).toBe(T0);
  });

  it('确定性：一次算完 60 分钟 === 拆 6 次每次 10 分钟', () => {
    const schedule = Array.from({ length: 6 }, (_, i) =>
      item(`s${i + 1}`, i % 2 === 0 ? 'vocal-karaoke' : 'dance-otaku', i * 10),
    );
    const endAt = T0 + 240 * MIN;
    const one = catchUp(baseRun(), schedule, runningClock(), WALL + 60 * MIN, 'det-seed', { timeScale: 1, endAt });

    let state = baseRun();
    let sched = schedule;
    let clock = runningClock();
    let now = WALL;
    const all: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      now += 10 * MIN;
      const step = catchUp(state, sched, clock, now, 'det-seed', { timeScale: 1, endAt });
      state = step.state;
      sched = step.schedule;
      clock = step.clock;
      all.push(...step.executed);
    }

    expect(all).toEqual(one.executed);
    expect(state).toEqual(one.state);
    expect(clock.gameAt).toBe(one.clock.gameAt);
    expect(sched.map((s) => s.id)).toEqual(one.schedule.map((s) => s.id));
  });

  it('markDone：打 done 标记且只保留最近 60 条已完成', () => {
    const schedule: ScheduleItem[] = Array.from({ length: 70 }, (_, i) => ({
      id: `x${i}`,
      actionId: 'vocal-karaoke',
      startAt: T0 + i * MIN,
      endAt: T0 + (i + 1) * MIN,
      done: i < 5,
    }));
    const executed = Array.from({ length: 70 }, (_, i) => `x${i}`);
    const out = markDone(schedule, executed);
    const done = out.filter((s) => s.done);
    expect(done).toHaveLength(60);
    // 保留的是最近 60 条（x10..x69）
    expect(done[0]!.id).toBe('x10');
    expect(done.at(-1)!.id).toBe('x69');
  });
});

describe('T-026 空档不降级', () => {
  it('running + 排程还有未完成项（exhausted）→ 保持 running，gameAt 不变', () => {
    // 一条已过点但未完成的项：settle 会跳过 → exhausted；重点是有未完成项时不许 idle
    const schedule: ScheduleItem[] = [
      { id: 'gap1', actionId: 'vocal-karaoke', startAt: T0 - 5 * MIN, endAt: T0 + 5 * MIN },
    ];
    const r = catchUp(baseRun(), schedule, runningClock(), WALL + MIN, 'gap-seed', {
      endAt: T0 + 240 * MIN,
    });

    expect(r.stoppedReason).toBe('exhausted');
    expect(r.executed).toEqual([]);
    expect(r.clock.status).toBe('running');
    expect(r.clock.gameAt).toBe(T0);
    // 锚点保留未消费零头：gameAt + (now - anchor) * speed === target
    expect(r.clock.gameAt + (WALL + MIN - r.clock.wallAnchor) * r.clock.speed).toBe(T0 + MIN);
  });

  it('running + 排程全 done（exhausted）→ idle', () => {
    const schedule: ScheduleItem[] = [
      { id: 'd1', actionId: 'vocal-karaoke', startAt: T0 - 5 * MIN, endAt: T0 + 5 * MIN, done: true },
    ];
    const r = catchUp(baseRun(), schedule, runningClock(), WALL + MIN, 'done-seed', {
      endAt: T0 + 240 * MIN,
    });

    expect(r.stoppedReason).toBe('exhausted');
    expect(r.clock.status).toBe('idle');
    expect(r.clock.wallAnchor).toBe(0);
  });

  it('空档跨过后继续 catchUp 到足够时间 → 行动正常执行（一次算 == 拆多次算）', () => {
    const schedule: ScheduleItem[] = [
      { id: 's1', actionId: 'vocal-karaoke', startAt: T0 + 5 * MIN, endAt: T0 + 15 * MIN },
    ];
    const endAt = T0 + 240 * MIN;

    // 第一次：只到空档内 → running，不执行
    const first = catchUp(baseRun(), schedule, runningClock(), WALL + MIN, 'split-seed', { timeScale: 1, endAt });
    expect(first.clock.status).toBe('running');
    expect(first.executed).toEqual([]);

    // 第二次：时间足够 → 执行
    const second = catchUp(first.state, first.schedule, first.clock, WALL + 16 * MIN, 'split-seed', { timeScale: 1, endAt });
    expect(second.executed).toEqual(['s1']);

    // 一次算到同一点
    const one = catchUp(baseRun(), schedule, runningClock(), WALL + 16 * MIN, 'split-seed', { timeScale: 1, endAt });
    expect(one.executed).toEqual(['s1']);
    expect(second.state).toEqual(one.state);
    expect(second.clock.gameAt).toBe(one.clock.gameAt);
  });
});

describe('T-028 TIME_SCALE 与公式收敛', () => {
  it('timeScale=20：1 真实秒 + speed 1 → 推进 20000 游戏毫秒；timeScale=1 → 1000', () => {
    expect(gameAdvance(1000, 1, 20)).toBe(20000);
    expect(gameAdvance(1000, 1, 1)).toBe(1000);

    // catchUp 的锚点回推也必须用同一尺度：算完再取目标，仍是 +20000
    const r = catchUp(baseRun(), [item('s1', 'vocal-karaoke', 10)], runningClock(), WALL + 1000, 'scale-seed', {
      timeScale: 20,
      endAt: T0 + 240 * MIN,
    });
    expect(r.clock.status).toBe('running');
    expect(clockTarget(r.clock, WALL + 1000, 20)).toBe(T0 + 20000);
  });

  it('倍速与系数正交：speed 8 的推进量 = speed 1 的 8 倍', () => {
    const one = gameAdvance(1000, 1, 20);
    const eight = gameAdvance(1000, 8, 20);
    expect(one).toBe(20000);
    expect(eight).toBe(one * 8);
    expect(gameAdvance(1000, 8, 1)).toBe(8000);
  });

  it('分段一致性：一次算完 vs 拆 5 次算，clock.gameAt 逐毫秒相等', () => {
    const schedule = [item('s1', 'vocal-karaoke', 0)]; // 10 分钟行动，30 真实秒跑完
    const endAt = T0 + 240 * MIN;
    const totalReal = 30000;
    const one = catchUp(baseRun(), schedule, runningClock(), WALL + totalReal, 'split-scale', {
      timeScale: 20,
      endAt,
    });

    let state = baseRun();
    let sched = schedule;
    let clock = runningClock();
    for (let i = 1; i <= 5; i += 1) {
      const step = catchUp(state, sched, clock, WALL + (i * totalReal) / 5, 'split-scale', {
        timeScale: 20,
        endAt,
      });
      state = step.state;
      sched = step.schedule;
      clock = step.clock;
    }

    expect(clock.gameAt).toBe(one.clock.gameAt);
    expect(clock.gameAt).toBe(T0 + 10 * MIN);
    expect(state.at).toBe(one.state.at);
    expect(state).toEqual(one.state);
    expect(clock.wallAnchor).toBe(one.clock.wallAnchor);
  });

  it('分段水位线（策划补挂）：每段后 clockTarget 必须等于 T0 + 累计真实耗时 × 20', () => {
    // 上面那条分段用例把行动跑满了，末段 status 落 idle、wallAnchor 归 0，
    // 于是「锚点回推少乘 timeScale」这类错误会被吞掉、照样全绿。
    // 这条每段都停在行动中间（status 保持 running、wallAnchor 非 0），
    // 直接断言「从锚点再算一次仍落在同一点」——锚点错 20 倍会立刻炸。
    const schedule = [item('s1', 'vocal-karaoke', 0)]; // 10 游戏分钟 = 30 真实秒（×20）
    const endAt = T0 + 240 * MIN;
    const step = 6000; // 每段 6 真实秒 = 120000 游戏毫秒，5 段正好跑完一条

    let state = baseRun();
    let sched = schedule;
    let clock = runningClock();

    for (let i = 1; i <= 4; i += 1) {
      const nowWall = WALL + i * step;
      const r = catchUp(state, sched, clock, nowWall, 'split-wm', { timeScale: 20, endAt });
      state = r.state;
      sched = r.schedule;
      clock = r.clock;

      expect(clock.status).toBe('running');
      expect(clock.gameAt).toBe(T0); // 行动还没跑完，进度不动
      // 核心不变量：再用这个锚点算一次，必须还在同一点（不多不少正好 i×step×20）
      expect(clockTarget(clock, nowWall, 20)).toBe(T0 + i * step * 20);
    }

    const last = catchUp(state, sched, clock, WALL + 5 * step, 'split-wm', { timeScale: 20, endAt });
    expect(last.clock.gameAt).toBe(T0 + 10 * MIN);
    expect(last.state.at).toBe(T0 + 10 * MIN);
  });

  it('默认系数（策划补挂）：不传 timeScale 必须等价于显式传 TIME_SCALE，不得静默回落 1', () => {
    // 之前的用例全都显式传 timeScale，默认参数那条路径没人守。
    // 若有人把 `opts.timeScale ?? TIME_SCALE` 写成 `?? 1`，测试会全绿而线上退化成 1 倍速
    // —— 那正是本次故障的翻版。这条用「默认 vs 显式」逐字段比对，不受具体数值影响。
    expect(gameAdvance(1000, 1)).toBe(1000 * TIME_SCALE);
    expect(gameAdvance(1000, 8)).toBe(8000 * TIME_SCALE);

    const schedule = [item('s1', 'vocal-karaoke', 0)];
    const endAt = T0 + 240 * MIN;
    const byDefault = catchUp(baseRun(), schedule, runningClock(), WALL + 30000, 'default-seed', { endAt });
    const byExplicit = catchUp(baseRun(), schedule, runningClock(), WALL + 30000, 'default-seed', {
      endAt,
      timeScale: TIME_SCALE,
    });
    expect(byDefault.clock).toEqual(byExplicit.clock);
    expect(byDefault.state).toEqual(byExplicit.state);
    expect(byDefault.schedule).toEqual(byExplicit.schedule);
  });
});

describe('T-029 elapsedBudget', () => {
  it('默认系数与显式 TIME_SCALE 完全一致', () => {
    expect(elapsedBudget(1234, 8)).toEqual(elapsedBudget(1234, 8, TIME_SCALE));
    expect(elapsedBudget(1234, 8)).toBe(gameAdvance(1234, 8) + 500);
  });

  it('半秒容差边界：预算 = 推进量 + 500，不多不少', () => {
    const advance = gameAdvance(1000, 1);
    expect(elapsedBudget(1000, 1) - advance).toBe(500);
    expect(elapsedBudget(1000, 1)).toBe(advance + 500);
  });
});
