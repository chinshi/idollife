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
 *   fans.stage / fans.gachi …         各类粉丝
 *   flags.xxx                         标记（0/1）
 *   中文别名：演唱 舞蹈 演技 口才 自我 他人 适配 体力 资金 粉丝数
 *
 * 函数：sum(...) / max(...) / min(...) / abs(x) / hasFlag("name")
 *
 * 旧的 JSON 对象条件继续支持。
 */
import { compileExpression as filtrexCompile, type Options } from 'filtrex';
import type { RunState, Stats } from './types';

const STAT_KEYS: (keyof Stats)[] = ['vocal', 'dance', 'acting', 'talk'];

const ALIAS: Record<string, string> = {
  演唱: 'vocal',
  舞蹈: 'dance',
  演技: 'acting',
  口才: 'talk',
  自我: 'self',
  他人: 'others',
  适配: 'fit',
  体力: 'stamina',
  资金: 'money',
  粉丝数: 'friends',
  好友数: 'friends',
  总属性: 'total',
};

/** 允许出现在表达式里的变量名 */
const KNOWN = new Set<string>([
  ...STAT_KEYS,
  'self',
  'others',
  'fit',
  'stamina',
  'money',
  'friends',
  'total',
  ...[
    'stage',
    'gachi',
    'music',
    'live',
    'growth',
    'power',
  ].map((t) => `fans.${t}`),
]);

const sanitizeFlag = (name: string) => 'flag_' + String(name).replace(/[^A-Za-z0-9_]/g, '_');

/** 把中文别名替换成英文字段名 */
function normalize(src: string): string {
  let out = src;
  for (const [cn, en] of Object.entries(ALIAS)) {
    out = out.split(cn).join(en);
  }
  // hasFlag("ev:debut") → flag_ev_debut（转成变量，靠 data 求值）
  out = out.replace(/hasFlag\s*\(\s*"([^"]+)"\s*\)/g, (_m: string, name: string) =>
    sanitizeFlag(name),
  );

  // Godot / JS 风格运算符 → filtrex 关键字
  out = out.replace(/&&/g, ' and ').replace(/\|\|/g, ' or ');
  out = out.replace(/!(?!=)/g, ' not ');
  return out;
}

/** 把状态摊平成表达式可读的数据 */
function toData(state: RunState): Record<string, unknown> {
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
    friends: (state.friends ?? []).length,
    total: STAT_KEYS.reduce((sum, k) => sum + state.stats[k], 0),
    flags: state.flags,
  };
  for (const key of declaredFlagKeys) data[key] = false;
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
  const expression = normalize(src);

  // 变量白名单校验（编译期就报错，不等运行时）；先去掉字符串字面量
  const scanSrc = expression.replace(/"[^"]*"/g, '""');
  for (const name of scanSrc.match(/[A-Za-z_][A-Za-z0-9_.]*/g) ?? []) {
    if (['and', 'or', 'not', 'true', 'false', 'mod', 'in'].includes(name)) continue;
    if (name === 'sum' || name === 'max' || name === 'min' || name === 'abs') {
      continue;
    }
    if (KNOWN.has(name) || name.startsWith('flag_')) continue;
    throw new ReferenceError(`未知变量「${name}」`);
  }

  const fn = filtrexCompile(expression, {
    extraFunctions: { sum: sumFn },
  } as Options);

  return (s: RunState) => {
    const result = fn(toData(s));
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
