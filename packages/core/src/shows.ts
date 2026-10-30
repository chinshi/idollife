import { applyFanAction, createFans, type FanType, type Fans } from './fans';
import { hashSeed, mulberry32 } from './rng';
import type { RunState } from './types';

export type ShowGrade = 'S' | 'A' | 'B' | 'C';

export interface ShowResult {
  grade: ShowGrade;
  score: number;
  /** 这场主要吸引哪类粉丝 */
  fanType: FanType;
  fanGain: number;
  report: string[];
}

const GRADE_TEXT: Record<ShowGrade, string[]> = {
  S: ['灯亮起来的那一刻，全场安静了。', '你跳完最后一段，掌声比音乐还响。'],
  A: ['发挥很稳，台下有人跟着喊。', '结束后有人挤到前排要签名。'],
  B: ['中规中矩，但没出错。', '有人在门口犹豫了一下，还是走了。'],
  C: ['中间忘了一个动作，你笑着圆过去了。', '台下稀稀拉拉的掌声，你说了谢谢。'],
};

function pickFanType(state: RunState): FanType {
  const s = state.stats;
  if (s.dance >= s.vocal && s.dance >= s.acting && s.dance >= s.talk) return 'stage';
  if (s.vocal >= s.acting && s.vocal >= s.talk) return 'music';
  if (s.acting >= s.talk) return 'growth';
  return 'gachi';
}

/**
 * 一场演出的结算（含 NPC 队友，纯函数）。
 * P0 不发钱，只给粉丝与战报；金钱系统接上后再加。
 */
export function performShow(state: RunState, seed: string): ShowResult {
  const rng = mulberry32(hashSeed(seed));
  const s = state.stats;
  const base = (s.vocal + s.dance + s.acting + s.talk) / 4;
  const fitBonus = state.axes.fit / 20;
  const staminaPenalty = state.stamina < 30 ? 8 : 0;
  const noise = rng() * 10 - 5;

  const score = Math.round(base + fitBonus - staminaPenalty + noise);

  const grade: ShowGrade = score >= 45 ? 'S' : score >= 32 ? 'A' : score >= 20 ? 'B' : 'C';
  const multiplier = grade === 'S' ? 3 : grade === 'A' ? 2 : grade === 'B' ? 1.2 : 0.5;
  const fanGain = Math.max(1, Math.round((score / 10) * multiplier * 3));
  const fanType = pickFanType(state);

  return {
    grade,
    score,
    fanType,
    fanGain,
    report: [...GRADE_TEXT[grade], `这场大概吸引了两百多人里的 ${Math.round(fanGain)} 个。`],
  };
}

/** 把演出结果写回状态：扣体力、涨粉、记日志 */
export function applyShow(state: RunState, result: ShowResult): RunState {
  const stamina = Math.max(0, state.stamina - 30);
  let fans: Fans = state.fans;
  fans = applyFanAction(fans, result.fanType, result.fanGain, 8);

  return {
    ...state,
    stamina,
    fans,
    log: [
      ...state.log,
      {
        at: state.at,
        actionId: `show:${result.grade}`,
        text: `演出结束（${result.grade}）。${result.report.join(' ')}`,
        staminaDelta: -30,
        statDelta: {},
        kind: 'action',
      },
    ],
  };
}

/** 空粉丝状态（供 UI 初始化用） */
export function emptyFans(total = 0): Fans {
  return createFans(total);
}
