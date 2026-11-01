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
    money: 5000,
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

describe('朋友圈', () => {
  it('花钱认识新朋友，进入朋友圈并扣钱', () => {
    const channel = CHANNELS[0]!;
    const r = meetFriend(base(), channel.id, 'seed');
    expect(r.result).toBe('ok');
    expect(r.state.friends.length).toBe(1);
    expect(r.state.money).toBe(5000 - channel.cost);
    expect(r.friend?.bias).toBeTruthy();
  });

  it('钱不够时不会认识', () => {
    const channel = CHANNELS[0]!;
    const r = meetFriend(base({ money: 0 }), channel.id, 'seed');
    expect(r.result).toBe('poor');
    expect(r.state.friends.length).toBe(0);
  });

  it('没有组合时不能邀请', () => {
    const met = meetFriend(base(), CHANNELS[0]!.id, 'seed');
    const r = inviteFriend(met.state, met.state.friends[0]!.id);
    expect(r.result).toBe('no-party');
  });

  it('已进团的人不会再被抽到（全局去重）', () => {
    let state = base({ debuted: true });
    state = createParty(state, 'SEK48').state;
    const met = meetFriend(state, CHANNELS[0]!.id, 'seed');
    const invited = inviteFriend(met.state, met.state.friends[0]!.id).state;

    // 再抽 30 次，名字都不能和已入团的人重复
    let cur = invited;
    for (let i = 0; i < 8; i++) {
      cur = meetFriend(cur, CHANNELS[0]!.id, `seed-${i}`).state;
    }
    const names = cur.friends.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('邀请后从朋友圈进入组合', () => {
    let state = base({ debuted: true });
    state = createParty(state, 'SEK48').state;
    const met = meetFriend(state, CHANNELS[0]!.id, 'seed');
    const friend = met.state.friends[0]!;

    const r = inviteFriend(met.state, friend.id);
    expect(r.result).toBe('ok');
    // 邀请后仍留在朋友圈，但标记了归属组合
    expect(r.state.friends.length).toBe(1);
    expect(r.state.friends[0]!.partyId).toBe(r.state.activePartyId);

    const party = r.state.parties.find((p) => p.id === r.state.activePartyId)!;
    expect(party.members.length).toBe(1);
    expect(party.members[0]!.name).toBe(friend.name);
  });
});
