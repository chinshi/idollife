import { ACTION_LIST, canShowAction, type ActionCategory, type ActionDef, type RunState } from '@idollife/core';

/**
 * 「安排行程」里行动列表的分类分组。
 *
 * 顺序即展示顺序，与配置表 `actions.category` 的取值一一对应。
 * `performance` 不在此列：演出统一走「演出」菜单报名（T-032），不在行程里手动排。
 */
export const PLAN_CATEGORIES: ActionCategory[] = ['growth', 'recover', 'work'];

export interface ActionGroup {
  cat: ActionCategory;
  items: ActionDef[];
}

/**
 * 按分类分组，只保留「当前可用」的行动。
 *
 * 注意：必须同时判 `a.category === cat`。T-037 修复前这里只判了「不是演出」，
 * 于是每个分类分组都渲染了全部 27 条行动（分组标题正确、内容重复 3 份）。
 * 空分类整组不渲染（沿用原行为：当前一条都做不了的分组不占版面）。
 */
export function groupPlanActions(run: RunState, cats: ActionCategory[] = PLAN_CATEGORIES): ActionGroup[] {
  return cats
    .map((cat) => ({
      cat,
      items: ACTION_LIST.filter((a) => a.category === cat && canShowAction(run, a.id)),
    }))
    .filter((g) => g.items.length > 0);
}
