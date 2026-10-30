import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACTION_LIST,
  ACTIONS,
  RECRUIT_COST,
  RUN_LENGTH_MS,
  START_MONEY,
  biasLabel,
  buyItem,
  effectiveStats,
  equipItem,
  getShop,
  memberStats,
  recruit,
  applyChoice,
  applyShow,
  createFans,
  getStoryEvent,
  judgeEnding,
  performShow,
  settle,
  tierOf,
} from '@idollife/core';
import type { Ending, EquipItem, RunState, ScheduleItem, SettleResult } from '@idollife/core';
import { clearSave, createSave, loadSave, writeSave } from './state/save';
import { syncRun, fetchLatestRun, pushChoice } from './api/sync';
import {
  getAccessToken,
  getSessionUser,
  onAuthChange,
  signIn,
  signOut,
  signUp,
  supabase,
  type AuthUser,
} from './auth/supabase';

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

const initialRun: RunState = {
  at: T0,
  stamina: 100,
  money: START_MONEY,
  stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
  axes: { self: 50, others: 50, fit: 50 },
  fans: createFans(0),
  party: [],
  inventory: [],
  equipped: {},
  flags: {},
  pendingEvent: null,
  log: [],
};

const RUN_END = T0 + RUN_LENGTH_MS;

const AXIS_LABEL: Record<'self' | 'others' | 'fit', string> = {
  self: '自我',
  others: '他人',
  fit: '适配',
};

const TIER_LABEL: Record<'low' | 'mid' | 'high', string> = {
  low: '低',
  mid: '中',
  high: '高',
};

const STAT_LABEL: Record<string, string> = {
  vocal: '演唱',
  dance: '舞蹈',
  acting: '演技',
  talk: '口才',
};

type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'guest';

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
  guest: '未登录（仅本地）',
};

