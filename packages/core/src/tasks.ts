/**
 * 任务系统
 *
 * 状态流转：
 *   未达可见条件 → 可见但不足可领取条件 → 可领取 → 进行中 → 已完成
 *
 * 存档标记（flags）：
 *   task:<id>:acceptedAt  领取时间（游戏时间）
 *   task:<id>:doneAt      完成时间
 *   task:<id>:doneDay     上次完成的游戏日（day 序号；repeat 任务跨日重置用）
 *   task:<id>:count       已完成次数
 *   task:<id>:expiredDay  上次超时未完成的游戏日（T-007 A：同日不再出现）
 */
import tasksJson from '../data/tasks.json';
import { ACTION_MS, DAILY_SLOTS, DAY_MS } from './content';
import { RAW_ATTRIBUTES, RAW_STORY } from './data';
import { matchesCondition, type RawRequires } from './expr';
import { applyFanAction } from './fans';
import type { RunState, Stats } from './types';

export type TaskType = 'once' | 'repeat';

export type TaskStatus =
  | 'hidden'
  | 'locked'
  | 'claimable'
  | 'active'
  | 'expired'
  | 'completable'
  | 'done';

/** 重置周期（T-007 B）；字段缺省 = 兼容 D-011 旧行为 */
export type TaskReset = 'none' | 'daily' | 'weekly';

export interface TaskRewards {
  money?: number;
  stamina?: number;
  fans?: number;
  stats?: Partial<Record<keyof Stats, number>>;
}

export interface TaskDef {
  id: string;
  type: TaskType;
  name: string;
  displayCondition?: RawRequires | string;
  acceptCondition?: RawRequires | string;
  completeCondition?: RawRequires | string;
  rewards: TaskRewards;
  /** 0 = 无限制 */
  times: number;
  content: string;
  brief: string;
  priority: number;
  /** 过期时间（游戏日），0 或缺省 = 无限期（T-009 / docs/25 §2.5 A：一天 = 3 行动 = DAY_MS） */
  deadlineDays?: number;
  /** 重置周期（T-007 B）；缺省时保持 D-011 旧行为（repeat 跨日重置、once 永久完成） */
  reset?: TaskReset;
  /** 前置任务 id 列表（T-007 C）；未全部 done 时本任务 hidden */
  prerequisite?: string[];
}

export const TASKS: TaskDef[] = (tasksJson.tasks as TaskDef[]).slice().sort(
  (a, b) => a.priority - b.priority,
);

export const TASK_TYPE_LABEL: Record<string, string> = {
  once: '一次性',
  repeat: '长期',
};

const acceptedKey = (id: string) => `task:${id}:acceptedAt`;
const doneKey = (id: string) => `task:${id}:doneAt`;
const doneDayKey = (id: string) => `task:${id}:doneDay`;
const countKey = (id: string) => `task:${id}:count`;
const expiredDayKey = (id: string) => `task:${id}:expiredDay`;
const expiredCountKey = (id: string) => `task:${id}:expiredCount`;

/** 游戏日序号（与 DAY_MS 对齐） */
const gameDay = (at: number) => Math.floor(at / DAY_MS);

export function acceptedAt(state: RunState, taskId: string): number {
  return Number(state.flags[acceptedKey(taskId)] ?? 0);
}

export function doneAt(state: RunState, taskId: string): number {
  return Number(state.flags[doneKey(taskId)] ?? 0);
}

export function doneTimes(state: RunState, taskId: string): number {
  return Number(state.flags[countKey(taskId)] ?? 0);
}

/** 累计错过次数（T-011）；旧档没有这个 flag 按 0，不做迁移 */
export function expiredTimes(state: RunState, taskId: string): number {
  return Number(state.flags[expiredCountKey(taskId)] ?? 0);
}

/** 上次完成的游戏日；旧档没有 doneDay 时从 doneAt 推导 */
export function lastDoneDay(state: RunState, taskId: string): number {
  const raw = state.flags[doneDayKey(taskId)];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return gameDay(doneAt(state, taskId));
}

/** 次数用完（一次性/限次任务） */
export function taskExhausted(state: RunState, task: TaskDef): boolean {
  if (task.times <= 0) return false;
  return doneTimes(state, task.id) >= task.times;
}

