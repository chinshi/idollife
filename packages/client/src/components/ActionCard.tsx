import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  ACTION_MS,
  CATEGORY_LABEL,
  STAT_LABEL,
  actionTier,
  previewAction,
  type ActionDef,
  type RunState,
} from '@idollife/core';

/**
 * T-021：安排行程弹窗里的紧凑行动卡。
 *
 * - 卡面只显示：名称 + 一句话摘要 + 层级角标（不再直显属性变化）
 * - 悬浮 portal tooltip 三层：① 消耗（金钱/时长/次数）② 显性变化（体力/心情/饱腹/健康/粉丝/四维，区间用「+3~4」）
 *   ③ 隐形变化（自我/他人/适配，来自 effects.axes）；**该行动没有轴数据时整层不渲染**
 */
const AXIS_LABEL: Record<string, string> = { self: '自我', others: '他人', fit: '适配' };

const TIER_LABEL: Record<number, string> = { 1: '初', 2: '中', 3: '高' };

const fmt = (v: number | [number, number]) =>
  Array.isArray(v) ? `${v[1] >= 0 ? '+' : ''}${v[0]}~${v[1]}` : `${v >= 0 ? '+' : ''}${v}`;

type TipPlacement = 'left' | 'right' | 'top' | 'bottom';

interface TipState {
  top: number;
  left: number;
  placement: TipPlacement;
  /** 侧边箭头相对 tip 顶部的偏移（跟着卡片中心走） */
  arrowTop?: number;
}

