/**
 * 朋友圈：认识新朋友（卡池抽取）+ 邀请加入组合
 *
 * 抽取规则：
 * 1. 先判定「抽空」：10% 概率什么都没遇到（钱照扣）
 * 2. 没抽空则从渠道对应卡池里抽人：
 *    - 池子里还有没认识过的人 → 只在没认识的人里等概率抽
 *    - 池子全都认识过了 → 全池加权抽，满默契的人权重减半
 */
import channelsJson from '../data/channels.json';
import { DAY_MS } from './content';
import { BALANCE, RAW_POOLS } from './data';
import { hashSeed, mulberry32 } from './rng';
import type { Bias, Friend, RunState } from './types';

export interface Channel {
  id: string;
  name: string;
  cost: number;
  biasPool: Bias[];
  poolId?: string;
  quality: [number, number];
  text: string;
}

export const CHANNELS: Channel[] = channelsJson.channels as Channel[];

/** 抽空概率 */
export const EMPTY_DRAW_CHANCE = 0.1;

const DUP_CAP = BALANCE.dupCap ?? 10;

/** 退团后多少天内不能重新入团 */
export const RECRUIT_COOLDOWN_DAYS = 30;

function poolMembers(poolId?: string): string[] {
  if (!poolId) return [];
  const pool = RAW_POOLS.find((p) => p.id === poolId);
  return pool ? pool.members : [];
}

/** 这个人在朋友圈/组合里的默契值（没有则 0） */
function chemistryOf(state: RunState, name: string): number {
  const friend = state.friends.find((f) => f.name === name);
  if (friend) return friend.dupCount ?? 0;

  for (const party of state.parties) {
    const member = party.members.find((m) => m.name === name);
    if (member) return member.dupCount;
  }
  return 0;
}

export type MeetResult = 'ok' | 'dup' | 'empty' | 'poor' | 'unknown';

/** 花一笔钱，认识一个新朋友，放进朋友圈 */
export function meetFriend(
  state: RunState,
  channelId: string,
  seed: string,
): { state: RunState; result: MeetResult; friend?: Friend } {
  const channel = CHANNELS.find((c) => c.id === channelId);
  if (!channel) return { state, result: 'unknown' };
  if (state.money < channel.cost) return { state, result: 'poor' };

  const meetCount = state.log.filter((l) => l.actionId.startsWith('meet:')).length;
  const rng = mulberry32(
    hashSeed(`${seed}:${channelId}:${state.at}:${meetCount}:${state.friends.length}`),
  );

  const spend = (extra: Partial<RunState>, text: string): RunState => ({
    ...state,
    ...extra,
    money: state.money - channel.cost,
    log: [
      ...state.log,
      {
        at: state.at,
        actionId: `meet:${channel.id}`,
        text,
        staminaDelta: 0,
        statDelta: {},
        kind: 'action',
      },
    ],
  });

  // 1) 抽空
  if (rng() < EMPTY_DRAW_CHANCE) {
    return { state: spend({}, `${channel.text}，但这次没遇到合适的人。`), result: 'empty' };
  }

  // 2) 选卡池
  const pool = poolMembers(channel.poolId);
  if (pool.length === 0) return { state, result: 'unknown' };

  const known = new Set<string>([
    ...state.friends.map((f) => f.name),
    ...state.parties.flatMap((p) => p.members.map((m) => m.name)),
  ]);
  const fresh = pool.filter((n) => !known.has(n));

  // 还有新人 → 只在新人里抽；抽完了 → 全池加权（满默契权重减半）
  const candidates = fresh.length > 0 ? fresh : pool;
  const weights = candidates.map((n) => (chemistryOf(state, n) >= DUP_CAP ? 0.5 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let name = candidates[0]!;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) {
      name = candidates[i]!;
      break;
    }
  }

  // 3) 已认识 → 累积默契
  const existingFriend = state.friends.find((f) => f.name === name);
  if (existingFriend) {
    const friends = state.friends.map((f) =>
      f.id === existingFriend.id
        ? { ...f, dupCount: Math.min(DUP_CAP, (f.dupCount ?? 0) + 1) }
        : f,
    );
    return {
      state: spend({ friends }, `又见到了 ${name}，默契 +1%（上限 ${DUP_CAP}%）。`),
      result: 'dup',
    };
  }

  const existingMember = state.parties.flatMap((p) => p.members).find((m) => m.name === name);
  if (existingMember) {
    const parties = state.parties.map((p) => ({
      ...p,
      members: p.members.map((m) =>
        m.id === existingMember.id
          ? { ...m, dupCount: Math.min(DUP_CAP, m.dupCount + 1) }
          : m,
      ),
    }));
    return {
      state: spend({ parties }, `又见到了 ${name}，默契 +1%（上限 ${DUP_CAP}%）。`),
      result: 'dup',
    };
  }

  // 4) 新人
  const bias = channel.biasPool[Math.floor(rng() * channel.biasPool.length)] ?? 'balanced';
  const quality =
    channel.quality[0] + rng() * Math.max(0.01, channel.quality[1] - channel.quality[0]);

  const friend: Friend = {
    id: `f-${state.at.toString(36)}-${state.friends.length}`,
    name,
    bias,
    from: channel.id,
    metAt: state.at,
    quality: Math.round(quality * 100) / 100,
    partyId: null,
    dupCount: 0,
  };

  return {
    state: spend(
      { friends: [...state.friends, friend] },
      `${channel.text}（认识了 ${friend.name}，花了 ${channel.cost}）`,
    ),
    result: 'ok',
    friend,
  };
}

