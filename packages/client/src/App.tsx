import { Component, Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
  DEBUT_THRESHOLD,
  RECRUIT_COOLDOWN_DAYS,
  cooldownLeftDays,
  TASKS,
  taskStatus,
  acceptTask,
  activeTasks,
  completedTasks,
  claimableTasks,
  taskBadgeCount,
  CHANNELS,
  meetFriend,
  inviteFriend,
  canShowAction,
  previewAction,
  remainingTimes,
  createFans,
  STAT_LABEL,
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
import { clearSave, createSave, loadSave, normalizeRun, writeSave } from './state/save';
import { syncRun, fetchLatestRun, pushChoice } from './api/sync';
import {
  getAccessToken,
  getSessionUser,
  refreshAccessToken,
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
  friends: [],
  inventory: [],
  equipped: {},
  flags: {},
  pendingEvent: null,
  eventQueue: [],
  log: [],
};

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function weekdayName(dayIndex: number): string {
  return WEEKDAY_NAMES[dayIndex % 7]!;
}

// 属性名称统一来自 packages/core/data/attributes.json
type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'expired';
type SysTab = 'shop' | 'bag';
type BagTab = 'equip' | 'consume' | 'other';
type LogTab = 'all' | 'event' | 'stat';
type MainTab = 'task' | 'stats' | 'plan' | 'party' | 'friends' | 'shop' | 'divine' | 'bag';

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
  if (d === cur) return `今天（${weekdayName(d)}）`;
  if (d === cur - 1) return `昨天（${weekdayName(d)}）`;
  if (d === cur + 1) return `明天（${weekdayName(d)}）`;
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
  const [planBackup, setPlanBackup] = useState<ScheduleItem[] | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const [planTick, setPlanTick] = useState(0);
  const [partyName, setPartyName] = useState('');
  const [bagTab, setBagTab] = useState<BagTab>('equip');
  const [sysTab, setSysTab] = useState<SysTab>('shop');
  const [logTab, setLogTab] = useState<LogTab>('all');
  const [mainTab, setMainTab] = useState<MainTab>('plan');
  const [lastStop, setLastStop] = useState('');
  const [confirmAction, setConfirmAction] = useState<null | 'stop' | 'restart'>(null);
  const [rightTab, setRightTab] = useState<'stats' | 'bag'>('stats');
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const toggleFlip = (id: string) => {
    setFlippedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const [managing, setManaging] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [friendsTab, setFriendsTab] = useState<'list' | 'meet'>('list');
  const [taskTab, setTaskTab] = useState<'all' | 'accept' | 'active' | 'done'>('all');
  const statTotal = run.stats.vocal + run.stats.dance + run.stats.acting + run.stats.talk;
  const STOP_TEXT: Record<string, string> = {
    stamina: '体力不足，行程停下来了',
    money: '钱不够，行程停下来了',
    exhausted: '这一批行程走完了',
    stopped: '到指定的停止点停下了',
    event: '有事件需要处理',
    ending: '两年到了',
    time: '',
  };
  const [historyLimit, setHistoryLimit] = useState(9);
  const [forceLogin, setForceLogin] = useState(false);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const clockKey = 'idollife:clock:v2';

  /**
   * 读取本地记录的「行动时钟」：
   * 存的是 { 游戏时间, 墙上时间 }，用墙上时间差把离线期间的时间补回来。
   */
  const bootClockRef = useRef<number>(-1);
  if (bootClockRef.current < 0) bootClockRef.current = (() => {
    try {
      const raw = localStorage.getItem(clockKey);
      if (!raw) return 0;
      const data = JSON.parse(raw) as { t?: number; w?: number; speed?: number };
      const t = Number(data.t ?? 0);
      const w = Number(data.w ?? 0);
      if (!Number.isFinite(t) || t <= 0) return 0;

      const speed = Number(data.speed ?? 1) || 1;
      const offline = w > 0 ? Math.max(0, Date.now() - w) : 0;
      const capped = Math.min(offline, 6 * 3600 * 1000); // 最多补 6 小时，防止离谱跳变
      let next = Math.round(t + capped * speed);

      // 不超过最后一条行程的结束时间（避免离线补出天文数字）
      try {
        const saved = loadSave();
        const maxEnd = (saved?.schedule ?? []).reduce((m, s) => Math.max(m, s.endAt), 0);
        if (maxEnd > 0) next = Math.min(next, maxEnd);
      } catch {
        /* 忽略 */
      }

      return next;
    } catch {
      return 0;
    }
  })();
  const bootClock = bootClockRef.current;

  const [gameNow, setGameNow] = useState<number>(
    Math.max(boot?.run?.at ?? T0, bootClock),
  );

  const runRef = useRef<RunState>(boot?.run ?? initialRun);
  const scheduleRef = useRef<ScheduleItem[]>(boot?.schedule ?? []);
  const batchRef = useRef<{ from: number; prevRun: RunState; prevSchedule: ScheduleItem[] } | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [boxH, setBoxH] = useState(0);
  const gameNowRef = useRef<number>(Math.max(boot?.run?.at ?? T0, bootClock));
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
        setRun(normalizeRun(latest.run));
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

  // 每 10 分钟续一次会话，避免长时间挂着后 token 过期
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => {
      void refreshAccessToken();
    }, 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [user]);
  // 记住「当前时钟位置」，刷新后从那里继续，而不是回到行动开始
  useEffect(() => {
    const id = window.setInterval(() => {
      try {
        localStorage.setItem(
          clockKey,
          JSON.stringify({
            t: Math.round(gameNowRef.current),
            w: Date.now(),
            speed,
          }),
        );
      } catch {
        /* 忽略 */
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [clockKey, speed]);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    gameNowRef.current = gameNow;
  }, [gameNow]);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  useEffect(() => {
    if (!running) return;

    const anchorPerf = performance.now();
    const anchorGame = Math.max(runRef.current.at, gameNowRef.current);
    dbg('时钟启动 anchorGame=' + String(anchorGame) + ' speed=' + String(speed));
    let raf = 0;
    let lastProcess = 0;
    let lastBeat = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const nowPerf = performance.now();
      if (nowPerf - lastProcess < 100) return;
      lastProcess = nowPerf;

      const target = Math.max(
        runRef.current.at,
        anchorGame + (nowPerf - anchorPerf) * speed,
      );
      setGameNow(target);

      if (nowPerf - lastBeat > 2000) {
        lastBeat = nowPerf;
        const fp = scheduleRef.current.filter((s) => !s.done).sort((a, b) => a.startAt - b.startAt)[0];
        const rest = fp ? Math.max(0, Math.round((fp.endAt - target) / 1000)) : -1;
        dbg(
          '心跳 target=' + String(Math.round(target)) +
          ' runAt=' + String(runRef.current.at) +
          ' 剩=' + String(rest) + 's',
        );
      }

      // 先清掉已经过期（结束时间早于当前时间）的条，
      // 否则 settle 会跳过它们 → 判定 exhausted → 时间看似不动
      const stale = scheduleRef.current.filter((s) => !s.done && s.startAt < runRef.current.at);
      if (stale.length > 0) {
        const staleIds = new Set(stale.map((s) => s.id));
        const cleaned = scheduleRef.current.filter((s) => !staleIds.has(s.id));
        scheduleRef.current = cleaned;
        setSchedule(cleaned);
        dbg('清理过期行程 ' + String(stale.length) + ' 条');
      }

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
        const next = scheduleRef.current
          .filter((s) => !s.done)
          .sort((a, b) => a.startAt - b.startAt)[0];

        const unknown =
          next && (!ACTIONS[next.actionId] || !previewAction(runRef.current, next.actionId));

        if (unknown) {
          const cleaned = scheduleRef.current.filter((s) => s.id !== next!.id);
          scheduleRef.current = cleaned;
          setSchedule(cleaned);
          dbg('丢弃未知行为 ' + next!.actionId + '（配置里没有）');
        } else if (next && next.startAt > runRef.current.at) {
          // 中间有空档：把时间对齐到它的开始，避免空转
          const healed = { ...runRef.current, at: next.startAt };
          runRef.current = healed;
          setRun(healed);
          dbg('对齐到下一个行动 at=' + String(next.startAt));
        } else if (next) {
          // 重叠：把待执行行程整体顺延，让它们重新首尾相接
          const fixed = repairChain(scheduleRef.current, runRef.current.at);
          scheduleRef.current = fixed;
          setSchedule(fixed);
          dbg('修复重叠行程 at=' + String(runRef.current.at));
        }
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
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, seed, speed]);


  const lastEnd = useMemo(
    () => schedule.reduce((max, s) => Math.max(max, s.endAt), run.at),
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

  /** 每个行动在时间轴上占多少像素（一条行动 ≈ 56px） */
  const pxPerMs = 56 / (ACTION_LIST[0]?.durationMs ?? 60_000);

  const { visibleItems, hiddenCount } = useMemo(() => {
    const done = schedule.filter((s) => s.done);
    const pend = schedule.filter((s) => !s.done);
    const shownDone = done.slice(-historyLimit);
    return {
      visibleItems: [...shownDone, ...pend].sort((a, b) => a.startAt - b.startAt),
      hiddenCount: done.length - shownDone.length,
    };
  }, [schedule, historyLimit]);

  // 测量时间轴可视高度，用来做整数像素居中（避免文字被小数像素模糊）
  // 依赖 user：登录前页面是欢迎页，时间轴元素还不存在，登录后必须重新测量
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;

    const update = () => {
      const h = el.clientHeight;
      if (h > 0) setBoxH(h);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);

    // 兜底：布局完成/字体加载后可能还有一次尺寸变化
    const timers = [80, 250, 600].map((ms) => window.setTimeout(update, ms));

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      ro.disconnect();
    };
  }, [user, checking]);

  // 左侧添加行动后，右侧自动滚到最新一条
  useEffect(() => {
    if (!showActions) return;
    const el = previewRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [planTick, showActions]);

  const baseTime = useMemo(
    () => visibleItems[0]?.startAt ?? run.at,
    [visibleItems, run.at],
  );

  const padY = Math.round(boxH / 2);

  const trackHeight = useMemo(() => {
    if (visibleItems.length === 0) return 0;
    const last = visibleItems[visibleItems.length - 1]!;
    return padY * 2 + Math.max(0, Math.round((last.endAt - baseTime) * pxPerMs)) + 160;
  }, [visibleItems, baseTime, pxPerMs, padY]);

  // 横向时间轴派生：当前行动在正中，左右分别是历史与未来
  const pastItems = useMemo(
    () => visibleItems.filter((s) => s.done).slice(-10),
    [visibleItems],
  );
  const futureItems = useMemo(
    () => visibleItems.filter((s) => !s.done && s.id !== nextItem?.id).slice(0, 10),
    [visibleItems, nextItem?.id],
  );

  const dayBreakLabels = useMemo(() => {
    const m = new Map<string, string>();
    visibleItems.forEach((it, i) => {
      const day = Math.floor((it.startAt - T0) / DAY_MS);
      const prev = visibleItems[i - 1];
      const prevDay = prev ? Math.floor((prev.startAt - T0) / DAY_MS) : -1;
      if (day !== prevDay) m.set(it.id, dayLabel(it.startAt, run.at));
    });
    return m;
  }, [visibleItems, run.at]);
  const pastDateAt = pastItems[0]?.startAt ?? run.at;
  const futureDateAt = futureItems[0]?.startAt ?? nextItem?.startAt ?? run.at;

  const currentPct = nextItem
    ? Math.min(
        1,
        Math.max(0, (gameNow - nextItem.startAt) / Math.max(1, nextItem.endAt - nextItem.startAt)),
      )
    : 0;

  function actionNo(it: { id: string; startAt: number }): number {
    const day = Math.floor((it.startAt - T0) / DAY_MS);
    const sameDay = visibleItems
      .filter((x) => Math.floor((x.startAt - T0) / DAY_MS) === day)
      .sort((a, b) => a.startAt - b.startAt);
    return Math.max(1, sameDay.findIndex((x) => x.id === it.id) + 1);
  }
  // 只在两种时机自动滚动：①开始推进 ②一条行动完成、进入下一条
  const prevRunningRef = useRef(false);
  const prevNextIdRef = useRef<string | null>(null);

  useEffect(() => {
    const started = running && !prevRunningRef.current;
    const advanced = (nextItem?.id ?? null) !== prevNextIdRef.current;
    if (!started && !advanced) return;

    // 元素还没挂载（欢迎页/加载中）就先不记账，等它出现后再滚一次
    const el = timelineRef.current;
    if (!el) return;

    prevRunningRef.current = running;
    prevNextIdRef.current = nextItem?.id ?? null;

    // 横向时间轴：把当前行动滚到可视区中间
    const cur = nextItem;
    const cellEl = cur ? el.querySelector<HTMLElement>(`[data-h-id="${cur.id}"]`) : null;
    if (!cellEl) return;

    const left = Math.max(
      0,
      Math.round(cellEl.offsetLeft + cellEl.offsetWidth / 2 - el.clientWidth / 2),
    );
    dbg('滚动 left=' + String(left) + ' w=' + String(el.clientWidth));

    el.scrollTo({ left, behavior: 'smooth' });
  }, [running, nextItem?.id, run.at, baseTime, pxPerMs, boxH, padY]);

  const dayMarks = useMemo(() => {
    const marks: Array<{ day: number; at: number; label: string }> = [];
    for (const it of visibleItems) {
      const day = Math.floor((it.startAt - T0) / DAY_MS);
      if (marks.length === 0 || marks[marks.length - 1]!.day !== day) {
        marks.push({ day, at: T0 + day * DAY_MS, label: dayLabel(it.startAt, run.at) });
      }
    }
    return marks;
  }, [visibleItems, run.at]);
  // 有新日志 / 刷新页面时，滚到最底部显示最新一条
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;

    const toBottom = () => {
      el.scrollTop = el.scrollHeight;
    };

    toBottom();
    const raf = requestAnimationFrame(toBottom);
    const timer = window.setTimeout(toBottom, 120);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [run.log.length, logTab, mainTab]);

  const visibleLog = useMemo(() => {
    const filtered = run.log.filter((l) => {
      if (logTab === 'event') {
        return l.kind === 'choice' || l.kind === 'routine' || l.actionId.startsWith('event:');
      }
      if (logTab === 'stat') {
        return Object.keys(l.statDelta).length > 0 || !!l.axesChanged;
      }
      return true;
    });
    return filtered.slice(-60);
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
      // token 过期：先刷新再重试一次，避免频繁被踢回登录
      const fresh = await refreshAccessToken();
      if (fresh) {
        const retry = await syncRun(
          { runId, run: prevRun, schedule: prevSchedule, from, to, seed },
          fresh,
        );
        if (retry.kind !== 'unauthorized') {
          setSyncStatus(retry.kind === 'error' ? 'offline' : 'synced');
          return;
        }
      }
      setSyncStatus('expired');
      setForceLogin(true);
      return;
    }
    if (outcome.kind === 'error') {
      setSyncStatus('offline');
      return;
    }

    if (outcome.kind === 'stale') {
      // 服务器校验失败：以服务器为准，校准本地时钟与排程时间
      const serverRun = normalizeRun(outcome.data.state);
      const fixedSchedule = repairChain(scheduleRef.current, serverRun.at);

      runRef.current = serverRun;
      scheduleRef.current = fixedSchedule;
      setRun(serverRun);
      setSchedule(fixedSchedule);
      setGameNow(serverRun.at);
      setRevision(outcome.data.revision);
      setRunning(false);
      batchRef.current = null;
      setSnapshot(null);
      setNotice('服务器校验没过，已按云端的进度校准时间，可以重新推进。');
      setSyncStatus('synced');
      dbg('校准 at=' + String(serverRun.at));
      return;
    }

    const res = outcome.data;
    setRevision(res.revision);
    if (!sameState(res.state, local.state)) {
      setRun(normalizeRun(res.state));
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

  function openPlan() {
    setPlanBackup(schedule);
    setShowActions(true);
  }

  function savePlan() {
    setPlanBackup(null);
    setShowActions(false);
    setNotice('行程已保存。');
  }

  function cancelPlan() {
    if (planBackup) setSchedule(planBackup);
    setPlanBackup(null);
    setShowActions(false);
    setNotice('已取消，行程恢复原样。');
  }

  function addAction(actionId: string) {
    const action = ACTIONS[actionId];
    if (!action) return;

    // 与上一条首尾相接；当天排满/放不下就顺延到下一天
    let startAt = Math.max(run.at, lastEnd);
    let guard = 0;
    while (guard < 60) {
      guard += 1;
      const d = Math.floor((startAt - T0) / DAY_MS);
      const dayStart = T0 + d * DAY_MS;
      const used = slotsOnDay(d);
      const slotStart = Math.max(startAt, dayStart + used * action.durationMs);

      if (used < DAILY_SLOTS && slotStart + action.durationMs <= dayStart + DAY_MS) {
        startAt = slotStart;
        break;
      }
      startAt = dayStart + DAY_MS;
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
    setPlanTick((n) => n + 1);
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

  /** 修复排程重叠：待执行行程若开始时间早于已推进时间，则顺延成首尾相接 */
  function repairChain(list: ScheduleItem[], fromAt: number): ScheduleItem[] {
    const pending = list
      .filter((s) => !s.done && !s.fixed)
      .sort((a, b) => a.startAt - b.startAt);

    let cursor = fromAt;
    const patched = new Map<string, ScheduleItem>();
    for (const it of pending) {
      const dur = Math.max(1, it.endAt - it.startAt);
      const start = Math.max(cursor, it.startAt);
      if (start !== it.startAt) patched.set(it.id, { ...it, startAt: start, endAt: start + dur });
      cursor = Math.max(cursor, start + dur);
    }
    if (patched.size === 0) return list;
    return list.map((s) => patched.get(s.id) ?? s);
  }
  const advanceRef = useRef<() => void>(() => {});

  // 记住速度档位
  useEffect(() => {
    try {
      localStorage.setItem('idollife:speed', String(speed));
    } catch {
      /* 忽略 */
    }
  }, [speed]);

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
          ? `体力不足（剩 ${result.state.stamina}），没法继续下一条行动了。去练个「爆睡」吧。`
          : result.stoppedReason === 'money'
            ? '钱不够，行程停下了。'
            : result.stoppedReason === 'stopped'
              ? '到你说的那个点停下了。'
              : result.stoppedReason === 'event'
                ? '有件事需要你决定。'
                : '这一批行程走完了。',
      );
    }
    setLastStop(String(result.stoppedReason ?? 'exhausted'));
    dbg('批次结束 reason=' + String(result.stoppedReason) + ' at=' + String(result.state.at) + ' 体力=' + String(result.state.stamina) + ' 钱=' + String(result.state.money));
    if (result.stoppedReason === 'event') resumeAfterEvent.current = true;
    void pushSync(batch.prevRun, batch.prevSchedule, batch.from, result.state.at, result);
    setSnapshot(null);
    batchRef.current = null;
  }

  function advance() {
    if (!requireLogin()) return;
    if (running) return;
    if (pending.length === 0) {
      setNotice('没有待执行的行程，先点「安排行程」加几条。');
      dbg('推进失败：没有待执行条目');
      return;
    }
    if (run.pendingEvent) {
      setNotice('先处理重点事件，时间已暂停。');
      setActiveEventId(run.pendingEvent);
      return;
    }

    const repaired = repairChain(schedule, run.at);
    if (repaired !== schedule) {
      dbg('修复重叠行程');
      setSchedule(repaired);
    }

    const staleAtStart = repaired.filter((s) => !s.done && s.startAt < run.at);
    const usable = repaired.filter((s) => !staleAtStart.includes(s));
    if (staleAtStart.length > 0) {
      dbg('开始前清理过期行程 ' + String(staleAtStart.length) + ' 条');
      setSchedule(usable);
    }

    const firstPending = usable.filter((s) => !s.done).sort((a, b) => a.startAt - b.startAt)[0];
    let baseRun = run;
    if (firstPending && firstPending.startAt > run.at) {
      const skipped = Math.round((firstPending.startAt - run.at) / 1000);
      dbg('跳过空档 ' + String(skipped) + 's');
      baseRun = { ...run, at: firstPending.startAt };
      setRun(baseRun);
    }

    setSnapshot({ run: baseRun, schedule: usable });
    batchRef.current = { from: baseRun.at, prevRun: baseRun, prevSchedule: usable };
    setGameNow(Math.max(baseRun.at, gameNowRef.current));
    setRunning(true);
    dbg('开始推进 pending=' + String(pending.length) + ' at=' + String(run.at));
  }

  advanceRef.current = advance;

  function stopCurrent() {
    if (!running) return;
    setConfirmAction('stop');
  }

  function doStop() {
    setConfirmAction(null);
    dbg('手动停止（只作废当前行动）');
    setRunning(false);
    batchRef.current = null;
    setSnapshot(null);
    resumeAfterEvent.current = false;
    // 当前行动还没结算，run.at 就停在它的开始时间，无需回滚
    setGameNow(runRef.current.at);
    try {
      localStorage.setItem(
        'idollife:clock:v2',
        JSON.stringify({ t: Math.round(runRef.current.at), w: Date.now(), speed }),
      );
    } catch {
      /* 忽略 */
    }
    setNotice('已停止：当前这条行动作废，其余行程保留。');
  }

  /** 仅测试用：清空本地存档，从头新建一局并覆盖云端 */
  function restartForTest() {
    setConfirmAction('restart');
  }

  function doRestart() {
    setConfirmAction(null);

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
      setNotice('出道后才能组建组合。先提升属性，达到出道条件吧。');
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

  function doMeet(channelId: string) {
    const r = meetFriend(run, channelId, seed);
    if (r.result === 'poor') {
      setNotice('钱不够，先攒一点。');
      return;
    }
    if (r.result === 'empty') {
      setRun(r.state);
      setNotice('这次没遇到合适的人（钱照扣）。');
      return;
    }
    if (r.result === 'dup') {
      // 走的是「重复认识」分支：也要把新的状态写回去（扣钱 + 日志 + 默契）
      setRun(r.state);
      setNotice('又见到了认识的人，默契 +1%。');
      return;
    }
    if (r.result !== 'ok') {
      setNotice('这个渠道暂时去不了。');
      return;
    }
    setRun(r.state);
    setFriendsTab('list');
    setNotice(r.friend ? `认识了 ${r.friend.name}，已加入朋友圈。` : '认识了一个新朋友。');
  }

  function doAccept(taskId: string) {
    const r = acceptTask(run, taskId);
    if (r.result === 'ok') {
      setRun(r.state);
      setNotice('任务已领取，完成后会自动结算奖励。');
      return;
    }
    setNotice(r.result === 'done' ? '这个任务已经完成了。' : '现在还不能领取。');
  }

  function doKick(memberId: string) {
    const partyId = run.activePartyId;
    if (!partyId) return;
    const target = run.parties.find((p) => p.id === partyId)?.members.find((m) => m.id === memberId);
    setRun({
      ...run,
      parties: run.parties.map((p) =>
        p.id === partyId ? { ...p, members: p.members.filter((m) => m.id !== memberId) } : p,
      ),
      friends: target
        ? run.friends.map((f) =>
            f.name === target.name
              ? { ...f, partyId: null, cooldownUntil: run.at + RECRUIT_COOLDOWN_DAYS * DAY_MS }
              : f,
          )
        : run.friends,
    });
    setNotice('已移出组合。');
  }

  function doInvite(friendId: string) {
    const r = inviteFriend(run, friendId);
    if (r.result === 'no-party') {
      setNotice('先创建或选择一个组合。');
      return;
    }
    if (r.result === 'full') {
      setNotice('组合满了（最多 10 人）。');
      return;
    }
    if (r.result === 'taken') {
      setNotice('这个人已经在别的组合里了。');
      return;
    }
    if (r.result === 'cooldown') {
      setNotice('这个人在冷却期，暂时不能入团。');
      return;
    }
    if (r.result !== 'ok') return;
    setRun(r.state);
    setNotice('已经邀请进组合了。');
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
    if (!canShowAction(run, SHOW_ACTION_ID)) {
      setNotice('现在还没到能上台的时候。');
      return;
    }
    if (remainingTimes(run, SHOW_ACTION_ID) <= 0) {
      setNotice('这一周的演出次数已经用完了。');
      return;
    }

    let dayIndex = Math.floor((Math.max(lastEnd, run.at) - T0) / DAY_MS);
    let dayStart = T0 + dayIndex * DAY_MS;

    for (let i = 0; i < 8; i++) {
      const weekday = dayIndex % 7;
      const isWeekend = weekday >= 5;
      if (isWeekend && slotsOnDay(dayIndex) === 0) break;
      dayIndex += 1;
      dayStart += DAY_MS;
    }

    const weekday = dayIndex % 7;
    if (weekday < 5) {
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

  // 刷新后：如果还有待执行行程，自动续跑（离线设计，读档即继续）
  const bootResumeRef = useRef(false);
  useEffect(() => {
    if (bootResumeRef.current) return;
    if (!user) return;
    if (!schedule.some((s) => !s.done)) return;
    bootResumeRef.current = true;
    const t = window.setTimeout(() => advanceRef.current(), 400);
    return () => window.clearTimeout(t);
  }, [user, schedule]);
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
        <div className="bar-left">
          <span className="brand">idollife</span>
          <span className="clock">
            第 {todayIndex + 1} 天 · {weekdayName(todayIndex)} · 今日剩余{' '}
            {Math.max(0, 3 - usedToday)}/3
          </span>
          <div className="title-account">
            <span className="acct-email" title={user?.email ?? ''}>
              {user?.email ?? '已离线'}
            </span>
            {syncStatus !== 'local' && (
              <span className={`chip chip-${syncStatus}`}>{SYNC_TEXT[syncStatus]}</span>
            )}
            <span className="acct-icons">
              <button
                className="icon-btn"
                title="调试日志"
                onClick={() => {
                  setDebugText(localStorage.getItem('idollife:debug:v1') ?? '(空)');
                  setShowDebug(true);
                }}
              >
                日志
              </button>
              <button className="icon-btn" title="重新开始" onClick={restartForTest}>
                重开
              </button>
              <button className="icon-btn" title="退出" onClick={() => void signOut()}>
                退出
              </button>
            </span>
          </div>
        </div>

        <div className="bar-center">
          <section className="mod mod-timeline">

            <div className="tlx">
              {!running && lastStop && STOP_TEXT[lastStop] && (
                <span className={`tlx-status ${lastStop}`}>{STOP_TEXT[lastStop]}</span>
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
                  <i style={{ width: `${Math.round(currentPct * 100)}%` }} />
                </div>
                <div className="tlx-card-meta">
                  {running && nextItem
                    ? `还剩 ${Math.ceil(remainMs / 1000)} 秒`
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
                <button onClick={() => setShowStops(true)}>设置暂停时间点</button>
                <div className="speed-row">
                  {[1, 10, 60].map((v) => (
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
                <button
                  className="primary"
                  onClick={advance}
                  disabled={pending.length === 0 || running}
                >
                  {running ? '推进中…' : '开始推进'}
                </button>
                <button onClick={stopCurrent} disabled={!running}>
                  停止
                </button>
                <span className="tools-date">
                  第 {todayIndex + 1} 天 · 第 {Math.floor(todayIndex / 7) + 1} 周 {weekdayName(todayIndex)}
                </span>
                <button
                  className={pending.length === 0 ? 'primary arrange-hint' : ''}
                  onClick={openPlan}
                >
                  安排行程
                </button>
              </div>

              <div className="tools-right">
                <button onClick={() => setMainTab('plan')}>历史行程</button>
                <span className="muted small">
                  {running ? '推进中' : '已停止'} · 待办 {pending.length}
                  {lastStop && lastStop !== 'time' ? ` · ${lastStop}` : ''}
                </span>
              </div>
            </div>
          </section>
        </div>

        <div className="bar-right">
          <div className="brief-head">任务简报</div>
          <ul className="brief-list">
            {activeTasks(run)
              .slice(0, 6)
              .map(({ task }) => (
                <li key={task.id}>
                  <span className="dot" />
                  <span className="brief-text">{task.brief}</span>
                </li>
              ))}
            {activeTasks(run).length === 0 && (
              <li>
                <span className="brief-text">暂无进行中的任务</span>
              </li>
            )}
          </ul>
        </div>      </header>


      <main className="shell">
        {/* 左：主信息 + 功能切换 */}
        <aside className="mod col-left">
          <nav className="mod mod-menu">
            {(
              [
                ['task', '任务'],
                ['plan', '行程'],
                ['party', '组合'],
                ['friends', '朋友圈'],
                ['shop', '商店'],
                ['divine', '占卜'],
              ] as Array<[MainTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                className={mainTab === key ? 'menu-item active' : 'menu-item'}
                onClick={() => setMainTab(key)}
              >
                {label}
                {key === 'task' && taskBadgeCount(run) > 0 && (
                  <em className="menu-badge">{taskBadgeCount(run)}</em>
                )}
              </button>
            ))}

            <button
              className={
                mainTab === 'stats' ? 'menu-item bag-entry active' : 'menu-item bag-entry'
              }
              onClick={() => setMainTab('stats')}
            >
              属性
            </button>
            <button
              className={
                mainTab === 'bag' ? 'menu-item bag-entry active' : 'menu-item bag-entry'
              }
              onClick={() => setMainTab('bag')}
            >
              背包
            </button>
          </nav>

        </aside>

        {/* 中：时间轴 / 待办 / 主系统 / 日志 */}
        <section className="col-center">
          {(run.pendingEvent || run.eventQueue.length > 0) && (
            <section className={run.pendingEvent ? 'mod mod-todo major' : 'mod mod-todo'}>
              <div className="mod-head">
                <h2>{run.pendingEvent ? '重点事件 · 时间已暂停' : '待处理事项'}</h2>
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
            </section>
          )}

          <section className="mod mod-main">
            {mainTab === 'task' && (
              <>
                <div className="mod-head">
                  <h2>任务</h2>
                  <span className="muted small">
                    共{TASKS.length} · 可{
                      TASKS.filter((x) => taskStatus(run, x) === 'claimable').length
                    } · 进{
                      TASKS.filter((x) => taskStatus(run, x) === 'active').length
                    } · 见{
                      TASKS.filter((x) => taskStatus(run, x) === 'locked').length
                    } · 完{
                      TASKS.filter((x) => taskStatus(run, x) === 'done').length
                    } · 隐{
                      TASKS.filter((x) => taskStatus(run, x) === 'hidden').length
                    }
                  </span>
                  <div className="seg-inline">
                    {(
                      [
                        ['all', '全部'],
                        ['accept', '领取任务'],
                        ['active', '进行中'],
                        ['done', '已完成'],
                      ] as Array<['all' | 'accept' | 'active' | 'done', string]>
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        className={taskTab === key ? 'seg-item active' : 'seg-item'}
                        onClick={() => setTaskTab(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const renderTask = (task: (typeof TASKS)[number]) => {
                    const status = taskStatus(run, task);
                    return (
                      <li
                        key={task.id}
                        className={[
                          'task',
                          status === 'claimable' ? 'claimable' : '',
                          status === 'done' ? 'done' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <div className="task-top">
                          <span className="task-name">{task.name}</span>
                          <span className={`task-state ${status}`}>
                            {status === 'claimable'
                              ? '可领取'
                              : status === 'active'
                                ? '进行中'
                                : status === 'done'
                                  ? '已完成'
                                  : '未达成'}
                          </span>
                          <span className="spacer" />
                          {status === 'done' ? (
                            <span className="muted small">
                              {dayLabel(Number(run.flags[`task:${task.id}:doneAt`] ?? run.at), run.at)}
                            </span>
                          ) : (
                            <button
                              className={status === 'claimable' ? 'primary' : ''}
                              disabled={status !== 'claimable'}
                              onClick={() => doAccept(task.id)}
                            >
                              {status === 'active' ? '已领取' : '领取任务'}
                            </button>
                          )}
                        </div>
                        <p className="task-brief-line">{task.brief}</p>
                        {status !== 'done' && (
                          <p className="muted small">{task.content}</p>
                        )}
                        {status !== 'done' && (
                          <p className="muted small">
                            奖励：
                            {[
                              task.rewards.money ? `¥${task.rewards.money}` : '',
                              task.rewards.stamina ? `体力 +${task.rewards.stamina}` : '',
                              task.rewards.fans ? `粉丝 +${task.rewards.fans}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ') || '无'}
                          </p>
                        )}
                      </li>
                    );
                  };

                  if (taskTab === 'done') {
                    const done = completedTasks(run);
                    if (done.length === 0) return <p className="muted small">还没有完成的任务。</p>;
                    return <ul className="task-list">{done.map(({ task }) => renderTask(task))}</ul>;
                  }

                  if (taskTab === 'active') {
                    const active = activeTasks(run);
                    if (active.length === 0) return <p className="muted small">没有进行中的任务。</p>;
                    return (
                      <ul className="task-list">{active.map(({ task }) => renderTask(task))}</ul>
                    );
                  }

                  if (taskTab === 'accept') {
                    const list = TASKS.filter((task) => {
                      const s = taskStatus(run, task);
                      return s === 'claimable' || s === 'locked' || s === 'active';
                    });
                    if (list.length === 0) return <p className="muted small">暂时没有可领取的任务。</p>;
                    return <ul className="task-list">{list.map(renderTask)}</ul>;
                  }

                  // 全部：可领取 → 进行中 → 可见 → 已完成，用分割线隔开
                  const sections: Array<{ key: string; title: string; list: (typeof TASKS)[number][] }> = [
                    {
                      key: 'claimable',
                      title: '可领取',
                      list: TASKS.filter((task) => taskStatus(run, task) === 'claimable'),
                    },
                    {
                      key: 'active',
                      title: '进行中',
                      list: TASKS.filter((task) => taskStatus(run, task) === 'active'),
                    },
                    {
                      key: 'locked',
                      title: '可见',
                      list: TASKS.filter((task) => taskStatus(run, task) === 'locked'),
                    },
                    {
                      key: 'done',
                      title: '已完成',
                      list: completedTasks(run).map((x) => x.task),
                    },
                  ];

                  const visibleSections = sections.filter((s) => s.list.length > 0);
                  if (visibleSections.length === 0) {
                    return <p className="muted small">暂时没有任务。</p>;
                  }

                  return (
                    <>
                      {visibleSections.map((sec) => (
                        <Fragment key={sec.key}>
                          <div className="task-sep">{sec.title}</div>
                          <ul className="task-list">{sec.list.map(renderTask)}</ul>
                        </Fragment>
                      ))}
                    </>
                  );
                })()}
              </>
            )}

            {mainTab === 'friends' && (
              <>
                <div className="mod-head">
                  <h2>朋友圈</h2>
                  <span className="seg-inline">
                    <button
                      className={friendsTab === 'list' ? 'seg-item active' : 'seg-item'}
                      onClick={() => setFriendsTab('list')}
                    >
                      我的朋友圈
                    </button>
                    <button
                      className={friendsTab === 'meet' ? 'seg-item active' : 'seg-item'}
                      onClick={() => setFriendsTab('meet')}
                    >
                      认识新朋友
                    </button>
                  </span>
                  <span className="spacer" />
                  <span className="muted small">
                    共 {run.friends.length} 人 · 可邀请 {run.friends.filter((f) => !f.partyId).length}
                  </span>
                </div>

                <div
                  className="friend-block"
                  style={{ display: friendsTab === 'meet' ? undefined : 'none' }}
                >
                  <h4>认识新朋友</h4>
                  <div className="row wrap">
                    {CHANNELS.map((c) => (
                      <button
                        key={c.id}
                        className={run.money < c.cost ? 'meet-poor' : ''}
                        onClick={() => doMeet(c.id)}
                        title={c.text}
                      >
                        {c.name}
                        <small>¥{c.cost}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className="friend-block"
                  style={{ display: friendsTab === 'list' ? undefined : 'none' }}
                >
                  <h4>我的朋友圈</h4>
                  {run.friends.length === 0 ? (
                    <p className="muted small">还没有认识的人，去上面挑个渠道试试。</p>
                  ) : (
                    <div className="mcards">
                      {run.friends.map((f) => {
                        const on = flippedIds.includes(`f:${f.id}`);
                        const inParty = !!f.partyId;
                        const teamName = f.partyId
                          ? run.parties.find((x) => x.id === f.partyId)?.name
                          : null;
                        return (
                          <div
                            key={f.id}
                            className={[
                              'mcard',
                              'friend',
                              on ? 'flipped' : '',
                              inParty ? 'in-team' : '',
                              !inParty && cooldownLeftDays(run, f) > 0 ? 'cooling' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => toggleFlip(`f:${f.id}`)}
                            title={inParty ? `已在「${teamName}」` : '点击翻转查看预估属性'}
                          >
                            <div className="mcard-inner">
                              <div className="mcard-face front">
                                <span className="mcard-name">{f.name}</span>
                                <span className="mcard-set">
                                  {biasLabel(f.bias)} · 资质 {Math.round(f.quality * 100)}%
                                </span>
                                <span className="mcard-dup">默契 +{f.dupCount ?? 0}%</span>
                                {inParty && <span className="mcard-team">已入团 · {teamName}</span>}
                                {!inParty && cooldownLeftDays(run, f) > 0 && (
                                  <span className="mcard-cool">
                                    冷却中 · 剩余 {cooldownLeftDays(run, f)} 天
                                  </span>
                                )}

                              </div>
                              <div className="mcard-face back">
                                <span className="mcard-name">{f.name}</span>
                                <div className="mcard-stats">
                                  {(['vocal', 'dance', 'acting', 'talk'] as const).map((k) => (
                                    <span key={k}>
                                      <em>{STAT_LABEL[k]}</em>
                                      {Math.round(run.stats[k] * f.quality)}
                                    </span>
                                  ))}
                                </div>
                                <span className="mcard-dup">预估属性</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {mainTab === 'stats' && (
              <>
                <div className="mod-head">
                  <h2>属性</h2>
                </div>
                <div className="stats big">
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
                <p className="muted small">
                  实际属性：
                  {Object.entries(effectiveStats(run))
                    .map(([k, v]) => `${STAT_LABEL[k]} ${v}`)
                    .join(' · ')}
                </p>
                <div className="row">
                  <button
                    className={canDebut(run) ? 'primary' : ''}
                    onClick={doDebut}
                    disabled={!canDebut(run)}
                  >
                    {run.debuted ? '已出道' : `出道 ${statTotal}/${DEBUT_THRESHOLD}`}
                  </button>
                  <button onClick={() => setShowDivination(true)}>占卜</button>
                </div>
              </>
            )}
            {mainTab === 'plan' && (
              <>
                <div className="mod-head">
                  <h2>行程</h2>
                </div>
                {pending.length === 0 ? (
                  <p className="muted small">还没有待执行行程。</p>
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
              </>
            )}

            {mainTab === 'bag' && (
              <>
                <div className="mod-head">
                  <h2>背包</h2>
                  <span className="muted small">{run.inventory.length} 件</span>
                </div>
                <nav className="crumb">
                  <span className="crumb-root">物品</span>
                  <span className="crumb-sep">›</span>
                  {(['equip', 'consume', 'other'] as BagTab[]).map((t) => (
                    <Fragment key={t}>
                      <button
                        className={bagTab === t ? 'crumb-item active' : 'crumb-item'}
                        onClick={() => setBagTab(t)}
                      >
                        {t === 'equip' ? '装备' : t === 'consume' ? '消耗' : '其他'}
                      </button>
                      {t !== 'other' && <span className="crumb-sep">/</span>}
                    </Fragment>
                  ))}
                </nav>
                {bagTab === 'equip' && (
                  run.inventory.length === 0 ? (
                    <p className="muted small">还没有装备。</p>
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
                )}
                {(bagTab === 'consume' || bagTab === 'other') && (
                  <p className="muted small">暂无物品。</p>
                )}
              </>
            )}
            {mainTab === 'party' && (
              <>
                <div className="mod-head">
                  <h2>组合{party ? ` · ${party.name}` : ''}</h2>
                  {run.parties.length > 1 && (
                    <div className="row wrap party-switch">
                      {run.parties.map((p) => (
                        <button
                          key={p.id}
                          className={p.id === run.activePartyId ? 'mini-tab active' : 'mini-tab'}
                          onClick={() => doSwitchParty(p.id)}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="spacer" />
                  <button onClick={() => setNotice('组合配置还没做，先留个位置。')}>配置</button>
                  <button onClick={() => setManaging((v) => !v)}>
                    {managing ? '完成' : '管理'}
                  </button>
                  <button onClick={openPartyModal}>{party ? '创建新组合' : '创建组合'}</button>
                </div>

                {!party ? (
                  <p className="muted">
                    {run.debuted ? '还没有组合。先创建一个。' : '出道后才能组建组合。'}
                  </p>
                ) : (
                  <div className="mcards">
                    <div
                      className={flippedIds.includes('__me') ? 'mcard flipped me' : 'mcard me'}
                      onClick={() => toggleFlip('__me')}
                      title="你自己"
                    >
                      <div className="mcard-inner">
                        <div className="mcard-face front">
                          <span className="mcard-name">我</span>
                          <span className="mcard-set">主角</span>
                          <span className="mcard-dup">队长</span>
                        </div>
                        <div className="mcard-face back">
                          <span className="mcard-name">我</span>
                          <div className="mcard-stats">
                            {(['vocal', 'dance', 'acting', 'talk'] as const).map((k) => (
                              <span key={k}>
                                <em>{STAT_LABEL[k]}</em>
                                {run.stats[k]}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    {party.members.map((m) => {
                      const s = memberStats(m, run.stats);

                      return (
                        <div
                          key={m.id}
                          className={flippedIds.includes(m.id) ? 'mcard flipped' : 'mcard'}
                          onClick={() => {
                            if (!managing) toggleFlip(m.id);
                          }}
                          title="点击翻转查看属性"
                        >
                          {managing && (
                            <button
                              className="mcard-kick"
                              onClick={(e) => {
                                e.stopPropagation();
                                setKickTarget(m.id);
                              }}
                            >
                              退团
                            </button>
                          )}
                          <div className="mcard-inner">
                            <div className="mcard-face front">
                              <span className="mcard-name">{m.name}</span>
                              <span className="mcard-set">{biasLabel(m.bias)}</span>
                              <span className="mcard-dup">默契 +{m.dupCount}%</span>
                            </div>
                            <div className="mcard-face back">
                              <span className="mcard-name">{m.name}</span>
                              <div className="mcard-stats">
                                {(['vocal', 'dance', 'acting', 'talk'] as const).map((k) => (
                                  <span key={k}>
                                    <em>{STAT_LABEL[k]}</em>
                                    {s[k]}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div
                      className="mcard invite-card"
                      onClick={() => setShowInvite(true)}
                      title="从朋友圈邀请"
                    >
                      <div className="invite-inner">
                        <span className="plus">＋</span>
                        <span className="hint">点击邀请朋友</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {mainTab === 'shop' && (
              <>
                <div className="mod-head">
                  <h2>商店</h2>
                  <span className="muted small">装备 {run.inventory.length} 件</span>
                </div>
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
              </>
            )}

            {mainTab === 'divine' && (
              <>
                <div className="mod-head">
                  <h2>占卜</h2>
                </div>
                <p className="muted small">
                  隐藏属性不会直接显示，只能通过占卜窥见一档。同一天内重复占卜，价格翻倍。
                </p>
                <div className="row">
                  <button className="primary" onClick={() => setShowDivination(true)}>
                    开始占卜
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="mod mod-log">
            <div className="mod-head">
              <h2>日志</h2>
              <div className="mini-tabs">
                {(['all', 'event', 'stat'] as LogTab[]).map((t) => (
                  <button
                    key={t}
                    className={logTab === t ? 'mini-tab active' : 'mini-tab'}
                    onClick={() => setLogTab(t)}
                  >
                    {t === 'all' ? '全部' : t === 'event' ? '事件' : '属性'}
                  </button>
                ))}
              </div>
            </div>

            <div className="log-scroll" ref={logRef}>
              {visibleLog.length === 0 ? (
                <p className="muted small">还没有记录。</p>
              ) : (
                <ul className="log dense">
                  {visibleLog.map((l, i) => {
                    const day = Math.floor((l.at - T0) / DAY_MS);
                    const prev = i > 0 ? visibleLog[i - 1] : undefined;
                    const prevDay = prev ? Math.floor((prev.at - T0) / DAY_MS) : -1;
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
        </section>

        {/* 右：账户信息 + 辅助（背包） */}
        <aside className="col-right">
          <section className="mod mod-aux">
            <nav className="seg">
              <button
                className={rightTab === 'stats' ? 'seg-item active' : 'seg-item'}
                onClick={() => setRightTab('stats')}
              >
                属性
              </button>
              <button
                className={rightTab === 'bag' ? 'seg-item active' : 'seg-item'}
                onClick={() => setRightTab('bag')}
              >
                背包
              </button>
            </nav>

            {rightTab === 'stats' ? (
              <div className="aux-body">
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

                <p className="muted small eff">
                  实际属性：
                  {Object.entries(effectiveStats(run))
                    .map(([k, v]) => `${STAT_LABEL[k]} ${v}`)
                    .join(' · ')}
                </p>

                <div className="row">
                  <button
                    className={canDebut(run) ? 'primary' : ''}
                    onClick={doDebut}
                    disabled={!canDebut(run)}
                  >
                    {run.debuted ? '已出道' : `出道 ${statTotal}/${DEBUT_THRESHOLD}`}
                  </button>
                  <button onClick={() => setShowDivination(true)}>占卜</button>
                </div>
              </div>
            ) : (
              <>
                <nav className="crumb">
                  <span className="crumb-root">物品</span>
                  <span className="crumb-sep">›</span>
                  {(['equip', 'consume', 'other'] as BagTab[]).map((t) => (
                    <Fragment key={t}>
                      <button
                        className={bagTab === t ? 'crumb-item active' : 'crumb-item'}
                        onClick={() => setBagTab(t)}
                      >
                        {t === 'equip' ? '装备' : t === 'consume' ? '消耗' : '其他'}
                      </button>
                      {t !== 'other' && <span className="crumb-sep">/</span>}
                    </Fragment>
                  ))}
                </nav>

                {bagTab === 'equip' &&
                  (run.inventory.length === 0 ? (
                    <p className="muted small">还没有装备。</p>
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
                  <p className="muted small">暂无物品。</p>
                )}
              </>
            )}
          </section>
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

      {confirmAction && (
        <Modal
          title={confirmAction === 'stop' ? '停止当前行程' : '重新开始'}
          onClose={() => setConfirmAction(null)}
        >
          {confirmAction === 'stop' ? (
            <p>
              只作废正在进行的那条行动（不结算），时间回到它开始前。
              <br />
              其余没开始的行程会保留。
            </p>
          ) : (
            <p>会清空本地存档并新建一局，确定吗？</p>
          )}
          <div className="row">
            <button onClick={() => setConfirmAction(null)}>取消</button>
            <button
              className="primary"
              onClick={confirmAction === 'stop' ? doStop : doRestart}
            >
              确定
            </button>
          </div>
        </Modal>
      )}
      {kickTarget && (
        <Modal title="请离成员" onClose={() => setKickTarget(null)}>
          <p>如果请离了该成员，可能对于团会产生不好的影响，且一个月内无法重新入团。</p>
          <div className="row">
            <button onClick={() => setKickTarget(null)}>取消</button>
            <button
              className="primary"
              onClick={() => {
                doKick(kickTarget);
                setKickTarget(null);
              }}
            >
              确认请离
            </button>
          </div>
        </Modal>
      )}
      {showInvite && (
        <Modal title="邀请朋友" onClose={() => setShowInvite(false)}>
          <p className="muted small">无团的朋友可以邀请；已有组合的人需要先移出原组合。</p>
          {run.friends.length === 0 ? (
            <p className="muted">朋友圈还是空的，先去「朋友圈」认识几个人。</p>
          ) : (
            <ul className="invite-list">
              {[...run.friends]
                .sort(
                  (a, b) =>
                    Number(!!a.partyId || cooldownLeftDays(run, a) > 0) -
                    Number(!!b.partyId || cooldownLeftDays(run, b) > 0),
                )
                .map((f) => {
                  const team = f.partyId
                    ? run.parties.find((x) => x.id === f.partyId)?.name
                    : null;
                  const cool = cooldownLeftDays(run, f);
                  const blocked = !!f.partyId || cool > 0;
                  return (
                    <li key={f.id} className={blocked ? 'owned' : ''}>
                      <span className="name">{f.name}</span>
                      <span className="meta">
                        {biasLabel(f.bias)} · 资质 {Math.round(f.quality * 100)}%
                      </span>
                      {team && <span className="team">已归属 · {team}</span>}
                      {!team && cool > 0 && (
                        <span className="team">冷却中 · 剩余 {cool} 天</span>
                      )}
                      <span className="spacer" />
                      <button disabled={blocked || !party} onClick={() => doInvite(f.id)}>
                        {f.partyId ? '不可邀请' : cool > 0 ? `冷却 ${cool} 天` : '邀请'}
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </Modal>
      )}
      {showStops && (
        <Modal title="设置暂停时间点" onClose={() => setShowStops(false)}>
          <p className="muted small">点一条行程：推进到它完成后就停下，方便你中途回来看看。</p>
          {pending.length === 0 ? (
            <p className="muted">还没有待执行行程。</p>
          ) : (
            <ul className="stop-list">
              {pending.map((s, i) => {
                const a = ACTIONS[s.actionId];
                return (
                  <li key={s.id} className={s.stopAfter ? 'on' : ''}>
                    <button onClick={() => toggleStop(s.id)}>
                      <span className="idx">{i + 1}</span>
                      <span className="nm">{a?.name ?? s.actionId}</span>
                      <span className="when">{dayLabel(s.startAt, run.at)}</span>
                      {s.stopAfter && <em>完成后停止</em>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Modal>
      )}
      {showActions && (
        <Modal title="安排行程" wide onClose={cancelPlan}>
          <div className="plan">
            <div className="plan-actions">
              {(['growth', 'recover', 'work'] as ActionCategory[]).map((cat) => {
                const list = ACTION_LIST.filter(
                  (a) => a.category === cat && canShowAction(run, a.id),
                );
                if (list.length === 0) return null;
                return (
                  <div key={cat} className="action-group">
                    <h4>{CATEGORY_LABEL[cat]}</h4>
                    <div className="actions">
                      {list.map((a) => {
                        const pv = previewAction(run, a.id);
                        const left = remainingTimes(run, a.id);
                        const statBits = pv
                          ? Object.entries(pv.stats)
                              .map(([k, r]) => `${STAT_LABEL[k] ?? k} +${r[0]}~${r[1]}`)
                              .join(' / ')
                          : '';
                        return (
                          <button
                            key={a.id}
                            onClick={() => addAction(a.id)}
                            disabled={left <= 0}
                            title={left <= 0 ? '次数已用完' : ''}
                          >
                            {a.name}
                            <small>
                              {statBits && `${statBits} · `}
                              {pv && (pv.stamina > 0 ? `体力 +${pv.stamina}` : `体力 ${pv.stamina}`)}
                              {pv && pv.money > 0 ? ` · +¥${pv.money}` : ''}
                              {pv && pv.money < 0 ? ` · ¥${-pv.money}` : ''}
                              {Number.isFinite(left) ? ` · 剩 ${left} 次` : ''}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="plan-preview" ref={previewRef}>
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

          <div className="plan-foot">
            <button onClick={cancelPlan}>取消</button>
            <button className="primary" onClick={savePlan}>
              保存安排
            </button>
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