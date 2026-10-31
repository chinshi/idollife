import { Component, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACTION_LIST,
  ACTIONS,
  CATEGORY_LABEL,
  DAILY_SLOTS,
  DAY_MS,
  SHOW_ACTION_ID,
  SHOW_DURATION_MS,
  SHOW_SLOTS,
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
  startedAt: T0,
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
  eventQueue: [],
  log: [],
};

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekdayName(dayIndex: number): string {
  return WEEKDAY_NAMES[(dayIndex + 4) % 7]!;
}

const STAT_LABEL: Record<string, string> = {
  vocal: '演唱',
  dance: '舞蹈',
  acting: '演技',
  talk: '口才',
};

type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'expired';
type SysTab = 'shop' | 'bag';
type BagTab = 'equip' | 'consume' | 'other';
type LogTab = 'all' | 'event' | 'stat';

function totalFans(run: RunState): number {
  return Object.values(run.fans.byType).reduce((a, b) => a + b, 0);
}

function fmtGameTime(t: number): string {
  const day = Math.floor((t - T0) / DAY_MS) + 1;
  return `第 ${day} 天`;
}

function dayOf(t: number): number {
  return Math.floor((t - T0) / DAY_MS);
}

function dayLabel(startAt: number, now: number): string {
  const d = dayOf(startAt);
  const cur = dayOf(now);
  if (d === cur) return '今天';
  if (d === cur - 1) return '昨天';
  if (d === cur + 1) return '明天';
  const week = Math.floor(d / 7) + 1;
  return `第${week}周 ${weekdayName(d)}`;
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

function CrashBanner({ msg, onClose }: { msg: string | null; onClose: () => void }) {
  if (!msg) return null;
  return (
    <div className="crash-banner">
      <div className="crash-text">
        <strong>页面出错了：</strong>
        <span>{msg.split('\n')[0]}</span>
      </div>
      <button className="icon-btn" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={wide ? 'modal wide' : 'modal'} onClick={(e) => e.stopPropagation()}>
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
  const [authLost, setAuthLost] = useState(false);
  const [crash, setCrash] = useState<string | null>(null);
  const hadUser = useRef(false);
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
  const [sysTab, setSysTab] = useState<SysTab>('shop');
  const [logTab, setLogTab] = useState<LogTab>('all');
  const [historyLimit, setHistoryLimit] = useState(9);
  const [forceLogin, setForceLogin] = useState(false);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [gameNow, setGameNow] = useState<number>(boot?.run?.at ?? T0);
  const runRef = useRef<RunState>(boot?.run ?? initialRun);
  const scheduleRef = useRef<ScheduleItem[]>(boot?.schedule ?? []);
  const batchRef = useRef<{ from: number; prevRun: RunState; prevSchedule: ScheduleItem[] } | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const resumeAfterEvent = useRef(false);
  const dbgLines = useRef<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [debugText, setDebugText] = useState('');

  const pulledFor = useRef<string | null>(null);

  const [snapshot, setSnapshot] = useState<{ run: RunState; schedule: ScheduleItem[] } | null>(null);

  useEffect(() => {
    const onErr = (e: ErrorEvent) => setCrash(e.error?.stack ?? e.message);
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e.reason as { stack?: string; message?: string } | undefined;
      setCrash(r?.stack ?? String(r?.message ?? r));
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);

  useEffect(() => {
    void getSessionUser().then((u) => {
      setUser(u);
      setChecking(false);
    });
    return onAuthChange((u) => {
      if (u) {
        hadUser.current = true;
        setAuthLost(false);
      } else if (hadUser.current) {
        // 曾经登录过：不要把整页换成登录页，改用弹窗强制重登
        setAuthLost(true);
        setForceLogin(true);
        pulledFor.current = null;
      }
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

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  useEffect(() => {
    if (!running) return;

    const startReal = Date.now();
    const startGame = runRef.current.at;

    const id = window.setInterval(() => {
      const target = Math.max(runRef.current.at, startGame + (Date.now() - startReal) * speed);
      setGameNow(target);

      const prev = runRef.current;
      const prevSched = scheduleRef.current;
      const result = settle(prev, prevSched, prev.at, target, seed, { endAt: RUN_END });

      if (result.executed.length > 0) {
        const nextSched = markExecuted(prevSched, result.executed);
        runRef.current = result.state;
        scheduleRef.current = nextSched;
        setRun(result.state);
        setSchedule(nextSched);
        dbg('执行 ' + result.executed.join(',') + ' → at=' + String(result.state.at));
      }

      const stillPending = scheduleRef.current.some((s) => !s.done);
      if (result.stoppedReason === 'exhausted' && stillPending) {
        dbg('等待下一个行动 startAt=' + String(nextStart()));
        return;
      }

      if (result.stoppedReason !== 'time') {
        dbg('停止 reason=' + String(result.stoppedReason) + ' 剩=' + String(
          scheduleRef.current.filter((s) => !s.done).length,
        ));
        setRunning(false);
        const batch = batchRef.current;
        if (batch) endBatch(result, batch);
      }
    }, 200);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, seed, speed]);


  const lastEnd = useMemo(
    () => schedule.filter((s) => !s.fixed).reduce((max, s) => Math.max(max, s.endAt), run.at),
    [schedule, run.at],
  );


  const pending = useMemo(() => schedule.filter((s) => !s.done), [schedule]);

  const nextItem =
    pending.length > 0
      ? [...pending].sort((a, b) => a.startAt - b.startAt)[0] ?? null
      : null;
  const nextDuration = nextItem ? Math.max(1, nextItem.endAt - nextItem.startAt) : 1;
  const remainMs =
    running && nextItem
      ? Math.min(nextDuration, Math.max(0, nextItem.endAt - gameNow))
      : 0;
  const progress =
    running && nextItem
      ? Math.min(1, Math.max(0, (gameNow - nextItem.startAt) / Math.max(1, nextItem.endAt - nextItem.startAt)))
      : 0;

  const todayIndex = Math.floor((run.at - T0) / DAY_MS);
  const usedToday = schedule
    .filter((s) => Math.floor((s.startAt - T0) / DAY_MS) === todayIndex)
    .reduce((n, s) => n + (s.actionId === SHOW_ACTION_ID ? SHOW_SLOTS : 1), 0);

  // 跨日 / 开始推进时，把「现在」滚到可视区中间
  useEffect(() => {
    const box = timelineRef.current;
    if (!box) return;
    const el = box.querySelector('.tl-now');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const delta = r.top - b.top - box.clientHeight / 2 + 24;
    box.scrollTo({ top: Math.max(0, box.scrollTop + delta), behavior: 'smooth' });
  }, [todayIndex, running, historyLimit]);

  /** 竖向时间轴：按天分组，标出「现在」的位置 */
  const timeline = useMemo(() => {
    const items = [...schedule].sort((a, b) => a.startAt - b.startAt);
    const doneItems = items.filter((s) => s.done);
    const pendingItems = items.filter((s) => !s.done);
    const shownDone = doneItems.slice(-historyLimit);

    const nodes: Array<
      | { type: 'day'; id: string; label: string }
      | { type: 'item'; id: string; item: ScheduleItem; index: number; label: string }
      | { type: 'now'; id: string }
      | { type: 'more'; id: string; hidden: number }
    > = [];

    if (doneItems.length > shownDone.length) {
      nodes.push({ type: 'more', id: 'more', hidden: doneItems.length - shownDone.length });
    }

    let lastDay = Number.NaN;
    const perDay = new Map<number, number>();

    const pushItem = (it: ScheduleItem) => {
      const d = Math.floor((it.startAt - T0) / DAY_MS);
      if (d !== lastDay) {
        nodes.push({ type: 'day', id: `d-${d}`, label: dayLabel(it.startAt, run.at) });
        lastDay = d;
      }
      const n = (perDay.get(d) ?? 0) + 1;
      perDay.set(d, n);
      nodes.push({
        type: 'item',
        id: it.id,
        item: it,
        index: n,
        label: dayLabel(it.startAt, run.at),
      });
    };

    const firstPending = pendingItems[0];
    const shown = [...shownDone, ...pendingItems].sort((a, b) => a.startAt - b.startAt);

    let nowPlaced = false;
    if (firstPending && !running) {
      nodes.push({ type: 'now', id: 'now' });
      nowPlaced = true;
    }
    for (const it of shown) {
      pushItem(it);
      if (it.id === firstPending?.id && running) {
        nodes.push({ type: 'now', id: 'now' });
        nowPlaced = true;
      }
    }
    if (!nowPlaced) nodes.push({ type: 'now', id: 'now' });

    return nodes;
  }, [schedule, run.at, running, historyLimit]);
  const visibleLog = useMemo(() => {
    const list = [...run.log].reverse();
    const filtered = list.filter((l) => {
      if (logTab === 'event') {
        return l.kind === 'choice' || l.kind === 'routine' || l.actionId.startsWith('event:');
      }
      if (logTab === 'stat') {
        return Object.keys(l.statDelta).length > 0 || !!l.axesChanged;
      }
      return true;
    });
    return filtered.slice(0, 60);
  }, [run.log, logTab]);

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

  async function pushWholeState(next: RunState, overrideRunId?: string) {
    const token = await getAccessToken();
    if (!token) {
      setForceLogin(true);
      return;
    }
    const res = await pushChoice(overrideRunId ?? runId, next, token);
    if (res) setRevision(res.revision);
  }

  function requireLogin(): boolean {
    if (user) return true;
    setForceLogin(true);
    return false;
  }

  /** 某一天已经占用了几个行动位（演出占 3 个） */
  function slotsOnDay(dayIndex: number): number {
    return schedule
      .filter((s) => Math.floor((s.startAt - T0) / DAY_MS) === dayIndex)
      .reduce((n, s) => n + (s.actionId === SHOW_ACTION_ID ? SHOW_SLOTS : 1), 0);

  }

  function addAction(actionId: string) {
    const action = ACTIONS[actionId];
    if (!action) return;

    // 从最早的可用位置开始，排满就自动顺延到下一天
    let dayIndex = Math.floor((Math.max(lastEnd, run.at) - T0) / DAY_MS);
    let guard = 0;
    while (slotsOnDay(dayIndex) >= DAILY_SLOTS && guard < 60) {
      dayIndex += 1;
      guard += 1;
    }

    const dayStart = T0 + dayIndex * DAY_MS;
    const usedSlots = slotsOnDay(dayIndex);
    const startAt = Math.max(run.at, dayStart + usedSlots * action.durationMs);

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

  function dbg(msg: string) {
    const line = new Date().toISOString().slice(11, 19) + ' ' + msg;
    dbgLines.current = [...dbgLines.current.slice(-199), line];
    try {
      localStorage.setItem('idollife:debug:v1', dbgLines.current.join('\n'));
    } catch {
      /* 忽略 */
    }
  }

  function nextStart(): number {
    const pend = scheduleRef.current.filter((s) => !s.done);
    return pend.length > 0 ? pend[0]!.startAt : 0;
  }

  function markExecuted(prev: ScheduleItem[], executed: string[]): ScheduleItem[] {
    const marked = prev.map((s) => (executed.includes(s.id) ? { ...s, done: true } : s));
    const doneIds = marked.filter((s) => s.done).map((s) => s.id);
    const keep = new Set(doneIds.slice(-60));
    return marked.filter((s) => !s.done || keep.has(s.id));
  }

  function endBatch(result: SettleResult, batch: { from: number; prevRun: RunState; prevSchedule: ScheduleItem[] }) {
    if (result.stoppedReason === 'ending') {
      setPhase('deciding');
      setNotice('两年到了。最后做一个决定吧。');
    } else {
      setNotice(
        result.stoppedReason === 'stamina'
          ? '体力不足，行程停下了。'
          : result.stoppedReason === 'money'
            ? '钱不够，行程停下了。'
            : result.stoppedReason === 'stopped'
              ? '到你说的那个点停下了。'
              : result.stoppedReason === 'event'
                ? '有件事需要你决定。'
                : '这一批行程走完了。',
      );
    }
    dbg('批次结束 reason=' + String(result.stoppedReason) + ' at=' + String(result.state.at));
    if (result.stoppedReason === 'event') resumeAfterEvent.current = true;
    void pushSync(batch.prevRun, batch.prevSchedule, batch.from, result.state.at, result);
    setSnapshot(null);
    batchRef.current = null;
  }

  function advance() {
    if (!requireLogin()) return;
    if (pending.length === 0 || running) return;
    if (run.pendingEvent) {
      setNotice('先处理重点事件，时间已暂停。');
      setActiveEventId(run.pendingEvent);
      return;
    }

    setSnapshot({ run, schedule });
    batchRef.current = { from: run.at, prevRun: run, prevSchedule: schedule };
    setGameNow(run.at);
    setRunning(true);
    dbg('开始推进 pending=' + String(pending.length) + ' at=' + String(run.at));
  }

  function stopCurrent() {
    if (!running && !snapshot) return;
    const ok = window.confirm(
      '确定停止当前行程吗？\n\n本批行程作废：拿不到属性点，触发的事件也会失效。',
    );
    if (!ok) return;

    dbg('手动停止');
    setRunning(false);
    batchRef.current = null;
    resumeAfterEvent.current = false;

    if (snapshot) {
      setRun(snapshot.run);
      setSchedule([]);
      setGameNow(snapshot.run.at);
      setNotice('本批行程已作废。');
      void pushWholeState(snapshot.run);
    } else {
      setSchedule([]);
      setNotice('排程已清空。');
    }
    setSnapshot(null);
  }

  /** 仅测试用：清空本地存档，从头新建一局并覆盖云端 */
  function restartForTest() {
    const ok = window.confirm('重新开始（测试用）\n\n会清空本地存档并新建一局，确定吗？');
    if (!ok) return;

    const fresh = createSave(initialRun, 'run-demo');
    clearSave();
    dbg('重新开始（测试）');
    setRunning(false);
    batchRef.current = null;
    resumeAfterEvent.current = false;
    setSnapshot(null);
    setGameNow(T0);
    setRunId(fresh.runId);
    setRun(initialRun);
    setSchedule([]);
    setRevision(0);
    setEnding(null);
    setPhase('playing');
    setNotice('已新建一局。');
    void pushWholeState(initialRun, fresh.runId);
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

  /** 参加演出：排在最近的周六/周日，占满当天 3 个行动位 */
  function addShow() {
    if (phase !== 'playing') return;

    let dayIndex = Math.floor((Math.max(lastEnd, run.at) - T0) / DAY_MS);
    let dayStart = T0 + dayIndex * DAY_MS;

    for (let i = 0; i < 8; i++) {
      const weekday = (dayIndex + 4) % 7;
      const isWeekend = weekday === 0 || weekday === 6;
      if (isWeekend && slotsOnDay(dayIndex) === 0) break;
      dayIndex += 1;
      dayStart += DAY_MS;
    }

    const weekday = (dayIndex + 4) % 7;
    if (weekday !== 0 && weekday !== 6) {
      setNotice('最近一周没有空闲的周末了。');
      return;
    }

    const startAt = Math.max(dayStart, run.at, lastEnd);
    setSchedule((prev) => [
      ...prev,
      {
        id: `show-${Date.now()}`,
        actionId: SHOW_ACTION_ID,
        fixed: true,
        startAt,
        endAt: startAt + SHOW_DURATION_MS,
      },
    ]);
    setNotice('演出安排在周末，占满当天 3 个行动位。');
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

  async function choose(eventId: string, choiceId: string) {
    const wasMajor = run.pendingEvent === eventId;
    const next = applyChoice(run, eventId, choiceId);
    setActiveEventId(null);
    setRun(next);
    setNotice('选择已记录。');
    dbg('选择 ' + choiceId);
    await pushWholeState(next);

    const rest = schedule.filter((s) => !s.done);
    if (wasMajor && resumeAfterEvent.current && rest.length > 0) {
      resumeAfterEvent.current = false;
      setSnapshot(null);
      batchRef.current = { from: next.at, prevRun: next, prevSchedule: schedule };
      setGameNow(next.at);
      setRunning(true);
      dbg('事件处理完，自动续跑 ' + String(rest.length) + ' 个');
    }
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

  if (!user && !authLost) {
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
      <CrashBanner msg={crash} onClose={() => setCrash(null)} />
      <header className="bar">
        <span className="brand">idollife</span>
        <span className="clock">
          第 {todayIndex + 1} 天 · {weekdayName(todayIndex)} · 今日剩余{' '}
          {Math.max(0, 3 - usedToday)}/3
        </span>
        <span className="spacer" />
        <span className="muted small">{user?.email ?? '已离线'}</span>
        <button
          className="link-btn"
          onClick={() => {
            setDebugText(localStorage.getItem('idollife:debug:v1') ?? '(空)');
            setShowDebug(true);
          }}
        >
          日志
        </button>
        <button className="link-btn" onClick={restartForTest}>
          重新开始
        </button>
        <button className="link-btn" onClick={() => void signOut()}>
          退出
        </button>
      </header>

      <main className="cols">
        <div className="col-main">
      <section className="panel">
        <div className="panel-head">
          <h2>日志</h2>
        </div>
        <div className="tabs">
          {(['all', 'event', 'stat'] as LogTab[]).map((t) => (
            <button
              key={t}
              className={logTab === t ? 'tab active' : 'tab'}
              onClick={() => setLogTab(t)}
            >
              {t === 'all' ? '全部' : t === 'event' ? '事件' : '属性'}
            </button>
          ))}
        </div>
        {visibleLog.length === 0 ? (
          <p className="muted small">还没有记录。</p>
        ) : (
          <ul className="log dense">
            {visibleLog.map((l, i) => (
              <li key={`${l.at}-${i}`}>
                <span className="log-time">{fmtGameTime(l.at)}</span>
                <span className="log-text">{l.text}</span>
                {l.axesChanged && <em className="tag hidden-tag">隐藏属性变动</em>}
              </li>
            ))}
          </ul>
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
        <div className="panel-head">
          <h2>系统</h2>
          <span className="muted small">装备 {run.inventory.length} 件</span>
        </div>

        <div className="tabs">
          {(['shop', 'bag'] as SysTab[]).map((t) => (
            <button
              key={t}
              className={sysTab === t ? 'tab active' : 'tab'}
              onClick={() => setSysTab(t)}
            >
              {t === 'shop' ? '商店' : '物品'}
            </button>
          ))}
        </div>

        {sysTab === 'shop' && (
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
        )}

        {sysTab === 'bag' && (
          <>
            <div className="tabs sub">
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

            {bagTab === 'equip' &&
              (run.inventory.length === 0 ? (
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
              ))}

            {(bagTab === 'consume' || bagTab === 'other') && (
              <p className="muted">暂无物品。</p>
            )}
          </>
        )}

        <p className="muted small">
          实际属性：
          {Object.entries(effectiveStats(run))
            .map(([k, v]) => `${STAT_LABEL[k]} ${v}`)
            .join(' · ')}
        </p>
      </section>


        </div>

        <aside className="col-side">
          {(run.pendingEvent || run.eventQueue.length > 0) && (
            <div className={run.pendingEvent ? 'event-box major' : 'event-box'}>
              <div className="event-head">
                {run.pendingEvent ? '重点事件 · 时间已暂停' : '待处理事件'}
              </div>
              {run.pendingEvent && (
                <button
                  className="event-item major"
                  onClick={() => setActiveEventId(run.pendingEvent)}
                >
                  <span>{getStoryEvent(run.pendingEvent)?.title ?? '事件'}</span>
                  <em>立刻处理 →</em>
                </button>
              )}
              {run.eventQueue.map((id) => (
                <button key={id} className="event-item" onClick={() => setActiveEventId(id)}>
                  <span>{getStoryEvent(id)?.title ?? id}</span>
                  <em>处理 →</em>
                </button>
              ))}
            </div>
          )}

          <div className="side-head">
            <button className="primary wide" onClick={() => setShowActions(true)}>
              安排行程
            </button>
          </div>

          <div className="speed-row">
            <span className="muted small">速度</span>
            {[1, 10, 60].map((v) => (
              <button
                key={v}
                className={speed === v ? 'tab active' : 'tab'}
                onClick={() => setSpeed(v)}
              >
                {v}×
              </button>
            ))}
          </div>

          <div className="side-status">
            <div className="side-date">
              第 {todayIndex + 1} 天 · {weekdayName(todayIndex)} · 今日剩余{' '}
              {Math.max(0, 3 - usedToday)}/3
            </div>
            <div className="side-now">
              {running
                ? nextItem
                  ? `进行中 · 还剩 ${Math.ceil(remainMs / 1000)} 秒完成「${
                      ACTIONS[nextItem.actionId]?.name ??
                      (nextItem.actionId === SHOW_ACTION_ID ? '演出' : nextItem.actionId)
                    }」`
                  : '进行中…'
                : '时间已停止'}
            </div>
          </div>

          <div className="timeline" ref={timelineRef}>`n            <div className="timeline-inner">
            {timeline.length === 0 && (
              <p className="muted">还没有安排。点「安排行程」加几个。</p>
            )}

            {timeline.map((node) => {
              if (node.type === 'more') {
                return (
                  <button
                    key={node.id}
                    className="tl-more"
                    onClick={() => setHistoryLimit((n) => n + 9)}
                  >
                    更多（还有 {node.hidden} 条更早的日程）
                  </button>
                );
              }
              if (node.type === 'day') {
                return (
                  <div key={node.id} className="tl-day">
                    {node.label}
                  </div>
                );
              }
              if (node.type === 'now') {
                return (
                  <div key={node.id} className="tl-now">
                    <span className="tl-node now" />
                    <span className="tl-now-text">
                      {running ? (
                        <span className="tl-now-line">
                          <strong>现在</strong>
                          <em className="tl-count">还剩 {Math.ceil(remainMs / 1000)} 秒</em>
                        </span>
                      ) : (
                        <strong>时间已停止</strong>
                      )}
                    </span>
                  </div>
                );
              }

              const a = ACTIONS[node.item.actionId];
              const name =
                a?.name ?? (node.item.actionId === SHOW_ACTION_ID ? '演出' : node.item.actionId);
              const done = !!node.item.done;
              const cls = [
                'tl-item',
                done ? 'done' : '',
                node.item.fixed ? 'fixed' : '',
                node.item.stopAfter ? 'stopped' : '',
              ]
                .filter(Boolean)
                .join(' ');

              const isCurrent = running && nextItem?.id === node.item.id;
              return (
                <div key={node.id} className={isCurrent ? `${cls} current` : cls}>
                  <span className="tl-node" />
                  {isCurrent && (
                    <span
                      className="tl-arrow"
                      style={{ top: `calc(15px + (100% - 15px) * ${progress.toFixed(3)})` }}
                      title="现在"
                    >
                      ▶
                    </span>
                  )}
                  <div className="tl-body">
                    <div className="tl-title">
                      <span className="tl-idx">
                        {node.label} · 行动 {node.index}
                      </span>
                      <span className="tl-name">{name}</span>
                      {node.item.fixed && <span className="tag fixed-tag">固定</span>}
                      {done && <span className="tag done-tag">已完成</span>}
                    </div>
                    <div className="tl-meta">
                      {Math.round((node.item.endAt - node.item.startAt) / MIN)} 分
                      {node.item.stopAfter && ' · 预计到此停止'}
                    </div>
                  </div>
                  {!node.item.fixed && !done && (
                    <div className="tl-actions">
                      <button
                        className={node.item.stopAfter ? 'stop-btn on' : 'stop-btn'}
                        title="执行到这里就停止推进"
                        onClick={() => toggleStop(node.item.id)}
                      >
                        ⏹
                      </button>
                      <button className="del" onClick={() => removeItem(node.item.id)}>
                        ×
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>

          <div className="side-foot">
            <button
              className="primary"
              onClick={advance}
              disabled={pending.length === 0 || running}
            >
              {running ? '推进中…' : '开始推进'}
            </button>
            <button onClick={stopCurrent} disabled={!snapshot && pending.length === 0}>
              停止当前行程
            </button>
            <button onClick={addShow} disabled={phase !== 'playing'}>
              参加演出
            </button>
          </div>
          {notice && <p className="notice">{notice}</p>}
        </aside>
      </main>

      {activeEventId &&
        (() => {
          const ev = getStoryEvent(activeEventId);
          if (!ev) return null;
          return (
            <Modal
              title={ev.major ? '重点事件' : '事件'}
              onClose={() => setActiveEventId(null)}
            >
              <h4>{ev.title}</h4>
              <p>{ev.text}</p>
              <div className="choices">
                {ev.choices.map((c) => (
                  <button key={c.id} onClick={() => void choose(activeEventId, c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </Modal>
          );
        })()}

      {showActions && (
        <Modal title="安排行程" wide onClose={() => setShowActions(false)}>
          <div className="plan">
            <div className="plan-actions">
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
            </div>

            <div className="plan-preview">
              <div className="plan-preview-head">待执行 {pending.length} 个（已完成的不显示）</div>
              {pending.length === 0 ? (
                <p className="muted small">左边点行动，会加到时间轴末尾。</p>
              ) : (
                <ul className="plan-list">
                  {pending.map((s) => {
                    const a = ACTIONS[s.actionId];
                    return (
                      <li key={s.id}>
                        <span className="plan-day">{dayLabel(s.startAt, run.at)}</span>
                        <span className="plan-name">
                          {a?.name ?? (s.actionId === SHOW_ACTION_ID ? '演出' : s.actionId)}
                        </span>
                        <button className="del" onClick={() => removeItem(s.id)}>
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
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

      {showDebug && (
        <Modal title="调试日志" onClose={() => setShowDebug(false)}>
          <pre className="debug-pre">{debugText}</pre>
          <div className="row">
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(debugText);
                setNotice('日志已复制');
              }}
            >
              复制
            </button>
          </div>
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