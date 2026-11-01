/**
 * 内容配置入口：所有「可以改内容」的东西都在 packages/core/data/*.json
 * 这里只做加载与类型收口，不要在代码里写死文案/数值。
 */
import actionResultsJson from '../data/action_results.json';
import actionsJson from '../data/actions.json';
import attributesJson from '../data/attributes.json';
import balanceJson from '../data/balance.json';
import eventsJson from '../data/events.json';
import poolsJson from '../data/pools.json';

export const BALANCE = balanceJson.balance;

export interface RawAction {
  id: string;
  name: string;
  /** 分类字段名：growth / work / recover */
  category: string;
  /** 分类中文名：提升属性 / 赚钱 / 恢复状态 */
  categoryName?: string;
  /** 显示条件（空=一直可见） */
  displayCondition?: RawRequires;
  /** 可执行次数，0=无限制 */
  times?: number;
  /** 次数范围：run 整局 / week 每周 / day 每天 */
  timesScope?: string;
  /** 影响的属性（可多个） */
  affectedStats?: string[];
  /** 单次行动流逝的游戏分钟数 */
  durationMinutes?: number;
}

export interface RawResult {
  id: string;
  actionId: string;
  actionName: string;
  /** 匹配条件（空=默认结果） */
  condition?: RawRequires;
  /** 小的优先匹配 */
  priority?: number;
  effects: {
    stamina?: number;
    money?: number;
    /** 粉丝增加量（按当前最强属性决定粉丝类型） */
    fans?: number;
    stats?: Record<string, number | [number, number]>;
  };
  /** 文案，支持 {属性字段名} / {n} / {stamina} / {money} */
  text: string;
}

export interface RawRoutine {
  id: string;
  text: string;
  stamina: number;
  stat?: string;
  statName?: string;
  gain?: number;
}

export interface RawRequires {
  statsAtLeast?: Record<string, number>;
  axesAtLeast?: Record<string, number>;
  axesBelow?: Record<string, number>;
  staminaBelow?: number;
  /** 四项属性总和 ≥ */
  statsSumAtLeast?: number;
  /** 单项属性低于 */
  statsBelow?: Record<string, number>;
  /** 四项属性总和 < */
  statsSumBelow?: number;
  fansAtLeast?: Record<string, number>;
  flagsNot?: string[];
  /** 这些标记都存在才满足 */
  flagsContain?: string[];
  /** 资金不少于 */
  moneyAtLeast?: number;
  /** 朋友圈人数不少于 */
  friendsAtLeast?: number;
}

export interface RawChoice {
  id: string;
  label: string;
  text: string;
  effects: {
    stamina?: number;
    stats?: Record<string, number>;
    axes?: Record<string, number>;
  };
  setFlag?: string;
}

export interface RawStory {
  id: string;
  title: string;
  text: string;
  major?: boolean;
  requires?: RawRequires;
  choices: RawChoice[];
}

export interface RawBiasName {
  [key: string]: string;
}

export const RAW_ACTIONS = actionsJson.actions as RawAction[];
export const RAW_RESULTS = actionResultsJson.results as RawResult[];
export const RAW_ROUTINE = eventsJson.routine as RawRoutine[];
export const RAW_STORY = eventsJson.story as RawStory[];

export interface RawAttribute {
  /** 分类英文名：visible / hidden / status / fans */
  category: string;
  /** 分类中文名：显性属性 / 隐藏属性 / 状态 / 粉丝属性 */
  categoryName: string;
  name: string;
  key: string;
  hidden: boolean;
  /** 0=完全隐藏，1=完全可见，2=隐藏仅占卜可见 */
  linked: number;
}

export const RAW_ATTRIBUTES = attributesJson.attributes as RawAttribute[];
export interface RawPool {
  id: string;
  name: string;
  members: string[];
}

export const RAW_POOLS = poolsJson.pools as RawPool[];