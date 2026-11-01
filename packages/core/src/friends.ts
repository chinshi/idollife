/**
 * 朋友圈：认识新朋友（花钱）+ 邀请加入组合
 */
import channelsJson from '../data/channels.json';
import { BALANCE } from './data';
import { DAY_MS } from './content';
import { hashSeed, mulberry32 } from './rng';
import type { Bias, Friend, RunState } from './types';

export interface Channel {
  id: string;
  name: string;
  cost: number;
  biasPool: Bias[];
  quality: [number, number];
  text: string;
}

export const CHANNELS: Channel[] = channelsJson.channels as Channel[];

const NAMES = [
  '林小满', '周予', '陈一诺', '苏晚', '何昭', '许知',
  '郑夏', '唐澄', '白露', '顾南', '沈青', '叶绫',
];

export type MeetResult = 'ok' | 'dup' | 'poor' | 'unknown';

const DUP_CAP = BALANCE.dupCap ?? 10;

/** 花一笔钱，认识一个新朋友，放进朋友圈 */
export function meetFriend(
  state: RunState,
  channelId: string,
  seed: string,
): { state: RunState; result: MeetResult; friend?: Friend } {
  const channel = CHANNELS.find((c) => c.id === channelId);
  if (!channel) return { state, result: 'unknown' };
  if (state.money < channel.cost) return { state, result: 'poor' };

  const rng = mulberry32(hashSeed(`${seed}:${channelId}:${state.at}:${state.friends.length}`));
  // 从全量名字池抽人：如果这个人已经认识，就累积默契，而不是新增
  const name = NAMES[Math.floor(rng() * NAMES.length)]!;

  const existingMember = state.parties
    .flatMap((p) => p.members)
    .find((m) => m.name === name);
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
      state: {
        ...state,
        money: state.money - channel.cost,
        parties,
        log: [
          ...state.log,
          {
            at: state.at,
            actionId: `meet:${channel.id}`,
            text: `又见到了 ${name}，默契 +1%（上限 ${DUP_CAP}%）。`,
            staminaDelta: 0,
            statDelta: {},
            kind: 'action',
          },
        ],
      },
      result: 'dup',
    };
  }

  const existingFriend = state.friends.find((f) => f.name === name);
  if (existingFriend) {
    const friends = state.friends.map((f) =>
      f.id === existingFriend.id
        ? { ...f, dupCount: Math.min(DUP_CAP, (f.dupCount ?? 0) + 1) }
        : f,
    );
    return {
      state: {
        ...state,
        money: state.money - channel.cost,
        friends,
        log: [
          ...state.log,
          {
            at: state.at,
            actionId: `meet:${channel.id}`,
            text: `又见到了 ${name}，默契 +1%（上限 ${DUP_CAP}%）。`,
            staminaDelta: 0,
            statDelta: {},
            kind: 'action',
          },
        ],
      },
      result: 'dup',
    };
  }

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
    state: {
      ...state,
      money: state.money - channel.cost,
      friends: [...state.friends, friend],
      log: [
        ...state.log,
        {
          at: state.at,
          actionId: `meet:${channel.id}`,
          text: `${channel.text}（认识了 ${friend.name}，花了 ${channel.cost}）`,
          staminaDelta: 0,
          statDelta: {},
          kind: 'action',
        },
      ],
    },
    result: 'ok',
    friend,
  };
}

/** 组合人数上限（含主角自己） */
export const PARTY_MAX = BALANCE.partyMax ?? 10;

export type InviteResult = 'ok' | 'no-party' | 'not-found' | 'full' | 'taken' | 'cooldown';

/** 退团后多少天内不能重新入团 */
export const RECRUIT_COOLDOWN_DAYS = 30;

/** 剩余冷却天数（0 = 可邀请） */
export function cooldownLeftDays(state: RunState, friend: Friend): number {
  const left = (friend.cooldownUntil ?? 0) - state.at;
  return left > 0 ? Math.ceil(left / DAY_MS) : 0;
}

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
