import type { RefObject } from 'react';
import { Fragment } from 'react';
import { DAY_MS, type LogEntry } from '@idollife/core';

export type LogTab = 'all' | 'event' | 'stat';

export function LogPanel({
  tab,
  onTab,
  logs,
  logRef,
  notice,
  t0,
  weekdayName,
}: {
  tab: LogTab;
  onTab: (t: LogTab) => void;
  logs: LogEntry[];
  logRef: RefObject<HTMLDivElement>;
  notice: string | null;
  t0: number;
  weekdayName: (day: number) => string;
}) {
  return (
    <section className="mod mod-log">
      <div className="mod-head">
        <h2>日志</h2>
        <div className="mini-tabs">
          {(['all', 'event', 'stat'] as LogTab[]).map((t) => (
            <button
              key={t}
              className={tab === t ? 'mini-tab active' : 'mini-tab'}
              onClick={() => onTab(t)}
            >
              {t === 'all' ? '全部' : t === 'event' ? '事件' : '属性'}
            </button>
          ))}
        </div>
      </div>

      <div className="log-scroll" ref={logRef}>
        {logs.length === 0 ? (
          <p className="muted small">还没有记录。</p>
        ) : (
          <ul className="log dense">
            {logs.map((l, i) => {
              const day = Math.floor((l.at - t0) / DAY_MS);
              const prev = i > 0 ? logs[i - 1] : undefined;
              const prevDay = prev ? Math.floor((prev.at - t0) / DAY_MS) : -1;
              const isNewDay = day !== prevDay;

              return (
                <Fragment key={`${l.at}-${i}`}>
                  {isNewDay && (
                    <li className="log-day">
                      第 {Math.floor(day / 7) + 1} 周 {weekdayName(day)}
                    </li>
                  )}
                  <li>
                    <span className="log-text">{l.text}</span>
                    {l.axesChanged && <em className="tag hidden-tag">隐藏属性变动</em>}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>

      {notice && <p className="notice">{notice}</p>}
    </section>
  );
}
