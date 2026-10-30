import { dominantFanType, fanShare } from './fans-util';
import type { FanType } from './fans';
import { tierOf, type RunState, type StatKey } from './types';

export type EndingGroup = 'interrupt' | 'stage-fan' | 'stage-stat' | 'stage-low' | 'backstage' | 'job' | 'life' | 'bad';
export type Decision = 'stay' | 'backstage' | 'leave';

export interface Ending {
  id: string;
  title: string;
  group: EndingGroup;
  text: string;
}

/** 42 个结局（4 字标题） */
export const ENDINGS: Record<string, Ending> = Object.fromEntries(
  (
    [
      // 中断（8）
      ['int-burnout', '积劳成疾', 'interrupt', '你在排练室晕倒，医生说必须停下来。'],
      ['int-void', '浑浑噩噩', 'interrupt', '你开始记不清上周发生了什么。'],
      ['int-desire', '想入非非', 'interrupt', '一段没处理好的关系传遍了圈子。'],
      ['int-condemn', '千夫所指', 'interrupt', '评论区关了又开，骂声还在。'],
      ['int-injury', '因伤退场', 'interrupt', '医生说这个伤，不能再跳了。'],
      ['int-broke', '山穷水尽', 'interrupt', '房租欠了两个月，你收拾行李回了家。'],
      ['int-cold', '心灰意冷', 'interrupt', '某天你发现，自己已经三周没打开排练室的门。'],
      ['int-quit', '急流勇退', 'interrupt', '你选在一个还算体面的时刻，说了再见。'],

      // 留在台前 · 粉丝型（6）
      ['fan-gachi', '国民初恋', 'stage-fan', '粉丝说你是「可以带回老家的那种人」。'],
      ['fan-stage', '剧场女神', 'stage-fan', '小场子的灯一亮，所有人都在看你。'],
      ['fan-music', '金曲歌后', 'stage-fan', '那首歌在榜单上挂了很久。'],
      ['fan-live', '现场传说', 'stage-fan', '提起那一晚的应援，老粉眼睛还会亮。'],
      ['fan-growth', '长情偶像', 'stage-fan', '有人从第一场跟到了最后一场。'],
      ['fan-power', '实力标杆', 'stage-fan', '后辈被教导：先去看她的现场。'],

      // 留在台前 · 属性型（5）
      ['stat-vocal', '歌坛天后', 'stage-stat', '你的声音成了这个圈子的标准。'],
      ['stat-dance', '舞台女王', 'stage-stat', '你跳过的地板，别人不敢再站。'],
      ['stat-acting', '银幕影后', 'stage-stat', '镜头终于愿意停在你的脸上。'],
      ['stat-talk', '综艺女王', 'stage-stat', '你一句话能让全场笑，也能让全场静。'],
      ['stat-visual', 'T台名模', 'stage-stat', '你站在那儿，就已经是画面。'],

      // 留在台前 · 未达标（4）
      ['low-corner', '角落伴舞', 'stage-low', '你还在台上，只是没人记得名字。'],
      ['low-short', '竖屏演员', 'stage-low', '你开始接竖屏短剧，一天拍完。'],
      ['low-mid', '腰部网红', 'stage-low', '有点流量，但上不去，也下不来。'],
      ['low-fade', '黯然退场', 'stage-low', '没有人送别，你也就没打扰谁。'],

      // 转幕后（5）
      ['back-talk', '金牌经纪', 'backstage', '你带的新人，第一次上电视时说谢谢姐。'],
      ['back-dance', '编舞导师', 'backstage', '你编的舞，被别的团跳火了。'],
      ['back-vocal', '幕后制作', 'backstage', '你在调音台后面，把一首歌救活了。'],
      ['back-acting', '表演指导', 'backstage', '你教他们怎么哭，自己却很久没哭过。'],
      ['back-boss', '厂牌主理', 'backstage', '你开了自己的小厂牌。'],

      // 离圈 · 职业（6）
      ['job-police', '警徽在身', 'job', '你穿上了另一套制服。'],
      ['job-office', '朝九晚五', 'job', '打卡、午休、下班，日子意外地稳。'],
      ['job-teach', '桃李满门', 'job', '你教的孩子，后来也上了台。'],
      ['job-back', '重返职场', 'job', '简历上那两年，你只写「自由职业」。'],
      ['job-code', '代码人生', 'job', '你回到了那台笔记本前。'],
      ['job-live', '带货主播', 'job', '镜头换成竖屏，话术换了一套。'],

      // 离圈 · 人生（4）
      ['life-plain', '平淡是福', 'life', '你嫁了人，偶尔还会哼那首没唱完的歌。'],
      ['life-rich', '嫁入豪门', 'life', '婚礼上没人提起你以前的名字。'],
      ['life-exec', '西装革履', 'life', '你成了那个签合同的人。'],
      ['life-startup', '白手起家', 'life', '你开了家小店，生意还不错。'],

      // 离圈 · 坏（4）
      ['bad-hard', '艰难维生', 'bad', '你在便利店上夜班，偶尔刷到以前的视频。'],
      ['bad-cold', '人走茶凉', 'bad', '群里还在聊天，只是没人艾特你。'],
      ['bad-ignore', '无人问津', 'bad', '搜索你的名字，只剩几条旧链接。'],
      ['bad-ruin', '潦倒收场', 'bad', '你把最后一箱周边卖给了收废品的。'],
    ] as const
  ).map(([id, title, group, text]) => [id, { id, title, group, text } as Ending]),
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
