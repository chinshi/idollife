import { RAW_ROUTINE, RAW_STORY, type RawRequires } from './data';
import { matchesCondition } from './expr';
import { clampStamina } from './content';
import { isStatKey } from './attributes';
import type { Axes, RunState, Stats } from './types';

export interface ChoiceEffects {
  stats?: Partial<Stats>;
  stamina?: number;
  mood?: number;
  axes?: Partial<Axes>;
  /** 性格变化 */
  traits?: Record<string, number>;
  /** 负向属性变化 */
  negatives?: Record<string, number>;
}

export interface Choice {
  id: string;
  label: string;
  /** 选择后写进日志的一行 */
  text: string;
  effects: ChoiceEffects;
  setFlag?: string;
  /** 出现条件（性格/负向/属性不满足则不显示） */
  requires: (s: RunState) => boolean;
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

export { matchesCondition } from './expr';
/** 剧情事件表（来自 data/events.json 的 story） */
export const STORY_EVENTS: StoryEvent[] = RAW_STORY.map((e) => ({
  id: e.id,
  title: e.title,
  text: e.text,
  major: e.major,
  requires: (s: RunState) => matchesCondition(s, e.requires),
  choices: e.choices.map((c) => ({
    id: c.id,
    label: c.label,
    text: c.text,
    effects: {
      stamina: c.effects.stamina,
      stats: c.effects.stats as Partial<Stats> | undefined,
      axes: c.effects.axes as Partial<Axes> | undefined,
      traits: c.effects.traits,
      negatives: c.effects.negatives,
      mood: c.effects.mood,
    },
    setFlag: c.setFlag,
    requires: (s: RunState) => matchesCondition(s, c.requires),
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
    // T-043：只收四项能力，其余键写进 stats 会变 NaN 并污染存档
    if (!isStatKey(k)) continue;
    const key = k as keyof Stats;
    next.stats[key] = clamp(next.stats[key] + (v ?? 0));
  }
  for (const [k, v] of Object.entries(choice.effects.axes ?? {})) {
    const key = k as keyof Axes;
    next.axes[key] = clamp(next.axes[key] + (v ?? 0));
  }

  if (choice.effects.mood) next.mood = clamp((state.mood ?? 70) + choice.effects.mood);

  const traits = { ...(state.traits ?? {}) };
  for (const [k, v] of Object.entries(choice.effects.traits ?? {})) {
    traits[k] = clamp((traits[k] ?? 0) + (v ?? 0));
  }
  if (Object.keys(traits).length > 0) next.traits = traits;

  const negatives = { ...(state.negatives ?? {}) };
  for (const [k, v] of Object.entries(choice.effects.negatives ?? {})) {
    negatives[k] = clamp((negatives[k] ?? 0) + (v ?? 0));
  }
  if (Object.keys(negatives).length > 0) next.negatives = negatives;

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

/** 当前状态下可选的项目（性格/负向/属性条件过滤） */
export function availableChoices(
  state: RunState,
  eventId: string,
): Array<{ id: string; label: string; text: string; effects: ChoiceEffects; requires: (s: RunState) => boolean }> {
  const event = getStoryEvent(eventId);
  if (!event) return [];
  return event.choices.filter((c) => c.requires(state));
}

/** 某个选项是否满足出现条件 */
export function choiceAvailable(state: RunState, eventId: string, choiceId: string): boolean {
  return availableChoices(state, eventId).some((c) => c.id === choiceId);
}