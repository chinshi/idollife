import { Component, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACTION_LIST,
  ACTIONS,
  CATEGORY_LABEL,
  DAILY_SLOTS,
  ACTION_MS,
  ACTION_META,
  nextPendingItem,
  sortedPending,
  preflightNext,
  DAY_MS,
  WEEK_MS,
  SHOW_ACTION_ID,
  RECRUIT_COST,
  RUN_LENGTH_MS,
  START_MONEY,
  activeParty,
  applyChoice,
  applyShow,
  biasLabel,
  buyItem,
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
  kickMember,
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
  // T-039：恒 1×
  TIME_SCALE,
  createClock,
  // T-027：槽位落位
  placeAction,
  // T-040：清空/删除要跳过正在执行的条目；提交前按服务端执行结果对齐
  isExecuting,
  reconcileSchedule,
  START_AT,
  // T-028：推进公式
  gameAdvance,
  // T-032：演出
  canBook,
  canCancel,
  entryFee,  // T-019：道具系统
  ITEMS_MAP,
  addConsumable,
  equipDefOf,
  describeCondition,
  useItem,
  unequipItem,
  judgeEnding,
  // T-041：结局抉择落库 + 刷新后恢复结局页
  recordEnding,
  decidedEnding,
  memberStats,
  performShow,
  recruit,
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
  Booking,
  ShowOccurrence,
  ShowSlotDef,
  SettleResult,
  TaskBriefEntry,
} from '@idollife/core';
import { clearSave, createSave, loadSave, normalizeRun, resolveBootSave, writeSave, type SaveV2 } from './state/save';
import { AuthForm } from './components/AuthForm';
import { CrashBanner, Modal } from './components/Modal';
import { TimeAxis } from './components/TimeAxis';
import { TimelineStatus } from './components/TimelineStatus';
import { LogPanel } from './components/LogPanel';
import { TaskPanel, type TaskTab } from './components/TaskPanel';
import { FriendsPanel } from './components/FriendsPanel';
import { StatsPanel } from './components/StatsPanel';
import { PlanPanel } from './components/PlanPanel';
import { ShowPanel } from './components/ShowPanel';
import { advanceGate, makeAdvanceBlock, type AdvanceBlock } from './components/advance-block';
import { shouldFireAdvance } from './components/advance-scheduler';
import { freshBase, shouldWriteFresh } from './components/fresh-state';
import { BlockBar } from './components/BlockBar';
import { BagPanel } from './components/BagPanel';
import { PartyPanel } from './components/PartyPanel';
import { ShopPanel } from './components/ShopPanel';
import { DivinePanel } from './components/DivinePanel';
import type { AppApi } from './components/api';
import { SidePanel } from './components/SidePanel';
import { Modals } from './components/Modals';
import {
  advance as serverAdvance,
  getState,
  putState,
  startClock,
  pauseClock,
  type StateResponse,
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
const T0 = START_AT;
const RUN_END = T0 + RUN_LENGTH_MS;

const initialRun: RunState = {
  startedAt: T0,
  at: T0,
  stamina: 100,
  money: START_MONEY,
  stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
  axes: { self: 50, others: 50, fit: 50 },
  mood: 70,
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
type MainTab = 'task' | 'stats' | 'plan' | 'show' | 'party' | 'friends' | 'shop' | 'divine' | 'bag';

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
  const bootRef = useRef<SaveV2 | null>(loadSave());

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLost, setAuthLost] = useState(false);
  const [crash, setCrash] = useState<string | null>(null);
  const hadUser = useRef(false);
  const [checking, setChecking] = useState(true);

  const [runId, setRunId] = useState(bootRef.current?.runId ?? createSave(initialRun, 'run-demo').runId);
  // T-017：进入游戏（读档 / 新档）时先补跑一次自动领取，让引导任务从第一眼就是「进行中」。
  // 放在 useState 的惰性初始化里 = 首次渲染前完成，不需要等第一次行动结算。
  const [run, setRun] = useState<RunState>(() => autoAcceptTasks(bootRef.current?.run ?? initialRun));
  const [schedule, setSchedule] = useState<ScheduleItem[]>(bootRef.current?.schedule ?? []);
  const [revision, setRevision] = useState<number>(bootRef.current?.revision ?? 0);
  const [seed] = useState(bootRef.current?.seed ?? 'run-demo');
  const [savedAt, setSavedAt] = useState<number | null>(bootRef.current?.updatedAt ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  /**
   * T-040：正在等服务端回包的动作标识（null = 空闲）。
   * 所有「点了要等服务器」的按钮都用它出加载态并互斥，
   * 避免玩家以为没点上、连点导致 revision 冲突后数值突然跳变。
   */
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);

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
  const [advanceBlock, setAdvanceBlock] = useState<AdvanceBlock | null>(null);
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
    stamina: '体力不够，停在这一条',
    money: '钱不够，停在这一条',
    times: '次数用完了',
    exhausted: '这一批行程走完了',
    stopped: '到指定的停止点停下了',
    event: '有事件需要处理',
    ending: '两年到了',
    time: '',
  };
  const [historyLimit, setHistoryLimit] = useState(9);
  const [forceLogin, setForceLogin] = useState(false);
  const [running, setRunning] = useState(false);
  /** T-039：服务端时钟（唯一权威）；null 表示尚未从服务端拿到 */
  const [clock, setClock] = useState<ClockState | null>(null);
  const clockRef = useRef<ClockState | null>(null);
  const [clockSyncError, setClockSyncError] = useState(false);

  const [gameNow, setGameNow] = useState<number>(bootRef.current?.run?.at ?? T0);

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

  /** T-039：应用服务端权威状态（客户端只展示，不结算） */
  function applyServerState(data: StateResponse) {
    serverOffsetRef.current = data.serverTime - Date.now();
    const nextRun = normalizeRun(data.run);
    commitRun(nextRun);
    scheduleRef.current = data.schedule;
    setSchedule(data.schedule);
    commitClock(data.clock);
    setRevision(data.revision);
    setGameNow(
      data.clock.status === 'running'
        ? data.clock.gameAt + gameAdvance(data.serverTime - data.clock.wallAnchor, 1, TIME_SCALE)
        : data.clock.gameAt,
    );
    setRunning(data.clock.status === 'running');
    setSyncStatus('synced');
  }

  async function loadAndCatchUpClient(effectiveRunId: string, token: string) {
    let res = await getState(effectiveRunId, token);
    if (res.kind === 'not_found') {
      const created = await putState(
        effectiveRunId,
        0,
        { run: autoAcceptTasks(normalizeRun(runRef.current)), schedule: scheduleRef.current, seed },
        token,
      );
      res = created;
    }
    if (res.kind === 'unauthorized') {
      setForceLogin(true);
      return;
    }
    if (res.kind !== 'ok') {
      setClockSyncError(true);
      setSyncStatus('offline');
      setNotice('云端状态读取失败，进度暂未校验。');
      return;
    }
    applyServerState(res.data);
    setClockSyncError(false);
    if (res.data.clock.status === 'running') {
      const caught = await serverAdvance(effectiveRunId, res.data.revision, null, token);
      if (caught.kind === 'ok') {
        const stepped = caught.data.stepped ?? 0;
        applyServerState(caught.data);
        if (stepped > 0) setNotice(offlineText(stepped, caught.data.stoppedReason));
      }
    }
  }

  function offlineText(stepped: number, reason?: string | null): string {
    const stop = reason && STOP_TEXT[reason] ? `（停在：${STOP_TEXT[reason]}）` : '';
    return `你不在的这段时间，行程又走了 ${stepped} 条。${stop}`;
  }

  const scheduleRef = useRef<ScheduleItem[]>(bootRef.current?.schedule ?? []);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [boxH, setBoxH] = useState(0);
  const gameNowRef = useRef<number>(bootRef.current?.run?.at ?? T0);
  const resumeAfterEvent = useRef(false);
  /** T-025：fire-and-forget 上报失败队列（下次成功时合并补报） */
  /** T-029：服务端时间偏移 / 本次运行起点与墙钟 */
  const serverOffsetRef = useRef(0);
  const dbgLines = useRef<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [debugText, setDebugText] = useState('');

  const pulledFor = useRef<string | null>(null);


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
      setSyncStatus('syncing');
      setNotice('正在同步云端状态…');
      const token = await getAccessToken();
      if (!token) {
        setForceLogin(true);
        return;
      }

      let effectiveRunId = runId;
      const ownedBoot = resolveBootSave(bootRef.current, user.id);
      if (bootRef.current && !ownedBoot) {
        clearSave();
        bootRef.current = null;
        const reset = createSave(autoAcceptTasks(normalizeRun(initialRun)), 'run-demo', user.id);
        effectiveRunId = reset.runId;
        setRunId(reset.runId);
        commitRun(reset.run);
        scheduleRef.current = [];
        setSchedule([]);
        setRevision(0);
        setSavedAt(null);
        setNotice('检测到另一个账号的本地存档，已切换。');
      }
      if (cancelled) return;
      await loadAndCatchUpClient(effectiveRunId, token);
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
        ownerId: user?.id,
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

  // T-039：同一个 100ms tick 既更新进度条，也检查停点；不再依赖 gameNow 触发的 effect
  const advancingRef = useRef(false);
  useEffect(() => {
    if (!running || !clock || clock.status !== 'running') return;
    // T-040：安排行程弹窗开着时停止自动推进。
    // 回包会 applyServerState → 覆盖 schedule，玩家正在编辑的内容会被服务端旧副本冲掉，
    // 表现就是「改行程时被正在执行的行程覆盖」。关掉弹窗后由 putSchedule 一次对齐。
    if (showActions) return;
    const timer = window.setInterval(() => {
      const serverNow = Date.now() + serverOffsetRef.current;
      setGameNow(clock.gameAt + gameAdvance(serverNow - clock.wallAnchor, 1, TIME_SCALE));
      if (advancingRef.current) return;
      const fire = shouldFireAdvance({
        clock,
        schedule: scheduleRef.current,
        serverNow,
        timeScale: TIME_SCALE,
      });
      if (!fire.fire) return;
      void (async () => {
        advancingRef.current = true;
        try {
          const token = await getAccessToken();
          if (!token) return;
          const res = await serverAdvance(runId, revision, fire.targetAt, token);
          if (res.kind === 'ok') {
            applyServerState(res.data);
            if ((res.data.stepped ?? 0) > 0) {
              setNotice(offlineText(res.data.stepped ?? 0, res.data.stoppedReason));
            }
            if (res.data.clock.status === 'paused') {
              setLastStop(res.data.stoppedReason ?? 'exhausted');
              setNotice(
                `行程停在这里：${STOP_TEXT[res.data.stoppedReason ?? 'exhausted'] ?? '已停止'}`,
              );
            }
          } else if (res.kind === 'conflict' && res.data) {
            applyServerState(res.data);
          }
        } finally {
          advancingRef.current = false;
        }
      })();
    }, 100);
    return () => window.clearInterval(timer);
  }, [running, clock, schedule, revision, runId, showActions]);

  const lastEnd = useMemo(
    () => schedule.reduce((max, s) => Math.max(max, s.endAt), run.at),
    [schedule, run.at],
  );


  const pending = useMemo(() => sortedPending(schedule), [schedule]);

  // T-035-r2：拦截横幅绑定队首条目；条目被删/完成后自动失效
  useEffect(() => {
    const id = advanceBlock?.itemId;
    if (!id) return;
    if (!schedule.some((s) => s.id === id && !s.done)) {
      setAdvanceBlock(null);
      setLastStop('');
    }
  }, [schedule, advanceBlock?.itemId]);

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

  const nextItem = pending.length > 0 ? pending[0]! : null;
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
    .reduce((n, s) => n + (s.slots ?? 1), 0);

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
  /**
   * T-041：存档里已经有结局抉择 → 刷新页面 / 换设备后直接回到结局页。
   * 用 `prev ??` 是为了不覆盖刚算出来的那份，避免文案每 100ms 重算一次。
   */
  useEffect(() => {
    if (!run.ending) return;
    setEnding((prev) => prev ?? decidedEnding(run));
    setPhase('ended');
  }, [run]);

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

  /** T-039-r4：唯一状态写入入口。先对齐 → 用对齐后的 base 计算 → 应用 → 提交 */
  async function pushFresh(
    compute: (base: RunState) => RunState,
    overrideRunId?: string,
  ): Promise<RunState | null> {
    const token = await getAccessToken();
    if (!token) {
      setForceLogin(true);
      return null;
    }
    const id = overrideRunId ?? runId;
    const aligned = await serverAdvance(id, revision, null, token);
    const base = freshBase(aligned.kind === 'ok' ? aligned.data.run : null, runRef.current);
    const expected = aligned.kind === 'ok' ? aligned.data.revision : revision;
    if (aligned.kind === 'ok') applyServerState(aligned.data);

    const next = compute(base);
    if (!shouldWriteFresh(base, next)) return null;
    commitRun(next);
    let res = await putState(id, expected, { run: next, schedule: scheduleRef.current, seed }, token);
    if (res.kind === 'conflict' || res.kind === 'stale_clock') {
      res = await putState(
        id,
        res.data?.revision ?? expected,
        { run: next, schedule: scheduleRef.current, seed },
        token,
      );
    }
    if (res.kind === 'ok') {
      applyServerState(res.data);
      setSyncStatus('synced');
      return res.data.run;
    }
    return null;
  }

  /**
   * T-040：包住「要等服务端回包」的动作。
   *
   * 为什么必须互斥：服务端用 `expectedRevision` 做乐观锁，连点两次会让第二次
   * 拿旧 revision 打到 409，客户端再对齐重放，玩家看到的就是数值突然跳一次。
   * 所以只要有动作在飞，其余提交类按钮全部禁用，被点的那个显示加载态。
   */
  function runBusy(key: string, task: () => Promise<unknown>) {
    if (busyRef.current) return;
    busyRef.current = key;
    setBusyKey(key);
    void Promise.resolve()
      .then(task)
      .catch(() => {
        setNotice('操作没提交成功，稍后再试一次。');
      })
      .finally(() => {
        busyRef.current = null;
        setBusyKey(null);
      });
  }

  /**
   * 只提交排程：先对齐，PUT 不带 run（服务端沿用记录里的 run）
   *
   * T-040：这里的顺序必须小心 —— `serverAdvance` 回包带着**服务端那份** schedule，
   * 直接 `applyServerState` 会把玩家刚改的行程整份盖掉（"改了没用"的真身）。
   * 所以先抓本地快照，对齐只用来拿「哪些已执行完」和「现在到哪一刻」，
   * 内容仍以本地编辑为准，再按 `reconcileSchedule` 去掉已错过执行窗口的条目。
   */
  async function putSchedule(): Promise<void> {
    const token = await getAccessToken();
    if (!token) {
      setForceLogin(true);
      return;
    }
    // 本地编辑快照：必须在对齐覆盖 scheduleRef 之前取
    const local = scheduleRef.current;

    const aligned = await serverAdvance(runId, revision, null, token);
    const expected = aligned.kind === 'ok' ? aligned.data.revision : revision;
    const at = aligned.kind === 'ok' ? aligned.data.run.at : runRef.current.at;
    const serverSchedule = aligned.kind === 'ok' ? aligned.data.schedule : local;
    if (aligned.kind === 'ok') applyServerState(aligned.data);

    const merged = reconcileSchedule(
      local,
      serverSchedule.filter((s) => s.done).map((s) => s.id),
      at,
    );
    scheduleRef.current = merged;
    setSchedule(merged);

    const res = await putState(runId, expected, { schedule: merged }, token);
    if (res.kind === 'ok') {
      applyServerState(res.data);
      setSyncStatus('synced');
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
      .reduce((n, s) => n + (s.slots ?? 1), 0);

  }

  function openPlan() {
    setPlanBackup(schedule);
    setShowActions(true);
  }

  function savePlan() {
    setPlanBackup(null);
    setShowActions(false);
    setNotice('行程已保存。');
    void putSchedule();
  }
  function cancelPlan() {
    if (planBackup) {
      setSchedule(planBackup);
      scheduleRef.current = planBackup;
    }
    setPlanBackup(null);
    setShowActions(false);
    setNotice('已取消，行程恢复原样。');
  }

  /**
   * T-021：清空全部未执行行程（保留已执行历史；直接清 + toast）
   * T-040：正在执行的那条必须留下 —— 服务端 settle 已经把它算进本轮了，
   * 本地把它删掉会让 run.at 停在一条不存在的行程里，表现为时间卡住。
   */
  function clearPlan() {
    const at = runRef.current.at;
    const kept = scheduleRef.current.filter((s) => s.done || isExecuting(s, at));
    const running = kept.filter((s) => !s.done).length;
    scheduleRef.current = kept;
    setSchedule(kept);
    setNotice(
      running > 0
        ? `已清空后续行程（正在执行的 ${running} 条保留，等它跑完）。`
        : '已清空全部未执行行程。',
    );
    void putSchedule();
  }

  function addAction(actionId: string) {
    const action = ACTIONS[actionId];
    if (!action) return;

    const placed = placeAction({
      schedule: scheduleRef.current,
      at: runRef.current.at,
      durationMs: action.durationMs,
      dayMs: DAY_MS,
      actionMs: ACTION_MS,
      slotsPerDay: DAILY_SLOTS,
    });
    const nextSchedule = [
      ...scheduleRef.current,
      {
        id: `s-${Date.now()}-${scheduleRef.current.length}`,
        actionId,
        startAt: placed.startAt,
        endAt: placed.startAt + action.durationMs,
      },
    ].sort((a, b) => a.startAt - b.startAt);

    scheduleRef.current = nextSchedule;
    setSchedule(nextSchedule);
    setNotice(null);
    setPlanTick((n) => n + 1);
  }

  /** T-040：正在执行的条目不许删（删了服务端这一轮就没法结算） */
  function removeItem(id: string) {
    const at = runRef.current.at;
    const target = scheduleRef.current.find((s) => s.id === id);
    if (target && isExecuting(target, at)) {
      setNotice('这条正在执行，等它跑完再改。');
      return;
    }
    const next = scheduleRef.current.filter((s) => s.id !== id);
    scheduleRef.current = next;
    setSchedule(next);
  }

  function toggleStop(id: string) {
    const next = scheduleRef.current.map((s) =>
      s.id === id ? { ...s, stopAfter: !s.stopAfter } : s,
    );
    scheduleRef.current = next;
    setSchedule(next);
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

  const advanceRef = useRef<() => void>(() => {});

  /** T-039：开始推进 = 服务端置 running，随后一次 advance 补齐 */
  function advance() {
    const pend = scheduleRef.current.filter((s) => !s.done);
    const head0 = nextPendingItem(scheduleRef.current);
    dbg(
      '推进入口 at=' + String(runRef.current.at) +
      ' 待办=' + String(pend.length) +
      ' 队首=' + (head0 ? head0.id + '/' + head0.actionId + '@' + String(head0.startAt) : '无') +
      ' running=' + String(running),
    );

    const gate = advanceGate({
      running,
      pendingCount: pend.length,
      hasPendingEvent: !!runRef.current.pendingEvent,
    });
    if (gate) {
      setAdvanceBlock(gate);
      setNotice(gate.text);
      if (gate.reason === 'event' && runRef.current.pendingEvent) {
        setActiveEventId(runRef.current.pendingEvent);
      }
      return;
    }
    if (!requireLogin()) return;

    const first = nextPendingItem(scheduleRef.current);
    const pf = preflightNext(scheduleRef.current, runRef.current);
    if (pf && !pf.ok) {
      const meta = first ? ACTION_META[first.actionId] : undefined;
      const actionName = first ? ACTIONS[first.actionId]?.name ?? first.actionId : '这一条';
      const scopeWord = { day: '今天', week: '本周', run: '本局' }[meta?.timesScope ?? 'run'];
      const block = makeAdvanceBlock(pf, actionName, scopeWord, meta?.times, first?.id);
      setAdvanceBlock({ reason: block.reason, text: block.text, itemId: block.itemId });
      setLastStop(block.lastStop);
      setNotice(block.text);
      return;
    }
    setAdvanceBlock(null);
    setClockSyncError(false);
    setSyncStatus('syncing');

    void (async () => {
      const token = await getAccessToken();
      if (!token) {
        setForceLogin(true);
        return;
      }
      const started = await startClock(runId, token);
      if (started.kind === 'no_schedule') {
        setNotice('没有待执行的行程。');
        return;
      }
      if (started.kind === 'pending_event') {
        setNotice('先处理重点事件。');
        return;
      }
      if (started.kind !== 'ok') {
        setClockSyncError(true);
        setNotice('开始推进失败，请重试。');
        return;
      }
      applyServerState(started.data);
      const next = await serverAdvance(runId, started.data.revision, null, token);
      if (next.kind === 'ok') {
        applyServerState(next.data);
        if ((next.data.stepped ?? 0) > 0) {
          setNotice(offlineText(next.data.stepped ?? 0, next.data.stoppedReason));
        }
      }
      dbg('服务端启动/推进 runId=' + runId);
    })();
  }

  advanceRef.current = advance;

  function stopCurrent() {
    if (!running) return;
    setConfirmAction('stop');
  }

  /** T-039：停止 = 服务端结算到当前上界并置 paused */
  function doStop() {
    setConfirmAction(null);
    setAdvanceBlock(null);
    if (!running) return;
    void (async () => {
      const token = await getAccessToken();
      if (!token) {
        setForceLogin(true);
        return;
      }
      const res = await pauseClock(runId, null, token);
      if (res.kind === 'ok') {
        applyServerState(res.data);
        setNotice('已暂停：停在这里，回来接着走。');
      } else {
        setRunning(false);
        setNotice('停止失败，已断开推进显示。');
      }
    })();
  }

  /** 仅测试用：清空本地存档，从头新建一局并覆盖云端 */
  function restartForTest() {
    setConfirmAction('restart');
  }

  /** T-016：起名 / 改名。规则：trim、1–12 字；空 = 跳过（默认「未命名」） */
  function applyIdolName(raw: string) {
    const trimmed = String(raw ?? '').trim().slice(0, 12);
    setNameModalOpen(false);
    setNameDraft('');
    void pushFresh((b) => ({ ...b, name: trimmed || '未命名' }));
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
    resumeAfterEvent.current = false;
    setGameNow(T0);
    setRunId(fresh.runId);
    commitRun(initialRun);
    setSchedule([]);
    setRevision(0);
    setEnding(null);
    setPhase('playing');
    setNotice('已新建一局。');
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const created = await putState(fresh.runId, 0, { run: initialRun, schedule: [], seed }, token);
      if (created.kind === 'ok') applyServerState(created.data);
    })();
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
    setShowPartyModal(false);
    setNotice('组合创建好了。');
    void pushFresh((b) => createParty(b, partyName).state);
  }

  function doMeet(channelId: string) {
    runBusy(`meet:${channelId}`, () =>
      pushFresh((b) => {
        const r = meetFriend(b, channelId, seed);
        if (r.result === 'poor') {
          setNotice('钱不够，先攒一点。');
          return b;
        }
        if (r.result === 'empty') {
          setNotice('这次没遇到合适的人（钱照扣）。');
          return r.state;
        }
        if (r.result === 'dup') {
          // 走的是「重复认识」分支：也要把新的状态写回去（扣钱 + 日志 + 默契）
          setNotice('又见到了认识的人，默契 +1%。');
          return r.state;
        }
        if (r.result !== 'ok') {
          setNotice('这个渠道暂时去不了。');
          return b;
        }
        // 不切换页签：留在「认识新朋友」方便连续抽取
        setNotice(r.friend ? `认识了 ${r.friend.name}，已加入朋友圈。` : '认识了一个新朋友。');
        return r.state;
      }),
    );
  }

  function doReward(taskId: string) {
    runBusy(`reward:${taskId}`, () =>
      pushFresh((b) => {
        const r = claimTaskReward(b, taskId);
        if (r.result !== 'ok') {
          setNotice('任务还没完成。');
          return b;
        }
        setNotice('任务奖励已领取。');
        return r.state;
      }),
    );
  }

  function doAccept(taskId: string) {
    runBusy(`accept:${taskId}`, () =>
      pushFresh((b) => {
        const r = acceptTask(b, taskId);
        if (r.result !== 'ok') {
          setNotice(r.result === 'done' ? '这个任务已经完成了。' : '现在还不能领取。');
          return b;
        }
        setNotice('任务已领取，完成后会自动结算奖励。');
        return r.state;
      }),
    );
  }

  function doKick(memberId: string) {
    runBusy(`kick:${memberId}`, () =>
      pushFresh((b) => {
        const r = kickMember(b, memberId);
        if (r.result === 'no-party') {
          setNotice('先创建一个组合，或者选一个当前组合。');
          return b;
        }
        if (r.result !== 'ok') {
          setNotice('这个人已经不在组合里了。');
          return b;
        }
        setNotice('已移出组合。');
        return r.state;
      }).then((next) => {
        // 回包才关确认框（T-040 同一条规矩）
        if (next) setKickTarget(null);
      }),
    );
  }

  function doInvite(friendId: string) {
    runBusy(`invite:${friendId}`, () =>
      pushFresh((b) => {
        const r = inviteFriend(b, friendId);
        if (r.result === 'no-party') {
          setNotice('先创建或选择一个组合。');
          return b;
        }
        if (r.result === 'full') {
          setNotice('组合满了（最多 10 人）。');
          return b;
        }
        if (r.result === 'taken') {
          setNotice('这个人已经在别的组合里了。');
          return b;
        }
        if (r.result === 'cooldown') {
          setNotice('这个人在冷却期，暂时不能入团。');
          return b;
        }
        if (r.result !== 'ok') return b;
        setNotice('已经邀请进组合了。');
        return r.state;
      }),
    );
  }

  function doRecruit() {
    runBusy('recruit', () =>
      pushFresh((b) => {
        if (!b.activePartyId) {
          setNotice('还没有组合，招募不了。');
          return b;
        }
        const { state, result } = recruit(b, `${seed}:recruit:${b.log.length}`);
        if (result === 'poor' || result === 'full' || result === 'no-party') {
          setNotice(result === 'poor' ? '钱不够招募了。' : '现在不能招募。');
          return b;
        }
        setNotice(state.log.at(-1)?.text ?? '');
        return state;
      }),
    );
  }

  function doSwitchParty(id: string) {
    // 切换的只是 activePartyId，但服务端存的还是旧值 → 换设备后组合会跳回去
    runBusy(`switch:${id}`, () => pushFresh((b) => switchParty(b, id)));
  }

  /** 参加演出：排在最近的周六/周日，占满当天 3 个行动位 */
  /** T-032：报名演出（立即扣出场费 + 写 fixed 排程项） */
  function doBookShow(occ: ShowOccurrence, slot: ShowSlotDef) {
    const snapshot = runRef.current;
    if (!snapshot.debuted) {
      setNotice('出道之后才能参与演出。');
      return;
    }
    const bookings = snapshot.bookings ?? [];
    const dayUsed = scheduleRef.current
      .filter((s) => Math.floor((s.startAt - START_AT) / DAY_MS) === Math.floor((occ.startAt - START_AT) / DAY_MS))
      .reduce((n, s) => n + (s.slots ?? 1), 0);
    const chk = canBook(snapshot, party, occ, slot, snapshot.at, bookings, dayUsed);
    if (!chk.ok) {
      setNotice(
        chk.reason === 'day-taken'
          ? '这天你已经有安排了。'
          : chk.reason === 'day-full'
            ? '这天行程排满了，先去行程里腾个位置。'
            : chk.reason === 'announced'
              ? '已宣发，不能再报名。'
              : '条件不足，先把要求补齐。',
      );
      return;
    }
    const { fee } = entryFee(snapshot, party, slot);
    const bookingId = `bk-${Date.now()}-${slot.showId}-${slot.slot}`;
    const booking: Booking = {
      id: bookingId,
      occurrenceId: occ.id,
      showId: slot.showId,
      name: occ.name,
      type: occ.type,
      tier: occ.tier,
      slot: slot.slot,
      startAt: occ.startAt,
      fee,
      status: 'booked',
    };
    const nextSchedule = [
      ...scheduleRef.current,
      {
        id: `show-${bookingId}`,
        actionId: `show:${slot.showId}`,
        kind: 'show' as const,
        bookingId,
        slots: slot.slots,
        fixed: true,
        startAt: occ.startAt,
        endAt: occ.startAt + slot.slots * ACTION_MS,
      },
    ].sort((a, b) => a.startAt - b.startAt);
    scheduleRef.current = nextSchedule;
    setSchedule(nextSchedule);
    setNotice(`报名成功，出场费 ¥${fee} 已到账`);
    runBusy(`book:${bookingId}`, () =>
      pushFresh((b) => ({
        ...b,
        money: b.money + fee,
        bookings: [...(b.bookings ?? []), booking],
        log: [
          ...b.log,
          {
            at: b.at,
            actionId: `book:${slot.showId}`,
            text: `报名了《${occ.name}》${slot.slotName}位，出场费 ¥${fee} 已到账。`,
            staminaDelta: 0,
            statDelta: {},
            kind: 'action',
          },
        ],
      })),
    );
  }

  /** T-032：取消报名（d≤7 禁止；7<d≤15 违约金） */
  function doCancelBooking(bookingId: string) {
    const snapshot = runRef.current;
    const booking = (snapshot.bookings ?? []).find((b) => b.id === bookingId);
    if (!booking) return;
    const r = canCancel(booking, snapshot.at);
    if (!r.ok) {
      setNotice('已宣发，不能取消。');
      return;
    }
    const nextSchedule = scheduleRef.current.filter((s) => s.bookingId !== bookingId);
    scheduleRef.current = nextSchedule;
    setSchedule(nextSchedule);
    setNotice(r.penalty > 0 ? `已取消，追回违约金 ¥${r.penalty}。` : '已取消报名。');
    runBusy(`unbook:${bookingId}`, () =>
      pushFresh((b) => ({
        ...b,
        money: b.money - r.penalty,
        bookings: (b.bookings ?? []).map((x) =>
          x.id === bookingId ? { ...x, status: 'cancelled' as const } : x,
        ),
        log: [
          ...b.log,
          {
            at: b.at,
            actionId: `cancel:${booking.showId}`,
            text: r.penalty > 0
              ? `取消了《${booking.name}》的报名，扣违约金 ¥${r.penalty}。`
              : `取消了《${booking.name}》的报名。`,
            staminaDelta: 0,
            statDelta: {},
            kind: 'action',
          },
        ],
      })),
    );
  }

  /** T-032：城市切换（第一周内；之后锁定） */
  function doSetCity(city: 0 | 1 | 2 | 3) {
    runBusy(`city:${city}`, () =>
      pushFresh((b) => {
        if (b.at >= b.startedAt + WEEK_MS) {
          setNotice('搬迁功能后续开放。');
          return b;
        }
        setNotice('城市已切换。');
        return { ...b, city };
      }),
    );
  }

  function doDivine() {
    runBusy('divine', () =>
      pushFresh((b) => {
        const { state, result, cost } = divine(b);
        if (result === 'poor') {
          setNotice(`占卜要 ${cost}，钱不够。`);
          return b;
        }
        setReading(divinationReading(state));
        setNotice(`花 ${cost} 占了一卦。`);
        return state;
      }),
    );
  }

  function doDebut() {
    runBusy('debut', () =>
      pushFresh((b) => {
        const next = syncStageReached(debut(b));
        setNotice(next === b ? '还没达到出道条件。' : '出道了！现在可以组建组合。');
        return next;
      }),
    );
  }

  /** T-018：晋级（下一阶段是 seq4 时走出道演出流程） */
  function doAdvanceStage() {
    const preview = advanceStage(runRef.current);
    if (preview.result === 'debut-required') {
      doDebut();
      return;
    }
    runBusy('stage', () =>
      pushFresh((b) => {
        const result = advanceStage(b);
        if (result.result !== 'ok') {
          setNotice(result.notice);
          return b;
        }
        setNotice(result.notice);
        return result.state;
      }),
    );
  }

  function doBuy(item: EquipItem) {
    runBusy(`buy:${item.id}`, () =>
      pushFresh((b) => {
        const { state, result } = buyItem(b, item);
        if (result !== 'ok') {
          setNotice('钱不够。');
          return b;
        }
        setNotice(state.log.at(-1)?.text ?? '');
        return state;
      }),
    );
  }

  function doEquipBag(invId: string, targetSlot?: EquipSlot) {
    runBusy(`equip:${invId}`, () =>
      pushFresh((b) => {
        const outcome = equipItem(b, invId, targetSlot);
        if (outcome.result === 'requirement') {
          const entry = b.inventory.find((e) => e.id === invId);
          const def = entry ? equipDefOf(entry) : null;
          setNotice(`装备要求未满足：${def ? describeCondition(def.requirement) : '条件不足'}。`);
          return b;
        }
        if (outcome.result !== 'ok') {
          setNotice(outcome.notice);
          return b;
        }
        setNotice(outcome.notice);
        return outcome.state;
      }),
    );
  }

  function doUnequipBag(slot: EquipSlot) {
    runBusy(`unequip:${slot}`, () =>
      pushFresh((b) => {
        const { state, notice } = unequipItem(b, slot);
        setNotice(notice);
        return state;
      }),
    );
  }

  /** T-019：使用消耗品 */
  function doUseItem(invId: string) {
    runBusy(`use:${invId}`, () =>
      pushFresh((b) => {
        const outcome = useItem(b, invId);
        if (outcome.result !== 'ok') {
          setNotice(outcome.notice);
          return b;
        }
        setNotice(outcome.notice);
        return outcome.state;
      }),
    );
  }

  /** T-019：便利店买消耗品 */
  function doBuyConsumable(itemId: string) {
    const def = ITEMS_MAP[itemId];
    if (!def) return;
    runBusy(`consume:${itemId}`, () =>
      pushFresh((b) => {
        if (b.money < def.price) {
          setNotice('钱不够。');
          return b;
        }
        const withItem = addConsumable(b, itemId);
        setNotice(`买下了「${def.name}」。`);
        return {
          ...withItem,
          money: withItem.money - def.price,
          log: [
            ...withItem.log,
            {
              at: withItem.at,
              actionId: 'buy-consume',
              text: `在便利店买了「${def.name}」。`,
              staminaDelta: 0,
              statDelta: {},
              kind: 'action',
            },
          ],
        };
      }),
    );
  }

  /**
   * T-040：事件抉择要等回包 —— 弹窗留到结果回来再关，期间按钮显示「处理中」。
   * 之前是点完立刻关弹窗、数值过一会儿才变，观感就是"点了没反应然后突然跳"。
   */
  function choose(eventId: string, choiceId: string) {
    const wasMajor = runRef.current.pendingEvent === eventId;
    dbg('选择 ' + choiceId);
    runBusy(`choice:${choiceId}`, async () => {
      await pushFresh((b) => applyChoice(b, eventId, choiceId));
      setActiveEventId(null);
      setNotice('选择已记录。');
      const rest = scheduleRef.current.filter((s) => !s.done);
      if (wasMajor && resumeAfterEvent.current && rest.length > 0) {
        resumeAfterEvent.current = false;
        dbg('事件处理完，自动续跑 ' + String(rest.length) + ' 个');
        void advanceRef.current();
      }
    });
  }

  async function doSignOut() {
    const fresh = createSave(autoAcceptTasks(normalizeRun(initialRun)), 'run-demo');
    clearSave();
    bootRef.current = null;
    setRunId(fresh.runId);
    commitRun(fresh.run);
    scheduleRef.current = [];
    setSchedule([]);
    setRevision(0);
    setSavedAt(null);
    commitClock(createClock(initialRun.at));
    setRunning(false);
    await signOut();
  }

  /**
   * T-041：结局抉择要落库。
   *
   * 原来这里只是 `pushFresh((b) => b)` —— 什么都没写，刷新/换设备又回到游戏里。
   * 现在把抉择本身写进存档（`run.ending`），结局文案仍由 `judgeEnding` 现算，
   * 所以不会因为数值后续变化而"结局和当下状态不匹配"。
   */
  function decide(d: 'stay' | 'backstage' | 'leave') {
    runBusy('decide', async () => {
      const next = await pushFresh((b) => recordEnding(b, d));
      if (!next) {
        setNotice('结局没能保存到云端，稍后再试一次。');
        return;
      }
      setEnding(decidedEnding(next) ?? judgeEnding(next, d));
      setPhase('ended');
      setNotice(null);
    });
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
    schedule,
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
    busyKey,
    choose,
    bookShow: doBookShow,
    cancelBooking: doCancelBooking,
    setCity: doSetCity,
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
    signOut: doSignOut,
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
      {clockSyncError ? (
        <div className="crash-banner readonly-banner">
          <div className="crash-text">
            <strong>云端时钟：</strong>
            <span>读取失败，进度暂未校验。</span>
          </div>
          <button className="icon-btn" onClick={() => window.location.reload()}>
            重试
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
              <button className="icon-btn" title="退出" onClick={() => void doSignOut()}>
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
                ['show', '演出'],
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
          {advanceBlock && (
            <BlockBar
              block={advanceBlock}
              onPlan={() => setMainTab('plan')}
              onClose={() => setAdvanceBlock(null)}
            />
          )}
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
                busyKey={busyKey}
              />
            )}
            {mainTab === 'friends' && <FriendsPanel api={api} />}

{mainTab === 'stats' && <StatsPanel api={api} />}

{mainTab === 'plan' && <PlanPanel api={api} />}

{mainTab === 'show' && <ShowPanel api={api} />}

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