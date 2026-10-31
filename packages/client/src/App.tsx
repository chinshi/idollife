import { Component, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACTION_LIST,
  ACTIONS,
  CATEGORY_LABEL,
  DAILY_ACTIONS,
  DAY_MS,
  RECRUIT_COST,
  RUN_LENGTH_MS,
  START_MONEY,
  activeParty,
  applyChoice,
  applyShow,
  biasLabel,
  buyItem,
  canDebut,
  createFans,
  createParty,
  debut,
  divine,
  divinationCost,
  divinationReading,
  effectiveStats,
  equipItem,
  getShop,
  getStoryEvent,
  judgeEnding,
  memberStats,
  performShow,
  recruit,
  settle,
  switchParty,
} from '@idollife/core';
import type {
  ActionCategory,
  Ending,
  EquipItem,
  RunState,
  ScheduleItem,
  SettleResult,
} from '@idollife/core';
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
const RUN_END = T0 + RUN_LENGTH_MS;

const initialRun: RunState = {
  at: T0,
  stamina: 100,
  money: START_MONEY,
  stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
  axes: { self: 50, others: 50, fit: 50 },
  fans: createFans(0),
  debuted: false,
  parties: [],
  activePartyId: null,
  inventory: [],
  equipped: {},
  flags: {},
  pendingEvent: null,
  log: [],
};

const STAT_LABEL: Record<string, string> = {
  vocal: '演唱',
  dance: '舞蹈',
  acting: '演技',
  talk: '口才',
};

type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'expired';
type BagTab = 'equip' | 'consume' | 'other';

function totalFans(run: RunState): number {
  return Object.values(run.fans.byType).reduce((a, b) => a + b, 0);
}

function fmtGameTime(t: number): string {
  const day = Math.floor((t - T0) / DAY_MS) + 1;
  const d = new Date(t);
  return `第 ${day} 天 · ${String(d.getUTCHours()).padStart(2, '0')}:${String(
    d.getUTCMinutes(),
  ).padStart(2, '0')}`;
}

