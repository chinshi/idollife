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
  RECRUIT_COOLDOWN_DAYS,
  cooldownLeftDays,
  TASKS,
  acceptTask,
  autoAcceptTasks,
  advanceStage,
  claimTaskReward,
  syncStageReached,
  taskBadgeCount,
  briefTasks,
  TASK_CATEGORY_LABEL,
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
  // T-025：时钟
  ALLOWED_SPEEDS,
  createClock,
  // T-019：道具系统
  ITEMS_MAP,
  addConsumable,
  equipDefOf,
  describeCondition,
  useItem,
  unequipItem,
  judgeEnding,
  memberStats,
  performShow,
  recruit,
  settle,
  switchParty,
} from '@idollife/core';
import type {
  ActionCategory,
  ClockState,
  Ending,
  EquipItem,
  EquipSlot,
  RunState,
  ScheduleItem,
  SettleResult,
  TaskBriefEntry,
} from '@idollife/core';
import { clearSave, createSave, loadSave, normalizeRun, writeSave } from './state/save';
import { AuthForm } from './components/AuthForm';
import { CrashBanner, Modal } from './components/Modal';
import { TimeAxis } from './components/TimeAxis';
import { TimelineStatus } from './components/TimelineStatus';
import { LogPanel } from './components/LogPanel';
import { TaskPanel, type TaskTab } from './components/TaskPanel';
import { FriendsPanel } from './components/FriendsPanel';
import { StatsPanel } from './components/StatsPanel';
import { PlanPanel } from './components/PlanPanel';
import { BagPanel } from './components/BagPanel';
import { PartyPanel } from './components/PartyPanel';
import { ShopPanel } from './components/ShopPanel';
import { DivinePanel } from './components/DivinePanel';
import type { AppApi } from './components/api';
import { SidePanel } from './components/SidePanel';
import { Modals } from './components/Modals';
import {
  syncRun,
  fetchLatestRun,
  pushChoice,
  startClock,
  pauseClock,
  fetchClockSession,
  type SyncResponse,
  type ClockResponse,
  type OfflineSummary,
} from './api/sync';
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
  mood: 70,
  satiety: 70,
  health: 100,
  innate: {
    // T-016c：身高直接存厘米（145–180）；体重存公斤（40–80）；样貌对齐文案区间（50–100）
    height: 145 + Math.round(Math.random() * 35),
    weight: 40 + Math.round(Math.random() * 40),
    appearance: 50 + Math.round(Math.random() * 50),
  },
  traits: { kind: 0, lead: 0, coop: 0, independent: 0, ambitious: 0, passion: 0 },
  negatives: { stress: 0, restless: 0, fatigue: 0, desire: 0, scandal: 0 },
  proficiency: { stage_prof: 0, song_prof: 0, choreo_prof: 0 },
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