/** 上次超时未完成落在哪个游戏日；没记过返回 null（T-007 A） */
export function expiredDay(state: RunState, taskId: string): number | null {
  const raw = state.flags[expiredDayKey(taskId)];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return null;
}

/** 是否已过截止时间：只对「已领取、未完成」的任务成立（T-009：单位是游戏日 = DAY_MS） */
function pastDeadline(state: RunState, task: TaskDef): boolean {
  const days = task.deadlineDays ?? 0;
  if (!(days > 0)) return false;
  if (acceptedAt(state, task.id) <= 0) return false;
  if (doneAt(state, task.id) > 0) return false;
  return state.at - acceptedAt(state, task.id) > days * DAY_MS;
}

/**
 * 重置周期（天）：0 = 不重置，1 = 每日，7 = 每周，null = 字段缺省（走 D-011 旧行为）。
 * 缺省时不套用文档里的「none」，否则现有 3 条 repeat 任务会被改成永久完成（见 T-007 未决问题）。
 */
function resetPeriodDays(task: TaskDef): number | null {
  if (task.reset === 'none') return 0;
  if (task.reset === 'daily') return 1;
  if (task.reset === 'weekly') return 7;
  return null;
}

/** 前置任务是否全部 done（数据成环时保守当未满足；check:data 会单独拦环） */
function prerequisitesDone(state: RunState, task: TaskDef, path: Set<string>): boolean {
  const pre = task.prerequisite ?? [];
  if (pre.length === 0) return true;
  if (path.has(task.id)) return false;
  path.add(task.id);
  let ok = true;
  for (const depId of pre) {
    const dep = TASKS.find((t) => t.id === depId);
    if (!dep || statusOf(state, dep, path) !== 'done') {
      ok = false;
      break;
    }
  }
  path.delete(task.id);
  return ok;
}

function statusOf(state: RunState, task: TaskDef, path: Set<string>): TaskStatus {
  // C：前置任务没全部完成 → 不可见（不是 locked）
  if (!prerequisitesDone(state, task, path)) return 'hidden';
  if (!matchesCondition(state, task.displayCondition as never)) return 'hidden';
  if (taskExhausted(state, task)) return 'done';

  const accepted = acceptedAt(state, task.id) > 0;
  const finished = doneAt(state, task.id) > 0;

  // D-011 + T-007 B：完成后按「重置周期」决定能否再领。
  // reset 字段缺省时不改变旧行为：repeat 任务跨日重置、once 任务永久完成。
  const period = resetPeriodDays(task);
  const repeats = period === null ? task.type === 'repeat' : period > 0;
  if (finished && repeats) {
    const days = gameDay(state.at) - lastDoneDay(state, task.id);
    if (days < (period ?? 1)) return 'done';
    return matchesCondition(state, task.acceptCondition as never) ? 'claimable' : 'locked';
  }

  if (accepted) {
    if (finished) return 'done';
    if (matchesCondition(state, task.completeCondition as never)) return 'completable';
    // A：只有「进行中（未完成）」才会超时；超时不消耗 times
    if (pastDeadline(state, task)) {
      const expired = expiredDay(state, task.id);
      const today = gameDay(state.at);
      const acceptedDay = gameDay(acceptedAt(state, task.id));
      // 只有「这次领取期间」记过的超时才算数：更早的 expiredDay 是上一次领取留下的
      if (expired !== null && expired >= acceptedDay) {
        // T-011：当日冷却 = 仍可见但不可操作（不再隐藏，玩家要看到「已错过」）
        if (expired === today) return 'expired';
        if (today > expired) {
          // 已过冷却日：机会还给玩家，按未领取处理（不消耗次数、不扣钱不扣粉）
          return matchesCondition(state, task.acceptCondition as never) ? 'claimable' : 'locked';
        }
      }
      return 'expired';
    }
    return 'active';
  }

  const canAccept = matchesCondition(state, task.acceptCondition as never);
  return canAccept ? 'claimable' : 'locked';
}

/** 当前任务状态 */
export function taskStatus(state: RunState, task: TaskDef): TaskStatus {
  return statusOf(state, task, new Set());
}

