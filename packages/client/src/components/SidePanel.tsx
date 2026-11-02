import {
  DEBUT_THRESHOLD,
  canAdvance,
  canDebut,
  currentStage,
  describeCondition,
  nextStage,
} from '@idollife/core';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppApi } from './api';
import { BagGrid } from './BagGrid';
import { StatsPanel } from './StatsPanel';

/** 主题色列可能是 6 位 hex 或 rainbow；非 hex（如终阶 rainbow）回落金色 */
function themeColorCss(color: string): string {
  return /^[0-9a-f]{6}$/i.test(color) ? '#' + color : '#d4af37';
}

export function SidePanel({ api }: { api: AppApi }) {
  const { run, rightTab, setRightTab, doAdvanceStage, setShowDivination } = api;

  // T-018：晋级按钮 + 悬浮要求 tooltip（portal 到 body，复刻粉丝雷达浮层的防闪断模式）
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const hideTimer = useRef<number | null>(null);

  const stage = currentStage(run);
  const next = nextStage(run);
  // 下一阶段是 seq4（rookie-idol）时，进入条件 hasFlag("ev:debut") 要等出道演出后才成立，
  // 所以这个按钮的可用性按「是否达到出道报名条件」判断（total ≥ DEBUT_THRESHOLD）。
  const canGo = next ? (next.seq === 4 ? canDebut(run) : canAdvance(run)) : false;
  // T-018 验收：按钮文案 = **当前阶段**那一行的按钮文案（描述「从当前阶段要做的动作」）
  const advanceLabel = stage.buttonText;
  // seq3 → seq4 的「出道」按钮：tooltip 中部不显示「发生过『出道』」（玩家看不懂），改报名条件
  const conditionText =
    next?.seq === 4
      ? `报名条件：四项属性总和 ≥ ${DEBUT_THRESHOLD}`
      : next
        ? `进入条件：${describeCondition(next.condition)}`
        : '';

  const openTip = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = 260;
    const H = 140; // tooltip 大致高度（三行）
    const gap = 8;
    const below = window.innerHeight - r.bottom < H + 16 && r.top > H + 16;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - W / 2), window.innerWidth - W - 8);
    setTipPos({ top: below ? r.bottom + gap : Math.max(8, r.top - H - gap), left, below });
  };
  const closeTipSoon = () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setTipPos(null), 140);
  };
  useEffect(
    () => () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <aside className="col-right">
      <section className="mod mod-aux">
        <nav className="seg">
          <button
            className={rightTab === 'stats' ? 'seg-item active' : 'seg-item'}
            onClick={() => setRightTab('stats')}
          >
            属性
          </button>
          <button
            className={rightTab === 'bag' ? 'seg-item active' : 'seg-item'}
            onClick={() => setRightTab('bag')}
          >
            背包
          </button>
        </nav>

        {rightTab === 'stats' ? (
          <div className="aux-body">
            {/* T-016b：侧栏属性页直接复用 StatsPanel（偶像名→阶段徽章→固有→状态→成长→…） */}
            <StatsPanel api={api} embedded />

            <div className="row">
              {/* T-018：晋级按钮（下一阶段 = seq4 时走出道演出流程） */}
              {next ? (
                <span
                  className="stage-advance-wrap"
                  ref={wrapRef}
                  onMouseEnter={openTip}
                  onMouseLeave={closeTipSoon}
                >
                  <button
                    className={canGo ? 'primary' : ''}
                    disabled={!canGo}
                    onClick={doAdvanceStage}
                  >
                    {advanceLabel}
                  </button>
                </span>
              ) : (
                <span className="stage-final-badge">终阶 · {stage.name}</span>
              )}
              <button onClick={() => setShowDivination(true)}>占卜</button>
            </div>
          </div>
        ) : (
          <BagGrid api={api} />
        )}
      </section>

      {/* 晋级 tooltip：三行（下一阶段名+称号 / 进入条件中文 / 解锁说明），不被侧栏裁切 */}
      {tipPos && next
        ? createPortal(
            <div
              className={tipPos.below ? 'stage-tip below' : 'stage-tip above'}
              style={{ top: tipPos.top, left: tipPos.left }}
              onMouseEnter={openTip}
              onMouseLeave={closeTipSoon}
            >
              <div className="stage-tip-head" style={{ color: themeColorCss(next.themeColor) }}>
                {next.name} · {next.title}
              </div>
              <div className="stage-tip-cond">{conditionText}</div>
              <div className="stage-tip-unlock">{next.unlockText}</div>
            </div>,
            document.body,
          )
        : null}
    </aside>
  );
}