function AppInner() {
  const boot = useRef(loadSave()).current;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLost, setAuthLost] = useState(false);
  const [crash, setCrash] = useState<string | null>(null);
  const hadUser = useRef(false);
  const [checking, setChecking] = useState(true);

  const [runId, setRunId] = useState(boot?.runId ?? createSave(initialRun, 'run-demo').runId);
  // T-017：进入游戏（读档 / 新档）时先补跑一次自动领取，让引导任务从第一眼就是「进行中」。
  // 放在 useState 的惰性初始化里 = 首次渲染前完成，不需要等第一次行动结算。
  const [run, setRun] = useState<RunState>(() => autoAcceptTasks(boot?.run ?? initialRun));
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
  // T-016：偶像名（开局起名 / 面板点击改名）
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [planBackup, setPlanBackup] = useState<ScheduleItem[] | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
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
  const [taskTab, setTaskTab] = useState<TaskTab>('all');
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
  /** T-025：服务端时钟（权威）；null 表示尚未从服务端拿到 */
  const [clock, setClock] = useState<ClockState | null>(null);
  const clockRef = useRef<ClockState | null>(null);
  const [readonlyBanner, setReadonlyBanner] = useState(false);

  // T-025：sessionId（关标签页失效）；后到者接管靠它识别旧端
  const sessionId = useMemo(() => {
    const KEY = 'idollife:session-id';
    try {
      const cached = sessionStorage.getItem(KEY);
      if (cached) return cached;
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(KEY, id);
      return id;
    } catch {
      return `sess-${Date.now().toString(36)}`;
    }
  }, []);

  const [gameNow, setGameNow] = useState<number>(boot?.run?.at ?? T0);

  const runRef = useRef<RunState>(run);

  /**
   * T-020：统一的状态提交口 —— 任何「基于旧状态产出新 RunState」的地方都必须走这里。
   *
   * 为什么必须同步写 runRef：rAF 时钟 tick 在 paint **之前**读 runRef.current 做结算底稿，
   * 而 `useEffect(() => runRef.current = run)` 在 paint **之后**才跑。handler 里若只 setRun，
   * 下一次 tick 会拿旧底稿 settle，把刚提交的新状态整个覆盖掉（组合创建后消失 = 这个竞态）。
   */
  function commitRun(next: RunState) {
    runRef.current = next;
    setRun(next);
  }

  /** T-025：服务端时钟快照（唯一权威） */
  function commitClock(next: ClockState | null) {
    clockRef.current = next;
    setClock(next);
  }

  /** 以服务端权威状态校准本地（run / schedule / clock） */
  function applyAuthoritative(
    nextRunRaw: RunState,
    nextSchedule: ScheduleItem[],
    nextClock?: ClockState | null,
    nextRevision?: number,
  ) {
    const nextRun = normalizeRun(nextRunRaw);
    const fixed = repairChain(nextSchedule, nextRun.at);
    commitRun(nextRun);
    scheduleRef.current = fixed;
    setSchedule(fixed);
    setGameNow(nextRun.at);
    if (nextClock) commitClock(nextClock);
    if (nextRevision !== undefined) setRevision(nextRevision);
  }

  function offlineText(offline: OfflineSummary): string {
    const stop = offline.stoppedReason ? `（停在：${STOP_TEXT[offline.stoppedReason] ?? offline.stoppedReason}）` : '';
    return `你不在的这段时间，行程又走了 ${offline.executed.length} 条。${stop}`;
  }
  const scheduleRef = useRef<ScheduleItem[]>(boot?.schedule ?? []);
  const batchRef = useRef<{ from: number; prevRun: RunState; prevSchedule: ScheduleItem[] } | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [boxH, setBoxH] = useState(0);
  const gameNowRef = useRef<number>(boot?.run?.at ?? T0);
  const resumeAfterEvent = useRef(false);
  /** T-025：fire-and-forget 上报失败队列（下次成功时合并补报） */
  const pendingReports = useRef<Array<{ run: RunState; schedule: ScheduleItem[]; to: number }>>([]);
  const reporting = useRef(false);
  /** T-013 bug 1：同一条行程连续结算不了几次就丢弃，防止时间轴被永久冻住 */
  const stuckRef = useRef<{ id: string; n: number }>({ id: '', n: 0 });
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
      if (cancelled) return;

      let effectiveRunId = runId;
      if (latest) {
        // T-017：开局初始化会写入「领取任务」日志，这里判定「本地还是空档」时忽略这类日志，
        // 避免新档因此不再从云端恢复。
        const localEmpty =
          run.log.filter((l) => !l.actionId.startsWith('task-accept:')).length === 0 &&
          schedule.length === 0 &&
          run.at === T0;
        if (localEmpty || latest.revision > revision) {
          setRunId(latest.runId);
          effectiveRunId = latest.runId;
          // 云端恢复后同样补跑一次自动领取（与进入游戏口径一致）。
          // T-020：云端恢复可能发生在时钟已启动之后，必须同步 runRef，否则下一 tick 会用旧底稿覆盖。
          commitRun(autoAcceptTasks(normalizeRun(latest.run)));
          scheduleRef.current = latest.schedule;
          setSchedule(latest.schedule);
          setRevision(latest.revision);
          commitClock(latest.clock ?? createClock(latest.run.at));
          setNotice('已从云端恢复进度。');
          if (latest.offline) setNotice(offlineText(latest.offline));
        }
      } else {
        // 新档：先确保服务端有记录（choice 创建，clock 默认 idle）
        await pushChoice(runId, autoAcceptTasks(normalizeRun(runRef.current)), sessionId, token);
      }

      // T-025：以服务端 clock 为准决定开屏是否自动播放 / 只读
      const ses = await fetchClockSession(effectiveRunId, sessionId, token);
      if (cancelled) return;
      if (ses.kind === 'ok') {
        applyAuthoritative(
          ses.data.state,
          ses.data.schedule,
          ses.data.clock,
          ses.data.revision,
        );
        setSpeed(ses.data.clock.speed);
        if (ses.data.offline) setNotice(offlineText(ses.data.offline));
        if (!ses.data.holder) {
          setReadonlyBanner(true);
          setRunning(false);
          return;
        }
        if (ses.data.clock.status === 'running') {
          setRunning(true);
        } else {
          setNotice(
            ses.data.clock.status === 'paused'
              ? '上次停在这里，点「继续」接着走。'
              : '上次停了，点「开始推进」继续。',
          );
        }
      } else if (ses.kind === 'taken_over') {
        setReadonlyBanner(true);
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
        version: 2,
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
  // T-025：本地时钟不再写入（服务端 clock 是唯一权威），整段已移除。

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  // T-016：还没起名的档，进入游戏后弹一次起名框。
  // 稍等 800ms，让云端恢复先落定——云端有名字时这里就不会再弹。
  useEffect(() => {
    if (run.name) return;
    const t = window.setTimeout(() => {
      if (runRef.current.name) return;
      setNameDraft('');
      setNameModalOpen(true);
    }, 800);
    return () => window.clearTimeout(t);
  }, [run.name]);

  useEffect(() => {
    gameNowRef.current = gameNow;
  }, [gameNow]);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  useEffect(() => {
    if (!running) return;

    let anchorPerf = performance.now();
    let anchorGame = Math.max(runRef.current.at, gameNowRef.current);
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
        scheduleRef.current = nextSched;
        commitRun(result.state);
        setSchedule(nextSched);
        dbg('执行 ' + result.executed.join(',') + ' → at=' + String(result.state.at));
        // T-025：每完成一批行动立即上报（不阻塞 tick；失败自动排队）
        void reportProgress(result.state, nextSched, result.state.at);
      }

      const stillPending = scheduleRef.current.some((s) => !s.done);
      if (result.stoppedReason === 'exhausted' && stillPending) {
        const next = scheduleRef.current
          .filter((s) => !s.done)
          .sort((a, b) => a.startAt - b.startAt)[0];

        // 防「永远执行不了」的行程项把时间轴冻住：同一条连续 3 个 tick 卡住就丢弃
        if (next) {
          if (stuckRef.current.id === next.id) stuckRef.current.n += 1;
          else stuckRef.current = { id: next.id, n: 1 };
          if (stuckRef.current.n >= 3) {
            const dropped = scheduleRef.current.filter((s) => s.id !== next.id);
            scheduleRef.current = dropped;
            setSchedule(dropped);
            setNotice('有一条行程没法结算，已跳过。');
            dbg('行程 ' + next.id + ' 连续 3 次结算不了，已丢弃');
            stuckRef.current = { id: '', n: 0 };
            return;
          }
        }

        const unknown =
          next && (!ACTIONS[next.actionId] || !previewAction(runRef.current, next.actionId));

        if (unknown) {
          const cleaned = scheduleRef.current.filter((s) => s.id !== next!.id);
          scheduleRef.current = cleaned;
          setSchedule(cleaned);
          dbg('丢弃未知行为 ' + next!.actionId + '（配置里没有）');
        } else if (next && next.startAt > runRef.current.at) {
          // 中间有空档：把时间对齐到它的开始，避免空转。
          // 关键：heal 会把 run.at 直接前移，锚点必须同步重设，否则 target 被钉死在新的 run.at 上，
          // 倒计时会“冻住”到墙钟把这段差补回来为止（跨日时最明显）。
          const prevAt = runRef.current.at;
          const healed: RunState = { ...runRef.current, at: next.startAt };
          commitRun(healed);
          anchorGame = healed.at;
          anchorPerf = nowPerf;
          setGameNow(runRef.current.at);
          dbg('跨空档对齐：跳到 ' + String(next.startAt) +
              ' 跨越 ' + String(Math.floor((next.startAt - prevAt) / DAY_MS)) + ' 天');
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

  // T-017：任务简报数据（三类分区；引导只取当前组，常规/限时只取进行中 / 可领奖）
  const briefGroups = useMemo(() => {
    return briefTasks(run)
      .map((group) => {
        let entries = group.tasks;
        if (group.category === 'guide') {
          const current = group.tasks.find((e) => e.status !== 'done');
          const groupNo = current?.task.guideGroup;
          entries = group.tasks.filter((e) => e.status !== 'done' && e.task.guideGroup === groupNo);
        } else {
          entries = group.tasks.filter((e) => e.status === 'active' || e.status === 'completable');
        }
        entries = [...entries].sort(
          (a, b) => (a.status === 'completable' ? 0 : 1) - (b.status === 'completable' ? 0 : 1),
        );
        return {
          category: group.category,
          label: TASK_CATEGORY_LABEL[group.category],
          tasks: entries,
        };
      })
      .filter((group) => group.tasks.length > 0);
  }, [run]);

  const briefSections = useMemo(() => {
    let budget = 6;
    return briefGroups
      .map((group) => {
        const take = group.tasks.slice(0, Math.max(0, budget));
        budget -= take.length;
        return { ...group, tasks: take };
      })
      .filter((group) => group.tasks.length > 0);
  }, [briefGroups]);
  const briefOverflow =
    briefGroups.reduce((n, g) => n + g.tasks.length, 0) -
    briefSections.reduce((n, g) => n + g.tasks.length, 0);

  const renderBrief = (entry: TaskBriefEntry) => {
    const { task, status, progress, deadline } = entry;
    const timeText = deadline
      ? status === 'expired'
        ? '已错过'
        : deadline.due
          ? '期限已到'
          : task.category === 'timed'
            ? deadline.urgent
              ? `剩 ${deadline.remainingSlots} 次`
              : `剩 ${deadline.remainingDays} 天`
            : ''
      : '';
    const done = status === 'completable';
    return (
      <li
        key={task.id}
        className={[
          'brief-item',
          task.category === 'guide' ? 'guide' : '',
          task.category === 'timed' ? 'timed' : '',
          done ? 'completable' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="button"
        tabIndex={0}
        onClick={() => setMainTab('task')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setMainTab('task');
        }}
      >
        <span className={done ? 'brief-check' : 'dot'}>{done ? '✓' : ''}</span>
        {/* T-023：任务名可省略，进度数字保持完整 */}
        <span className="brief-text">
          {progress ? (
            <>
              <span className="brief-name">{task.name}</span>
              <span className="brief-progress">
                （{progress.current}/{progress.target}）
              </span>
            </>
          ) : (
            <span className="brief-name">{task.brief}</span>
          )}
        </span>
        {timeText ? (
          <span className={'brief-time' + (deadline?.urgent ? ' urgent' : '')}>{timeText}</span>
        ) : null}
      </li>
    );
  };

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

  /**
   * T-025：结算上报（fire-and-forget）。
   * 每完成一条行动由 tick 调一次；endBatch 再补一次收尾。失败进内存队列，下次成功时合并补报。
   */
  async function reportProgress(nextRun: RunState, nextSchedule: ScheduleItem[], to: number) {
    pendingReports.current.push({ run: nextRun, schedule: nextSchedule, to });
    if (reporting.current) return;
    reporting.current = true;
    try {
      const token = await getAccessToken();
      if (!token) {
        setSyncStatus('expired');
        return;
      }
      setSyncStatus('syncing');

      while (pendingReports.current.length > 0) {
        const item = pendingReports.current[0]!;
        const outcome = await syncRun(
          { runId, sessionId, run: item.run, schedule: item.schedule, to: item.to, seed },
          token,
        );

        if (outcome.kind === 'ok') {
          pendingReports.current.shift();
          setRevision(outcome.data.revision);
          if (outcome.data.clock) commitClock(outcome.data.clock);
          if (outcome.data.schedule) {
            scheduleRef.current = outcome.data.schedule;
            setSchedule(outcome.data.schedule);
          }
          if (outcome.data.offline) setNotice(offlineText(outcome.data.offline));
          continue;
        }

        if (outcome.kind === 'mismatch' || outcome.kind === 'too_fast' || outcome.kind === 'stale') {
          // 校准类错误：队列里后续几项都基于旧状态，直接全部丢弃，避免连发被拒/连续刷校准提示
          pendingReports.current.length = 0;
          applyAuthoritative(
            outcome.data.state,
            outcome.data.schedule ?? scheduleRef.current,
            outcome.data.clock,
            outcome.data.revision,
          );
          setNotice('已按云端进度校准。');
          setSyncStatus('synced');
          continue;
        }

        if (outcome.kind === 'taken_over') {
          pendingReports.current = [];
          applyAuthoritative(
            outcome.data.state,
            outcome.data.schedule ?? scheduleRef.current,
            outcome.data.clock,
            outcome.data.revision,
          );
          setRunning(false);
          setReadonlyBanner(true);
          setSyncStatus('offline');
          return;
        }

        if (outcome.kind === 'unauthorized') {
          const fresh = await refreshAccessToken();
          if (fresh) continue;
          setSyncStatus('expired');
          setForceLogin(true);
          return;
        }

        // error：保留队列，下次成功时补报
        setSyncStatus('offline');
        return;
      }

      setSyncStatus('synced');
    } finally {
      reporting.current = false;
    }
  }

  /** 事件抉择等「不推进时间」的状态提交（仍带 sessionId） */
  async function pushWholeState(next: RunState, overrideRunId?: string) {
    const token = await getAccessToken();
    if (!token) {
      setForceLogin(true);
      return;
    }
    const res = await pushChoice(overrideRunId ?? runId, next, sessionId, token);
    if (res) {
      setRevision(res.revision);
      if (res.clock) commitClock(res.clock);
    }
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

  /** T-021：清空全部未执行行程（保留已执行历史；直接清 + toast，弹窗不关） */
  function clearPlan() {
    setSchedule((prev) => prev.filter((s) => s.done));
    setNotice('已清空全部未执行行程。');
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
    // T-025：收尾补报一次（通常无新增，幂等）
    void reportProgress(result.state, scheduleRef.current, result.state.at);
    setSnapshot(null);
    batchRef.current = null;
  }

  /** T-025：开始/继续推进必须由服务端授予（后到者直接接管） */
  async function advance() {
    if (!requireLogin()) return;
    if (running) return;
    if (scheduleRef.current.filter((s) => !s.done).length === 0) {
      setNotice('没有待执行的行程，先点「安排行程」加几条。');
      dbg('推进失败：没有待执行条目');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setForceLogin(true);
      return;
    }
    setSyncStatus('syncing');
    const res = await startClock(runId, sessionId, speed, token, scheduleRef.current);

    if (res.kind === 'ok') {
      const { clock: nextClock, state, schedule: nextSchedule, revision: nextRevision } = res.data;
      applyAuthoritative(state, nextSchedule, nextClock, nextRevision);
      setSpeed(nextClock.speed);
      setReadonlyBanner(false);
      setGameNow(runRef.current.at);
      setSnapshot({ run: runRef.current, schedule: scheduleRef.current });
      batchRef.current = {
        from: runRef.current.at,
        prevRun: runRef.current,
        prevSchedule: scheduleRef.current,
      };
      setRunning(true);
      setSyncStatus('synced');
      if (res.data.offline) setNotice(offlineText(res.data.offline));
      dbg('服务端授予推进权 at=' + String(runRef.current.at) + ' speed=' + nextClock.speed);
      return;
    }

    if (res.kind === 'no_schedule' || res.kind === 'pending_event') {
      applyAuthoritative(
        res.data.state,
        res.data.schedule ?? scheduleRef.current,
        res.data.clock,
        res.data.revision,
      );
      setRunning(false);
      setNotice(
        res.kind === 'pending_event'
          ? '先处理重点事件，时间已暂停。'
          : '没有待执行的行程，先点「安排行程」加几条。',
      );
      if (res.kind === 'pending_event' && res.data.state.pendingEvent) {
        setActiveEventId(res.data.state.pendingEvent);
      }
      return;
    }

    if (res.kind === 'taken_over') {
      applyAuthoritative(res.data.state, res.data.schedule ?? scheduleRef.current, res.data.clock, res.data.revision);
      setRunning(false);
      setReadonlyBanner(true);
      setNotice('另一台设备接手了这局。');
      return;
    }

    if (res.kind === 'unauthorized') {
      setForceLogin(true);
      return;
    }
    if (res.kind === 'error') {
      setSyncStatus('offline');
      setNotice('推进失败：服务端连不上，稍后再试。');
      return;
    }
    setNotice('这个倍速不被服务端接受。');
  }

  advanceRef.current = advance;

  function stopCurrent() {
    if (!running) return;
    setConfirmAction('stop');
  }

  /** T-025：暂停 = 服务端冻结锚点，停在这里（不作废当前行动） */
  async function doStop() {
    setConfirmAction(null);
    const token = await getAccessToken();
    if (!token) {
      setForceLogin(true);
      return;
    }
    dbg('请求服务端暂停');
    const res = await pauseClock(runId, sessionId, token);

    if (res.kind === 'ok') {
      applyAuthoritative(
        res.data.state,
        res.data.schedule ?? scheduleRef.current,
        res.data.clock,
        res.data.revision,
      );
      setRunning(false);
      batchRef.current = null;
      setSnapshot(null);
      resumeAfterEvent.current = false;
      setGameNow(runRef.current.at);
      setSpeed(res.data.clock.speed);
      setNotice('已暂停：停在这里，回来接着走。');
      setSyncStatus('synced');
      if (res.data.offline) setNotice(offlineText(res.data.offline));
      return;
    }

    if (res.kind === 'taken_over') {
      applyAuthoritative(res.data.state, res.data.schedule ?? scheduleRef.current, res.data.clock, res.data.revision);
      setRunning(false);
      setReadonlyBanner(true);
      setNotice('另一台设备接手了这局。');
      return;
    }

    if (res.kind === 'unauthorized') {
      setForceLogin(true);
      return;
    }
    setNotice('暂停同步失败，请稍后再试。');
  }

  /** 仅测试用：清空本地存档，从头新建一局并覆盖云端 */
  function restartForTest() {
    setConfirmAction('restart');
  }

  /** T-016：起名 / 改名。规则：trim、1–12 字；空 = 跳过（默认「未命名」） */
  function applyIdolName(raw: string) {
    const trimmed = String(raw ?? '').trim().slice(0, 12);
    const next: RunState = { ...runRef.current, name: trimmed || '未命名' };
    commitRun(next);
    setNameModalOpen(false);
    setNameDraft('');
    // 立即写一次存档，否则刷新页面会再弹一次起名框
    const ok = writeSave({
      version: 2,
      runId,
      revision,
      updatedAt: Date.now(),
      seed,
      run: next,
      schedule: scheduleRef.current,
    });
    if (ok) setSavedAt(Date.now());
    void pushWholeState(next);
    setNotice(trimmed ? `偶像名已设为「${trimmed}」。` : '已使用默认名「未命名」。');
  }

  function openRenameIdol() {
    const cur = runRef.current.name ?? '';
    // 「未命名」是默认占位，改名时不回填到输入框里
    setNameDraft(cur && cur !== '未命名' ? cur : '');
    setNameModalOpen(true);
  }

  /**
   * 关闭起名框：已起名 = 取消（不动名字，避免误点 X 把名字清成「未命名」）；
   * 未起名 = 等同于「跳过」，落到默认名。
   */
  function cancelNameModal() {
    if (runRef.current.name) {
      setNameModalOpen(false);
      setNameDraft('');
      return;
    }
    applyIdolName('');
  }

  function doRestart() {
    setConfirmAction(null);

    const fresh = createSave(initialRun, 'run-demo');
    clearSave();
    // T-025：新档时钟回到 idle（本地不再持有权威，只重置显示态）
    commitClock(createClock(initialRun.at));
    dbg('重新开始（测试）');
    setRunning(false);
    batchRef.current = null;
    resumeAfterEvent.current = false;
    setSnapshot(null);
    setGameNow(T0);
    setRunId(fresh.runId);
    commitRun(initialRun);
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
    // T-020：底稿取 runRef.current；提交走 commitRun（同步 runRef，避免下一 tick 用旧状态覆盖）
    const { state } = createParty(runRef.current, partyName);
    commitRun(state);
    setShowPartyModal(false);
    setNotice('组合创建好了。');
    void pushWholeState(state);
  }

  function doMeet(channelId: string) {
    const r = meetFriend(runRef.current, channelId, seed);
    if (r.result === 'poor') {
      setNotice('钱不够，先攒一点。');
      return;
    }
    if (r.result === 'empty') {
      commitRun(r.state);
      setNotice('这次没遇到合适的人（钱照扣）。');
      return;
    }
    if (r.result === 'dup') {
      // 走的是「重复认识」分支：也要把新的状态写回去（扣钱 + 日志 + 默契）
      commitRun(r.state);
      setNotice('又见到了认识的人，默契 +1%。');
      return;
    }
    if (r.result !== 'ok') {
      setNotice('这个渠道暂时去不了。');
      return;
    }
    commitRun(r.state);
    // 不切换页签：留在「认识新朋友」方便连续抽取
    setNotice(r.friend ? `认识了 ${r.friend.name}，已加入朋友圈。` : '认识了一个新朋友。');
  }

  function doReward(taskId: string) {
    const r = claimTaskReward(runRef.current, taskId);
    if (r.result === 'ok') {
      commitRun(r.state);
      // T-013 bug 2：任务标记（doneAt/count）要推给服务端，否则云端重算会把本地任务状态冲掉
      void pushWholeState(r.state);
      setNotice('任务奖励已领取。');
      return;
    }
    setNotice('任务还没完成。');
  }

  function doAccept(taskId: string) {
    const r = acceptTask(runRef.current, taskId);
    if (r.result === 'ok') {
      commitRun(r.state);
      // T-013 bug 2：acceptedAt 标记要推给服务端（与 doBuy/doEquip 一致）
      void pushWholeState(r.state);
      setNotice('任务已领取，完成后会自动结算奖励。');
      return;
    }
    setNotice(r.result === 'done' ? '这个任务已经完成了。' : '现在还不能领取。');
  }

  function doKick(memberId: string) {
    const base = runRef.current;
    const partyId = base.activePartyId;
    if (!partyId) return;
    const target = base.parties.find((p) => p.id === partyId)?.members.find((m) => m.id === memberId);
    commitRun({
      ...base,
      parties: base.parties.map((p) =>
        p.id === partyId ? { ...p, members: p.members.filter((m) => m.id !== memberId) } : p,
      ),
      friends: target
        ? base.friends.map((f) =>
            f.name === target.name
              ? { ...f, partyId: null, cooldownUntil: base.at + RECRUIT_COOLDOWN_DAYS * DAY_MS }
              : f,
          )
        : base.friends,
    });
    setNotice('已移出组合。');
  }

  function doInvite(friendId: string) {
    const r = inviteFriend(runRef.current, friendId);
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
    commitRun(r.state);
    setNotice('已经邀请进组合了。');
  }

  function doRecruit() {
    const base = runRef.current;
    if (!base.activePartyId) {
      setNotice('还没有组合，招募不了。');
      return;
    }
    const { state, result } = recruit(base, `${seed}:recruit:${base.log.length}:${Date.now()}`);
    if (result === 'poor') {
      setNotice('钱不够招募了。');
      return;
    }
    if (result === 'no-party') {
      setNotice('还没有组合，招募不了。');
      return;
    }
    commitRun(state);
    setNotice(state.log.at(-1)?.text ?? '');
    void pushWholeState(state);
  }

  function doSwitchParty(id: string) {
    commitRun(switchParty(runRef.current, id));
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

  // T-025：开屏是否自动播放由服务端 clock 决定（见上面的云端恢复 + clock/session 流程）；
  // 客户端不再用本地 paused 判断，也不再本地补离线时间。

  function doDivine() {
    const { state, result, cost } = divine(runRef.current);
    if (result === 'poor') {
      setNotice(`占卜要 ${cost}，钱不够。`);
      return;
    }
    commitRun(state);
    setReading(divinationReading(state));
    setNotice(`花 ${cost} 占了一卦。`);
    void pushWholeState(state);
  }

  function doDebut() {
    // T-018：出道成功后把推导出的阶段（seq4 rookie-idol）补进 stage:reached
    const base = runRef.current;
    const next = syncStageReached(debut(base));
    commitRun(next);
    setNotice(next === base ? '还没达到出道条件。' : '出道了！现在可以组建组合。');
    void pushWholeState(next);
  }

  /** T-018：晋级（下一阶段是 seq4 时走出道演出流程） */
  function doAdvanceStage() {
    const result = advanceStage(runRef.current);
    if (result.result === 'debut-required') {
      doDebut();
      return;
    }
    if (result.result === 'ok') {
      commitRun(result.state);
      setNotice(result.notice);
      void pushWholeState(result.state);
      return;
    }
    setNotice(result.notice);
  }

  function doBuy(item: EquipItem) {
    const { state, result } = buyItem(runRef.current, item);
    if (result !== 'ok') {
      setNotice('钱不够。');
      return;
    }
    commitRun(state);
    setNotice(state.log.at(-1)?.text ?? '');
    void pushWholeState(state);
  }

  function doEquipBag(invId: string, targetSlot?: EquipSlot) {
    const base = runRef.current;
    const outcome = equipItem(base, invId, targetSlot);
    if (outcome.result === 'requirement') {
      const entry = base.inventory.find((e) => e.id === invId);
      const def = entry ? equipDefOf(entry) : null;
      setNotice(`装备要求未满足：${def ? describeCondition(def.requirement) : '条件不足'}。`);
      return;
    }
    if (outcome.result !== 'ok') {
      setNotice(outcome.notice);
      return;
    }
    commitRun(outcome.state);
    setNotice(outcome.notice);
    void pushWholeState(outcome.state);
  }

  function doUnequipBag(slot: EquipSlot) {
    const { state, notice } = unequipItem(runRef.current, slot);
    commitRun(state);
    setNotice(notice);
    void pushWholeState(state);
  }

  /** T-019：使用消耗品（隐藏效果写进 axes/负向，但日志与 notice 只列显性部分） */
  function doUseItem(invId: string) {
    const outcome = useItem(runRef.current, invId);
    if (outcome.result !== 'ok') {
      setNotice(outcome.notice);
      return;
    }
    commitRun(outcome.state);
    setNotice(outcome.notice);
    void pushWholeState(outcome.state);
  }

  /** T-019：便利店买消耗品（common/uncommon，按参考价；rare/legendary 不上架） */
  function doBuyConsumable(itemId: string) {
    const def = ITEMS_MAP[itemId];
    if (!def) return;
    const base = runRef.current;
    if (base.money < def.price) {
      setNotice('钱不够。');
      return;
    }
    let next = addConsumable(base, itemId);
    next = {
      ...next,
      money: next.money - def.price,
      log: [
        ...next.log,
        {
          at: next.at,
          actionId: 'buy-consume',
          text: `在便利店买了「${def.name}」。`,
          staminaDelta: 0,
          statDelta: {},
          kind: 'action',
        },
      ],
    };
    commitRun(next);
    setNotice(`买下了「${def.name}」。`);
    void pushWholeState(next);
  }

  async function choose(eventId: string, choiceId: string) {
    const base = runRef.current;
    const wasMajor = base.pendingEvent === eventId;
    const next = applyChoice(base, eventId, choiceId);
    setActiveEventId(null);
    commitRun(next);
    setNotice('选择已记录。');
    dbg('选择 ' + choiceId);
    await pushWholeState(next);

    const rest = scheduleRef.current.filter((s) => !s.done);
    if (wasMajor && resumeAfterEvent.current && rest.length > 0) {
      resumeAfterEvent.current = false;
      setSnapshot(null);
      dbg('事件处理完，自动续跑 ' + String(rest.length) + ' 个');
      // 继续推进必须重新向服务端申请（clock 在事件后是 idle）
      void advanceRef.current();
    }
  }

  /** T-025：改倍速 = 先 pause 再 start(speed)（服务端会重算锚点） */
  async function changeSpeed(next: number) {
    if (!ALLOWED_SPEEDS.includes(next as (typeof ALLOWED_SPEEDS)[number])) return;
    if (!running) {
      setSpeed(next);
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setForceLogin(true);
      return;
    }
    const paused = await pauseClock(runId, sessionId, token);
    if (paused.kind !== 'ok') {
      setNotice(paused.kind === 'taken_over' ? '另一台设备接手了这局。' : '切换倍速失败，请稍后再试。');
      if (paused.kind === 'taken_over') {
        applyAuthoritative(paused.data.state, paused.data.schedule ?? scheduleRef.current, paused.data.clock, paused.data.revision);
        setRunning(false);
        setReadonlyBanner(true);
      }
      return;
    }
    setRunning(false);
    applyAuthoritative(paused.data.state, paused.data.schedule ?? scheduleRef.current, paused.data.clock, paused.data.revision);
    const started = await startClock(runId, sessionId, next, token, scheduleRef.current);
    if (started.kind === 'ok') {
      applyAuthoritative(started.data.state, started.data.schedule, started.data.clock, started.data.revision);
      setSpeed(started.data.clock.speed);
      batchRef.current = { from: runRef.current.at, prevRun: runRef.current, prevSchedule: scheduleRef.current };
      setSnapshot({ run: runRef.current, schedule: scheduleRef.current });
      setGameNow(runRef.current.at);
      setRunning(true);
      setNotice(`倍速已切到 ${next}×。`);
    } else {
      setNotice('切换倍速后未能继续推进。');
    }
  }

  async function continueHere() {
    setReadonlyBanner(false);
    await advance();
  }

  function decide(d: 'stay' | 'backstage' | 'leave') {
    setEnding(judgeEnding(runRef.current, d));
    setPhase('ended');
    setNotice(null);
    void pushWholeState(runRef.current);
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

  const api: AppApi = {
    run,
    seed,
    removeItem,
    party,
    pending,
    visibleItems,
    pastItems,
    futureItems,
    nextItem,
    dayBreakLabels,
    visibleLog,
    running,
    gameNow,
    remainMs,
    currentPct,
    speed,
    lastStop,
    stopText: STOP_TEXT,
    mainTab,
    setMainTab,
    taskTab,
    setTaskTab,
    friendsTab,
    setFriendsTab,
    rightTab,
    setRightTab,
    bagTab,
    setBagTab,
    logTab,
    setLogTab,
    flippedIds,
    toggleFlip,
    managing,
    setManaging,
    historyLimit,
    setHistoryLimit,
    todayIndex,
    usedToday,
    statTotal,
    totalFans,
    syncStatus,
    syncText: SYNC_TEXT,
    savedAt,
    user,
    notice,
    setNotice,
    advance,
    stopCurrent,
    openPlan,
    addShow,
    doAccept,
    doReward,
    doMeet,
    doInvite,
    doKick,
    doBuy,
    doUseItem,
    doEquipBag,
    doUnequipBag,
    doBuyConsumable,
    doDebut,
    doAdvanceStage,
    doSwitchParty,
    openPartyModal,
    doDivine,
    signOut,
    restartForTest,
    setShowInvite,
    setShowDivination,
    setActiveEventId,
    setKickTarget,
    setShowStops,
    setShowDebug,
    setDebugText,
    dayLabel,
    biasLabel,
    weekdayName,
    // T-016：属性面板点偶像名改名
    onRenameIdol: openRenameIdol,
  };

  const modalCtx = {
    ...api,
    activeEventId,
    setActiveEventId,
    choose,
    runId,
    run,
    phase,
    ending,
    showActions,
    showDivination,
    reading,
    showPartyModal,
    partyName,
    confirmAction,
    showStops,
    showInvite,
    kickTarget,
    forceLogin,
    showDebug,
    debugText,
    setRunId,
    commitRun,
    setSchedule,
    setRevision,
    setNotice,
    setSyncStatus,
    setPhase,
    setEnding,
    setShowDivination,
    setShowPartyModal,
    setPartyName,
    setConfirmAction,
    setShowStops,
    setShowInvite,
    setKickTarget,
    setForceLogin,
    setShowDebug,
    doStop,
    doRestart,
    doKick,
    doInvite,
    doDivine,
    savePlan,
    cancelPlan,
    clearPlan,
    t0: T0,
    addAction,
    removeItem,
    toggleStop,
    previewRef,
    dayLabel,
    biasLabel,
    party,
    pending,
    confirmCreateParty,
    decide,
    clearSave,
    createSave,
    initialRun,
  };

  return (
    <div className="app">
      <CrashBanner msg={crash} onClose={() => setCrash(null)} />
      {readonlyBanner ? (
        <div className="crash-banner readonly-banner">
          <div className="crash-text">
            <strong>只读模式：</strong>
            <span>另一台设备接手了这局。</span>
          </div>
          <button className="icon-btn" onClick={() => void continueHere()}>
            在此设备继续
          </button>
        </div>
      ) : null}
      <header className="bar">
        {/* T-023：一行 5 块并列 —— 标题卡 / 角色动画 / 时间轴 / 状态 / 任务简报 */}
        <div className="bar-left bar-card">
          <div className="title-brand-row">
            <span className="brand">idollife</span>
            {syncStatus !== 'local' && (
              <span className={`chip chip-${syncStatus}`}>{SYNC_TEXT[syncStatus]}</span>
            )}
          </div>
          <span className="clock title-clock">
            第 {todayIndex + 1} 天 · {weekdayName(todayIndex)} · 今日剩余{' '}
            {Math.max(0, 3 - usedToday)}/3
          </span>
          <div className="title-account">
            <span className="acct-email" title={user?.email ?? ''}>
              {user?.email ?? '已离线'}
            </span>
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

        {/* T-024：中间三块（角色动画 / 时间轴 / 状态）包进 .bar-center，顶栏与主区同列宽 */}
        <div className="bar-center">
          {/* 角色动画占位（无标题，白卡外观由 .bar-card 统一） */}
          <aside className="mod tl-anim bar-card">
            <div className="tl-anim-hold">动画预留位</div>
          </aside>

          <TimeAxis
            pastItems={pastItems}
            futureItems={futureItems}
            nextItem={nextItem}
            running={running}
            remainMs={remainMs}
            pct={currentPct}
            dayBreakLabels={dayBreakLabels}
            actionNo={actionNo}
            speed={speed}
            setSpeed={changeSpeed}
            pendingCount={pending.length}
            todayIndex={todayIndex}
            weekdayName={weekdayName}
            lastStop={lastStop}
            stopText={STOP_TEXT}
            onAdvance={advance}
            onStop={stopCurrent}
            onArrange={openPlan}
            onHistory={() => setMainTab('plan')}
            onOpenStops={() => setShowStops(true)}
          />

          <TimelineStatus run={run} />
        </div>

        <div className="bar-right bar-card">
          <div className="brief-head">任务简报</div>
          <ul className="brief-list">
            {briefSections.length === 0 ? (
              <li>
                <span className="brief-text">暂无进行中的任务</span>
              </li>
            ) : null}
            {briefSections.map((section) => (
              <Fragment key={section.category}>
                <li className="brief-sep">{section.label}</li>
                {section.tasks.map((entry) => renderBrief(entry))}
              </Fragment>
            ))}
            {briefOverflow > 0 ? <li className="brief-more">+{briefOverflow}</li> : null}
          </ul>
        </div>
      </header>



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
              <TaskPanel
                run={run}
                tab={taskTab}
                onTab={setTaskTab}
                onAccept={doAccept}
                onReward={doReward}
                dayLabel={dayLabel}
              />
            )}
            {mainTab === 'friends' && <FriendsPanel api={api} />}

{mainTab === 'stats' && <StatsPanel api={api} />}

{mainTab === 'plan' && <PlanPanel api={api} />}

{mainTab === 'bag' && <BagPanel api={api} />}

{mainTab === 'party' && <PartyPanel api={api} />}

{mainTab === 'shop' && <ShopPanel api={api} />}

{mainTab === 'divine' && <DivinePanel api={api} />}


          </section>

          <LogPanel
            tab={logTab}
            onTab={setLogTab}
            logs={visibleLog}
            logRef={logRef}
            notice={notice}
            t0={T0}
            weekdayName={weekdayName}
          />
        </section>

        {/* 右：账户信息 + 辅助（背包） */}
        <SidePanel api={api} />
      </main>


      {/* T-016：开局起名 / 改名（可跳过，默认「未命名」） */}
      {nameModalOpen && (
        <Modal
          title={run.name ? '修改偶像名' : '给偶像起个名字'}
          onClose={cancelNameModal}
        >
          <div className="name-form">
            <input
              className="name-input"
              value={nameDraft}
              maxLength={12}
              autoFocus
              placeholder="1–12 个字；跳过就用「未命名」"
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyIdolName(nameDraft);
              }}
            />
            <p className="muted small">名字只影响显示，不影响任何数值。之后在「属性」面板点名字可以改。</p>
            <div className="name-actions">
              <button className="primary" onClick={() => applyIdolName(nameDraft)}>
                {run.name ? '保存' : '开始'}
              </button>
              <button onClick={cancelNameModal}>{run.name ? '取消' : '跳过'}</button>
            </div>
          </div>
        </Modal>
      )}

      <Modals ctx={modalCtx} />
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