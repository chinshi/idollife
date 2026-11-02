import { describe, expect, it } from 'vitest';
import eventsJson from '../data/events.json';
import tasksJson from '../data/tasks.json';
import { describeCondition } from '../src/tasks';

/**
 * T-013 bug 3：`describeCondition` 必须把表达式 DSL 翻成中文，界面不能再漏英文字段名。
 *
 * 覆盖数据里出现过的**全部**条件：24 条任务的 accept/complete、30 条剧情的 requires、
 * 以及每个 choice 的 requires。翻译不了、只能保留原文的必须登记在 FALLBACK（目前为空）。
 */

/** 翻译不了、只能保留原文的条件（目前为空；新增时登记并在回执说明） */
const FALLBACK: string[] = [];

/** 英文字段名残留（≥3 个字母/下划线） */
const ENGLISH_RESIDUE = /[A-Za-z_]{3,}/;

interface RawCase {
  where: string;
  cond: string;
}

const cases: RawCase[] = [];

for (const task of tasksJson.tasks as Array<Record<string, unknown>>) {
  for (const key of ['acceptCondition', 'completeCondition', 'displayCondition'] as const) {
    const cond = task[key];
    if (typeof cond === 'string' && cond.trim()) {
      cases.push({ where: `${String(task.id)}.${key}`, cond });
    }
  }
}

for (const story of eventsJson.story as Array<Record<string, unknown>>) {
  if (typeof story.requires === 'string' && story.requires.trim()) {
    cases.push({ where: `story.${String(story.id)}.requires`, cond: story.requires });
  }
  for (const choice of (story.choices ?? []) as Array<Record<string, unknown>>) {
    const cond = choice.requires;
    if (typeof cond === 'string' && cond.trim()) {
      cases.push({
        where: `story.${String(story.id)}/${String(choice.id)}.requires`,
        cond,
      });
    }
  }
}

describe('describeCondition：表达式 → 中文（T-013 bug 3）', () => {
  it('数据里全部条件都能翻译，输出无英文字段残留、非空且不是「无」', () => {
    expect(cases.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const { where, cond } of cases) {
      const out = describeCondition(cond);
      if (!out || out === '无') {
        failures.push(`${where}: 输出为空 →「${out}」`);
      } else if (ENGLISH_RESIDUE.test(out)) {
        failures.push(`${where}: 残留英文 →「${out}」（原文 ${cond}）`);
      } else if (out === cond.trim()) {
        failures.push(`${where}: 原样回退 →「${out}」`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('FALLBACK 白名单为空：没有任何条件只能回退英文原文', () => {
    expect(FALLBACK).toEqual([]);
    for (const { cond } of cases) {
      expect(ENGLISH_RESIDUE.test(describeCondition(cond))).toBe(false);
    }
  });

  it('卡片表格里的样例文案精确匹配', () => {
    expect(describeCondition('talk >= 20')).toBe('口才 ≥ 20');
    expect(describeCondition('others >= 30')).toBe('他人 ≥ 30');
    expect(describeCondition('money >= 10000')).toBe('资金 ≥ 10000');
    expect(describeCondition('fans.stage >= 100')).toBe('舞台粉 ≥ 100');
    expect(describeCondition('fans.gachi >= 20')).toBe('嘎起粉 ≥ 20');
    expect(describeCondition('total >= 120')).toBe('四项属性总和 ≥ 120');
    expect(describeCondition('friends >= 1')).toBe('朋友圈 ≥ 1 人');
    expect(describeCondition('hasFlag("ev:fan-letter")')).toBe('发生过「第一封信」');
    expect(describeCondition('total >= 120 and not hasFlag("ev:debut")')).toBe(
      '四项属性总和 ≥ 120 且 未发生过「出道」',
    );
  });

  it('带换行 / 多余空白的表达式同样能翻', () => {
    expect(describeCondition('  dance >= 15 and not hasFlag("ev:first-audition") \n')).toBe(
      '舞蹈 ≥ 15 且 未发生过「一个试镜机会」',
    );
  });

  it('解析不了时回退原文、不抛错', () => {
    expect(describeCondition('???')).toBe('???');
    expect(describeCondition('foo(bar)')).toBe('foo(bar)');
    expect(describeCondition('')).toBe('无');
    expect(describeCondition(undefined)).toBe('无');
  });

  it('旧的 JSON 对象条件仍然翻译（回归）', () => {
    expect(describeCondition({ statsAtLeast: { vocal: 10 } } as never)).toBe('演唱 ≥ 10');
    expect(describeCondition({ moneyAtLeast: 5000 } as never)).toBe('资金 ≥ 5000');
  });
});