export default function App() {
  const boot = useRef(loadSave()).current;

  const [runId, setRunId] = useState(boot?.runId ?? createSave(initialRun, 'run-demo').runId);
  const [run, setRun] = useState<RunState>(boot?.run ?? initialRun);
  const [schedule, setSchedule] = useState<ScheduleItem[]>(boot?.schedule ?? []);
  const [revision, setRevision] = useState<number>(boot?.revision ?? 0);
  const [seed] = useState(boot?.seed ?? 'run-demo');
  const [savedAt, setSavedAt] = useState<number | null>(boot?.updatedAt ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [phase, setPhase] = useState<'playing' | 'deciding' | 'ended'>('playing');
  const [ending, setEnding] = useState<Ending | null>(null);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    void getSessionUser().then((u) => {
      setUser(u);
      setSyncStatus(u ? 'local' : 'guest');
    });
    return onAuthChange((u) => {
      setUser(u);
      setSyncStatus(u ? 'local' : 'guest');
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      const token = await getAccessToken();
      const latest = await fetchLatestRun(token);
      if (cancelled || !latest) return;

      const localEmpty = run.log.length === 0 && schedule.length === 0 && run.at === T0;
      if (localEmpty || latest.revision > revision) {
        setRunId(latest.runId);
        setRun(latest.run);
        setSchedule(latest.schedule);
        setRevision(latest.revision);
        setNotice('已从云端恢复进度。');
      }
    })();

    return () => {
      cancelled = true;
    };
    // 只在登录状态变化时拉一次云端
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const t = setTimeout(() => {
      const ok = writeSave({
        version: 1,
        runId,
        revision,
        updatedAt: Date.now(),
        seed,
        run,
        schedule,
      });
      if (ok) setSavedAt(Date.now());
    }, 250);
    return () => clearTimeout(t);
  }, [runId, revision, run, schedule, seed]);

  const lastEnd = useMemo(
    () => schedule.reduce((max, s) => Math.max(max, s.endAt), run.at),
    [schedule, run.at],
  );

  const totalMin = useMemo(
    () => Math.round(schedule.reduce((sum, s) => sum + (s.endAt - s.startAt), 0) / MIN),
    [schedule],
  );

  const dayGroups = useMemo(() => {
    const map = new Map<number, ScheduleItem[]>();
    for (const s of schedule) {
      const day = Math.floor((s.startAt - T0) / (24 * 60 * MIN)) + 1;
      const arr = map.get(day) ?? [];
      arr.push(s);
      map.set(day, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [schedule]);

  async function pushSync(
    prevRun: RunState,
    prevSchedule: ScheduleItem[],
    from: number,
    to: number,
    local: SettleResult,
  ) {
    const token = await getAccessToken();
    if (!token) {
      setSyncStatus('guest');
      return;
    }

    setSyncStatus('syncing');
    const outcome = await syncRun(
      { runId, run: prevRun, schedule: prevSchedule, from, to, seed },
      token,
    );

    if (outcome.kind === 'unauthorized') {
      setSyncStatus('guest');
      return;
    }
    if (outcome.kind === 'error') {
      setSyncStatus('offline');
      return;
    }

    if (outcome.kind === 'stale') {
      setRun(outcome.data.state);
      setRevision(outcome.data.revision);
      setNotice('服务器上的进度更新，已回滚到云端。');
      setSyncStatus('synced');
      return;
    }

    const res = outcome.data;
    setRevision(res.revision);

    if (!sameState(res.state, local.state)) {
      setRun(res.state);
      setNotice('服务器已校准进度（以服务器为准）。');
    }
    setSyncStatus('synced');
  }

  async function choose(choiceId: string) {
    if (!run.pendingEvent) return;
    const next = applyChoice(run, run.pendingEvent, choiceId);
    setRun(next);
    setNotice('选择已记录。');

    const token = await getAccessToken();
    const res = await pushChoice(runId, next, token);
    if (res) setRevision(res.revision);
  }

  function doBuy(item: EquipItem) {
    const { state, result } = buyItem(run, item);
    if (result !== 'ok') {
      setNotice('钱不够。');
      return;
    }
    setRun(state);
    setNotice(state.log.at(-1)?.text ?? '');
    void (async () => {
      const token = await getAccessToken();
      const res = await pushChoice(runId, state, token);
      if (res) setRevision(res.revision);
    })();
  }

  function doEquip(item: EquipItem) {
    const next = equipItem(run, item.id);
    setRun(next);
    setNotice(`换上了「${item.name}」。`);
    void (async () => {
      const token = await getAccessToken();
      const res = await pushChoice(runId, next, token);
      if (res) setRevision(res.revision);
    })();
  }

  function doRecruit() {
    if (run.money < RECRUIT_COST) {
      setNotice('钱不够招募了。');
      return;
    }
    const { state } = recruit(run, seed + ':recruit:' + run.log.length + ':' + Date.now());
    setRun(state);
    setNotice(state.log.at(-1)?.text ?? '');
    void (async () => {
      const token = await getAccessToken();
      const res = await pushChoice(runId, state, token);
      if (res) setRevision(res.revision);
    })();
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

    const result = settle(prevRun, prevSchedule, from, to, seed, { endAt: RUN_END });
    setRun(result.state);
    setSchedule((prev) => prev.filter((s) => !result.executed.includes(s.id)));

    if (result.stoppedReason === 'ending') {
      setPhase('deciding');
      setNotice('两年到了。最后做一个决定吧。');
    } else {
      setNotice(
        result.stoppedReason === 'stamina'
          ? `体力不足，只执行了 ${result.executed.length} 个行动。`
          : result.stoppedReason === 'time'
            ? '排程没跑完，剩下的留到下次。'
            : result.stoppedReason === 'event'
              ? '有件事需要你决定。'
              : `执行了 ${result.executed.length} 个行动。`,
      );
    }

    void pushSync(prevRun, prevSchedule, from, to, result);
  }

  function doShow() {
    if (phase !== 'playing' || run.pendingEvent) return;
    const result = performShow(run, `${seed}:show:${run.log.length}`);
    const next = applyShow(run, result);
    setRun(next);
    setNotice(`演出 ${result.grade}：${result.report[0]}`);

    void (async () => {
      const token = await getAccessToken();
      const res = await pushChoice(runId, next, token);
      if (res) setRevision(res.revision);
    })();
  }

  function decide(d: 'stay' | 'backstage' | 'leave') {
    const e = judgeEnding(run, d);
    setEnding(e);
    setPhase('ended');
    setNotice(null);

    void (async () => {
      const token = await getAccessToken();
      const res = await pushChoice(runId, run, token);
      if (res) setRevision(res.revision);
    })();
  }

  function reset() {
    clearSave();
    const fresh = createSave(initialRun, 'run-demo');
    setRunId(fresh.runId);
    setRun(initialRun);
    setSchedule([]);
    setSavedAt(null);
    setSyncStatus(user ? 'local' : 'guest');
    setPhase('playing');
    setEnding(null);
    setNotice('存档已重置。');
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    const fn = authMode === 'login' ? signIn : signUp;
    const res = await fn(email.trim(), password);
    setAuthBusy(false);
    if (res.error) {
      setAuthError(res.error);
      return;
    }
    setPassword('');
    setNotice(authMode === 'login' ? '登录成功，下次推进将同步到服务器。' : '注册成功。');
  }

  return (
    <div className="app">
      <header className="bar">
        <span className="brand">idollife</span>
        <span className="clock">{fmt(run.at)}</span>
      </header>

      <section className="panel">
        {!supabase ? (
          <p className="muted">未配置 Supabase，登录不可用（本地照常玩）。</p>
        ) : user ? (
          <div className="auth-row">
            <span className="muted">已登录：{user.email ?? user.id.slice(0, 8)}</span>
            <button onClick={() => void signOut()}>退出</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submitAuth}>
            <div className="auth-tabs">
              <button
                type="button"
                className={authMode === 'login' ? 'tab active' : 'tab'}
                onClick={() => setAuthMode('login')}
              >
                登录
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'tab active' : 'tab'}
                onClick={() => setAuthMode('register')}
              >
                注册
              </button>
            </div>
            <div className="auth-fields">
              <input
                type="email"
                placeholder="邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="密码（至少 6 位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <button className="primary" disabled={authBusy}>
                {authBusy ? '处理中…' : authMode === 'login' ? '登录' : '注册'}
              </button>
            </div>
            {authError && <p className="auth-error">{authError}</p>}
            <p className="muted">登录后进度才会同步到服务器；不登录也能本地玩。</p>
          </form>
        )}
      </section>

      <section className="panel">
        <div className="stats">
          {(['vocal', 'dance', 'acting', 'talk'] as const).map((k) => (
            <div key={k} className="stat">
              <span className="k">{STAT_LABEL[k]}</span>
              <span className="v">{run.stats[k]}</span>
            </div>
          ))}
          <div className="stat">
            <span className="k">资金</span>
            <span className="v">{run.money}</span>
          </div>
          <div className="stat">
            <span className="k">体力</span>
            <span className="v">{run.stamina}</span>
          </div>
          <div className="stat">
            <span className="k">粉丝</span>
            <span className="v">
              {Object.values(run.fans.byType).reduce((a, b) => a + b, 0)}
            </span>
          </div>
        </div>
        <div className="axes">
          {(['self', 'others', 'fit'] as const).map((k) => (
            <span key={k} className="axis">
              {AXIS_LABEL[k]} {TIER_LABEL[tierOf(run.axes[k])]}
            </span>
          ))}
        </div>
        <p className="muted saved">
          {savedAt ? `已保存 ${fmtClock(savedAt)}` : '尚未保存'}
          {syncStatus !== 'local' && (
            <span className={`chip chip-${syncStatus}`}>{SYNC_TEXT[syncStatus]}</span>
          )}
        </p>
      </section>

      {run.pendingEvent &&
        (() => {
          const ev = getStoryEvent(run.pendingEvent);
          if (!ev) return null;
          return (
            <section className="panel event">
              <h2>需要你决定</h2>
              <h3>{ev.title}</h3>
              <p>{ev.text}</p>
              <div className="choices">
                {ev.choices.map((c) => (
                  <button key={c.id} onClick={() => void choose(c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </section>
          );
        })()}

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
          <button onClick={doShow} disabled={run.stamina < 30 || phase !== 'playing'}>
            参加演出
            <small>体力 -30</small>
          </button>
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
          <div className="days">
            {dayGroups.map(([day, items]) => {
              const mins = Math.round(
                items.reduce((sum, s) => sum + (s.endAt - s.startAt), 0) / MIN,
              );
              return (
                <div key={day} className="day">
                  <div className="day-head">
                    <span>Day {day}</span>
                    <span className="muted">
                      {items.length} 个 · {mins} 分
                    </span>
                  </div>
                  <ul className="sched">
                    {items.map((s) => {
                      const a = ACTIONS[s.actionId];
                      const d = new Date(s.startAt);
                      return (
                        <li key={s.id}>
                          <span className="time">
                            {String(d.getUTCHours()).padStart(2, '0')}:
                            {String(d.getUTCMinutes()).padStart(2, '0')}
                          </span>
                          <span className="name">{a?.name ?? s.actionId}</span>
                          <span className="dur">{Math.round((s.endAt - s.startAt) / MIN)} 分</span>
                          <button className="del" onClick={() => removeItem(s.id)} title="移除">
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
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
        <h2>商店（本周）</h2>
        <ul className="shop">
          {getShop(run, seed).map((item) => (
            <li key={item.id}>
              <span className="name">{item.name}</span>
              <span className="muted">
                {STAT_LABEL[item.affix.stat]} +{item.affix.value}
                {item.rarity === 'rare' ? ' · 稀有' : ''}
              </span>
              <button onClick={() => doBuy(item)} disabled={run.money < item.price}>
                ¥{item.price}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>背包（{run.inventory.length}）</h2>
        {run.inventory.length === 0 ? (
          <p className="muted">还没买过东西。</p>
        ) : (
          <ul className="shop">
            {run.inventory.map((item) => {
              const on = run.equipped.outfit === item.id;
              return (
                <li key={item.id}>
                  <span className="name">
                    {item.name}
                    {on ? '（已装备）' : ''}
                  </span>
                  <span className="muted">
                    {STAT_LABEL[item.affix.stat]} +{item.affix.value}
                  </span>
                  <button onClick={() => doEquip(item)} disabled={on}>
                    装备
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="muted">
          当前属性：{Object.entries(effectiveStats(run))
            .map(([k, v]) => `${STAT_LABEL[k]} ${v}`)
            .join(' · ')}
        </p>
      </section>

      <section className="panel">
        <h2>组合（{run.party.length}）</h2>
        {run.party.length === 0 ? (
          <p className="muted">还没有成员。招募一次 500。</p>
        ) : (
          <ul className="party">
            {run.party.map((m) => {
              const s = memberStats(m, run.stats);
              return (
                <li key={m.id}>
                  <span className="name">{m.name}</span>
                  <span className="muted">
                    {biasLabel(m.bias)} · 默契 +{m.dupCount}%
                  </span>
                  <span className="dur">
                    {s.vocal}/{s.dance}/{s.acting}/{s.talk}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="row">
          <button className="primary" onClick={doRecruit} disabled={run.money < RECRUIT_COST}>
            招募
            <small>-{RECRUIT_COST}</small>
          </button>
        </div>
      </section>

      {phase === 'deciding' && (
        <section className="panel event">
          <h2>两年了</h2>
          <h3>你还要留在这个圈子吗？</h3>
          <div className="choices">
            <button onClick={() => decide('stay')}>留在台前</button>
            <button onClick={() => decide('backstage')}>转幕后</button>
            <button onClick={() => decide('leave')}>离开</button>
          </div>
        </section>
      )}

      {phase === 'ended' && ending && (
        <section className="panel ending">
          <h2>结局</h2>
          <h3>{ending.title}</h3>
          <p>{ending.text}</p>
          <button className="primary" onClick={reset}>
            再来一次
          </button>
        </section>
      )}

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
