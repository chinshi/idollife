import { describe, expect, it } from 'vitest';
import { advanceGate } from '../src/components/advance-block';

/**
 * T-038 守卫：`advance()` 的每个 early-return 必须给出可见原因。
 * 这里锁的是门禁本身——任何一条返回 null 都会让玩家点完按钮"什么都没发生"。
 */
const ok = { running: false, pendingCount: 1, hasPendingEvent: false };

describe('advanceGate 推进入口门禁', () => {
  it('全部条件满足时放行（返回 null）', () => {
    expect(advanceGate(ok)).toBeNull();
  });

  it('正在运行：拦下并提示等这一批或停止', () => {
    const g = advanceGate({ ...ok, running: true });
    expect(g?.reason).toBe('running');
    expect(g?.text).toContain('停止');
  });

  it('待办 0：拦下并指向安排行程', () => {
    const g = advanceGate({ ...ok, pendingCount: 0 });
    expect(g?.reason).toBe('empty');
    expect(g?.text).toContain('安排行程');
  });

  it('有未处理重点事件：拦下', () => {
    const g = advanceGate({ ...ok, hasPendingEvent: true });
    expect(g?.reason).toBe('event');
    expect(g?.text).toContain('重点事件');
  });

  it('每个被拦下的 reason 都有非空文案（不允许空提示）', () => {
    const cases = [
      { ...ok, running: true },
      { ...ok, pendingCount: 0 },
      { ...ok, hasPendingEvent: true },
    ];
    for (const c of cases) {
      const g = advanceGate(c);
      expect(g).not.toBeNull();
      expect((g?.text ?? '').trim().length).toBeGreaterThan(0);
    }
  });
});