/**
 * 结算超时：把「这次超时还没记过」的任务写 `task:<id>:expiredDay` + `expiredCount +1` + 一条日志。
 * 纯函数（时间读 state.at）；没有 deadlineDays 的数据调用它等于什么都没做。
 *
 * T-011 幂等守卫：T-011 之后 expired 当天状态仍是 `expired`，所以每次结算都会命中分支；
 * 若不在写 flag 前按「今天是否已经记过」拦截，就会每做一个行动刷一条日志、计数被灌爆。
 */
export function expireTasks(state: RunState, tasks: TaskDef[] = TASKS): RunState {
  let next = state;
  for (const task of tasks) {
    if (statusOf(next, task, new Set()) !== 'expired') continue;
    const today = gameDay(next.at);
    if (expiredDay(next, task.id) === today) continue; // 今天已经结算过这次超时
    next = {
      ...next,
      flags: {
        ...next.flags,
        [expiredDayKey(task.id)]: today,
        [expiredCountKey(task.id)]: expiredTimes(next, task.id) + 1,
      },
      log: [
        ...next.log,
        {
          at: next.at,
          actionId: `task-expired:${task.id}`,
          text: `通告「${task.name}」超时未完成。`,
          staminaDelta: 0,
          statDelta: {},
          kind: 'action',
        },
      ],
    };
  }
  return next;
}

export interface TaskDeadline {
  /** 截止点（游戏时间戳，与 state.at 同口径） */
  deadlineAt: number;
  /** 剩余毫秒；已过截止点时为负 */
  remainingMs: number;
  /** 剩余可用行动次数，向上取整，最小 0（玩家真正消耗的资源单位） */
  remainingSlots: number;
  /** 剩余游戏日，向上取整，最小 0 */
  remainingDays: number;
  /** 已到/已过截止点 */
  due: boolean;
  /** 紧急：剩余 ≤ 1 个游戏日（= DAILY_SLOTS 次行动） */
  urgent: boolean;
}

/**
 * 只读倒计时（T-010，界面唯一真源）。
 *
 * 不塞进 taskStatus()：这是可以单独按任意 `state.at` 调用的纯函数。
 * 无限期（`deadlineDays` 为 0/缺失）、未领取、已完成 → `null`；
 * 已过期（taskStatus() === 'expired'）**不返回 null**——界面要能显示「已超时」。
 */
export function taskDeadline(state: RunState, task: TaskDef): TaskDeadline | null {
  const days = task.deadlineDays ?? 0;
  if (!(days > 0)) return null;
  const accepted = acceptedAt(state, task.id);
  if (accepted <= 0) return null;
  if (doneAt(state, task.id) > 0) return null;

  const deadlineAt = accepted + days * DAY_MS;
  const remainingMs = deadlineAt - state.at;
  // 向上取整：哪怕只剩 1ms，也算「还剩 1 次行动」，不能显示 0 次却还是进行中
  const remainingSlots = Math.max(0, Math.ceil(remainingMs / ACTION_MS));

  return {
    deadlineAt,
    remainingMs,
    remainingSlots,
    remainingDays: Math.max(0, Math.ceil(remainingMs / DAY_MS)),
    // 这里的 >= 只表示「时间已到」；到期判定 pastDeadline() 用 >（恰好到期仍 active），两者不冲突
    due: state.at >= deadlineAt,
    urgent: remainingSlots <= DAILY_SLOTS,
  };
}

/** 领取任务 → 进行中 */
export function acceptTask(
  state: RunState,
  taskId: string,
): { state: RunState; result: 'ok' | 'not-found' | 'not-claimable' | 'done' } {
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) return { state, result: 'not-found' };

  const status = taskStatus(state, task);
  if (status === 'done') return { state, result: 'done' };
  if (status !== 'claimable') return { state, result: 'not-claimable' };

  return {
    state: {
      ...state,
      flags: { ...state.flags, [acceptedKey(task.id)]: state.at, [doneKey(task.id)]: 0 },
      log: [
        ...state.log,
        {
          at: state.at,
          actionId: `task-accept:${task.id}`,
          text: `领取任务「${task.name}」。`,
          staminaDelta: 0,
          statDelta: {},
          kind: 'action',
        },
      ],
    },
    result: 'ok',
  };
}

/**
 * 领取任务奖励：任务处于「可领奖」状态时调用，发奖并标记完成。
 */