export function ActionCard({
  run,
  action,
  left,
  onAdd,
}: {
  run: RunState;
  action: ActionDef;
  left: number;
  onAdd: () => void;
}) {
  const pv = previewAction(run, action.id);
  const tier = actionTier(action.id);
  const [tip, setTip] = useState<TipState | null>(null);
  const hostRef = useRef<HTMLButtonElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const hostRect = useRef<DOMRect | null>(null);
  const hideTimer = useRef<number | null>(null);

  /**
   * T-023：悬浮框默认放卡片**左侧**（留 8px 不重叠）；左侧空间不足翻右侧；
   * 两侧都放不下才回退到上方/下方居中。高度优先实测，未测到用 190 兜底。
   */
  const computePosition = (r: DOMRect): TipState => {
    const W = 260;
    const gap = 8;
    const H = tipRef.current?.offsetHeight ?? 190;
    const leftSide = r.left - gap - W >= 8;
    const rightSide = r.right + gap + W <= window.innerWidth - 8;

    if (leftSide || rightSide) {
      const placement: TipPlacement = leftSide ? 'left' : 'right';
      const left = leftSide ? r.left - gap - W : r.right + gap;
      const top = Math.min(Math.max(8, r.top), window.innerHeight - H - 8);
      const arrowTop = Math.min(Math.max(10, r.top + r.height / 2 - top), Math.max(10, H - 12));
      return { top, left, placement, arrowTop };
    }

    const above = r.top > H + 16;
    const placement: TipPlacement = above ? 'top' : 'bottom';
    const top = above
      ? Math.max(8, r.top - gap - H)
      : Math.min(window.innerHeight - H - 8, r.bottom + gap);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - W / 2), window.innerWidth - W - 8);
    return { top, left, placement };
  };

  const openTip = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    const el = hostRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    hostRect.current = r;
    setTip(computePosition(r));
  };

  // 渲染后用实测高度把位置再 clamp 一次，避免溢出视口（首帧用 190 兜底）
  useLayoutEffect(() => {
    if (!tip || !hostRect.current) return;
    const next = computePosition(hostRect.current);
    if (next.top !== tip.top || next.left !== tip.left || next.placement !== tip.placement) {
      setTip(next);
    }
  }, [tip]);

  const closeTipSoon = () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setTip(null), 140);
  };
  useEffect(
    () => () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const slots = pv ? Math.max(1, Math.ceil(action.durationMs / ACTION_MS)) : 1;
  const summary = `${CATEGORY_LABEL[action.category] ?? action.category} · ${
    action.stat ? (STAT_LABEL[action.stat] ?? action.stat) : '综合'
  } · ${slots} 行动位`;

  const axisEntries = pv ? Object.entries(pv.axes) : [];

  return (
    <>
      <button
        ref={hostRef}
        type="button"
        className={`action-card cat-${action.category ?? 'growth'}`}
        onClick={onAdd}
        disabled={left <= 0}
        onMouseEnter={openTip}
        onMouseLeave={closeTipSoon}
        title={left <= 0 ? '次数已用完' : ''}
      >
        <span className="action-card-name">{action.name}</span>
        <span className={`action-tier tier-${tier}`}>{TIER_LABEL[tier]}</span>
        <span className="action-card-sum">{left <= 0 ? '次数已用完' : summary}</span>
      </button>

      {tip && pv
        ? createPortal(
            <div
              ref={tipRef}
              className={[
                'action-tip',
                tip.placement === 'left'
                  ? 'side-left'
                  : tip.placement === 'right'
                    ? 'side-right'
                    : tip.placement === 'top'
                      ? 'above'
                      : 'below',
              ].join(' ')}
              style={
                {
                  top: tip.top,
                  left: tip.left,
                  ...(tip.arrowTop !== undefined ? { '--arrow-top': `${tip.arrowTop}px` } : {}),
                } as CSSProperties
              }
              onMouseEnter={openTip}
              onMouseLeave={closeTipSoon}
            >
              <div className="action-tip-head">
                {action.name}
                <em className={`action-tier tier-${tier}`}>{TIER_LABEL[tier]}</em>
              </div>

              <div className="action-tip-sec">
                <div className="action-tip-title">消耗</div>
                {pv.money !== 0 ? (
                  <div className={pv.money < 0 ? 'eff-down' : 'eff-up'}>
                    资金 {pv.money > 0 ? '+' : '-'}¥{Math.abs(pv.money)}
                  </div>
                ) : null}
                <div className="eff-dim">时长 {slots} 行动位</div>
                <div className="eff-dim">
                  次数 {Number.isFinite(left) ? `剩 ${left} 次` : '无限制'}
                </div>
              </div>

              <div className="action-tip-sec">
                <div className="action-tip-title">变化</div>
                {pv.stamina !== 0 ? (
                  <div className={pv.stamina > 0 ? 'eff-up' : 'eff-down'}>
                    体力 {fmt(pv.stamina)}
                    {pv.hungerHalved ? <em className="eff-dim">（太饿，恢复减半）</em> : null}
                  </div>
                ) : null}
                {pv.mood !== 0 ? (
                  <div className={pv.mood > 0 ? 'eff-up' : 'eff-down'}>心情 {fmt(pv.mood)}</div>
                ) : null}
                {pv.satiety !== 0 ? (
                  <div className={pv.satiety > 0 ? 'eff-up' : 'eff-down'}>
                    饱腹 {fmt(pv.satiety)}
                  </div>
                ) : null}
                {pv.health !== 0 ? (
                  <div className={pv.health > 0 ? 'eff-up' : 'eff-down'}>
                    健康 {fmt(pv.health)}
                  </div>
                ) : null}
                {pv.fans !== 0 ? <div className="eff-up">粉丝 {fmt(pv.fans)}</div> : null}
                {Object.entries(pv.stats).map(([k, r]) => (
                  <div key={k} className="eff-up">
                    {STAT_LABEL[k] ?? k} {fmt(r)}
                  </div>
                ))}
              </div>

              {/* 底层：没有轴数据就不渲染（不留空壳） */}
              {axisEntries.length > 0 ? (
                <div className="action-tip-sec">
                  <div className="action-tip-title">隐形变化</div>
                  {axisEntries.map(([k, r]) => (
                    <div key={k} className="eff-axis">
                      {AXIS_LABEL[k] ?? k} {fmt(r as [number, number])}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
