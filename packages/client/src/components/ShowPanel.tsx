import React, { useMemo, useState } from 'react';
import {
  DAY_MS,
  START_AT,
  WEEK_MS,
  canBook,
  checkBooking,
  cityDef,
  daysUntil,
  effectiveStats,
  entryFee,
  npcOccupied,
  scheduleWeek,
  SHOW_SLOTS_DEFS,
  TIER_LABEL,
  weekIndexOf,
  type ShowOccurrence,
} from '@idollife/core';
import { cardState, firstOpenSlotIndex, type ShowCardState } from './show-card';
import type { AppApi } from './api';
import { showHeaderText } from './show-header';
import { Modal } from './Modal';

const CITY_LABEL: Record<number, string> = { 0: '超一线', 1: '一线', 2: '二线', 3: '三线' };
const TYPE_LABEL: Record<string, string> = {
  circuit: '拼盘',
  'one-man': '专场',
  comic: '漫展',
  business: '商务',
  shoot: '拍摄',
};

function freeSlots(occ: ShowOccurrence, npc: Set<number>, mineSlots: number[]): number {
  const blocked = new Set([...npc, ...mineSlots]);
  return occ.slots.filter((s) => !blocked.has(s.slot)).length;
}

function statusWeight(state: ShowCardState, mineCount: number): number {
  if (mineCount > 0) return 0;
  if (state === 'open') return 1;
  if (state === 'full') return 2;
  return 3;
}

