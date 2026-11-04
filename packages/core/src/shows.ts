import { applyFanAction, createFans, totalFans, type FanType, type Fans } from './fans';
import { fanShare } from './fans-util';
import { hashSeed, mulberry32 } from './rng';
import { effectiveStats } from './items';
import { DAY_MS, DAILY_SLOTS, START_AT, WEEK_MS } from './content';
import { RAW_SHOWS, CITIES, type RawCity } from './data';
import { matchesCondition } from './events';
import type { Booking, Party, RunState, ScheduleItem } from './types';

export type ShowGrade = 'S' | 'A' | 'B' | 'C';

export interface ShowResult {
  grade: ShowGrade;
  score: number;
  /** 这场主要吸引哪类粉丝 */
  fanType: FanType;
  fanGain: number;
  moneyGain: number;
  report: string[];
}

const GRADE_TEXT: Record<ShowGrade, string[]> = {
  S: ['灯亮起来的那一刻，全场安静了。', '你跳完最后一段，掌声比音乐还响。'],
  A: ['发挥很稳，台下有人跟着喊。', '结束后有人挤到前排要签名。'],
  B: ['中规中矩，但没出错。', '有人在门口犹豫了一下，还是走了。'],
  C: ['中间忘了一个动作，你笑着圆过去了。', '台下稀稀拉拉的掌声，你说了谢谢。'],
};

