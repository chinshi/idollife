import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTION_LIST, ACTIONS, settle } from '@idollife/core';
import type { RunState, ScheduleItem, SettleResult } from '@idollife/core';
import { clearSave, createSave, loadSave, writeSave } from './state/save';
import { syncRun } from './api/sync';

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

type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline';

function fmt(time: number): string {
  const day = Math.floor((time - T0) / (24 * 60 * MIN)) + 1;
  const d = new Date(time);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `Day ${day} · ${hh}:${mm}`;
}

function fmtClock(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

function sameState(a: RunState, b: RunState): boolean {
  return (
    a.at === b.at &&
    a.stamina === b.stamina &&
    a.stats.vocal === b.stats.vocal &&
    a.stats.dance === b.stats.dance &&
    a.stats.acting === b.stats.acting &&
    a.stats.talk === b.stats.talk
  );
}

const SYNC_TEXT: Record<SyncStatus, string> = {
  local: '',
  syncing: '同步中…',
  synced: '已同步',
  offline: '离线（仅本地）',
};

export default function App() {
  const boot = useRef(loadSave()).current;

  const [runId, setRunId] = useState(boot?.runId ?? createSave(initialRun, 'run-demo').runId);
  const [run, setRun] = useState<RunState>(boot?.run ?? initialRun);
  const [schedule, setSchedule] = useState<ScheduleItem[]>(boot?.schedule ?? []);
  const [seed] = useState(boot?.seed ?? 'run-demo');
  const [savedAt, setSavedAt] = useState<number | null>(boot?.updatedAt ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');

  useEffect(() => {
    const t = setTimeout(() => {
      const ok = writeSave({
        version: 1,
        runId,
        updatedAt: Date.now(),
        seed,
        run,
        schedule,
      });
      if (ok) setSavedAt(Date.now());
    }, 250);
    return () => clearTimeout(t);
  }, [runId, run, schedule, seed]);

  const lastEnd = useMemo(
    () => schedule.reduce((max, s) => Math.max(max, s.endAt), run.at),
    [schedule, run.at],
  );

  const totalMin = useMemo(
    () => Math.round(schedule.reduce((sum, s) => sum + (s.endAt - s.startAt), 0) / MIN),
    [schedule],
  );

  async function pushSync(
    prevRun: RunState,
    prevSchedule: ScheduleItem[],
    from: number,
    to: number,
    local: SettleResult,
  ) {
    setSyncStatus('syncing');
    const res = await syncRun({
      runId,
      run: prevRun,
      schedule: prevSchedule,
      from,
      to,
      seed,
    });

    if (!res) {
      setSyncStatus('offline');
      return;
    }

    if (!sameState(res.state, local.state)) {
      setRun(res.state);
      setNotice('服务器已校准进度（以服务器为准）。');
    }
    setSyncStatus('synced');
  }

  function addAction(actionId: string) {
    const action = ACTIONS[actionId];
    if (!action) return;
    const startAt = Math.max(lastEnd, run.at);
    setSchedule((prev) => [
      ...prev,
      {
        id: `s-${Date.now()}-${prev.length}`,
        actionId,
        startAt,
        endAt: startAt + action.durationMs,
      },
    ]);
    setNotice(null);
  }

  function autoFill() {
    const pattern = [
      'vocal-karaoke',
      'dance-otaku',
      'rest-sleep',
      'acting-short',
      'talk-selftalk',
      'rest-sleep',
    ];
    let stamina = run.stamina;
    let cursor = Math.max(lastEnd, run.at);
    const next: ScheduleItem[] = [];

    for (let i = 0; i < 9; i++) {
      const a = ACTIONS[pattern[i % pattern.length]!];
      if (!a) break;
      if (stamina + a.stamina < 0) break;
      stamina += a.stamina;
      next.push({
        id: `s-auto-${Date.now()}-${i}`,
        actionId: a.id,
        startAt: cursor,
        endAt: cursor + a.durationMs,
      });
      cursor += a.durationMs;
    }

    if (next.length === 0) {
      setNotice('体力不够，先休息一下吧。');
      return;
    }
    setSchedule((prev) => [...prev, ...next]);
    setNotice(`自动排入 ${next.length} 个行动。`);
  }

  function removeItem(id: string) {
    setSchedule((prev) => prev.filter((s) => s.id !== id));
  }

  function advance() {
    if (schedule.length === 0) return;

    const prevRun = run;
    const prevSchedule = schedule;
    const from = run.at;
    const to = lastEnd;

    const result = settle(prevRun, prevSchedule, from, to, seed);
    setRun(result.state);
    setSchedule((prev) => prev.filter((s) => !result.executed.includes(s.id)));

    setNotice(
      result.stoppedReason === 'stamina'
        ? `体力不足，只执行了 ${result.executed.length} 个行动。`
        : result.stoppedReason === 'time'
          ? '排程没跑完，剩下的留到下次。'
          : `执行了 ${result.executed.length} 个行动。`,
    );

    void pushSync(prevRun, prevSchedule, from, to, result);
  }

  function reset() {
    clearSave();
    const fresh = createSave(initialRun, 'run-demo');
    setRunId(fresh.runId);
    setRun(initialRun);
    setSchedule([]);
    setSavedAt(null);
    setSyncStatus('local');
    setNotice('存档已重置。');
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
        <p className="muted saved">
          {savedAt ? `已保存 ${fmtClock(savedAt)}` : '尚未保存'}
          {syncStatus !== 'local' && (
            <span className={`chip chip-${syncStatus}`}>{SYNC_TEXT[syncStatus]}</span>
          )}
        </p>
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
        <div className="row">
          <button onClick={autoFill}>自动排满</button>
          <button onClick={() => setSchedule([])} disabled={schedule.length === 0}>
            清空排程
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>
          排程（{schedule.length} 个 · {totalMin} 分钟）
        </h2>
        {schedule.length === 0 ? (
          <p className="muted">还没有安排。点上面的行动，或者「自动排满」。</p>
        ) : (
          <ul className="sched">
            {schedule.map((s) => {
              const a = ACTIONS[s.actionId];
              return (
                <li key={s.id}>
                  <span className="time">{fmt(s.startAt).replace('Day ', 'D')}</span>
                  <span className="name">{a?.name ?? s.actionId}</span>
                  <span className="dur">{Math.round((s.endAt - s.startAt) / MIN)} 分</span>
                  <button className="del" onClick={() => removeItem(s.id)} title="移除">
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="row">
          <button className="primary" onClick={advance} disabled={schedule.length === 0}>
            开始推进
          </button>
          <button onClick={reset}>重置存档</button>
        </div>
        {notice && <p className="notice">{notice}</p>}
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