/** T-032 演出（报名制）T-034 列表/详情重做 */
export function ShowPanel({
  api,
  initialTab = 'list',
}: {
  api: AppApi;
  initialTab?: 'list' | 'mine' | 'calendar';
}) {
  const { run, seed, setCity, doDebut, dayLabel, busyKey } = api;
  const [tab, setTab] = useState<'list' | 'mine' | 'calendar'>(initialTab);
  const [selectedOcc, setSelectedOcc] = useState<ShowOccurrence | null>(null);
  const city = run.city ?? 3;
  const cityInfo = cityDef(city);
  const bookings = run.bookings ?? [];
  const firstWeek = run.at < run.startedAt + WEEK_MS;

  const occurrences = useMemo(() => {
    const w = weekIndexOf(run.at);
    const list: ShowOccurrence[] = [];
    for (let i = 0; i < 4; i += 1) list.push(...scheduleWeek(city, w + i, seed));
    return list
      .filter((o) => {
        const d = daysUntil(o.startAt, run.at);
        return d >= -1 && d <= 60;
      })
      .map((occ) => {
        const mineSlots = bookings
          .filter((b) => b.occurrenceId === occ.id && b.status !== 'cancelled')
          .map((b) => b.slot);
        const npc = npcOccupied(occ, run.at, mineSlots);
        const state = cardState(occ, run.at, npc, mineSlots);
        return { occ, state, mineCount: mineSlots.length };
      })
      .sort((a, b) => {
        const wa = statusWeight(a.state, a.mineCount);
        const wb = statusWeight(b.state, b.mineCount);
        return wa - wb || daysUntil(a.occ.startAt, run.at) - daysUntil(b.occ.startAt, run.at);
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
          <button className="primary" disabled={!!busyKey} onClick={doDebut}>
            {busyKey === 'debut' ? '出道中…' : '去出道'}
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
              <button
                key={c}
                className={c === city ? 'active' : ''}
                disabled={!!busyKey}
                onClick={() => setCity(c)}
              >
                {busyKey === `city:${c}` ? '切换中…' : CITY_LABEL[c]}
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
          {occurrences.map(({ occ }) => (
            <ShowCard key={occ.id} api={api} occ={occ} onOpen={() => setSelectedOcc(occ)} />
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
                <div className="show-card static" key={b.id}>
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
                    <button
                      disabled={d <= 7 || !!busyKey}
                      onClick={() => api.cancelBooking(b.id)}
                    >
                      {busyKey === `unbook:${b.id}`
                        ? '取消中…'
                        : d <= 7
                          ? '已宣发不可取消'
                          : '取消报名'}
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
            const booked = bookings.find(
              (b) => b.status !== 'cancelled' && Math.floor((b.startAt - START_AT) / DAY_MS) === day,
            );
            const open = occurrences.some(
              (o) => Math.floor((o.occ.startAt - START_AT) / DAY_MS) === day,
            );
            return (
              <div key={day} className={`show-cal-day${booked ? ' booked' : open ? ' open' : ''}`}>
                <span>第 {day + 1} 天</span>
                <em>{booked ? booked.name : open ? '可报名' : ''}</em>
              </div>
            );
          })}
        </div>
      )}

      {selectedOcc && (
        <ShowDetailModal api={api} occ={selectedOcc} onClose={() => setSelectedOcc(null)} />
      )}
    </>
  );
}

function ShowCard({ api, occ, onOpen }: { api: AppApi; occ: ShowOccurrence; onOpen: () => void }) {
  const { run, dayLabel } = api;
  const bookings = run.bookings ?? [];
  const d = daysUntil(occ.startAt, run.at);
  const mineSlots = bookings
    .filter((b) => b.occurrenceId === occ.id && b.status !== 'cancelled')
    .map((b) => b.slot);
  const npc = npcOccupied(occ, run.at, mineSlots);
  const state = cardState(occ, run.at, npc, mineSlots);
  const free = freeSlots(occ, npc, mineSlots);
  const dd = Math.max(0, d - 7);
  const status = mineSlots.length > 0 ? '已报名' : state === 'announced' ? '已宣发' : state === 'full' ? '已满' : '';

  return (
    <button
      type="button"
      className={`show-card${state === 'announced' ? ' announced' : ''}`}
      onClick={onOpen}
    >
      <div className="show-title">
        <strong>{occ.name}</strong>
        <span className="show-badge">{TYPE_LABEL[occ.type] ?? occ.type}</span>
        <span className={`show-badge tier-${occ.tier}`}>{TIER_LABEL[occ.tier]}</span>
        {status === '已宣发' && <span className="show-badge status-announced">已宣发</span>}
        {status === '已满' && <span className="show-badge status-full">已满</span>}
        {status === '已报名' && <span className="show-badge status-mine">已报名</span>}
      </div>
      <div className="show-meta">
        {dayLabel(occ.startAt, run.at)} · 开演 {d} 天后 · {d <= 7 ? '报名已截止' : `报名截止 ${dd} 天后`}
      </div>
      <div className="show-free">空位 {free} / {occ.slots.length}</div>
      <div className="show-open">点击查看详情 ›</div>
    </button>
  );
}

export function ShowDetailModal({ api, occ, onClose }: { api: AppApi; occ: ShowOccurrence; onClose: () => void }) {
  const { run, party, bookShow, schedule, dayLabel, busyKey } = api;
  const bookings = run.bookings ?? [];
  const mineSlots = bookings
    .filter((b) => b.occurrenceId === occ.id && b.status !== 'cancelled')
    .map((b) => b.slot);
  const npc = npcOccupied(occ, run.at, mineSlots);
  const state = cardState(occ, run.at, npc, mineSlots);
  const first = firstOpenSlotIndex(occ, npc, mineSlots);
  const [selected, setSelected] = useState(first >= 0 ? first : 0);
  const slot = occ.slots[selected]!;
  const stats = effectiveStats(run);
  const chk = checkBooking(run, party, occ, slot);
  const dayTaken = bookings.some(
    (b) =>
      b.status !== 'cancelled' &&
      Math.floor((b.startAt - START_AT) / DAY_MS) === Math.floor((occ.startAt - START_AT) / DAY_MS),
  );
  const dayUsed = schedule
    .filter((s) => Math.floor((s.startAt - START_AT) / DAY_MS) === Math.floor((occ.startAt - START_AT) / DAY_MS))
    .reduce((n, s) => n + (s.slots ?? 1), 0);
  const bookChk = canBook(run, party, occ, slot, run.at, bookings, dayUsed);
  const { fee, uplift } = entryFee(run, party, slot);
  const selectedTaken = npc.has(slot.slot) || mineSlots.includes(slot.slot);
  const selectedMine = mineSlots.includes(slot.slot);
  const d = daysUntil(occ.startAt, run.at);
  const dd = Math.max(0, d - 7);
  const title =
    state === 'announced' ? '已宣发' : state === 'full' ? '已满' : '';

  const disabledText = selectedMine
    ? '你已报名'
    : state === 'announced'
      ? '已宣发，报名已截止'
      : state === 'full'
        ? '本场已满'
        : selectedTaken
          ? '位置已被占'
          : dayTaken
            ? '这天已有安排'
            : !bookChk.ok && bookChk.reason === 'day-full'
              ? '这天行程排满了'
              : !chk.ok
                ? '条件不足'
                : '';
  const disabled =
    selectedMine ||
    state !== 'open' ||
    selectedTaken ||
    dayTaken ||
    !bookChk.ok ||
    !chk.ok;

  return (
    <Modal title={`${occ.name}`} wide onClose={onClose}>
      <div className="show-detail">
        <div className="show-title">
          <span className="show-badge">{TYPE_LABEL[occ.type] ?? occ.type}</span>
          <span className={`show-badge tier-${occ.tier}`}>{TIER_LABEL[occ.tier]}</span>
          {title === '已宣发' && <span className="show-badge status-announced">已宣发</span>}
          {title === '已满' && <span className="show-badge status-full">已满</span>}
        </div>
        <div className="show-meta">
          {dayLabel(occ.startAt, run.at)} · 开演 {d} 天后 · {d <= 7 ? '报名已截止' : `报名截止 ${dd} 天后`}
        </div>

        <div className="show-detail-list">
          {occ.slots.map((s, i) => {
            const taken = npc.has(s.slot);
            const mine = mineSlots.includes(s.slot);
            const rowChk = checkBooking(run, party, occ, s);
            const rowFee = entryFee(run, party, s).fee;
            const req = s.reqStats;
            const bad = (k: 'vocal' | 'dance' | 'acting' | 'talk') =>
              stats[k] < (req[k] ?? 0);
            return (
              <div
                key={s.slot}
                className={`show-detail-row${i === selected ? ' selected' : ''}${taken ? ' taken' : ''}${mine ? ' mine' : ''}`}
                onClick={() => {
                  if (taken || mine) return;
                  setSelected(i);
                }}
              >
                <div className="show-detail-name">{s.slotName}</div>
                <div className="show-detail-req">
                  名气 <span className={rowChk.missing.fame !== undefined ? 'req-bad' : ''}>{s.reqFame}</span> · 演唱 <span className={bad('vocal') ? 'req-bad' : ''}>{req.vocal ?? 0}</span> · 舞蹈{' '}
                  <span className={bad('dance') ? 'req-bad' : ''}>{req.dance ?? 0}</span> · 演技{' '}
                  <span className={bad('acting') ? 'req-bad' : ''}>{req.acting ?? 0}</span> · 口才{' '}
                  <span className={bad('talk') ? 'req-bad' : ''}>{req.talk ?? 0}</span>
                  <div className="show-detail-sub">
                    <span className={rowChk.missing.fans !== undefined ? 'req-bad' : ''}>粉丝 {s.reqFans}</span>
                    {s.reqParty > 0 ? (
                      <span className={rowChk.missing.party !== undefined ? 'req-bad' : ''}> · 成员 {s.reqParty}</span>
                    ) : null}
                  </div>
                </div>
                <div className="show-detail-fee">¥{rowFee.toLocaleString()}</div>
                <div className="show-detail-act">
                  {mine ? (
                    <span>你已报名</span>
                  ) : taken ? (
                    <span>NPC 已占</span>
                  ) : (
                    <button type="button" className="show-pick" onClick={() => setSelected(i)}>
                      选择
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="show-rules">
          <div>报名截止：开演前 7 天，之后转为已宣发、不再接受报名</div>
          <div>同一天只能报一场演出</div>
          <div>取消规则：距开演 ≤15 天取消扣 60% 出场费；≤7 天不可取消</div>
          <div>出场费按属性超出要求的幅度提成，最多 +30%</div>
        </div>

        <div className="show-detail-foot">
          <div>
            {!chk.ok ? `达标后约 ¥${fee.toLocaleString()}` : `出场费 ¥${fee.toLocaleString()}`}
            {chk.ok && uplift > 0 ? `（含属性提成 +${Math.round(uplift * 100)}%${uplift >= 0.3 ? '，已封顶' : ''}）` : ''}
          </div>
          <button
            className="primary"
            disabled={disabled || !!busyKey}
            onClick={() => {
              bookShow(occ, slot);
              onClose();
            }}
          >
            {disabled ? disabledText : busyKey?.startsWith('book:') ? '报名中…' : '报名'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
