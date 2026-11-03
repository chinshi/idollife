import { ACTIONS, SHOW_ACTION_ID } from '@idollife/core';
import type { AppApi } from './api';

/**
 * 行程页（T-021）：主系统里只显示一行「当前 / 下一条行程」，
 * 完整配置统一在「安排行程」弹窗里；条目样式与弹窗同款。
 */
export function PlanPanel({ api }: { api: AppApi }) {
  const { run, nextItem, pending, dayLabel, openPlan } = api;

  const next = nextItem;
  const name = next
    ? (ACTIONS[next.actionId]?.name ?? (next.actionId === SHOW_ACTION_ID ? '演出' : next.actionId))
    : '';
  const pendingName = next
    ? null
    : pending.length > 0
      ? (ACTIONS[pending[0]!.actionId]?.name ?? pending[0]!.actionId)
      : null;

  return (
    <>
      <div className="mod-head">
        <h2>行程</h2>
        <span className="muted small">待执行 {pending.length} 个</span>
      </div>

      {next ? (
        <div className="plan-row">
          <span className="plan-name">{name}</span>
          <span className="plan-when">{dayLabel(next.startAt, run.at)}</span>
        </div>
      ) : pendingName ? (
        <div className="plan-row">
          <span className="plan-name">{pendingName}</span>
          <span className="plan-when">待执行</span>
        </div>
      ) : (
        <p className="muted small">还没有待执行行程。</p>
      )}

      <div className="row">
        <button className="primary" onClick={openPlan}>
          安排行程
        </button>
      </div>
    </>
  );
}
