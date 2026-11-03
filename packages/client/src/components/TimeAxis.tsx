import { ACTIONS, ALLOWED_SPEEDS, SHOW_ACTION_ID, type ScheduleItem } from '@idollife/core';

export interface TimeAxisProps {
  pastItems: ScheduleItem[];
  futureItems: ScheduleItem[];
  nextItem: ScheduleItem | null;
  running: boolean;
  remainMs: number;
  pct: number;
  dayBreakLabels: Map<string, string>;
  actionNo: (it: { id: string; startAt: number }) => number;
  speed: number;
  setSpeed: (v: number) => void;
  pendingCount: number;
  todayIndex: number;
  weekdayName: (d: number) => string;
  lastStop: string;
  stopText: Record<string, string>;
  onAdvance: () => void;
  onStop: () => void;
  onArrange: () => void;
  onHistory: () => void;
  onOpenStops: () => void;
}

export function TimeAxis(props: TimeAxisProps) {
  const {
    pastItems,
    futureItems,
    nextItem,
    running,
    remainMs,
    pct,
    dayBreakLabels,
    actionNo,
    speed,
    setSpeed,
    pendingCount,
    todayIndex,
    weekdayName,
    lastStop,
    stopText,
    onAdvance,
    onStop,
    onArrange,
    onHistory,
    onOpenStops,
  } = props;

  return (
    <div className="tl-holder">
      <section className="mod mod-timeline">
        <div className="tlx">
          {!running && lastStop && stopText[lastStop] && (
            <span className={`tlx-status ${lastStop}`}>{stopText[lastStop]}</span>
          )}

          <div className="tlx-side tlx-past">
            {pastItems.length === 0 && <span className="tlx-empty">还没有历史</span>}
            {pastItems.map((it) => {
              const a = ACTIONS[it.actionId];
              return (
                <div
                  key={it.id}
                  className={[
                    'tlx-point',
                    'done',
                    dayBreakLabels.has(it.id) ? 'newday' : '',
                    it.stopAfter ? 'stopped' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-date={dayBreakLabels.get(it.id) ?? ''}
                  style={{ width: '84px' }}
                >
                  <span className="tlx-above">
                    {a?.name ?? it.actionId}
                    <em>已完成</em>
                  </span>
                  <span className="tlx-dot" />
                  <span className="tlx-below">
                    行动{actionNo(it)}
                    {it.stopAfter && <em className="stop-mark">完成后停止</em>}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="tlx-card">
            <div className="tlx-card-name">
              {nextItem ? (ACTIONS[nextItem.actionId]?.name ?? nextItem.actionId) : '空闲'}
            </div>
            <div className="tlx-card-bar">
              <i style={{ width: `${Math.round(pct * 100)}%` }} />
            </div>
            <div className="tlx-card-meta">
              {running && nextItem
                ? remainMs === 0
                  ? '结算中…'
                  : `还剩 ${Math.ceil(remainMs / 1000)} 秒`
                : nextItem
                  ? `行动${actionNo(nextItem)} · 待执行`
                  : '时间已停止'}
            </div>
          </div>

          <div className="tlx-side tlx-future">
            {futureItems.map((it) => {
              const a = ACTIONS[it.actionId];
              return (
                <div
                  key={it.id}
                  className={[
                    'tlx-point',
                    dayBreakLabels.has(it.id) ? 'newday' : '',
                    it.stopAfter ? 'stopped' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-date={dayBreakLabels.get(it.id) ?? ''}
                  style={{ width: '84px' }}
                >
                  <span className="tlx-above">{a?.name ?? it.actionId}</span>
                  <span className="tlx-dot" />
                  <span className="tlx-below">
                    行动{actionNo(it)}
                    {it.stopAfter && <em className="stop-mark">完成后停止</em>}
                  </span>
                </div>
              );
            })}
            {futureItems.length === 0 && <span className="tlx-empty">没有后续行程</span>}
          </div>
        </div>

        <div className="tlx-tools">
          <div className="tools-left">
            <button onClick={onOpenStops}>设置暂停时间点</button>
            <div className="speed-row">
              {ALLOWED_SPEEDS.map((v) => (
                <button
                  key={v}
                  className={speed === v ? 'mini-tab active' : 'mini-tab'}
                  onClick={() => setSpeed(v)}
                >
                  {v}×
                </button>
              ))}
            </div>
          </div>

          <div className="tools-center">
            <button className="primary" onClick={onAdvance} disabled={pendingCount === 0 || running}>
              {running ? '推进中…' : '开始推进'}
            </button>
            <button onClick={onStop} disabled={!running}>
              停止
            </button>
            <span className="tools-date">
              第 {todayIndex + 1} 天 · 第 {Math.floor(todayIndex / 7) + 1} 周 {weekdayName(todayIndex)}
            </span>
            <button
              className={pendingCount === 0 ? 'primary arrange-hint' : ''}
              onClick={onArrange}
            >
              安排行程
            </button>
          </div>

          <div className="tools-right">
            <button onClick={onHistory}>历史行程</button>
            <span className="muted small">
              {running ? '推进中' : '已停止'} · 待办 {pendingCount}
              {lastStop && lastStop !== 'time' ? ` · ${lastStop}` : ''}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
