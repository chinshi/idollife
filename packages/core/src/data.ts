/**
 * 内容配置入口：所有「可以改内容」的东西都在 packages/core/data/*.json
 * 这里只做加载与类型收口，不要在代码里写死文案/数值。
 */
import actionsJson from '../data/actions.json';
import attributesJson from '../data/attributes.json';
import balanceJson from '../data/balance.json';
import eventsJson from '../data/events.json';

export const BALANCE = balanceJson.balance;

export interface RawAction {
  id: string;
  name: string;
  category: string;
  stat?: string;
  stamina: number;
  gain?: [number, number];
  cost?: number;
  money?: number;
  text: string;
}

export interface RawRoutine {
  id: string;
  text: string;
  stamina: number;
  stat?: string;
  gain?: number;
}

export interface RawRequires {
  statsAtLeast?: Record<string, number>;
  axesAtLeast?: Record<string, number>;
  axesBelow?: Record<string, number>;
  staminaBelow?: number;
  fansAtLeast?: Record<string, number>;
  flagsNot?: string[];
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

export const RAW_ACTIONS = actionsJson.actions as RawAction[];
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