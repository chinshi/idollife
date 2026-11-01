/**
 * 朋友圈：认识新朋友（花钱）+ 邀请加入组合
 */
import channelsJson from '../data/channels.json';
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

export type MeetResult = 'ok' | 'poor' | 'unknown';

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
  const existing = new Set(state.friends.map((f) => f.name));
  const available = NAMES.filter((n) => !existing.has(n));
  const name = (available.length > 0 ? available : NAMES)[
    Math.floor(rng() * (available.length > 0 ? available.length : NAMES.length))
  ]!;

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

export type InviteResult = 'ok' | 'no-party' | 'not-found';

/** 从朋友圈邀请一个人加入当前组合 */
export function inviteFriend(
  state: RunState,
  friendId: string,
): { state: RunState; result: InviteResult } {
  const friend = state.friends.find((f) => f.id === friendId);
  if (!friend) return { state, result: 'not-found' };

  const partyId = state.activePartyId;
  const party = partyId ? state.parties.find((p) => p.id === partyId) : undefined;
  if (!party) return { state, result: 'no-party' };

  const member = {
    id: `m-${friend.id}`,
    name: friend.name,
    bias: friend.bias,
    dupCount: 0,
  };

  return {
    state: {
      ...state,
      friends: state.friends.filter((f) => f.id !== friendId),
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
