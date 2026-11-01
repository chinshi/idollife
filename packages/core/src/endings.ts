import endingsJson from '../data/endings.json';
import { dominantFanType, fanShare } from './fans-util';
import type { FanType } from './fans';
import { tierOf, type RunState, type StatKey } from './types';

export type EndingGroup = 'interrupt' | 'stage-fan' | 'stage-stat' | 'stage-low' | 'backstage' | 'job' | 'life' | 'bad';
export type Decision = 'stay' | 'backstage' | 'leave';

export interface Ending {
  id: string;
  title: string;
  /** 分组字段名：interrupt / stage-fan / ... */
  group: EndingGroup;
  /** 分组中文名：中断结局 / 粉丝向结局 / ... */
  groupName?: string;
  text: string;
}


/** 42 个结局（4 字标题） */
export const ENDINGS: Record<string, Ending> = Object.fromEntries(
  (endingsJson.endings as Ending[]).map((e) => [e.id, e]),
);
/** 结局分组中文名（来自 data/endings.json） */
export const ENDING_GROUP_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(ENDINGS).map((e) => [e.group, e.groupName ?? e.group]),
);

const FAN_ENDING: Record<FanType, string> = {
  gachi: 'fan-gachi',
  stage: 'fan-stage',
  music: 'fan-music',
  live: 'fan-live',
  growth: 'fan-growth',
  power: 'fan-power',
};

const STAT_ENDING: Record<StatKey, string> = {
  vocal: 'stat-vocal',
  dance: 'stat-dance',
  acting: 'stat-acting',
  talk: 'stat-talk',
};

const LOW_ENDING: Record<StatKey, string> = {
  vocal: 'low-mid',
  dance: 'low-corner',
  acting: 'low-short',
  talk: 'low-fade',
};

const BACKSTAGE_ENDING: Record<StatKey, string> = {
  vocal: 'back-vocal',
  dance: 'back-dance',
  acting: 'back-acting',
  talk: 'back-talk',
};

const JOB_ENDING: Record<StatKey, string> = {
  vocal: 'job-teach',
  dance: 'job-police',
  acting: 'job-back',
  talk: 'job-live',
};

export function bestStat(stats: Record<StatKey, number>): StatKey {
  return (Object.entries(stats) as [StatKey, number][]).sort((a, b) => b[1] - a[1])[0]![0];
}

/**
 * 根据「留圈抉择 + 当前状态」判定结局。
 * 判定顺序见 docs/05-内容与叙事.md §3.6。
 */
export function judgeEnding(state: RunState, decision: Decision): Ending {
  const best = bestStat(state.stats);
  const fit = tierOf(state.axes.fit);
  const self = tierOf(state.axes.self);
  const others = tierOf(state.axes.others);

  if (decision === 'backstage') {
    return ENDINGS[BACKSTAGE_ENDING[best]]!;
  }

  if (decision === 'leave') {
    if (others === 'low' && self === 'low') return ENDINGS['bad-hard']!;
    if (others === 'low') return ENDINGS['bad-cold']!;
    if (fit === 'high') return ENDINGS[JOB_ENDING[best]]!;
    if (self === 'high') return ENDINGS['life-startup']!;
    return ENDINGS['life-plain']!;
  }

  // 留在台前
  if (fit === 'low') return ENDINGS[LOW_ENDING[best]]!;

  const dominant = dominantFanType(state.fans);
  const share = fanShare(state.fans, dominant);
  if (state.stats[best] >= 55 && share >= 0.25) {
    return ENDINGS[STAT_ENDING[best]]!;
  }
  return ENDINGS[FAN_ENDING[dominant]]!;
}
