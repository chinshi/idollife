import { useMemo, useState } from 'react';
import { ACTION_LIST, ACTIONS, settle } from '@idollife/core';
import type { RunState, ScheduleItem } from '@idollife/core';

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

const initialRun: RunState = {
  at: T0,
  stamina: 100,
  stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
  log: [],
};

const STAT_LABEL: Record<string, string> = {
  vocal: '演唱',
  dance: '舞蹈',
  acting: '演技',
  talk: '口才',
};

function fmt(time: number): string {
  const base = T0;
  const day = Math.floor((time - base) / (24 * 60 * MIN)) + 1;
  const d = new Date(time);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `Day ${day} · ${hh}:${mm}`;
}

export default function App() {
  const [run, setRun] = useState<RunState>(initialRun);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [seed] = useState('run-demo');
  const [finished, setFinished] = useState<string[]>([]);

  const lastEnd = useMemo(
    () => schedule.reduce((max, s) => Math.max(max, s.endAt), run.at),
    [schedule, run.at],
  );

  function addAction(actionId: string) {
    const action = ACTIONS[actionId];
    if (!action) return;
    const startAt = Math.max(lastEnd, run.at);
    setSchedule((prev) => [
      ...prev,
      {
        id: `s-${prev.length + 1}`,
        actionId,
        startAt,
        endAt: startAt + action.durationMs,
      },
    ]);
  }

  function advance() {
    if (schedule.length === 0) return;
    const result = settle(run, schedule, run.at, lastEnd, seed);
    setRun(result.state);
    setFinished(result.executed);
    setSchedule(schedule.filter((s) => !result.executed.includes(s.id)));
  }

  function reset() {
    setRun(initialRun);
    setSchedule([]);
    setFinished([]);
  }

  return (
    <div className="app">
      <header className="bar">
        <span className="brand">idollife</span>
        <span className="clock">{fmt(run.at)}</span>
      </header>

      <section className="panel">
        <div className="stats">
          {(['vocal', 'dance', 'acting', 'talk'] as const).map((k) => (
            <div key={k} className="stat">
              <span className="k">{STAT_LABEL[k]}</span>
              <span className="v">{run.stats[k]}</span>
            </div>
          ))}
          <div className="stat">
            <span className="k">体力</span>
            <span className="v">{run.stamina}</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>安排行动</h2>
        <div className="actions">
          {ACTION_LIST.map((a) => (
            <button key={a.id} onClick={() => addAction(a.id)}>
              {a.name}
              <small>{a.stamina > 0 ? `体力 +${a.stamina}` : `体力 ${a.stamina}`}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>本周排程（{schedule.length}）</h2>
        {schedule.length === 0 ? (
          <p className="muted">还没有安排。点上面的行动加入排程。</p>
        ) : (
          <ul className="sched">
            {schedule.map((s) => (
              <li key={s.id}>
                <span>{ACTIONS[s.actionId]?.name ?? s.actionId}</span>
                <span className="muted">{fmt(s.startAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="primary" onClick={advance} disabled={schedule.length === 0}>
            开始推进
          </button>
          <button onClick={reset}>重置</button>
        </div>
        {finished.length > 0 && (
          <p className="muted">本次执行了 {finished.length} 个行动。</p>
        )}
      </section>

      <section className="panel">
        <h2>日志</h2>
        {run.log.length === 0 ? (
          <p className="muted">还没有发生什么。</p>
        ) : (
          <ul className="log">
            {[...run.log].reverse().map((l, i) => (
              <li key={`${l.at}-${i}`}>
                <span className="muted">{fmt(l.at)}</span>
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
