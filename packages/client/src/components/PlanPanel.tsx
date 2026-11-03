import { memo, useEffect, useMemo, useRef } from 'react';
import {
  ACTIONS,
  ACTION_MS,
  ACTION_META,
  DAILY_SLOTS,
  DAY_MS,
  SHOW_ACTION_ID,
  SHOW_DURATION_MS,
  START_AT,
  buildDaySlots,
  preflightAction,
} from '@idollife/core';
import type { ScheduleItem } from '@idollife/core';
import type { AppApi } from './api';

/** 行动占槽数：演出占满 3 槽，其余按 durationMs；spanOf 留在调用方（content 依赖） */
const spanOf = (item: ScheduleItem) => Math.max(1, item.slots ?? 1);

const nameOf = (item: ScheduleItem) =>
  ACTIONS[item.actionId]?.name ?? (item.actionId === SHOW_ACTION_ID ? '演出' : item.actionId);

const categoryOf = (item: ScheduleItem) =>
  item.actionId === SHOW_ACTION_ID ? 'performance' : (ACTIONS[item.actionId]?.category ?? 'growth');

type DayState = 'past' | 'today' | 'future';

/** 单格 memo：props 里只有 nowAt（run.at），不传 gameNow，推进中不会逐帧重渲染 */
const DayCell = memo(function DayCell({
  day,
  items,
  state,
  nowAt,
  weekdayName,
}: {
  day: number;
  items: ScheduleItem[];
  state: DayState;
  nowAt: number;
  weekdayName: (day: number) => string;
}) {
  const dayStart = START_AT + day * DAY_MS;
  const slots = buildDaySlots(items, dayStart, DAILY_SLOTS, ACTION_MS, spanOf);
  const allDone = items.length > 0 && items.every((s) => s.done);

  return (
    <div className={`date-cell plan-day ${state}`} data-day={day}>
      <div className="date-head plan-day-head">
        <span>
          第 {Math.floor(day / 7) + 1} 周 {weekdayName(day)}
        </span>
        {state === 'today' ? <span className="day-badge today">今天</span> : null}
        {state === 'past' ? <span className="day-badge">已过</span> : null}
        {state === 'past' && allDone ? <span className="day-check">✓</span> : null}
      </div>
      <div className="date-slots">
        {slots.map(({ item, covered, index: i }) => {
          if (!item) {
            if (covered) return null;
            return (
              <div className="date-slot empty" key={`e${i}`} style={{ flexGrow: 1 }}>
                {state === 'past' ? '空' : `动作${i + 1}`}
              </div>
            );
          }
          const executing = !item.done && item.startAt <= nowAt && nowAt < item.endAt;
          const finished = !!item.done;
          const locked = finished || executing;
          const sp = Math.min(DAILY_SLOTS - i, spanOf(item));
          return (
            <div
              className={`date-slot cat-${categoryOf(item)}${locked ? ' locked' : ''}${
                executing ? ' executing' : ''
              }`}
              key={item.id}
              style={{ flexGrow: sp }}
            >
              <span className="nm">{nameOf(item)}</span>
              {finished ? <span className="day-check">✓</span> : null}
              {executing ? <span className="slot-tag">执行中</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
});

/**
 * 行程主模块（T-030）：横向一列天级框。
 * - 初始/数据晚到时对齐「前天」；玩家手动滚过后不再打扰。
 * - 三态：past / today / future；末尾追加「＋ 点击安排行程」。
 */
export function PlanPanel({ api }: { api: AppApi }) {
  const { run, schedule, pending, weekdayName, openPlan } = api;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  const programmaticRef = useRef(false);

  // 常驻前置提示：只看 pending[0]（O(1)），不遍历整个排程
  const nextPending = pending[0];
  const pf = nextPending ? preflightAction(run, nextPending.actionId) : null;
  const blocked = !!pf && !pf.ok;
  const nextName = nextPending
    ? ACTIONS[nextPending.actionId]?.name ?? nextPending.actionId
    : '';
  const scopeWord = nextPending
    ? { day: '今天', week: '本周', run: '本局' }[ACTION_META[nextPending.actionId]?.timesScope ?? 'run']
    : '';
  const blockedText = blocked
    ? pf.reason === 'stamina'
      ? `下一条「${nextName}」体力差 ${Math.max(0, (pf.need ?? 0) - (pf.have ?? 0))}`
      : pf.reason === 'money'
        ? `下一条「${nextName}」钱差 ¥${Math.max(0, (pf.need ?? 0) - (pf.have ?? 0))}`
        : `下一条「${nextName}」${scopeWord ?? '本局'}次数已用完`
    : '';

  const currentDay = Math.max(0, Math.floor((run.at - START_AT) / DAY_MS));
  const maxItemDay = schedule.reduce(
    (m, s) => Math.max(m, Math.floor((s.startAt - START_AT) / DAY_MS)),
    0,
  );
  const lastDay = Math.max(currentDay, maxItemDay);

  // currentDay 只随 run.at 变化（低频），因此推进中不会逐帧重建 daysData
  const daysData = useMemo(() => {
    const days = Array.from({ length: lastDay + 1 }, (_, i) => i);
    return days.map((day) => {
      const items = schedule
        .filter((s) => Math.floor((s.startAt - START_AT) / DAY_MS) === day)
        .sort((a, b) => a.startAt - b.startAt);
      const state: DayState = day < currentDay ? 'past' : day === currentDay ? 'today' : 'future';
      return { day, items, state };
    });
  }, [schedule, currentDay, lastDay]);

  // 初始定位 + 数据晚到跟进；玩家手动滚过后不再拽走
  useEffect(() => {
    if (dirtyRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.max(0, currentDay - 2);
    const target = el.querySelector(`[data-day="${idx}"]`) as HTMLElement | null;
    if (!target) return;
    programmaticRef.current = true;
    const delta = target.getBoundingClientRect().left - el.getBoundingClientRect().left;
    el.scrollLeft += delta;
    requestAnimationFrame(() => {
      programmaticRef.current = false;
    });
  }, [currentDay]);

  const onScroll = () => {
    if (!programmaticRef.current) dirtyRef.current = true;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth) return;
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    if (delta === 0) return;
    e.preventDefault();
    dirtyRef.current = true;
    el.scrollLeft += delta;
  };

  return (
    <>
      <div className={`mod-head plan-head${blocked ? ' has-block' : ''}`}>
        <h2>行程</h2>
        <span className="muted small">待执行 {pending.length} 个</span>
        {blocked ? <span className="plan-blocked">{blockedText}</span> : null}
        <button className="plan-open-btn" onClick={openPlan}>
          安排行程
        </button>
      </div>

      <div className="plan-strip" ref={scrollRef} onScroll={onScroll} onWheel={onWheel}>
        {daysData.map(({ day, items, state }) => (
          <DayCell
            key={day}
            day={day}
            items={items}
            state={state}
            nowAt={run.at}
            weekdayName={weekdayName}
          />
        ))}

        <button className="date-cell plan-day plan-add-cell" onClick={openPlan}>
          <span className="add-plus">＋</span>
          <span>点击安排行程</span>
        </button>
      </div>
    </>
  );
}