export function claimTaskReward(
  state: RunState,
  taskId: string,
): { state: RunState; result: 'ok' | 'not-ready' | 'not-found' } {
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) return { state, result: 'not-found' };
  if (taskStatus(state, task) !== 'completable') return { state, result: 'not-ready' };

  const rewards = task.rewards ?? {};
  const stats = { ...state.stats };
  for (const [k, v] of Object.entries(rewards.stats ?? {})) {
    const key = k as keyof Stats;
    stats[key] = Math.max(0, Math.min(100, stats[key] + (v ?? 0)));
  }

  const fanGain = rewards.fans ?? 0;
  const fans = fanGain > 0 ? applyFanAction(state.fans, 'stage', fanGain, 0.2) : state.fans;

  const rewardText =
    [
      rewards.money ? `+¥${rewards.money}` : '',
      rewards.stamina ? `体力 +${rewards.stamina}` : '',
      rewards.fans ? `粉丝 +${rewards.fans}` : '',
    ]
      .filter(Boolean)
      .join(' · ') || '已记录';

  return {
    state: {
      ...state,
      money: state.money + (rewards.money ?? 0),
      stamina: Math.max(0, Math.min(100, state.stamina + (rewards.stamina ?? 0))),
      stats,
      fans,
      flags: {
        ...state.flags,
        [doneKey(task.id)]: state.at,
        [doneDayKey(task.id)]: gameDay(state.at),
        [countKey(task.id)]: doneTimes(state, task.id) + 1,
      },
      log: [
        ...state.log,
        {
          at: state.at,
          actionId: `task-done:${task.id}`,
          text: `完成任务「${task.name}」。（${rewardText}）`,
          staminaDelta: rewards.stamina ?? 0,
          statDelta: rewards.stats ?? {},
          kind: 'action',
        },
      ],
    },
    result: 'ok',
  };
}
/** 已完成任务（按完成时间倒序；没有完成时间的排最后） */
export function completedTasks(state: RunState): Array<{ task: TaskDef; at: number }> {
  return TASKS.filter((task) => taskStatus(state, task) === 'done')
    .map((task) => ({ task, at: doneAt(state, task.id) || acceptedAt(state, task.id) || 0 }))
    .sort((a, b) => b.at - a.at);
}

/** 进行中的任务（按领取时间正序） */
export function activeTasks(state: RunState): Array<{ task: TaskDef; at: number }> {
  return TASKS.map((task) => ({ task, at: acceptedAt(state, task.id) }))
    .filter((x) => {
      if (x.at <= 0) return false;
      return taskStatus(state, x.task) === 'active';
    })
    .sort((a, b) => a.at - b.at);
}

/** 可领取的任务 */
export function claimableTasks(state: RunState): TaskDef[] {
  return TASKS.filter((task) => taskStatus(state, task) === 'claimable');
}

/** 需要玩家注意的任务（可领取 + 已完成未看） */
export function taskBadgeCount(state: RunState): number {
  return claimableTasks(state).length;
}

const LABELS: Record<string, string> = {
  vocal: '演唱',
  dance: '舞蹈',
  acting: '演技',
  talk: '口才',
  self: '自我',
  others: '他人',
  fit: '适配',
  stage: '舞台粉',
  gachi: '嘎起粉',
  music: '音乐粉',
  live: '现场粉',
  growth: '养成粉',
  power: '实力粉',
};

/* ───────────── 表达式 DSL → 中文（T-013 bug 3） ───────────── */

/** LABELS 之外、表达式里还会出现的变量名 */
const EXTRA_LABELS: Record<string, string> = {
  money: '资金',
  friends: '朋友圈',
  total: '四项属性总和',
  stamina: '体力',
  mood: '心情',
  satiety: '饱腹',
  height: '身高',
  weight: '体重',
  appearance: '样貌',
  proportion: '身材比例',
};

/** attributes.json 的中文名（含 trait./neg./prof./fans. 前缀写法，裸字段名也收） */
const ATTR_LABELS: Record<string, string> = (() => {
  const GROUP: Record<string, string> = {
    innate: 'innate',
    trait: 'trait',
    negative: 'neg',
    proficient: 'prof',
    fans: 'fans',
  };
  const map: Record<string, string> = {};
  for (const attr of RAW_ATTRIBUTES) {
    map[attr.key] = attr.name;
    const prefix = GROUP[attr.category];
    if (prefix) map[prefix + '.' + attr.key] = attr.name;
  }
  return map;
})();

