import { describe, expect, it } from 'vitest';
import { catchUp, createClock, markDone } from '../src/clock';
import { createFans } from '../src/fans';
import type { RunState, ScheduleItem } from '../src/types';

/**
 * T-025：catchUp 纯函数单测（固定输入；不依赖真实时钟）。
 */
const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
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
      const r = catchUp(baseRun(), schedule, clock, WALL + 60 * MIN, 'seed', { endAt: T0 + 10 * 60 * MIN });
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
    const one = catchUp(baseRun(), schedule, runningClock(), WALL + 60 * MIN, 'det-seed', { endAt });

    let state = baseRun();
    let sched = schedule;
    let clock = runningClock();
    let now = WALL;
    const all: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      now += 10 * MIN;
      const step = catchUp(state, sched, clock, now, 'det-seed', { endAt });
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
