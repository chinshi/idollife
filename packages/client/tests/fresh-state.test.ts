import { describe, expect, it } from 'vitest';
import type { RunState } from '@idollife/core';
import { freshBase, shouldWriteFresh } from '../src/components/fresh-state';

const old = { at: 1, fans: 1 } as unknown as RunState;
const aligned = { at: 20, fans: 9 } as unknown as RunState;

describe('T-039-r4 pushFresh base', () => {
  it('G17 compute 必须收到服务端对齐后的 run', () => {
    expect(freshBase(aligned, old)).toBe(aligned);
    expect(freshBase(aligned, old).at).toBe(20);
    expect(freshBase(aligned, old).fans).toBe(9);
  });

  it('G18 返回同一引用 = 放弃写入', () => {
    expect(shouldWriteFresh(aligned, aligned)).toBe(false);
    expect(shouldWriteFresh(aligned, { ...aligned } as RunState)).toBe(true);
  });
});
