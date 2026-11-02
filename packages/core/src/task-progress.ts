/**
 * 任务进度（T-008，docs/25 §2.5 D）
 *
 * 只从 completeCondition 的两种简单形态推导进度：
 *   `<变量> >= <数字>` → target = 数字
 *   `<变量> >  <数字>` → target = 数字 + 1（严格大于的最小可达值）
 * 复合条件（and / or / 函数 / 多个比较）一律返回 null，界面降级为纯文字——不瞎猜。
 *
 * 当前值统一走 expr.ts 的 buildExprData()，和条件求值用同一套取值（mood 缺省 70 这类规则不会漂移）。
 */
import { RAW_ATTRIBUTES } from './data';
import { buildExprData } from './expr';
import { ALIAS, normalizeExpr } from './expr-rules.js';
import type { TaskDef } from './tasks';
import type { RunState } from './types';

export interface TaskProgress {
  /** 中文显示名，如「舞蹈」「舞台粉」 */
  label: string;
  current: number;
  target: number;
}

/** attributes.json 的 category → 表达式里的分组前缀 */
const CATEGORY_PREFIX: Record<string, string> = {
  innate: 'innate',
  trait: 'trait',
  negative: 'neg',
  proficient: 'prof',
  fans: 'fans',
};

/**
 * 变量名 → 中文名。优先级：① attributes.json 中文名 ② 中文别名反查 ③ 变量原名。
 * 键同时登记裸名和「前缀.名」，与表达式里的写法对齐。
 */
const VARIABLE_LABEL = (() => {
  const map = new Map<string, string>();
  for (const attr of RAW_ATTRIBUTES) {
    if (!attr.key || !attr.name) continue;
    map.set(attr.key, attr.name);
    const prefix = CATEGORY_PREFIX[attr.category];
    if (prefix) map.set(`${prefix}.${attr.key}`, attr.name);
  }
  // 中文别名反查：total / friends 这类没有 attributes.json 条目的变量靠这一步
  for (const [cn, en] of Object.entries(ALIAS)) {
    if (!map.has(en)) map.set(en, cn);
  }
  return map;
})();

/** 只认「<变量> >= <数字>」和「<变量> > <数字>」两种单比较形态 */
const SIMPLE_CONDITION = /^([A-Za-z_][A-Za-z0-9_.]*)\s*(>=|>)\s*(-?\d+(?:\.\d+)?)$/;

export function taskProgress(state: RunState, task: TaskDef): TaskProgress | null {
  const raw = task.completeCondition;
  // 空条件 / 旧 JSON 对象条件都不提供进度
  if (typeof raw !== 'string') return null;
  const source = raw.trim();
  if (!source) return null;

  // 用与编译期同一套 normalize：中文别名、裸字段别名都会折算成 buildExprData 里的键
  const normalized = normalizeExpr(source).trim();
  const match = SIMPLE_CONDITION.exec(normalized);
  // 复合条件 / hasFlag / 函数 / 多个比较 → 降级纯文字，不猜
  if (!match) return null;

  const name = match[1] ?? '';
  const operator = match[2] ?? '>=';
  const literal = match[3] ?? '';

  // 取不到值就返回 null（不显示 0/x 骗人）
  const current = buildExprData(state)[name];
  if (typeof current !== 'number' || !Number.isFinite(current)) return null;

  const value = Number(literal);
  if (!Number.isFinite(value)) return null;
  const target = operator === '>' ? value + 1 : value;

  // 目标 <= 0 的写法（如 `vocal >= 0`）没有进度意义：玩家一步没做也会显示满格，属假达标，
  // 直接不提供进度（降级纯文字）。
  if (target <= 0) return null;

  return {
    label: VARIABLE_LABEL.get(name) ?? name,
    current,
    target,
  };
}
