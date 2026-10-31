import type { ActionDef } from './types';

const MIN = 60_000;

/** 一周目长度：游戏内 2 年（按行动推进的毫秒数计） */
export const RUN_LENGTH_MS = 2 * 365 * 24 * 60 * MIN;

/** 游戏内一周 */
export const WEEK_MS = 7 * 24 * 60 * MIN;

/** 游戏内一天 */
export const DAY_MS = 24 * 60 * MIN;

/** 每周房租（记在结算里自动扣） */
export const RENT_PER_WEEK = 500;

/** 开局资金 */
export const START_MONEY = 8000;

/** 每天的行动位：每天 3 个；周末一场演出直接占满 3 个 */
export const DAILY_SLOTS = 3;
export const SHOW_SLOTS = 3;
export const SHOW_ACTION_ID = 'show';
export const SHOW_DURATION_MS = 30 * MIN;

/** 出道门槛：四项属性和 */
export const DEBUT_THRESHOLD = 120;

/** P0 行动表 */
export const ACTIONS: Record<string, ActionDef> = {
  'vocal-karaoke': {
    id: 'vocal-karaoke',
    name: '唱 K',
    category: 'growth',
    stat: 'vocal',
    stamina: -10,
    gain: [1, 3],
    cost: 50,
    durationMs: 10 * MIN,
    text: '你在包厢里唱了两小时，嗓子有点热。（演唱 +{n}）',
  },
  'dance-otaku': {
    id: 'dance-otaku',
    name: '跳宅舞',
    category: 'growth',
    stat: 'dance',
    stamina: -12,
    gain: [1, 3],
    durationMs: 10 * MIN,
    text: '对着镜子把同一段副歌跳了二十遍。（舞蹈 +{n}）',
  },
  'acting-short': {
    id: 'acting-short',
    name: '自拍小短剧',
    category: 'growth',
    stat: 'acting',
    stamina: -10,
    gain: [1, 2],
    durationMs: 10 * MIN,
    text: '自导自演拍了三条，第二条最好。（演技 +{n}）',
  },
  'talk-selftalk': {
    id: 'talk-selftalk',
    name: '自说自话',
    category: 'growth',
    stat: 'talk',
    stamina: -8,
    gain: [1, 2],
    durationMs: 10 * MIN,
    text: '对着镜头练了一下午串场词。（口才 +{n}）',
  },
  'work-part-time': {
    id: 'work-part-time',
    name: '打工',
    category: 'work',
    stamina: -20,
    money: 320,
    durationMs: 10 * MIN,
    text: '在便利店站了四个小时，脚有点麻。（收入 +320）',
  },
  'rest-sleep': {
    id: 'rest-sleep',
    name: '爆睡',
    category: 'recover',
    stamina: 25,
    durationMs: 10 * MIN,
    text: '睡了一觉，感觉活过来了。',
  },
};

export const ACTION_LIST = Object.values(ACTIONS);

export const CATEGORY_LABEL: Record<string, string> = {
  growth: '提升属性',
  recover: '恢复状态',
  work: '赚钱',
};
