import { describe, expect, it } from 'vitest';
import eventsJson from '../data/events.json';
import { compileExpression } from '../src/expr';

/**
 * T-005：requires 表达式的编译期兜底。
 *
 * check:data 走的是手写规则校验；万一有人绕过 `pnpm check:data` 直接改 events.json，
 * 这里用**真正的编译器**逐个编译一遍，保证坏表达式进不了运行期（玩家点开选项那一刻才炸）。
 */
interface RawEvent {
  id?: string;
  requires?: unknown;
  choices?: RawEvent[];
}

const events = eventsJson as unknown as { story?: RawEvent[]; routine?: RawEvent[] };

/** events.json 里所有 requires（story / story[].choices / routine），带定位信息 */
function allRequires(): Array<{ where: string; expr: string }> {
  const out: Array<{ where: string; expr: string }> = [];
  for (const e of events.story ?? []) {
    if (typeof e.requires === 'string') out.push({ where: `story ${e.id}`, expr: e.requires });
    for (const c of e.choices ?? []) {
      if (typeof c.requires === 'string') {
        out.push({ where: `choice ${e.id}/${c.id}`, expr: c.requires });
      }
    }
  }
  for (const r of events.routine ?? []) {
    if (typeof r.requires === 'string') out.push({ where: `routine ${r.id}`, expr: r.requires });
  }
  return out;
}

describe('requires 表达式编译期兜底', () => {
  const requires = allRequires();

  it('确实收集到了 requires（防止遍历写空导致假绿）', () => {
    expect(requires.length).toBeGreaterThan(0);
  });

  it('events.json 里所有 requires 都能被 compileExpression 编译', () => {
    const failed: string[] = [];
    for (const { where, expr } of requires) {
      try {
        compileExpression(expr);
      } catch (err) {
        failed.push(`${where}: ${expr} → ${(err as Error).message}`);
      }
    }
    expect(failed).toEqual([]);
  });
});
