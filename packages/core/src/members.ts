import { DEBUT_THRESHOLD } from './content';
import { hashSeed, mulberry32 } from './rng';
import type { Bias, Member, Party, RunState, Stats } from './types';

export type { Bias, Member };

import membersJson from '../data/members.json';
import { BALANCE } from './data';

export const RECRUIT_COST = BALANCE.recruitCost;
export const DUP_CAP = BALANCE.dupCap;
/** NPC 初始强度相对主角 */
export const NPC_BASE_RATIO = BALANCE.npcBaseRatio;

const NAMES = membersJson.members.namePool;
const BIASES = membersJson.members.biases as Bias[];
const BIAS_NAMES = membersJson.members.biasNames as Record<string, string>;

/** 倾向中文名：唱功型 / 舞蹈型 / ... */
export const BIAS_LABEL: Record<string, string> = Object.fromEntries(
  BIASES.map((b) => [b, BIAS_NAMES?.[b] ?? b]),
);

export type PartyResult = 'ok' | 'not-debuted' | 'not-found' | 'no-party';
export type RecruitResult = 'new' | 'dup' | 'poor' | 'no-party';

/** 是否够格出道 */
export function canDebut(state: RunState): boolean {
  if (state.debuted) return false;
  const total = state.stats.vocal + state.stats.dance + state.stats.acting + state.stats.talk;
  return total >= DEBUT_THRESHOLD;
}

export function debut(state: RunState): RunState {
  if (!canDebut(state)) return state;
  return {
    ...state,
    debuted: true,
    flags: { ...state.flags, 'ev:debut': true },
    log: [
      ...state.log,
      {
        at: state.at,
        actionId: 'debut',
        text: '你正式出道了。从现在起，可以组建自己的组合。',
        staminaDelta: 0,
        statDelta: {},
        kind: 'action',
      },
    ],
  };
}

/** 创建组合（出道前不可用） */
export function createParty(state: RunState, name: string): { state: RunState; result: PartyResult } {
  if (!state.debuted) return { state, result: 'not-debuted' };

  const id = `party-${state.parties.length + 1}-${state.at.toString(36)}`;
  const party: Party = { id, name: name.trim() || `组合 ${state.parties.length + 1}`, members: [] };

  return {
    state: {
      ...state,
      parties: [...state.parties, party],
      activePartyId: id,
      log: [
        ...state.log,
        {
          at: state.at,
          actionId: 'create-party',
          text: `创建了组合「${party.name}」。`,
          staminaDelta: 0,
          statDelta: {},
          kind: 'action',
        },
      ],
    },
    result: 'ok',
  };
}

export function switchParty(state: RunState, partyId: string): RunState {
  if (!(state.parties ?? []).some((p) => p.id === partyId)) return state;
  return { ...state, activePartyId: partyId };
}

export function activeParty(state: RunState): Party | null {
  return (state.parties ?? []).find((p) => p.id === state.activePartyId) ?? null;
}

/**
 * 招募一个 NPC：花 500，抽一个模板；重复则叠 +1%（上限 +10%）。
 * 必须先有组合。
 */
export function recruit(state: RunState, seed: string): { state: RunState; result: RecruitResult } {
  const party = activeParty(state);
  if (!party) return { state, result: 'no-party' };
  if (state.money < RECRUIT_COST) return { state, result: 'poor' };

  const rng = mulberry32(hashSeed(seed + ':' + state.log.length));
  const name = NAMES[Math.floor(rng() * NAMES.length)]!;
  const bias = BIASES[Math.floor(rng() * BIASES.length)]!;
  const id = `npc-${name}`;

  const members = [...party.members];
  const idx = members.findIndex((m) => m.id === id);
  let result: RecruitResult;
  let text: string;

  if (idx >= 0) {
    const prev = members[idx]!;
    const dupCount = Math.min(DUP_CAP, prev.dupCount + 1);
    members[idx] = { ...prev, dupCount };
    result = 'dup';
    text = `${prev.name} 又来了，默契 +1%（累计 ${dupCount}）。`;
  } else {
    const member: Member = { id, name, bias, dupCount: 0 };
    members.push(member);
    result = 'new';
    text = `招募到了 ${name}（${biasLabel(bias)}）。`;
  }

  return {
    state: {
      ...state,
      money: state.money - RECRUIT_COST,
      parties: state.parties.map((p) => (p.id === party.id ? { ...p, members } : p)),
      log: [
        ...state.log,
        { at: state.at, actionId: 'recruit', text, staminaDelta: 0, statDelta: {}, kind: 'action' },
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

/** 成员的实际能力：主角平均值 ×90%，按偏向重新分配，重复最多 +10% */
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