/** 剧情事件 id → 标题（hasFlag("ev:xxx") 的中文名来源） */
const EVENT_TITLES: Record<string, string> = Object.fromEntries(
  RAW_STORY.map((story) => [story.id, story.title]),
);

function variableLabel(name: string): string | null {
  return LABELS[name] ?? EXTRA_LABELS[name] ?? ATTR_LABELS[name] ?? null;
}

const COMPARE_TEXT: Record<string, string> = {
  '>=': '≥',
  '<=': '≤',
  '>': '>',
  '<': '<',
  '==': '=',
  '=': '=',
  '!=': '≠',
};

interface Rendered {
  text: string;
  /** 变量叶子记住原名（friends 需要额外补「人」） */
  varName?: string;
}

interface Tok {
  kind: 'id' | 'num' | 'str' | 'op';
  text: string;
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re =
    /\s*(>=|<=|==|!=|=|>|<|\+|-|\*|\/|&&|\|\||!|\(|\)|,|"[^"]*"|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_.]*)/y;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m || m.index !== i || !m[1]) throw new Error('无法解析的字符');
    i = re.lastIndex;
    const text = m[1];
    if (text.startsWith('"')) out.push({ kind: 'str', text: text.slice(1, -1) });
    else if (/^\d/.test(text)) out.push({ kind: 'num', text });
    else if (/^[A-Za-z_]/.test(text)) out.push({ kind: 'id', text });
    else out.push({ kind: 'op', text });
  }
  return out;
}

function renderCall(fn: string, args: string[]): string {
  const name = fn.toLowerCase();
  if (name === 'hasflag') {
    const raw = args[0] ?? '';
    if (!raw) return '标记';
    const id = raw.replace(/^ev:/, '');
    const title = EVENT_TITLES[id];
    return title ? '发生过「' + title + '」' : '触发过 ' + id;
  }
  if (name === 'sum') return '（' + args.join(' + ') + '）';
  throw new Error('未知函数 ' + fn);
}

/** 递归下降解析器：只覆盖条件 DSL 用到的形态，遇到不认识的就抛错交给外层回退 */
class ConditionParser {
  private pos = 0;

  constructor(private readonly toks: Tok[]) {}

  parse(): string {
    const rendered = this.parseOr();
    if (this.pos !== this.toks.length) throw new Error('表达式有多余内容');
    return rendered.text;
  }

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }

  private next(): Tok {
    const tok = this.toks[this.pos];
    if (!tok) throw new Error('表达式提前结束');
    this.pos += 1;
    return tok;
  }

  private isOp(...texts: string[]): boolean {
    const tok = this.peek();
    return !!tok && tok.kind === 'op' && texts.includes(tok.text);
  }

  private isKw(...texts: string[]): boolean {
    const tok = this.peek();
    return !!tok && tok.kind === 'id' && texts.includes(tok.text);
  }

  private parseOr(): Rendered {
    let left = this.parseAnd();
    while (this.isOp('||') || this.isKw('or')) {
      this.next();
      left = { text: left.text + ' 或 ' + this.parseAnd().text };
    }
    return left;
  }

  private parseAnd(): Rendered {
    let left = this.parseNot();
    while (this.isOp('&&') || this.isKw('and')) {
      this.next();
      left = { text: left.text + ' 且 ' + this.parseNot().text };
    }
    return left;
  }

  private parseNot(): Rendered {
    if (this.isKw('not') || this.isOp('!')) {
      this.next();
      return { text: '未' + this.parseNot().text };
    }
    return this.parseCompare();
  }

  private parseCompare(): Rendered {
    const left = this.parseAtom();
    if (this.isOp('>=', '<=', '==', '!=', '=', '>', '<')) {
      const op = this.next().text;
      const right = this.parseAtom();
      const symbol = COMPARE_TEXT[op] ?? op;
      const unit = left.varName === 'friends' ? ' 人' : '';
      return { text: left.text + ' ' + symbol + ' ' + right.text + unit };
    }
    return left;
  }

  private parseAtom(): Rendered {
    const tok = this.peek();
    if (!tok) throw new Error('表达式提前结束');
    if (tok.kind === 'num') {
      this.next();
      return { text: tok.text };
    }
    if (tok.kind === 'str') {
      this.next();
      return { text: tok.text };
    }
    if (tok.kind === 'op' && tok.text === '(') {
      this.next();
      const inner = this.parseOr();
      const close = this.next();
      if (close.text !== ')') throw new Error('括号没配对');
      return { text: '（' + inner.text + '）' };
    }
    if (tok.kind === 'id') {
      this.next();
      if (this.isOp('(')) {
        this.next();
        const args: string[] = [];
        if (!this.isOp(')')) {
          args.push(this.parseAtom().text);
          while (this.isOp(',')) {
            this.next();
            args.push(this.parseAtom().text);
          }
        }
        const close = this.next();
        if (close.text !== ')') throw new Error('函数括号没配对');
        return { text: renderCall(tok.text, args) };
      }
      if (tok.text === 'true') return { text: '真' };
      if (tok.text === 'false') return { text: '假' };
      const label = variableLabel(tok.text);
      if (!label) throw new Error('未知变量 ' + tok.text);
      return { text: label, varName: tok.text };
    }
    throw new Error('无法解析的标记 ' + tok.text);
  }
}

