import { describe, expect, it } from 'vitest';
import { advanceBlockText, makeAdvanceBlock } from '../src/components/advance-block';

const stamina = { ok: false as const, reason: 'stamina' as const, text: '', need: 30, have: 10 };
const money = { ok: false as const, reason: 'money' as const, text: '', need: 500, have: 380 };
const times = { ok: false as const, reason: 'times' as const, text: '', need: 0, have: 0 };

describe('T-035 推进受阻文案', () => {
  it('体力/钱：完整版含行动名与差值', () => {
    expect(advanceBlockText(stamina, '专业歌唱指导')).toContain('专业歌唱指导');
    expect(advanceBlockText(stamina, '专业歌唱指导')).toContain('体力差 20');
    expect(advanceBlockText(stamina, '专业歌唱指导')).toContain('推不动');
    expect(advanceBlockText(money, '街头演出')).toContain('钱差 ¥120');
    expect(advanceBlockText(money, '街头演出')).toContain('街头演出');
  });

  it('次数：按 scopeWord 派生本局/本周/今天，不硬编码每局', () => {
    expect(advanceBlockText(times, '兼职打工', '本局', { times: 1 })).toContain('本局次数已用完');
    expect(advanceBlockText(times, '兼职打工', '本周', { times: 1 })).toContain('本周次数已用完');
    expect(advanceBlockText(times, '兼职打工', '本周', { times: 1 })).not.toContain('每局');
    expect(advanceBlockText(times, '兼职打工', '本局', { times: 1 })).toContain('删掉它，');
    expect(advanceBlockText(times, '兼职打工', '今天', { times: 1 })).toContain('今天次数已用完');
    expect(advanceBlockText(times, '兼职打工', '本局', { compact: true })).toContain('下一条');
  });

  it('拦截状态必须带非空 lastStop', () => {
    const b = makeAdvanceBlock(stamina, '专业歌唱指导', '本局');
    expect(b.lastStop).toBe('stamina');
    expect(b.text).toContain('体力差');
    expect(makeAdvanceBlock(times, '兼职打工', '本局').lastStop).toBe('times');
  });
});
