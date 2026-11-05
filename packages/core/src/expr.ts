/**
 * 条件表达式（基于 filtrex，语法接近 Godot Expression / SQL）
 *
 *   vocal >= 100 and dance < 50 and total > 200
 *   演唱 >= 100 && 舞蹈 < 50 && total > 200
 *   not (money < 1000) or hasFlag("ev:debut")
 *
 * 变量（写错的变量在编译期就会报错）：
 *   vocal / dance / acting / talk     四项显性属性
 *   self / others / fit               三轴
 *   stamina / money / friends / total 体力 / 资金 / 朋友圈人数 / 四属性总和
 *   mood / stress                     心情 / 压力（缺省 70 / 0）
 *   fans.stage / fans.gachi …         各类粉丝
 *   flags.xxx                         标记（0/1）
 *   中文别名：演唱 舞蹈 演技 口才 自我 他人 适配 体力 资金 心情 压力 粉丝数 总属性
 *
 * 函数：sum(...) / max(...) / min(...) / abs(x) / hasFlag("name")
 *
 * 旧的 JSON 对象条件继续支持。
 */
import { compileExpression as filtrexCompile, type Options } from 'filtrex';
import {
  findUnknownNames,
  normalizeExpr,
  sanitizeFlag,
  STAT_KEYS as RULE_STAT_KEYS,
} from './expr-rules.js';
import type { RunState, Stats } from './types';

/**
 * 表达式规则（变量白名单 / 中文别名 / 裸字段别名 / 允许的前缀）统一放在 expr-rules.js，
 * scripts/validate-data.mjs 用同一份规则做数据期校验，避免出现两套。
 */
const STAT_KEYS = RULE_STAT_KEYS as (keyof Stats)[];

/**
 * 把状态摊平成表达式可读的数据。
 *
 * 这是「变量取值」的唯一来源：编译求值（compileExpression）与任务进度（task-progress）
 * 都必须用它，别在别处另写一套，否则 mood 缺省 70 这类规则会漂移。
 */
export function buildExprData(state: RunState): Record<string, unknown> {
  const data: Record<string, unknown> = {
    vocal: state.stats.vocal,
    dance: state.stats.dance,
    acting: state.stats.acting,
    talk: state.stats.talk,
    self: state.axes.self,
    others: state.axes.others,
    fit: state.axes.fit,
    stamina: state.stamina,
    money: state.money,
    mood: state.mood ?? 70,
    stress: state.negatives?.stress ?? 0,
    // T-044：数据里存量条件写的是 neg.stress / neg.fatigue / neg.desire / neg.scandal，
    // 校验器（GROUP_PREFIXES 含 'neg'）一直认这套写法，但求值侧从来没提供 neg 对象，
    // 于是这些条件恒为 false —— 4 个剧情事件一直触发不了。这里补上。
    neg: state.negatives ?? {},
    friends: (state.friends ?? []).length,
    total: STAT_KEYS.reduce((sum, k) => sum + state.stats[k], 0),
    // T-018：六类粉丝之和（与客户端 totalFans 同口径）
    fansTotal: Object.values(state.fans.byType).reduce((sum, v) => sum + (Number(v) || 0), 0),
    flags: state.flags,
  };
  for (const key of declaredFlagKeys) data[key] = false;
  for (const [k, v] of Object.entries(state.innate ?? {})) data['innate.' + k] = v;
  for (const [k, v] of Object.entries(state.traits ?? {})) data['trait.' + k] = v;
  for (const [k, v] of Object.entries(state.negatives ?? {})) data['neg.' + k] = v;
  for (const [k, v] of Object.entries(state.proficiency ?? {})) data['prof.' + k] = v;
  for (const [flag, on] of Object.entries(state.flags ?? {})) {
    data[sanitizeFlag(flag)] = Boolean(on);
  }
  for (const [type, value] of Object.entries(state.fans.byType)) {
    data[`fans.${type}`] = value;
  }
  return data;
}

const sumFn = (...args: number[]) => args.reduce((a, b) => a + (Number(b) || 0), 0);

/** 配置里出现过的所有标记（保证未设置的标记也能取到 0） */
const declaredFlagKeys = new Set<string>();

