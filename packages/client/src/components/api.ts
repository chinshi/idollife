import type {
  Bias,
  EquipItem,
  EquipSlot,
  LogEntry,
  Party,
  RunState,
  ScheduleItem,
} from '@idollife/core';

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'expired';
export type SysTab = 'shop' | 'bag';
export type BagTab = 'equip' | 'consume' | 'other';
export type LogTab = 'all' | 'event' | 'stat';
export type MainTab = 'task' | 'stats' | 'plan' | 'show' | 'party' | 'friends' | 'shop' | 'divine' | 'bag';
export type TaskTab = 'all' | 'accept' | 'active' | 'done';

export interface AuthUserLike {
  id?: string;
  email?: string | null;
}

/** App 暴露给各面板/弹窗的状态与操作 */
export interface AppApi {
  // 数据
  run: RunState;
  seed: string;
  removeItem: (id: string) => void;
  party: Party | null;
  /** T-027：完整排程（含 done / 执行中），安排行程弹窗需要 */
  schedule: ScheduleItem[];
  pending: ScheduleItem[];
  visibleItems: ScheduleItem[];
  pastItems: ScheduleItem[];
  futureItems: ScheduleItem[];
  nextItem: ScheduleItem | null;
  dayBreakLabels: Map<string, string>;
  visibleLog: LogEntry[];

  // 时钟
  running: boolean;
  gameNow: number;
  remainMs: number;
  currentPct: number;
  lastStop: string;
  stopText: Record<string, string>;

  // 界面状态
  mainTab: MainTab;
  setMainTab: (t: MainTab) => void;
  taskTab: TaskTab;
  setTaskTab: (t: TaskTab) => void;
  friendsTab: 'list' | 'meet';
  setFriendsTab: (t: 'list' | 'meet') => void;
  rightTab: 'stats' | 'bag';
  setRightTab: (t: 'stats' | 'bag') => void;
  bagTab: BagTab;
  setBagTab: (t: BagTab) => void;
  logTab: LogTab;
  setLogTab: (t: LogTab) => void;
  flippedIds: string[];
  toggleFlip: (id: string) => void;
  managing: boolean;
  setManaging: (v: boolean | ((p: boolean) => boolean)) => void;
  historyLimit: number;
  setHistoryLimit: (v: number | ((p: number) => number)) => void;

  // 顶部信息
  todayIndex: number;
  usedToday: number;
  statTotal: number;
  totalFans: (run: RunState) => number;
  syncStatus: SyncStatus;
  syncText: Record<SyncStatus, string>;
  savedAt: number | null;
  user: AuthUserLike | null;
  notice: string | null;
  setNotice: (v: string | null) => void;

  // 操作
  advance: () => void;
  stopCurrent: () => void;
  openPlan: () => void;
  /** T-032 演出报名 */
  bookShow: (occ: import('@idollife/core').ShowOccurrence, slot: import('@idollife/core').ShowSlotDef) => void;
  cancelBooking: (bookingId: string) => void;
  setCity: (city: 0 | 1 | 2 | 3) => void;
  doAccept: (id: string) => void;
  doReward: (id: string) => void;
  doMeet: (channelId: string) => void;
  doInvite: (friendId: string) => void;
  doKick: (memberId: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doBuy: (item: any) => void;
  // T-019：道具/背包
  doUseItem: (invId: string) => void;
  doEquipBag: (invId: string, targetSlot?: EquipSlot) => void;
  doUnequipBag: (slot: EquipSlot) => void;
  doBuyConsumable: (itemId: string) => void;
  doDebut: () => void;
  /** T-018：晋级到下一成长阶段（seq4 时内部走出道演出） */
  doAdvanceStage: () => void;
  doSwitchParty: (id: string) => void;
  openPartyModal: () => void;
  doDivine: () => void;
  signOut: () => void;
  restartForTest: () => void;

  // 打开/关闭弹窗
  setShowInvite: (v: boolean) => void;
  setShowDivination: (v: boolean) => void;
  setActiveEventId: (id: string | null) => void;
  setKickTarget: (id: string | null) => void;
  setShowStops: (v: boolean) => void;
  setShowDebug: (v: boolean) => void;
  setDebugText: (v: string) => void;

  // 工具
  dayLabel: (at: number, now: number) => string;
  biasLabel: (bias: Bias) => string;
  weekdayName: (day: number) => string;

  /** T-016：属性面板点偶像名 → 打开改名对话框 */
  onRenameIdol: () => void;
}
