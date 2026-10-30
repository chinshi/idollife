import type { ActionDef } from './types';

const MIN = 60_000;

/** P0 行动表：先跑通循环，数值全部是占位 */
export const ACTIONS: Record<string, ActionDef> = {
  'vocal-karaoke': {
    id: 'vocal-karaoke',
    name: '唱 K',
    stat: 'vocal',
    stamina: -10,
    gain: [1, 3],
    durationMs: 10 * MIN,
    text: '你在包厢里唱了两小时，嗓子有点热。（演唱 +{n}）',
  },
  'dance-otaku': {
    id: 'dance-otaku',
    name: '跳宅舞',
    stat: 'dance',
    stamina: -12,
    gain: [1, 3],
    durationMs: 10 * MIN,
    text: '对着镜子把同一段副歌跳了二十遍。（舞蹈 +{n}）',
  },
  'acting-short': {
    id: 'acting-short',
    name: '自拍小短剧',
    stat: 'acting',
    stamina: -10,
    gain: [1, 2],
    durationMs: 10 * MIN,
    text: '自导自演拍了三条，第二条最好。（演技 +{n}）',
  },
  'talk-selftalk': {
    id: 'talk-selftalk',
    name: '自说自话',
    stat: 'talk',
    stamina: -8,
    gain: [1, 2],
    durationMs: 10 * MIN,
    text: '对着镜头练了一下午串场词。（口才 +{n}）',
  },
  'rest-sleep': {
    id: 'rest-sleep',
    name: '爆睡',
    stamina: 25,
    durationMs: 10 * MIN,
    text: '睡了一觉，感觉活过来了。',
  },
};

export const ACTION_LIST = Object.values(ACTIONS);
