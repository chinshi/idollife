/**
 * 成长阶段（T-018）：配置驱动（packages/core/data/stages.json，来源 content/all.xlsx 的 stages 表）。
 *
 * 推导口径：
 * - `flags["stage:reached"]` 记录已达到的最高 seq（单调不回退）——「记录优先」
 * - 无记录 / 记录落后时，用「满足进入条件的最高 seq」兜底——「推导兜底」
 *   （出道这种靠事件 flag 推进的阶段也靠推导自然到达 seq4）
 *
 * 全部纯函数：不碰 Date.now / Math.random / DOM / localStorage。
 */
import stagesJson from '../data/stages.json';
import { matchesCondition, type RawRequires } from './expr';
import type { RunState } from './types';

export interface StageDef {
  seq: number;
  id: string;
  /** 阶段名，如「出道候补」 */
  name: string;
  /** 称号，如「差一步就上台」 */
  title: string;
  /** 进入条件（表达式；seq1 为空对象 {}） */
  condition?: RawRequires | string;
  /** 晋级按钮文案：晋级 / 出道 / 办专场；终阶为空 */
  buttonText: string;
  /** 客户端样式类 s1–s8 */
  style: string;
  /** 主题色（仅参考/未来动态化用） */
  themeColor: string;
  /** 解锁说明（tooltip 第三行） */
  unlockText: string;
}

export const STAGES: StageDef[] = (stagesJson.stages as StageDef[]).slice().sort((a, b) => a.seq - b.seq);

/** 已达最高阶段的存档 flag */
export const STAGE_REACHED_KEY = 'stage:reached';

function reachedSeq(state: RunState): number {
  const raw = state.flags[STAGE_REACHED_KEY];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

function meetsStage(state: RunState, stage: StageDef): boolean {
  const cond = stage.condition;
  if (cond === undefined || cond === null) return true;
  if (typeof cond === 'object' && Object.keys(cond).length === 0) return true;
  return matchesCondition(state, cond);
}

/** 仅按进入条件推导出的最高 seq（旧档迁移用；无条件视为满足） */
export function derivedStageSeq(state: RunState): number {
  for (let i = STAGES.length - 1; i >= 0; i -= 1) {
    const stage = STAGES[i];
    if (stage && meetsStage(state, stage)) return stage.seq;
  }
  return 1;
}

/** 当前阶段：flags 记录优先；无记录（旧档）时按进入条件推导 */
export function currentStage(state: RunState): StageDef {
  const maxSeq = STAGES[STAGES.length - 1]?.seq ?? 1;
  const reached = reachedSeq(state);
  const seq = reached > 0 ? Math.min(reached, maxSeq) : derivedStageSeq(state);
  return STAGES.find((s) => s.seq === seq) ?? STAGES[0]!;
}

/**
 * 事件驱动的阶段推进（目前只有「出道」）：把按条件推导出的更高阶段补进 `stage:reached`。
 * 只升不降；不改任何数值。读档迁移与出道后会调用。
 */
export function syncStageReached(state: RunState): RunState {
  const reached = reachedSeq(state);
  const derived = derivedStageSeq(state);
  if (derived <= reached) return state;
  return { ...state, flags: { ...state.flags, [STAGE_REACHED_KEY]: derived } };
}

/** 下一阶段；终阶返回 null */
export function nextStage(state: RunState): StageDef | null {
  const cur = currentStage(state);
  return STAGES.find((s) => s.seq === cur.seq + 1) ?? null;
}

/** 下一阶段的进入条件是否已满足 */
export function canAdvance(state: RunState): boolean {
  const next = nextStage(state);
  return !!next && meetsStage(state, next);
}

export interface AdvanceStageResult {
  state: RunState;
  result: 'ok' | 'debut-required' | 'locked' | 'final';
  notice: string;
}

/**
 * 晋级动作：写 stage:reached = next.seq + 一条日志。
 * 特例：下一阶段是 seq4（rookie-idol，条件 hasFlag("ev:debut")）时不直接晋级，
 * 返回 'debut-required'，由客户端走现有的出道演出流程（完成后事件写 ev:debut，推导自然到 seq4）。
 */
export function advanceStage(state: RunState): AdvanceStageResult {
  const cur = currentStage(state);
  const next = nextStage(state);
  if (!next) return { state, result: 'final', notice: '已经是最后一个阶段了。' };
  if (!canAdvance(state)) return { state, result: 'locked', notice: '还没满足晋级条件。' };
  if (next.seq === 4) return { state, result: 'debut-required', notice: '该出道了。' };

  return {
    state: {
      ...state,
      flags: { ...state.flags, [STAGE_REACHED_KEY]: next.seq },
      log: [
        ...state.log,
        {
          at: state.at,
          actionId: `stage-advance:${next.id}`,
          text: `阶段提升：${cur.name} → ${next.name}。`,
          staminaDelta: 0,
          statDelta: {},
          kind: 'routine',
        },
      ],
    },
    result: 'ok',
    notice: `晋级：${next.name}！`,
  };
}

/** 给客户端用的徽章 class：stage-badge s1…s8 */
export function stageBadgeClass(stage: StageDef): string {
  const style = /^s[1-8]$/.test(stage.style) ? stage.style : 's1';
  return `stage-badge ${style}`;
}