function registerFlags(src: string): void {
  for (const m of src.matchAll(/hasFlag\s*\(\s*"([^"]+)"\s*\)/g)) {
    if (m[1]) declaredFlagKeys.add(sanitizeFlag(m[1]));
  }
}

/** 编译表达式，返回 (state) => boolean；语法错误会 throw */
export function compileExpression(src: string): (s: RunState) => boolean {
  registerFlags(src);
  const expression = normalizeExpr(src);

  // 变量白名单校验（编译期就报错，不等运行时）；规则与 scripts/validate-data.mjs 共用 expr-rules.js
  const unknown = findUnknownNames(expression);
  if (unknown.length > 0) throw new ReferenceError(`未知变量「${unknown[0]}」`);

  const fn = filtrexCompile(expression, {
    extraFunctions: { sum: sumFn },
  } as Options);

  return (s: RunState) => {
    const result = fn(buildExprData(s));
    if (result instanceof Error) return false;
    return Boolean(result);
  };
}

/** 旧版 JSON 条件（保留兼容） */
export interface RawRequires {
  statsAtLeast?: Record<string, number>;
  statsBelow?: Record<string, number>;
  axesAtLeast?: Record<string, number>;
  axesBelow?: Record<string, number>;
  staminaBelow?: number;
  statsSumAtLeast?: number;
  statsSumBelow?: number;
  fansAtLeast?: Record<string, number>;
  flagsNot?: string[];
  flagsContain?: string[];
  moneyAtLeast?: number;
  friendsAtLeast?: number;
}

export function matchObjectCondition(state: RunState, req?: RawRequires): boolean {
  if (!req) return true;

  if (req.statsAtLeast) {
    for (const [k, v] of Object.entries(req.statsAtLeast)) {
      if (state.stats[k as keyof Stats] < v) return false;
    }
  }
  if (req.statsBelow) {
    for (const [k, v] of Object.entries(req.statsBelow)) {
      if (state.stats[k as keyof Stats] >= v) return false;
    }
  }
  if (req.axesAtLeast) {
    for (const [k, v] of Object.entries(req.axesAtLeast)) {
      if (state.axes[k as 'self' | 'others' | 'fit'] < v) return false;
    }
  }
  if (req.axesBelow) {
    for (const [k, v] of Object.entries(req.axesBelow)) {
      if (state.axes[k as 'self' | 'others' | 'fit'] >= v) return false;
    }
  }
  if (typeof req.staminaBelow === 'number' && state.stamina >= req.staminaBelow) return false;
  if (typeof req.statsSumAtLeast === 'number') {
    const sum = STAT_KEYS.reduce((acc, k) => acc + state.stats[k], 0);
    if (sum < req.statsSumAtLeast) return false;
  }
  if (typeof req.statsSumBelow === 'number') {
    const sum = STAT_KEYS.reduce((acc, k) => acc + state.stats[k], 0);
    if (sum >= req.statsSumBelow) return false;
  }
  if (req.fansAtLeast) {
    for (const [k, v] of Object.entries(req.fansAtLeast)) {
      if (((state.fans.byType as Record<string, number>)[k] ?? 0) < v) return false;
    }
  }
  if (typeof req.moneyAtLeast === 'number' && state.money < req.moneyAtLeast) return false;
  if (typeof req.friendsAtLeast === 'number' && (state.friends ?? []).length < req.friendsAtLeast) {
    return false;
  }
  if (req.flagsContain) {
    for (const f of req.flagsContain) {
      if (!state.flags[f]) return false;
    }
  }
  if (req.flagsNot) {
    for (const f of req.flagsNot) {
      if (state.flags[f]) return false;
    }
  }
  return true;
}

/** 统一入口：字符串走表达式，对象走旧 JSON 条件 */
export function matchesCondition(state: RunState, cond?: RawRequires | string | null): boolean {
  if (!cond) return true;
  if (typeof cond === 'string') {
    const src = cond.trim();
    if (!src) return true;
    return compileExpression(src)(state);
  }
  return matchObjectCondition(state, cond);
}

/** 给人看的条件文字 */
export function conditionText(cond?: RawRequires | string | null): string {
  if (!cond) return '无';
  if (typeof cond === 'string') return cond.trim() || '无';
  return '（对象条件）';
}
