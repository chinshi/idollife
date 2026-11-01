import { describe, expect, it } from 'vitest';
import { CHANNELS, inviteFriend, meetFriend } from '../src/friends';
import { createParty } from '../src/members';
import { createFans } from '../src/fans';
import type { RunState } from '../src/types';

const T0 = 1767300000000;

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 100000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(0),
    debuted: false,
    parties: [],
    activePartyId: null,
    friends: [],
    inventory: [],
    equipped: {},
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...over,
  } as RunState;
}

/** 一直抽到不是「抽空」为止（抽空是 10% 概率） */
function drawUntil(state: RunState, channelId: string, tag = 'seed') {
  let cur = state;
  for (let i = 0; i < 30; i++) {
    const r = meetFriend(cur, channelId, `${tag}-${i}`);
    if (r.result !== 'empty') return r;
    cur = r.state;
  }
  throw new Error('连续抽空 30 次');
}

describe('朋友圈', () => {
  it('花钱认识新朋友，进入朋友圈并扣钱', () => {
    const channel = CHANNELS[0]!;
    const r = drawUntil(base(), channel.id);
    expect(r.result).toBe('ok');
    expect(r.state.friends.length).toBe(1);
    expect(r.state.money).toBe(100000 - channel.cost);
    expect(r.friend?.bias).toBeTruthy();
  });

  it('钱不够时不会认识', () => {
    const channel = CHANNELS[0]!;
    const r = meetFriend(base({ money: 0 }), channel.id, 'seed');
    expect(r.result).toBe('poor');
    expect(r.state.friends.length).toBe(0);
  });

  it('抽空也会扣钱并写日志', () => {
    const channel = CHANNELS[0]!;
    const r = meetFriend(base(), channel.id, 'seed');
    if (r.result === 'empty') {
      expect(r.state.money).toBe(100000 - channel.cost);
      expect(r.state.log.some((l) => l.actionId.startsWith('meet:'))).toBe(true);
    }
  });

  it('池子抽完后重复遇到会累积默契', () => {
    const channel = CHANNELS[0]!;
    let state = base();
    for (let i = 0; i < 60 && state.friends.length < 8; i++) {
      const r = meetFriend(state, channel.id, `fill-${i}`);
      state = r.state;
    }
    expect(state.friends.length).toBeGreaterThan(0);

    const before = state.friends.reduce((a, f) => a + (f.dupCount ?? 0), 0);
    const r = drawUntil(state, channel.id, 'dup');
    expect(r.result).toBe('dup');
    const after = r.state.friends.reduce((a, f) => a + (f.dupCount ?? 0), 0);
    expect(after).toBeGreaterThan(before);
  });

  it('没有组合时不能邀请', () => {
    const met = drawUntil(base(), CHANNELS[0]!.id);
    const r = inviteFriend(met.state, met.state.friends[0]!.id);
    expect(r.result).toBe('no-party');
  });

  it('邀请后从朋友圈进入组合', () => {
    let state = base({ debuted: true });
    state = createParty(state, 'SEK48').state;
    const met = drawUntil(state, CHANNELS[0]!.id);
    const friend = met.state.friends[0]!;

    const r = inviteFriend(met.state, friend.id);
    expect(r.result).toBe('ok');
    // 仍在朋友圈，但标记了归属
    expect(r.state.friends[0]!.partyId).toBe(r.state.activePartyId);

    const party = r.state.parties.find((p) => p.id === r.state.activePartyId)!;
    expect(party.members.length).toBe(1);
    expect(party.members[0]!.name).toBe(friend.name);
  });
});