function pickFanType(state: RunState): FanType {
  const s = effectiveStats(state);
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
  const s = effectiveStats(state);
  const base = (s.vocal + s.dance + s.acting + s.talk) / 4;
  const fitBonus = state.axes.fit / 20;
  const staminaPenalty = state.stamina < 30 ? 8 : 0;
  const noise = rng() * 10 - 5;

  const score = Math.round(base + fitBonus - staminaPenalty + noise);

  const grade: ShowGrade = score >= 45 ? 'S' : score >= 32 ? 'A' : score >= 20 ? 'B' : 'C';
  const multiplier = grade === 'S' ? 3 : grade === 'A' ? 2 : grade === 'B' ? 1.2 : 0.5;
  const fanGain = Math.max(1, Math.round((score / 10) * multiplier * 3));
  const moneyGain = Math.round(400 * multiplier);
  const fanType = pickFanType(state);

  return {
    grade,
    score,
    fanType,
    fanGain,
    moneyGain,
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
    money: state.money + result.moneyGain,
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

// ---------- T-032 演出报名制 ----------

export type ShowTier =
  | 'normal'
  | 'large'
  | 'sino'
  | 'festival'
  | 'birthday'
  | 'graduate'
  | 'debut';

export const TIER_LABEL: Record<ShowTier, string> = {
  normal: '普通',
  large: '大型',
  sino: '中外',
  festival: '节日SP',
  birthday: '生日SP',
  graduate: '毕业SP',
  debut: '出道SP',
};
export const TIER_ORDER: ShowTier[] = [
  'normal',
  'large',
  'sino',
  'festival',
  'birthday',
  'graduate',
  'debut',
];

export interface ShowSlotDef {
  showId: string;
  name: string;
  type: 'circuit' | 'one-man' | 'comic' | 'business' | 'shoot';
  tier: ShowTier;
  slotCount: number;
  weight: number;
  slot: number;
  slotName: string;
  weekday: 'sat' | 'sun' | 'midweek';
  slots: number;
  baseFee: number;
  ticketBase: number;
  goodsBase: number;
  statGain: number;
  fanGain: number;
  reqFame: number;
  reqStats: Partial<Record<'vocal' | 'dance' | 'acting' | 'talk', number>>;
  reqParty: number;
  reqFans: number;
  audience: Record<FanType, number>;
  songs: string[];
  gift: string;
  visibleCond: unknown;
  npcWeight: number;
  festival: string;
}

export interface ShowOccurrence {
  id: string;
  showId: string;
  name: string;
  type: ShowSlotDef['type'];
  tier: ShowTier;
  slotCount: number;
  startAt: number;
  festival: string;
  slots: ShowSlotDef[];
}

const SHOW_GROUPS = new Map<string, ShowSlotDef[]>();
for (const raw of RAW_SHOWS) {
  const def: ShowSlotDef = {
    showId: raw.showId,
    name: raw.name,
    type: raw.type as ShowSlotDef['type'],
    tier: raw.tier as ShowTier,
    slotCount: raw.slotCount,
    weight: raw.weight,
    slot: raw.slot,
    slotName: raw.slotName,
    weekday: raw.weekday as ShowSlotDef['weekday'],
    slots: raw.slots,
    baseFee: raw.baseFee,
    ticketBase: raw.ticketBase,
    goodsBase: raw.goodsBase,
    statGain: raw.statGain,
    fanGain: raw.fanGain,
    reqFame: raw.reqFame,
    reqStats: raw.reqStats,
    reqParty: raw.reqParty,
    reqFans: raw.reqFans,
    audience: raw.audience as Record<FanType, number>,
    songs: raw.songs,
    gift: raw.gift,
    visibleCond: raw.visibleCond,
    npcWeight: raw.npcWeight,
    festival: raw.festival,
  };
  const list = SHOW_GROUPS.get(raw.showId) ?? [];
  list.push(def);
  SHOW_GROUPS.set(raw.showId, list);
}
for (const list of SHOW_GROUPS.values()) list.sort((a, b) => a.slot - b.slot);

export const SHOW_SLOTS_DEFS: ShowSlotDef[] = [...SHOW_GROUPS.values()].flat();

/** 城市配置；找不到回退三线 */
export function cityDef(tier: number): RawCity {
  return CITIES.find((c) => c.tier === tier) ?? CITIES.find((c) => c.tier === 3)!;
}

/** 三条同时成立才可见：类型白名单 / 级别白名单 / 顺位上限 */
export function showVisibleIn(tier: number, def: ShowSlotDef): boolean {
  const city = cityDef(tier);
  return (
    city.types.includes(def.type) &&
    city.levels.includes(def.tier) &&
    def.slotCount <= city.maxSlots
  );
}

/** 一周锚点（START_AT 起，按 7 天连续对齐） */
export function weekIndexOf(at: number): number {
  return Math.floor((at - START_AT) / WEEK_MS);
}
export function weekAnchorOf(at: number): number {
  return START_AT + weekIndexOf(at) * WEEK_MS;
}

function weekdayOffset(weekday: ShowSlotDef['weekday']): number {
  return weekday === 'sat' ? 5 * DAY_MS : weekday === 'sun' ? 6 * DAY_MS : 3 * DAY_MS;
}

interface ShowGroup {
  showId: string;
  defs: ShowSlotDef[];
}

/** 按级别权重抽 count 场（同周不得重复 showId） */
function pickWeighted(pool: ShowGroup[], count: number, rng: () => number): ShowGroup[] {
  const available = [...pool];
  const result: ShowGroup[] = [];
  while (result.length < count && available.length > 0) {
    const tierWeights = new Map<ShowTier, number>();
    for (const g of available) {
      const tier = g.defs[0]!.tier;
      if (!tierWeights.has(tier)) tierWeights.set(tier, g.defs[0]!.weight);
    }
    const total = [...tierWeights.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let roll = rng() * total;
    let pickedTier: ShowTier | null = null;
    for (const [tier, w] of tierWeights) {
      roll -= w;
      if (roll <= 0) {
        pickedTier = tier;
        break;
      }
    }
    if (!pickedTier) pickedTier = [...tierWeights.keys()].at(-1)!;
    const inTier = available.filter((g) => g.defs[0]!.tier === pickedTier);
    const chosen = inTier[Math.floor(rng() * inTier.length)]!;
    result.push(chosen);
    available.splice(available.indexOf(chosen), 1);
  }
  return result;
}

/** 该城市该周刷出的场次；seed 派生（D-010）。festivalWeek 仅测试/节日周用。
 * 注意：visibleCond 过滤留给 P2（函数签名没有 run，无法在这里求值）。 */
export function scheduleWeek(
  cityTier: number,
  weekIndex: number,
  seed: string,
  festivalWeek = false,
): ShowOccurrence[] {
  const city = cityDef(cityTier);
  const all: ShowGroup[] = [...SHOW_GROUPS.entries()]
    .filter(([, defs]) => showVisibleIn(cityTier, defs[0]!))
    .map(([showId, defs]) => ({ showId, defs }));

  const notFestival = all.filter((g) => g.defs[0]!.tier !== 'festival');
  const weekendPool = notFestival.filter((g) => g.defs.some((d) => d.weekday !== 'midweek'));
  const midPool = notFestival.filter((g) => g.defs.some((d) => d.weekday === 'midweek'));
  const festivalPool = all.filter((g) => g.defs[0]!.tier === 'festival');

  const rng = mulberry32(hashSeed(`${seed}:shows:${weekIndex}:${cityTier}`));
  const midCount =
    city.midMax > city.midMin
      ? city.midMin + Math.floor(rng() * (city.midMax - city.midMin + 1))
      : city.midMin;

  const chosen = [
    ...pickWeighted(weekendPool, city.weekend, rng),
    ...pickWeighted(midPool, midCount, rng),
  ];
  if (festivalWeek && festivalPool.length > 0) {
    chosen.push(...pickWeighted(festivalPool, 1, rng));
  }

  const weekAnchor = START_AT + weekIndex * WEEK_MS;
  return chosen.map(({ showId, defs }) => {
    const first = defs[0]!;
    const startAt = weekAnchor + weekdayOffset(first.weekday);
    return {
      id: `${weekIndex}:${showId}`,
      showId,
      name: first.name,
      type: first.type,
      tier: first.tier,
      slotCount: first.slotCount,
      startAt,
      festival: first.festival,
      slots: defs,
    };
  });
}

/** 距开演天数（可负） */
export function daysUntil(startAt: number, at: number): number {
  return Math.floor((startAt - at) / DAY_MS);
}

/** T-034 占位曲线：平时全空，压力集中在报名截止（d=7）前 7 天 */
export function npcFillRatio(d: number): number {
  if (d > 14) return 0;
  if (d <= 7) return 1;
  const table: Record<number, number> = {
    14: 0.05,
    13: 0.15,
    12: 0.28,
    11: 0.45,
    10: 0.65,
    9: 1,
    8: 1,
  };
  return table[d] ?? 0;
}

/** 该场该时刻被 NPC 占用的顺位集合（跳过玩家已占位） */
export function npcOccupied(occ: ShowOccurrence, at: number, playerSlots: number[]): Set<number> {
  const d = daysUntil(occ.startAt, at);
  const n = occ.slots.length;
  const ratio = npcFillRatio(d);
  const count = ratio >= 1 ? n : n === 1 ? 0 : Math.min(n - 1, Math.round(n * ratio));
  const occupied = new Set<number>();
  const player = new Set(playerSlots);
  for (const s of occ.slots) {
    if (occupied.size >= count) break;
    if (player.has(s.slot)) continue;
    occupied.add(s.slot);
  }
  return occupied;
}

export function partyFameStub(run: RunState, party: Party | null): number {
  // P2 换成正式组合名气
  return Math.floor(totalFans(run.fans) / 10 + (party?.members.length ?? 0) * 40);
}

export function checkBooking(
  run: RunState,
  party: Party | null,
  occ: ShowOccurrence,
  slot: ShowSlotDef,
): { ok: boolean; missing: { fame?: number; fans?: number; stats?: string[]; party?: number } } {
  const missing: { fame?: number; fans?: number; stats?: string[]; party?: number } = {};
  const fame = partyFameStub(run, party);
  if (fame < slot.reqFame) missing.fame = slot.reqFame - fame;

  const fans = totalFans(run.fans);
  if (fans < slot.reqFans) missing.fans = slot.reqFans - fans;

  const stats = effectiveStats(run);
  const statMissing: string[] = [];
  for (const key of ['vocal', 'dance', 'acting', 'talk'] as const) {
    const need = slot.reqStats[key] ?? 0;
    if (stats[key] < need) statMissing.push(`${key === 'vocal' ? '演唱' : key === 'dance' ? '舞蹈' : key === 'acting' ? '演技' : '口才'} ${need - stats[key]}`);
  }
  if (statMissing.length > 0) missing.stats = statMissing;

  const partyNeed = slot.reqParty - (party?.members.length ?? 0);
  if (partyNeed > 0) missing.party = partyNeed;

  const ok =
    missing.fame === undefined &&
    missing.fans === undefined &&
    missing.stats === undefined &&
    missing.party === undefined;
  return { ok, missing };
}

/** 出场费（含属性提成，封顶 30%） */
export function entryFee(run: RunState, party: Party | null, slot: ShowSlotDef): { fee: number; uplift: number } {
  const stats = effectiveStats(run);
  const actual = stats.vocal + stats.dance + stats.acting + stats.talk;
  const reqSum = Object.values(slot.reqStats).reduce((a, b) => a + (b ?? 0), 0);
  const qualified = (['vocal', 'dance', 'acting', 'talk'] as const).every(
    (k) => stats[k] >= (slot.reqStats[k] ?? 0),
  );
  const raw = reqSum > 0 && qualified ? (actual - reqSum) / reqSum : 0;
  const uplift = Math.max(0, Math.min(0.3, raw));
  return { fee: Math.round(slot.baseFee * (1 + uplift)), uplift };
}

/** 取消资格与违约金 */
export function canCancel(booking: Booking, at: number): { ok: boolean; penalty: number; blocking?: 'announced' } {
  const d = daysUntil(booking.startAt, at);
  if (d <= 7) return { ok: false, penalty: 0, blocking: 'announced' };
  const penalty = d <= 15 ? Math.round(booking.fee * 0.6) : 0;
  return { ok: true, penalty };
}

/** 报名资格（含宣发锁定/同日互斥/条件） */
export function canBook(
  run: RunState,
  party: Party | null,
  occ: ShowOccurrence,
  slot: ShowSlotDef,
  at: number,
  bookings: Booking[] = [],
  dayUsedSlots = 0,
): { ok: boolean; reason: 'ok' | 'announced' | 'day-taken' | 'day-full' | 'ineligible' } {
  if (dayUsedSlots + slot.slots > DAILY_SLOTS) {
    return { ok: false, reason: 'day-full' };
  }
  const d = daysUntil(occ.startAt, at);
  if (d <= 7) return { ok: false, reason: 'announced' };
  const day = Math.floor((occ.startAt - START_AT) / DAY_MS);
  if (
    bookings.some(
      (b) =>
        b.status !== 'cancelled' &&
        Math.floor((b.startAt - START_AT) / DAY_MS) === day,
    )
  ) {
    return { ok: false, reason: 'day-taken' };
  }
  const chk = checkBooking(run, party, occ, slot);
  if (!chk.ok) return { ok: false, reason: 'ineligible' };
  return { ok: true, reason: 'ok' };
}

/** 演出结算（P0 简化合并公式）；返回新 state，并把 booking 标记 done */
export function settleShow(state: RunState, item: ScheduleItem, booking: Booking): RunState {
  const defs = SHOW_GROUPS.get(booking.showId) ?? [];
  const slot = defs.find((d) => d.slot === booking.slot);
  if (!slot) return state;

  const n = defs.length;
  const ratio = n <= 1 ? 1 : (slot.slot - 1) / (n - 1);
  const slotMul = [0.8, 1.0, 1.2, 1.4][Math.min(3, Math.round(ratio * 3))]!;

  const fame = partyFameStub(state, state.parties.find((p) => p.id === state.activePartyId) ?? null);
  const total = totalFans(state.fans);
  const match =
    total <= 0
      ? 0.5
      : Object.entries(slot.audience).reduce((acc, [t, w]) => acc + (Number(w) || 0) * fanShare(state.fans, t as FanType), 0);

  const ticket = slot.ticketBase * (0.5 + 0.5 * Math.min(1.5, fame / 1000)) * slotMul;
  const goods = slot.goodsBase * match * (0.6 + 0.4 * 0.7);
  const income = Math.round(ticket + goods);
  const stat = slot.statGain;
  const fansGain = slot.fanGain;
  const score = Math.round((ticket + goods + fansGain) / 10);

  let fans = state.fans;
  const dominant = Object.entries(slot.audience).sort((a, b) => b[1] - a[1])[0]?.[0] as FanType | undefined;
  if (dominant) fans = applyFanAction(fans, dominant, fansGain, 5);

  const result = { ticket: Math.round(ticket), goods: Math.round(goods), stat, fans: fansGain, score };
  const next: RunState = {
    ...state,
    at: item.endAt,
    money: state.money + income,
    fans,
    stats: {
      vocal: state.stats.vocal + Math.floor(stat / 4),
      dance: state.stats.dance + Math.floor(stat / 4),
      acting: state.stats.acting + Math.floor(stat / 4),
      talk: state.stats.talk + (stat - 3 * Math.floor(stat / 4)),
    },
    bookings: (state.bookings ?? []).map((b) =>
      b.id === booking.id ? { ...b, status: 'done', result } : b,
    ),
    log: [
      ...state.log,
      {
        at: item.endAt,
        actionId: `show:${booking.showId}`,
        text: `演出结束《${booking.name}》${booking.slot}号位：门票 ¥${Math.round(ticket)} · 特典 ¥${Math.round(goods)} · 属性 +${stat} · 粉丝 +${fansGain}`,
        staminaDelta: 0,
        statDelta: {},
        kind: 'show',
      },
    ],
  };
  return next;
}

export function occurrenceVisible(run: RunState, occ: ShowOccurrence): boolean {
  return occ.slots.some((slot) => matchesCondition(run, slot.visibleCond as never));
}

