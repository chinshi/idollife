import React, { useMemo, useState } from 'react';
import {
  ACTIONS,
  DAY_MS,
  DAILY_SLOTS,
  START_AT,
  WEEK_MS,
  canBook,
  checkBooking,
  cityDef,
  daysUntil,
  effectiveStats,
  entryFee,
  npcOccupied,
  partyFameStub,
  scheduleWeek,
  SHOW_SLOTS_DEFS,
  TIER_LABEL,
  weekIndexOf,
  type ShowOccurrence,
  type ShowSlotDef,
} from '@idollife/core';
import { cardState, firstOpenSlotIndex } from './show-card';
import type { AppApi } from './api';
import { showHeaderText } from './show-header';

const CITY_LABEL: Record<number, string> = { 0: '超一线', 1: '一线', 2: '二线', 3: '三线' };
const TYPE_LABEL: Record<string, string> = {
  circuit: '拼盘',
  'one-man': '专场',
  comic: '漫展',
  business: '商务',
  shoot: '拍摄',
};

/** T-032 演出（报名制） */
export function ShowPanel({
  api,
  initialTab = 'list',
}: {
  api: AppApi;
  initialTab?: 'list' | 'mine' | 'calendar';
}) {
  const { run, party, seed, bookShow, cancelBooking, setCity, doDebut, dayLabel } = api;
  const [tab, setTab] = useState<'list' | 'mine' | 'calendar'>(initialTab);
  const city = run.city ?? 3;
  const cityInfo = cityDef(city);
  const bookings = run.bookings ?? [];
  const firstWeek = run.at < run.startedAt + WEEK_MS;

  const occurrences = useMemo(() => {
    const w = weekIndexOf(run.at);
    const list: ShowOccurrence[] = [];
    for (let i = 0; i < 4; i += 1) {
      list.push(...scheduleWeek(city, w + i, seed));
    }
    return list
      .filter((o) => {
        const d = daysUntil(o.startAt, run.at);
        return d >= -1 && d <= 60;
      })
      .sort((a, b) => {
        const ba = bookings.some((x) => x.startAt === a.startAt && x.status !== 'cancelled') ? 1 : 0;
        const bb = bookings.some((x) => x.startAt === b.startAt && x.status !== 'cancelled') ? 1 : 0;
        return ba - bb || daysUntil(a.startAt, run.at) - daysUntil(b.startAt, run.at);
      });
  }, [city, run.at, seed, bookings]);

  if (!run.debuted) {
    return (
      <>
        <div className="mod-head">
          <h2>演出</h2>
        </div>
        <div className="show-gate">
          <p>出道之后才能参与演出。</p>
          <button className="primary" onClick={doDebut}>
            去出道
          </button>
        </div>
      </>
    );
  }

  const tabs = [
    ['list', '报名演出'],
    ['mine', '已参与演出'],
    ['calendar', '演出日历'],
  ] as const;

  return (
    <>
      <div className="mod-head">
        <h2>演出</h2>
        <span className="muted small">{CITY_LABEL[city]}城市</span>
        <span className="muted small">{showHeaderText(cityInfo)}</span>
        {firstWeek ? (
          <span className="show-city-switch">
            {([0, 1, 2, 3] as const).map((c) => (
              <button key={c} className={c === city ? 'active' : ''} onClick={() => setCity(c)}>
                {CITY_LABEL[c]}
              </button>
            ))}
          </span>
        ) : (
          <span className="muted small">搬迁功能后续开放</span>
        )}
        <span className="seg-inline show-tabs">
          {tabs.map(([k, label]) => (
            <button key={k} className={tab === k ? 'seg-item active' : 'seg-item'} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </span>
      </div>

      {tab === 'list' && (
        <div className="show-list">
          {occurrences.length === 0 && <p className="muted small">本周还没有刷出演出。</p>}
          {occurrences.map((occ) => (
            <ShowCard key={occ.id} api={api} occ={occ} />
          ))}
        </div>
      )}

      {tab === 'mine' && (
        <div className="show-list">
          {bookings.length === 0 && <p className="muted small">还没有报名任何演出。</p>}
          {[...bookings]
            .sort((a, b) => b.startAt - a.startAt)
            .map((b) => {
              const d = daysUntil(b.startAt, run.at);
              const announced = b.status === 'booked' && d <= 7;
              const slotDef = SHOW_SLOTS_DEFS.find(
                (s) => s.showId === b.showId && s.slot === b.slot,
              );
              const slotLabel =
                slotDef?.slotCount === 1
                  ? '主位'
                  : (slotDef?.slotName ?? (b.slot === 1 ? '主位' : `${b.slot}号位`));
              return (
                <div className="show-card" key={b.id}>
                  <div className="show-title">
                    <strong>{b.name}</strong>
                    <span className="show-badge">{TYPE_LABEL[b.type] ?? b.type}</span>
                    <span className={`show-badge tier-${b.tier ?? 'normal'}`}>
                      {TIER_LABEL[b.tier] ?? '普通'}
                    </span>
                    <span className="show-badge">{slotLabel}</span>
                    <span className="show-badge">
                      {b.status === 'done' ? '已完成' : b.status === 'cancelled' ? '已取消' : announced ? '已宣发' : '已报名'}
                    </span>
                  </div>
                  <div className="muted small">
                    {dayLabel(b.startAt, run.at)} · 出场费 ¥{b.fee}
                  </div>
                  {b.result && (
                    <div className="show-result">
                      门票 ¥{b.result.ticket} · 特典 ¥{b.result.goods} · 属性 +{b.result.stat} · 粉丝 +{b.result.fans}
                    </div>
                  )}
                  {b.status === 'booked' && (
                    <button disabled={d <= 7} onClick={() => cancelBooking(b.id)}>
                      {d <= 7 ? '已宣发不可取消' : '取消报名'}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {tab === 'calendar' && (
        <div className="show-calendar">
          {Array.from({ length: 30 }, (_, i) => {
            const day = Math.floor((run.at - START_AT) / DAY_MS) + i;
            const start = START_AT + day * DAY_MS;
            const booked = bookings.find(
              (b) => b.status !== 'cancelled' && Math.floor((b.startAt - START_AT) / DAY_MS) === day,
            );
            const open = occurrences.some((o) => Math.floor((o.startAt - START_AT) / DAY_MS) === day);
            return (
              <div key={day} className={`show-cal-day${booked ? ' booked' : open ? ' open' : ''}`}>
                <span>第 {day + 1} 天</span>
                <em>{booked ? booked.name : open ? '可报名' : ''}</em>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ShowCard({ api, occ }: { api: AppApi; occ: ShowOccurrence }) {
  const { run, party, bookShow, schedule, setNotice } = api;
  const bookings = run.bookings ?? [];
  const d = daysUntil(occ.startAt, run.at);
  const announced = d <= 7;
  const dayTaken = bookings.some(
    (b) => b.status !== 'cancelled' && Math.floor((b.startAt - START_AT) / DAY_MS) === Math.floor((occ.startAt - START_AT) / DAY_MS),
  );
  const dayUsed = schedule
    .filter((s) => Math.floor((s.startAt - START_AT) / DAY_MS) === Math.floor((occ.startAt - START_AT) / DAY_MS))
    .reduce((n, s) => n + (s.slots ?? 1), 0);
  const fame = partyFameStub(run, party);
  const mineSlots = bookings
    .filter((b) => b.occurrenceId === occ.id && b.status !== 'cancelled')
    .map((b) => b.slot);
  const npc = npcOccupied(occ, run.at, mineSlots);
  const state = cardState(occ, run.at, npc, mineSlots);
  const [slotIdx, setSlotIdx] = useState(() => firstOpenSlotIndex(occ, npc, mineSlots));
  const activeIdx = slotIdx >= 0 ? slotIdx : 0;
  const slot = occ.slots[activeIdx]!;
  const chk = checkBooking(run, party, occ, slot);
  const bookChk = canBook(run, party, occ, slot, run.at, bookings, dayUsed);
  const { fee, uplift } = entryFee(run, party, slot);
  const stats = effectiveStats(run);
  const takenSelected = npc.has(slot.slot) && !mineSlots.includes(slot.slot);

  return (
    <div className={`show-card${state === 'announced' ? ' announced' : ''}`}>
      <div className="show-title">
        <strong>{occ.name}</strong>
        <span className="show-badge">{TYPE_LABEL[occ.type] ?? occ.type}</span>
        <span className={`show-badge tier-${occ.tier}`}>{TIER_LABEL[occ.tier]}</span>
        {state === 'announced' ? <span className="show-badge status-announced">已宣发</span> : null}
        {state === 'full' ? <span className="show-badge status-full">本场已满</span> : null}
      </div>
      <div className="muted small">
        第 {weekIndexOf(occ.startAt) + 1} 周 · 距开演 {d} 天 · 报名截止还剩 {Math.max(0, d - 7)} 天
      </div>
      <div className="show-lineup">
        {occ.slots.map((s, i) => {
          const taken = npc.has(s.slot);
          const mine = bookings.some((b) => b.occurrenceId === occ.id && b.slot === s.slot && b.status !== 'cancelled');
          return (
            <button
              key={s.slot}
              className={`show-slot${i === slotIdx ? ' active' : ''}${taken ? ' taken' : ''}`}
              aria-disabled={taken && !mine}
              onClick={() => {
                if (taken && !mine) {
                  setNotice('这个位置已经被占了');
                  return;
                }
                setSlotIdx(i);
              }}
            >
              <span>{s.slotName}</span>
              <em>{mine ? '已报名' : taken ? 'NPC 已占' : '空位'}</em>
              <small>名气 {s.reqFame}</small>
            </button>
          );
        })}
      </div>
      <div className="show-req">
        <span>名气 {fame >= slot.reqFame ? '够' : `差 ${slot.reqFame - fame}`}</span>
        {(['vocal', 'dance', 'acting', 'talk'] as const).map((k) => {
          const need = slot.reqStats[k] ?? 0;
          return (
            <span key={k}>
              {k === 'vocal' ? '演唱' : k === 'dance' ? '舞蹈' : k === 'acting' ? '演技' : '口才'}{' '}
              {stats[k] >= need ? '够' : `差 ${need - stats[k]}`}
            </span>
          );
        })}
        <span>粉丝 {chk.missing.fans ? `差 ${chk.missing.fans}` : '够'}</span>
      </div>
      <div className="show-fee">
        {!chk.ok ? `达标后约 ¥${fee}` : `出场费 ¥${fee}`}
        {chk.ok && uplift > 0 ? `（含属性提成 +${Math.round(uplift * 100)}%${uplift >= 0.3 ? '，已封顶' : ''}）` : ''}
      </div>
      <button
        className="primary"
        disabled={state !== 'open' || dayTaken || !chk.ok || !bookChk.ok || takenSelected}
        title={
          state === 'announced'
            ? '报名已截止'
            : state === 'full'
              ? '本场已满'
              : takenSelected
                ? '位置已被占'
                : !bookChk.ok && bookChk.reason === 'day-full'
                  ? '这天行程排满了'
                  : !chk.ok
                    ? '条件不足'
                    : dayTaken
                      ? '这天已有安排'
                      : ''
        }
        onClick={() => bookShow(occ, slot)}
      >
        {state === 'announced'
          ? '已宣发，报名已截止'
          : state === 'full'
            ? '本场已满'
            : takenSelected
              ? '位置已被占'
              : dayTaken
                ? '这天已有安排'
                : !bookChk.ok && bookChk.reason === 'day-full'
                  ? '这天行程排满了'
                  : !chk.ok
                    ? '条件不足'
                    : '报名'}
      </button>
    </div>
  );
}
