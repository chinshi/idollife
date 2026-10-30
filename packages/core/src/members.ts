import { hashSeed, mulberry32 } from './rng';
import type { Bias, Member, RunState, Stats } from './types';

export type { Bias, Member };


export const RECRUIT_COST = 500;
export const DUP_CAP = 10;
/** NPC 初始强度是主角的 90% */
export const NPC_BASE_RATIO = 0.9;

const NAMES = [
  '林小满', '周予', '陈一诺', '苏晚', '何昭', '许知',
  '郑夏', '唐澄', '白露', '顾南', '沈青', '叶绫',
];

const BIASES: Bias[] = ['vocal', 'dance', 'acting', 'talk', 'balanced'];

export interface RecruitResult {
  kind: 'new' | 'dup' | 'poor';
  member?: Member;
  cost: number;
  /** 触发这次招募的随机角色名，便于测试复现 */
  roll: number;
}

/** 招募一个 NPC：花 500，随机抽一个模板；重复则叠 +1%（上限 +10%） */
export function recruit(state: RunState, seed: string): { state: RunState; result: RecruitResult } {
  if (state.money < RECRUIT_COST) {
    return { state, result: { kind: 'poor', cost: RECRUIT_COST, roll: -1 } };
  }

  const rng = mulberry32(hashSeed(seed + ':' + state.log.length));
  const roll = rng();
  const name = NAMES[Math.floor(rng() * NAMES.length)]!;
  const bias = BIASES[Math.floor(rng() * BIASES.length)]!;
  const id = `npc-${name}`;

  const upgraded = addOrUpgradeMember(state, name, bias);
  const result: RecruitResult = { ...upgraded.result, cost: RECRUIT_COST, roll };
  const party = upgraded.party;

  return {
    state: {
      ...state,
      money: state.money - RECRUIT_COST,
      party,
      log: [
        ...state.log,
        {
          at: state.at,
          actionId: 'recruit',
          text:
            result.kind === 'new'
              ? `招募到了 ${result.member!.name}（${biasLabel(result.member!.bias)}）。`
              : `${result.member!.name} 又来了，默契 +1%（累计 ${result.member!.dupCount}）。`,
          staminaDelta: 0,
          statDelta: {},
          kind: 'action',
        },
      ],
    },
    result,
  };
}

export function biasLabel(bias: Bias): string {
  switch (bias) {
    case 'vocal':
      return '唱';
    case 'dance':
      return '跳';
    case 'acting':
      return '演';
    case 'talk':
      return '说';
    default:
      return '全';
  }
}

/**
 * 成员的实际能力：以主角平均值为基准 ×90%，
 * 再按偏向重新分配，重复次数最多 +10%。
 */
export function memberStats(member: Member, player: Stats): Stats {
  const avg = (player.vocal + player.dance + player.acting + player.talk) / 4;
  const scale = avg * NPC_BASE_RATIO * (1 + Math.min(DUP_CAP, member.dupCount) * 0.01);
  const weights: Record<Bias, [number, number, number, number]> = {
    vocal: [1.3, 0.9, 0.9, 0.9],
    dance: [0.9, 1.3, 0.9, 0.9],
    acting: [0.9, 0.9, 1.3, 0.9],
    talk: [0.9, 0.9, 0.9, 1.3],
    balanced: [1, 1, 1, 1],
  };
  const [v, d, a, t] = weights[member.bias];
  return {
    vocal: Math.round(scale * v),
    dance: Math.round(scale * d),
    acting: Math.round(scale * a),
    talk: Math.round(scale * t),
  };
}

/** 把同名成员加入组合，或给已有成员叠一次「默契」（+1%，上限 +10%） */
export function addOrUpgradeMember(
  state: RunState,
  name: string,
  bias: Bias,
): { party: Member[]; result: { kind: 'new' | 'dup'; member: Member } } {
  const party = [...state.party];
  const id = `npc-${name}`;
  const idx = party.findIndex((m) => m.id === id);

  if (idx >= 0) {
    const prev = party[idx]!;
    const dupCount = Math.min(DUP_CAP, prev.dupCount + 1);
    party[idx] = { ...prev, dupCount };
    return { party, result: { kind: 'dup', member: party[idx]! } };
  }

  const member: Member = { id, name, bias, dupCount: 0 };
  party.push(member);
  return { party, result: { kind: 'new', member } };
}