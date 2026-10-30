/** 六类粉丝 */
export type FanType = 'stage' | 'gachi' | 'music' | 'live' | 'growth' | 'power';

/** 四层忠诚度，从低到高 */
export type Loyalty = 'casual' | 'dd' | 'group' | 'solo';

export const FAN_TYPES: FanType[] = ['stage', 'gachi', 'music', 'live', 'growth', 'power'];
export const LOYALTY_ORDER: Loyalty[] = ['casual', 'dd', 'group', 'solo'];

export interface Fans {
  /** 每类粉丝的数量 */
  byType: Record<FanType, number>;
  /** 每层忠诚度的数量（总和 = 粉丝总数） */
  loyalty: Record<Loyalty, number>;
  /** 每类粉丝的好感值，0–100，满了就向上转化 */
  affection: Record<FanType, number>;
}

/** 好感满 100 触发一次向上转化 */
export const AFFECTION_MAX = 100;
/** 每次转化把该层 5% 往上挪（至少 1 人） */
const PROMOTE_RATIO = 0.05;

function zeroed<T extends string>(keys: T[]): Record<T, number> {
  return keys.reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {} as Record<T, number>);
}

export function createFans(total = 0): Fans {
  return {
    byType: zeroed(FAN_TYPES),
    loyalty: { casual: total, dd: 0, group: 0, solo: 0 },
    affection: zeroed(FAN_TYPES),
  };
}

export function totalFans(fans: Fans): number {
  return LOYALTY_ORDER.reduce((sum, k) => sum + fans.loyalty[k], 0);
}

/**
 * 做一件「某类粉丝喜欢的事」：
 * 1. 该类粉丝数量增加
 * 2. 该类好感增加
 * 3. 好感溢出 100 时，把最低未满层的一部分人向上转化
 */
export function applyFanAction(fans: Fans, type: FanType, newFans: number, affection: number): Fans {
  const next: Fans = {
    byType: { ...fans.byType },
    loyalty: { ...fans.loyalty },
    affection: { ...fans.affection },
  };

  const added = Math.max(0, Math.floor(newFans));
  next.byType[type] += added;
  next.loyalty.casual += added;
  next.affection[type] = Math.min(AFFECTION_MAX, next.affection[type] + Math.max(0, affection));

  while (next.affection[type] >= AFFECTION_MAX) {
    next.affection[type] -= AFFECTION_MAX;
    promoteOnce(next);
  }

  return next;
}

/** 把最底下一层的一部分人提升一级（人数守恒） */
function promoteOnce(fans: Fans): void {
  for (let i = 0; i < LOYALTY_ORDER.length - 1; i++) {
    const from = LOYALTY_ORDER[i]!;
    const to = LOYALTY_ORDER[i + 1]!;
    const movable = Math.max(1, Math.floor(fans.loyalty[from] * PROMOTE_RATIO));
    const moved = Math.min(movable, fans.loyalty[from]);
    if (moved > 0) {
      fans.loyalty[from] -= moved;
      fans.loyalty[to] += moved;
      return;
    }
  }
}

/** 掉粉：从指定层扣，最低层优先，扣完为止 */
export function loseFans(fans: Fans, amount: number): Fans {
  let left = Math.max(0, Math.floor(amount));
  const next: Fans = {
    byType: { ...fans.byType },
    loyalty: { ...fans.loyalty },
    affection: { ...fans.affection },
  };

  for (const tier of LOYALTY_ORDER) {
    if (left <= 0) break;
    const take = Math.min(next.loyalty[tier], left);
    next.loyalty[tier] -= take;
    left -= take;
  }

  // 按比例削各类粉丝数
  const before = totalFans(fans);
  const after = totalFans(next);
  if (before > 0) {
    for (const t of FAN_TYPES) {
      next.byType[t] = Math.round((next.byType[t] * after) / before);
    }
  }

  return next;
}
