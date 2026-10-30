import type { Axes, RunState, Stats } from './types.js';
import { tierOf } from './types.js';

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
  /** 触发条件（纯函数，便于测试） */
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

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  { id: 'r-rehearsal', text: '排练室空着，你多练了半小时。', stamina: -3, stat: 'dance', gain: 1 },
  { id: 'r-convenience', text: '便利店的关东煮打折，你买了一份。', stamina: 4 },
  { id: 'r-train', text: '末班车上有人认出你，小声说了句加油。', stamina: 2, stat: 'vocal', gain: 1 },
  { id: 'r-note', text: '你在手机备忘录里写下一句歌词。', stamina: -1, stat: 'acting', gain: 1 },
  { id: 'r-tired', text: '今天状态一般，练得有点散。', stamina: -2 },
  { id: 'r-mirror', text: '对着镜子调整了很久的表情。', stamina: -2, stat: 'talk', gain: 1 },
];

export const STORY_EVENTS: StoryEvent[] = [
  {
    id: 'first-audition',
    title: '一个试镜机会',
    text: '经纪人推门进来：「有个小场子的试镜，后天。你敢不敢去？」',
    requires: (s) => s.stats.dance >= 15 && !s.flags['first-audition'],
    choices: [
      {
        id: 'go',
        label: '去，反正也没什么可输的',
        text: '你去了。台下只有五个人，但你跳完了整支舞。',
        effects: { stamina: -10, axes: { self: 8, others: 4, fit: 3 } },
        setFlag: 'first-audition',
      },
      {
        id: 'prepare',
        label: '再练两天，准备充分再去',
        text: '你多练了两天，动作更稳了，但也错过了这次机会。',
        effects: { stamina: -5, stats: { dance: 2 }, axes: { self: 3, fit: 5 } },
        setFlag: 'first-audition',
      },
      {
        id: 'skip',
        label: '算了，还没准备好',
        text: '你说下次吧。经纪人没再说什么。',
        effects: { axes: { self: -6, others: -2 } },
        setFlag: 'first-audition',
      },
    ],
  },
  {
    id: 'fan-letter',
    title: '第一封信',
    text: '后台收到一封手写信，字迹很认真：「谢谢你上周那场演出。」',
    requires: (s) => s.axes.others >= 45 && !s.flags['fan-letter'],
    choices: [
      {
        id: 'reply',
        label: '回一封',
        text: '你写了回信。一周后，她又来了，还带了朋友。',
        effects: { axes: { others: 6, self: 3 } },
        setFlag: 'fan-letter',
      },
      {
        id: 'keep',
        label: '收起来，好好保存',
        text: '你把信夹进笔记本里，没跟任何人说。',
        effects: { axes: { self: 5 } },
        setFlag: 'fan-letter',
      },
    ],
  },
  {
    id: 'burnout',
    title: '撑不住了',
    text: '连着几天没睡够，你在排练室的地板上坐了很久。',
    requires: (s) => s.stamina < 20 && !s.flags['burnout'],
    choices: [
      {
        id: 'rest',
        label: '请两天假，好好睡一觉',
        text: '你睡了一整天，醒来时天已经黑了。',
        effects: { stamina: 40, axes: { self: 4 } },
        setFlag: 'burnout',
      },
      {
        id: 'push',
        label: '咬牙继续',
        text: '你继续练，但动作开始变形。',
        effects: { stamina: -5, stats: { dance: 1 }, axes: { self: -5, fit: 2 } },
        setFlag: 'burnout',
      },
    ],
  },
];

export function findStoryEvent(state: RunState): StoryEvent | null {
  for (const ev of STORY_EVENTS) {
    if (state.pendingEvent === ev.id) return ev;
    if (!state.flags[`ev:${ev.id}`] && ev.requires(state)) return ev;
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

  if (choice.setFlag) next.flags[`ev:${choice.setFlag}`] = true;

  next.log.push({
    at: next.at,
    actionId: `event:${ev.id}`,
    text: `${choice.text}（自我 ${tierOf(next.axes.self)} / 他人 ${tierOf(next.axes.others)} / 适配 ${tierOf(next.axes.fit)}）`,
    staminaDelta: choice.effects.stamina ?? 0,
    statDelta: (choice.effects.stats ?? {}) as Partial<Stats>,
    kind: 'choice',
  });

  return next;
}