function dayLabel(startAt: number, now: number): string {
  const diff = Math.floor((startAt - T0) / DAY_MS) - Math.floor((now - T0) / DAY_MS);
  if (diff <= 0) return '今天';
  if (diff === 1) return '明日';
  if (diff === 2) return '后天';
  return `第 ${diff + 1} 天`;
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
  expired: '登录已过期',
};

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          {onClose && (
            <button className="icon-btn" onClick={onClose}>
              ×
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function AuthForm({
  submitLabel,
  onDone,
}: {
  submitLabel: string;
  onDone: (user: AuthUser) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fn = mode === 'login' ? signIn : signUp;
    const res = await fn(email.trim(), password);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const u = await getSessionUser();
    if (u) onDone(u);
    else setError('登录成功但拿不到会话，请重试');
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-tabs">
        <button
          type="button"
          className={mode === 'login' ? 'tab active' : 'tab'}
          onClick={() => setMode('login')}
        >
          登录
        </button>
        <button
          type="button"
          className={mode === 'register' ? 'tab active' : 'tab'}
          onClick={() => setMode('register')}
        >
          注册
        </button>
      </div>
      <label className="field">
        <span>邮箱</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </label>
      <label className="field">
        <span>密码</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 6 位"
          minLength={6}
          required
        />
      </label>
      {error && <p className="auth-error">{error}</p>}
      <button className="primary wide" disabled={busy}>
        {busy ? '处理中…' : submitLabel}
      </button>
    </form>
  );
}

function AppInner() {
  const boot = useRef(loadSave()).current;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

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

  const [showActions, setShowActions] = useState(false);
  const [showDivination, setShowDivination] = useState(false);
  const [reading, setReading] = useState<{ self: string; others: string; fit: string } | null>(null);
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [partyName, setPartyName] = useState('');
  const [bagTab, setBagTab] = useState<BagTab>('equip');
  const [forceLogin, setForceLogin] = useState(false);

  const pulledFor = useRef<string | null>(null);

  const [snapshot, setSnapshot] = useState<{ run: RunState; schedule: ScheduleItem[] } | null>(null);

  useEffect(() => {
    void getSessionUser().then((u) => {
      setUser(u);
      setChecking(false);
    });
    return onAuthChange((u) => {
      if (!u) pulledFor.current = null;
      setUser(u);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    if (pulledFor.current === user.id) return;
    pulledFor.current = user.id;
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

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: ScheduleItem[] }>();
    for (const s of schedule) {
      const label = dayLabel(s.startAt, run.at);
      const g = map.get(label) ?? { label, items: [] };
      g.items.push(s);
      map.set(label, g);
    }
    return [...map.values()];
  }, [schedule, run.at]);

  const party = activeParty(run);

  async function pushSync(
    prevRun: RunState,
    prevSchedule: ScheduleItem[],
    from: number,
    to: number,
    local: SettleResult,
  ) {
    const token = await getAccessToken();
    if (!token) {
      setSyncStatus('expired');
      setForceLogin(true);
      return;
    }

    setSyncStatus('syncing');
    const outcome = await syncRun(
      { runId, run: prevRun, schedule: prevSchedule, from, to, seed },
      token,
    );

    if (outcome.kind === 'unauthorized') {
      setSyncStatus('expired');
      setForceLogin(true);
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

  async function pushWholeState(next: RunState) {
    const token = await getAccessToken();
    if (!token) {
      setForceLogin(true);
      return;
    }
    const res = await pushChoice(runId, next, token);
    if (res) setRevision(res.revision);
  }

  function requireLogin(): boolean {
    if (user) return true;
    setForceLogin(true);
    return false;
  }

  function addAction(actionId: string) {
    const action = ACTIONS[actionId];
    if (!action) return;

    const startAt = Math.max(lastEnd, run.at);
    const dayIndex = Math.floor((startAt - T0) / DAY_MS);
    const weekday = new Date(T0 + dayIndex * DAY_MS).getUTCDay();
    const cap = weekday === 0 || weekday === 6 ? DAILY_ACTIONS.weekend : DAILY_ACTIONS.weekday;
    const used = schedule.filter(
      (s) => Math.floor((s.startAt - T0) / DAY_MS) === dayIndex,
    ).length;

    if (used >= cap) {
      setNotice(`这一天最多 ${cap} 个行动，换一天吧。`);
      return;
    }

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

  function removeItem(id: string) {
    setSchedule((prev) => prev.filter((s) => s.id !== id));
  }

  function toggleStop(id: string) {
    setSchedule((prev) => prev.map((s) => (s.id === id ? { ...s, stopAfter: !s.stopAfter } : s)));
  }

  function advance() {
    if (!requireLogin()) return;
    if (schedule.length === 0) return;

    setSnapshot({ run, schedule });

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
          : result.stoppedReason === 'money'
            ? `钱不够，只执行了 ${result.executed.length} 个行动。`
            : result.stoppedReason === 'stopped'
              ? '到你说的那个点停下了。'
              : result.stoppedReason === 'event'
                ? '有件事需要你决定。'
                : `执行了 ${result.executed.length} 个行动。`,
      );
    }

    void pushSync(prevRun, prevSchedule, from, to, result);
  }

  function stopCurrent() {
    const ok = window.confirm(
      '确定停止当前行程吗？\n\n本批行程作废：拿不到属性点，触发的事件也会失效。',
    );
    if (!ok) return;

    if (snapshot) {
      setRun(snapshot.run);
      setNotice('本批行程已作废。');
      void pushWholeState(snapshot.run);
    } else {
      setNotice('排程已清空（没有可回滚的本批记录）。');
    }
    setSchedule([]);
    setSnapshot(null);
  }

  function openPartyModal() {
    if (!run.debuted) {
      window.alert('出道后才能组建组合。先提升属性，达到出道条件吧。');
      return;
    }
    setPartyName('');
    setShowPartyModal(true);
  }

  function confirmCreateParty() {
    const { state } = createParty(run, partyName);
    setRun(state);
    setShowPartyModal(false);
    setNotice('组合创建好了。');
    void pushWholeState(state);
  }

  function doRecruit() {
    if (!party) {
      setNotice('还没有组合，招募不了。');
      return;
    }
    const { state, result } = recruit(run, `${seed}:recruit:${run.log.length}:${Date.now()}`);
    if (result === 'poor') {
      setNotice('钱不够招募了。');
      return;
    }
    if (result === 'no-party') {
      setNotice('还没有组合，招募不了。');
      return;
    }
    setRun(state);
    setNotice(state.log.at(-1)?.text ?? '');
    void pushWholeState(state);
  }

  function doSwitchParty(id: string) {
    setRun(switchParty(run, id));
  }

  function doShow() {
    if (phase !== 'playing' || run.pendingEvent) return;
    const result = performShow(run, `${seed}:show:${run.log.length}`);
    const next = applyShow(run, result);
    setRun(next);
    setNotice(`演出 ${result.grade}：${result.report[0]}`);
    void pushWholeState(next);
  }

  function doDivine() {
    const { state, result, cost } = divine(run);
    if (result === 'poor') {
      setNotice(`占卜要 ${cost}，钱不够。`);
      return;
    }
    setRun(state);
    setReading(divinationReading(state));
    setNotice(`花 ${cost} 占了一卦。`);
    void pushWholeState(state);
  }

  function doDebut() {
    const next = debut(run);
    setRun(next);
    setNotice('出道了！现在可以组建组合。');
    void pushWholeState(next);
  }

  function doBuy(item: EquipItem) {
    const { state, result } = buyItem(run, item);
    if (result !== 'ok') {
      setNotice('钱不够。');
      return;
    }
    setRun(state);
    setNotice(state.log.at(-1)?.text ?? '');
    void pushWholeState(state);
  }

  function doEquip(item: EquipItem) {
    const next = equipItem(run, item.id);
    setRun(next);
    setNotice(`换上了「${item.name}」。`);
    void pushWholeState(next);
  }

  async function choose(choiceId: string) {
    if (!run.pendingEvent) return;
    const next = applyChoice(run, run.pendingEvent, choiceId);
    setRun(next);
    setNotice('选择已记录。');
    await pushWholeState(next);
  }

  function decide(d: 'stay' | 'backstage' | 'leave') {
    setEnding(judgeEnding(run, d));
    setPhase('ended');
    setNotice(null);
    void pushWholeState(run);
  }

  if (!supabase) {
    return (
      <div className="app">
        <div className="panel">
          <h2>未配置后端</h2>
          <p className="muted">缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，登录不可用。</p>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="app">
        <p className="muted center">加载中…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="landing">
        <h1 className="landing-title">偶像生活</h1>
        <p className="landing-sub">纯文字偶像养成 · 慢节奏 · 每天几分钟</p>
        <div className="panel landing-card">
          <AuthForm submitLabel="开始游戏" onDone={(u) => setUser(u)} />
          <p className="muted small">登录后才会开始，进度保存在云端。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="bar">
        <span className="brand">idollife</span>
        <span className="clock">{fmtGameTime(run.at)}</span>
        <span className="spacer" />
        <span className="muted small">{user.email}</span>
        <button className="link-btn" onClick={() => void signOut()}>
          退出
        </button>
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
          <div className="stat">
            <span className="k">资金</span>
            <span className="v">{run.money}</span>
          </div>
          <div className="stat">
            <span className="k">粉丝</span>
            <span className="v">{totalFans(run)}</span>
          </div>
        </div>
        <div className="row">
          <button onClick={() => setShowDivination(true)}>占卜</button>
          {canDebut(run) && (
            <button className="primary" onClick={doDebut}>
              出道
            </button>
          )}
          {syncStatus !== 'local' && (
            <span className={`chip chip-${syncStatus}`}>{SYNC_TEXT[syncStatus]}</span>
          )}
        </div>
        <p className="muted saved">
          {savedAt ? `已保存 ${new Date(savedAt).toLocaleTimeString()}` : '尚未保存'}
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>行程</h2>
          <button onClick={() => setShowActions(true)}>安排行动</button>
        </div>

        {schedule.length === 0 ? (
          <p className="muted">还没有安排。点「安排行动」加几个。</p>
        ) : (
          <div className="days">
            {groups.map((g) => (
              <div key={g.label} className="day">
                <ul className="sched">
                  {g.items.map((s, i) => {
                    const a = ACTIONS[s.actionId];
                    return (
                      <li key={s.id}>
                        <button
                          className={s.stopAfter ? 'stop-btn on' : 'stop-btn'}
                          title="执行到这里就停止推进"
                          onClick={() => toggleStop(s.id)}
                        >
                          ⏹
                        </button>
                        <span className="when">{g.label}</span>
                        <span className="idx">行动 {i + 1}</span>
                        <span className="name">{a?.name ?? s.actionId}</span>
                        <span className="dur">{Math.round((s.endAt - s.startAt) / MIN)} 分</span>
                        <button className="del" onClick={() => removeItem(s.id)}>
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="row">
          <button className="primary" onClick={advance} disabled={schedule.length === 0}>
            开始推进
          </button>
          <button onClick={stopCurrent} disabled={!snapshot && schedule.length === 0}>
            停止当前行程
          </button>
          <button onClick={doShow} disabled={run.stamina < 30 || phase !== 'playing'}>
            参加演出
          </button>
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
        <div className="panel-head">
          <h2>组合{party ? ` · ${party.name}` : ''}</h2>
          <button onClick={openPartyModal}>{party ? '创建新组合' : '创建组合'}</button>
        </div>

        {run.parties.length > 1 && (
          <div className="row wrap">
            {run.parties.map((p) => (
              <button
                key={p.id}
                className={p.id === run.activePartyId ? 'tab active' : 'tab'}
                onClick={() => doSwitchParty(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {!party ? (
          <p className="muted">
            {run.debuted ? '还没有组合。先创建一个。' : '出道后才能组建组合。'}
          </p>
        ) : party.members.length === 0 ? (
          <p className="muted">组合里还没有成员。</p>
        ) : (
          <ul className="party">
            {party.members.map((m) => {
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
          <button
            className="primary"
            onClick={doRecruit}
            disabled={!party || run.money < RECRUIT_COST}
          >
            招募
            <small>-{RECRUIT_COST}</small>
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>背包（{run.inventory.length}）</h2>
        <div className="tabs">
          {(['equip', 'consume', 'other'] as BagTab[]).map((t) => (
            <button
              key={t}
              className={bagTab === t ? 'tab active' : 'tab'}
              onClick={() => setBagTab(t)}
            >
              {t === 'equip' ? '装备' : t === 'consume' ? '消耗' : '其他'}
            </button>
          ))}
        </div>

        {bagTab === 'equip' ? (
          run.inventory.length === 0 ? (
            <p className="muted">还没有装备。</p>
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
          )
        ) : (
          <p className="muted">暂无物品。</p>
        )}

        <p className="muted small">
          实际属性：
          {Object.entries(effectiveStats(run))
            .map(([k, v]) => `${STAT_LABEL[k]} ${v}`)
            .join(' · ')}
        </p>
      </section>

      <section className="panel">
        <h2>日志</h2>
        {run.log.length === 0 ? (
          <p className="muted">还没有发生什么。</p>
        ) : (
          <ul className="log">
            {[...run.log]
              .reverse()
              .slice(0, 40)
              .map((l, i) => (
                <li key={`${l.at}-${i}`}>
                  <span className="muted">{fmtGameTime(l.at)}</span>
                  <span>{l.text}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      {run.pendingEvent &&
        (() => {
          const ev = getStoryEvent(run.pendingEvent);
          if (!ev) return null;
          return (
            <Modal title="需要你决定">
              <h4>{ev.title}</h4>
              <p>{ev.text}</p>
              <div className="choices">
                {ev.choices.map((c) => (
                  <button key={c.id} onClick={() => void choose(c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </Modal>
          );
        })()}

      {showActions && (
        <Modal title="安排行动" onClose={() => setShowActions(false)}>
          {(['growth', 'recover', 'work'] as ActionCategory[]).map((cat) => {
            const list = ACTION_LIST.filter((a) => a.category === cat);
            if (list.length === 0) return null;
            return (
              <div key={cat} className="action-group">
                <h4>{CATEGORY_LABEL[cat]}</h4>
                <div className="actions">
                  {list.map((a) => (
                    <button key={a.id} onClick={() => addAction(a.id)}>
                      {a.name}
                      <small>
                        {a.stamina > 0 ? `体力 +${a.stamina}` : `体力 ${a.stamina}`}
                        {a.cost ? ` · ¥${a.cost}` : ''}
                        {a.money ? ` · +¥${a.money}` : ''}
                      </small>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </Modal>
      )}

      {showDivination && (
        <Modal title="占卜" onClose={() => setShowDivination(false)}>
          {reading ? (
            <div className="reading">
              <p>自我：{reading.self}</p>
              <p>他人：{reading.others}</p>
              <p>适配：{reading.fit}</p>
            </div>
          ) : (
            <p className="muted">还没占过。占卜能看到你现在的状态倾向。</p>
          )}
          <div className="row">
            <button className="primary" onClick={doDivine} disabled={run.money < divinationCost(run)}>
              占一卦
              <small>-{divinationCost(run)}</small>
            </button>
          </div>
        </Modal>
      )}

      {showPartyModal && (
        <Modal title="创建组合" onClose={() => setShowPartyModal(false)}>
          <label className="field">
            <span>组合名</span>
            <input
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder={`组合 ${run.parties.length + 1}`}
            />
          </label>
          <div className="row">
            <button className="primary" onClick={confirmCreateParty}>
              创建
            </button>
          </div>
        </Modal>
      )}

      {phase === 'deciding' && (
        <Modal title="两年了">
          <h4>你还要留在这个圈子吗？</h4>
          <div className="choices">
            <button onClick={() => decide('stay')}>留在台前</button>
            <button onClick={() => decide('backstage')}>转幕后</button>
            <button onClick={() => decide('leave')}>离开</button>
          </div>
        </Modal>
      )}

      {phase === 'ended' && ending && (
        <Modal title="结局">
          <h4 className="ending-title">{ending.title}</h4>
          <p>{ending.text}</p>
          <button
            className="primary"
            onClick={() => {
              clearSave();
              const fresh = createSave(initialRun, 'run-demo');
              setRunId(fresh.runId);
              setRun(initialRun);
              setSchedule([]);
              setRevision(0);
              setEnding(null);
              setPhase('playing');
            }}
          >
            再来一次
          </button>
        </Modal>
      )}

      {forceLogin && (
        <Modal title="登录已过期，请重新登录">
          <AuthForm
            submitLabel="继续"
            onDone={() => {
              setForceLogin(false);
              setSyncStatus('local');
            }}
          />
        </Modal>
      )}
    </div>
  );
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[idollife] render error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="panel">
            <h2>页面出错了</h2>
            <p className="muted">{this.state.error.message}</p>
            <p className="muted small">
              如果浏览器装了网页翻译插件（比如沉浸式翻译），请在本站关掉它——它会改写页面结构，导致应用崩溃白屏。
            </p>
            <button className="primary" onClick={() => window.location.reload()}>
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}