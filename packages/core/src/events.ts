import { RAW_ROUTINE, RAW_STORY, type RawRequires } from './data';
import type { Axes, RunState, Stats } from './types';

export interface ChoiceEffects {
  stats?: Partial<Stats>;
  stamina?: number;
  axes?: Partial<Axes>;
}

export interface Choice {
  id: string;
  label: string;
  /** 选择后写进日志的一行 */
  text: string;
  effects: ChoiceEffects;
  setFlag?: string;
}

export interface StoryEvent {
  id: string;
  title: string;
  text: string;
  /** 重点事件：触发即暂停时间 */
  major?: boolean;
  /** 触发条件 */
  requires: (s: RunState) => boolean;
  choices: Choice[];
}

/** 常规事件模板：只改数值，不碰三轴 */
export interface RoutineTemplate {
  id: string;
  text: string;
  stamina: number;
  stat?: keyof Stats;
  gain?: number;
}

/** 常规事件表（来自 data/events.json 的 routine） */
export const ROUTINE_TEMPLATES: RoutineTemplate[] = RAW_ROUTINE.map((r) => ({
  id: r.id,
  text: r.text,
  stamina: r.stamina,
  stat: r.stat as keyof Stats | undefined,
  gain: r.gain,
}));

/** 判断是否满足某个条件（供行为结果表复用） */
export function matchesCondition(s: RunState, req?: RawRequires): boolean {
  return makeRequires(req)(s);
}

/** 把 JSON 里的触发条件翻译成函数 */
function makeRequires(req?: RawRequires): (s: RunState) => boolean {
  return (s: RunState) => {
    if (req?.statsAtLeast) {
      for (const [k, v] of Object.entries(req.statsAtLeast)) {
        if (s.stats[k as keyof Stats] < v) return false;
      }
    }
    if (req?.axesAtLeast) {
      for (const [k, v] of Object.entries(req.axesAtLeast)) {
        if (s.axes[k as keyof Axes] < v) return false;
      }
    }
    if (req?.axesBelow) {
      for (const [k, v] of Object.entries(req.axesBelow)) {
        if (s.axes[k as keyof Axes] >= v) return false;
      }
    }
    if (typeof req?.staminaBelow === 'number' && s.stamina >= req.staminaBelow) return false;
    if (typeof req?.statsSumAtLeast === 'number') {
      const sum = s.stats.vocal + s.stats.dance + s.stats.acting + s.stats.talk;
      if (sum < req.statsSumAtLeast) return false;
    }
    if (typeof req?.statsSumBelow === 'number') {
      const sum = s.stats.vocal + s.stats.dance + s.stats.acting + s.stats.talk;
      if (sum >= req.statsSumBelow) return false;
    }
    if (req?.fansAtLeast) {
      for (const [k, v] of Object.entries(req.fansAtLeast)) {
        if (((s.fans.byType as Record<string, number>)[k] ?? 0) < v) return false;
      }
    }
    if (req?.flagsNot) {
      for (const f of req.flagsNot) {
        if (s.flags[f]) return false;
      }
    }
    return true;
  };
}

/** 剧情事件表（来自 data/events.json 的 story） */
export const STORY_EVENTS: StoryEvent[] = RAW_STORY.map((e) => ({
  id: e.id,
  title: e.title,
  text: e.text,
  major: e.major,
  requires: makeRequires(e.requires),
  choices: e.choices.map((c) => ({
    id: c.id,
    label: c.label,
    text: c.text,
    effects: {
      stamina: c.effects.stamina,
      stats: c.effects.stats as Partial<Stats> | undefined,
      axes: c.effects.axes as Partial<Axes> | undefined,
    },
    setFlag: c.setFlag,
  })),
}));

export function findStoryEvent(state: RunState): StoryEvent | null {
  for (const ev of STORY_EVENTS) {
    if (state.pendingEvent === ev.id) return ev;
    if (!state.flags[`ev:${ev.id}`] && !state.flags[`ev:${ev.id}:queued`] && ev.requires(state)) {
      return ev;
    }
  }
  return null;
}

export function getStoryEvent(id: string): StoryEvent | undefined {
  return STORY_EVENTS.find((e) => e.id === id);
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** 应用一次选择，返回新状态（纯函数） */
export function applyChoice(state: RunState, eventId: string, choiceId: string): RunState {
  const ev = getStoryEvent(eventId);
  const choice = ev?.choices.find((c) => c.id === choiceId);
  if (!ev || !choice) return state;

  const next: RunState = {
    ...state,
    stamina: clamp(state.stamina + (choice.effects.stamina ?? 0)),
    stats: { ...state.stats },
    axes: { ...state.axes },
    flags: { ...state.flags },
    pendingEvent: null,
    eventQueue: (state.eventQueue ?? []).filter((id) => id !== eventId),
    log: [...state.log],
  };

  for (const [k, v] of Object.entries(choice.effects.stats ?? {})) {
    const key = k as keyof Stats;
    next.stats[key] = clamp(next.stats[key] + (v ?? 0));
  }
  for (const [k, v] of Object.entries(choice.effects.axes ?? {})) {
    const key = k as keyof Axes;
    next.axes[key] = clamp(next.axes[key] + (v ?? 0));
  }

  if (choice.setFlag) {
    next.flags[`ev:${choice.setFlag}`] = true;
    delete next.flags[`ev:${choice.setFlag}:queued`];
  }

  next.log.push({
    at: next.at,
    actionId: `event:${ev.id}`,
    text: choice.text,
    staminaDelta: choice.effects.stamina ?? 0,
    statDelta: (choice.effects.stats ?? {}) as Partial<Stats>,
    axesChanged: Object.keys(choice.effects.axes ?? {}).length > 0,
    kind: 'choice',
  });

  return next;
}