/** 表达式 → 中文；解析不了返回 null（界面回退原文，绝不抛错） */
function translateConditionExpr(src: string): string | null {
  try {
    return new ConditionParser(tokenize(src)).parse();
  } catch {
    return null;
  }
}

/** 把条件翻译成中文，给界面展示 */
export function describeCondition(cond?: RawRequires | string): string {
  if (typeof cond === 'string') {
    const src = cond.trim();
    if (!src) return '无';
    return translateConditionExpr(src) ?? src;
  }
  if (!cond || Object.keys(cond).length === 0) return '无';
  const c = cond as Record<string, Record<string, number> | number | string[] | undefined>;
  const parts: string[] = [];

  const sum = c.statsSumAtLeast as number | undefined;
  if (typeof sum === 'number') parts.push(`四项属性总和 ≥ ${sum}`);
  for (const [k, v] of Object.entries((c.statsAtLeast as Record<string, number>) ?? {})) {
    parts.push(`${LABELS[k] ?? k} ≥ ${v}`);
  }
  for (const [k, v] of Object.entries((c.statsBelow as Record<string, number>) ?? {})) {
    parts.push(`${LABELS[k] ?? k} < ${v}`);
  }
  for (const [k, v] of Object.entries((c.axesAtLeast as Record<string, number>) ?? {})) {
    parts.push(`${LABELS[k] ?? k} ≥ ${v}`);
  }
  for (const [k, v] of Object.entries((c.axesBelow as Record<string, number>) ?? {})) {
    parts.push(`${LABELS[k] ?? k} < ${v}`);
  }
  if (typeof c.staminaBelow === 'number') parts.push(`体力 < ${c.staminaBelow}`);
  if (typeof c.moneyAtLeast === 'number') parts.push(`资金 ≥ ${c.moneyAtLeast}`);
  if (typeof c.friendsAtLeast === 'number') parts.push(`朋友圈 ≥ ${c.friendsAtLeast} 人`);
  for (const [k, v] of Object.entries((c.fansAtLeast as Record<string, number>) ?? {})) {
    parts.push(`${LABELS[k] ?? k} ≥ ${v}`);
  }
  for (const f of (c.flagsContain as string[]) ?? []) {
    parts.push(f === 'ev:debut' ? '完成出道' : `标记 ${f}`);
  }
  return parts.join('、') || '无';
}

/** 奖励文案 */
export function describeRewards(task: TaskDef): string {
  const r = task.rewards ?? {};
  const parts = [
    r.money ? `¥${r.money}` : '',
    r.stamina ? `体力 +${r.stamina}` : '',
    r.fans ? `粉丝 +${r.fans}` : '',
    ...Object.entries(r.stats ?? {}).map(([k, v]) => `${LABELS[k] ?? k} +${v}`),
  ].filter(Boolean);
  return parts.join(' · ') || '无';
}