/** 剩余冷却天数（0 = 可邀请） */
export function cooldownLeftDays(state: RunState, friend: Friend): number {
  const left = (friend.cooldownUntil ?? 0) - state.at;
  return left > 0 ? Math.ceil(left / DAY_MS) : 0;
}

export type InviteResult = 'ok' | 'no-party' | 'not-found' | 'full' | 'taken' | 'cooldown';

/** 组合人数上限（含主角自己） */
export const PARTY_MAX = BALANCE.partyMax ?? 10;

/** 从朋友圈邀请一个人加入当前组合 */
export function inviteFriend(
  state: RunState,
  friendId: string,
): { state: RunState; result: InviteResult } {
  const friend = state.friends.find((f) => f.id === friendId);
  if (!friend) return { state, result: 'not-found' };
  if (friend.partyId) return { state, result: 'taken' };
  if (cooldownLeftDays(state, friend) > 0) return { state, result: 'cooldown' };

  const partyId = state.activePartyId;
  const party = partyId ? state.parties.find((p) => p.id === partyId) : undefined;
  if (!party) return { state, result: 'no-party' };
  // 主角自己占 1 个位置
  if (party.members.length >= PARTY_MAX - 1) return { state, result: 'full' };

  // NPC 只能属于一个组合（主角不受限）
  const taken = state.parties.some(
    (p) => p.id !== party.id && p.members.some((m) => m.name === friend.name),
  );
  if (taken) return { state, result: 'taken' };

  const member = {
    id: `m-${friend.id}`,
    name: friend.name,
    bias: friend.bias,
    dupCount: Math.min(DUP_CAP, Number(friend.dupCount ?? 0)),
  };

  return {
    state: {
      ...state,
      friends: state.friends.map((f) => (f.id === friendId ? { ...f, partyId: party.id } : f)),
      parties: state.parties.map((p) =>
        p.id === party.id ? { ...p, members: [...p.members, member] } : p,
      ),
      log: [
        ...state.log,
        {
          at: state.at,
          actionId: 'invite',
          text: `${friend.name} 加入了「${party.name}」。`,
          staminaDelta: 0,
          statDelta: {},
          kind: 'action',
        },
      ],
    },
    result: 'ok',
  };
}
