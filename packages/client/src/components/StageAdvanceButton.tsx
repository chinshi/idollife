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

/** 主题色列可能是 6 位 hex 或 rainbow；非 hex（如终阶 rainbow）回落金色 */
function themeColorCss(color: string): string {
  return /^[0-9a-f]{6}$/i.test(color) ? '#' + color : '#d4af37';
}

/**
 * T-018 晋级按钮 + T-021 布局调整：徽章右侧的晋级按钮。
 * tooltip 复用 T-016d 的 portal + fixed（防闪断、贴边翻转），不受面板 overflow 裁切。
 */
export function StageAdvanceButton({ api }: { api: AppApi }) {
  const { run, doAdvanceStage } = api;
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const hideTimer = useRef<number | null>(null);

  const stage = currentStage(run);
  const next = nextStage(run);
  // next=seq4 时进入条件是 hasFlag("ev:debut")（出道后才成立），可用性改按 canDebut 判断
  const canGo = next ? (next.seq === 4 ? canDebut(run) : canAdvance(run)) : false;
  // 按钮文案 = 当前阶段那一行的按钮文案（描述「从当前阶段要做的动作」）
  const label = stage.buttonText;
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
    const H = 140;
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

  if (!next) return <span className="stage-final-badge">终阶 · {stage.name}</span>;

  return (
    <>
      <span
        className="stage-advance-wrap"
        ref={wrapRef}
        onMouseEnter={openTip}
        onMouseLeave={closeTipSoon}
      >
        <button className={canGo ? 'primary stage-advance-btn' : 'stage-advance-btn'} disabled={!canGo} onClick={doAdvanceStage}>
          {label}
        </button>
      </span>
      {tipPos
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
    </>
  );
}
