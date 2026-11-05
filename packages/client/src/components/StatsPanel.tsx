import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ATTRIBUTES,
  STAMINA_MAX,
  STAT_LABEL,
  appearanceLabel,
  attrValue,
  currentStage,
  effectiveStats,
  stageBadgeClass,
  type AttributeDef,
} from '@idollife/core';
import type { AppApi } from './api';
import { FanRadar } from './FanRadar';
import { StageAdvanceButton } from './StageAdvanceButton';

/**
 * 属性面板（T-016c 口径，T-016d 修订）
 *
 * - 顺序：偶像名 → 固有属性 → 状态（进度条）→ 成长属性（纯数字）→ 资源
 * - `linked === 0`（熟练度）与 `linked === 2`（性格/负向/三轴，仅占卜可见）一律不渲染，
 *   面板里看不到任何数值——唯一入口是占卜的文案描述（用户 2026-11-02：任何地方不外显）
 * - `hidden === true` 只显示灰色小标「主界面不显示」，面板内数值照常（固有/状态/粉丝）
 * - 样貌只显示 appearanceLabel 的文案，不显示数字；身高/体重带单位
 * - 成长属性没有上限，不用进度条，直接显示数字
 * - 粉丝构成雷达图悬浮在「资源 · 粉丝」行上方显示（T-016d）：浮层 portal 到 body 用 fixed
 *   定位，不受侧栏 `overflow: hidden` 裁切，宽度固定 264px 且贴窗口下沿翻转，不挤压面板布局
 *
 * `embedded`：嵌入侧栏「属性」页签时传 true —— 侧栏已有页签标题，这里不再渲染大标题，
 * 其余内容与主面板完全一致，单一实现不分叉（辅系统显示永远跟随本组件的改动）。
 */
const GROUP_ORDER = ['innate', 'status', 'visible'] as const;

/** 界面叫法与配置表不同：配置表沿用「显性属性」，界面按用户口径叫「成长属性」（T-016） */
const GROUP_DISPLAY_NAME: Record<string, string> = { visible: '成长属性' };

/** 固有属性的单位显示（T-016c：身高 cm、体重 kg） */
const INNATE_UNIT: Record<string, string> = { height: 'cm', weight: 'kg' };

const thousands = (n: number) => Math.round(n).toLocaleString('zh-CN');

/**
 * 状态条色调：正向指标（体力/心情/健康）越低越危险；压力是反向指标，越高越危险（T-044）。
 */
const statusTone = (value: number, inverted = false) =>
  inverted
    ? value >= 100
      ? 'danger'
      : value >= 60
        ? 'warn'
        : ''
    : value < 15
      ? 'danger'
      : value < 30
        ? 'warn'
        : '';

export function StatsPanel({ api, embedded = false }: { api: AppApi; embedded?: boolean }) {
  const { run, totalFans } = api;
  // T-018：当前成长阶段（名字下方徽章）
  const stage = currentStage(run);

  // 粉丝浮层：portal 到 body，位置按宿主行的视口矩形算（侧栏有 overflow:hidden，绝对定位会被裁）
  const fanHostRef = useRef<HTMLDivElement | null>(null);
  const [fanRect, setFanRect] = useState<{ top: number; bottom: number; right: number } | null>(null);
  const hideTimer = useRef<number | null>(null);

  const openFan = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    const el = fanHostRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setFanRect({ top: r.top, bottom: r.bottom, right: r.right });
  };
  // 延迟收起：鼠标从宿主移进浮层那一小段不闪断
  const closeFanSoon = () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setFanRect(null), 140);
  };
  useEffect(
    () => () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const groups = new Map<string, { name: string; items: AttributeDef[] }>();
  for (const a of ATTRIBUTES) {
    const g = groups.get(a.category) ?? { name: a.categoryName, items: [] };
    g.items = [...g.items, a];
    groups.set(a.category, g);
  }

  return (
    <>
      {embedded ? null : (
        <div className="mod-head">
          <h2>属性</h2>
        </div>
      )}

      {/* 偶像名，点击可改；未起名时弱化显示「未命名」 */}
      <div className="attr-idol">
        <span className="attr-idol-label">偶像名</span>
        <button
          type="button"
          className={run.name ? 'attr-idol-name' : 'attr-idol-name unnamed'}
          onClick={() => api.onRenameIdol()}
          title="点击修改偶像名"
        >
          {run.name || '未命名'}
        </button>
      </div>

      {/* T-018：阶段徽章；T-021：与晋级按钮同一行两端对齐（徽章左 / 按钮右） */}
      <div className="attr-stage-row">
        <div className={stageBadgeClass(stage)}>
          <span className="stage-name">{stage.name}</span>
          <span className="stage-sep">·</span>
          <span className="stage-title">{stage.title}</span>
        </div>
        <StageAdvanceButton api={api} />
      </div>

      <div className="attr-groups">
        {GROUP_ORDER.map((category) => {
          const group = groups.get(category);
          if (!group) return null;

          // linked === 0（熟练度）不渲染；linked === 2（仅占卜可见）也不渲染，占卜是唯一入口
          const items = group.items.filter((a) => a.linked === 1);
          if (items.length === 0) return null;

          const hiddenMain = items.some((a) => a.hidden);
          const isStatus = category === 'status';

          return (
            <section key={category} className="attr-group">
              <h4>
                {GROUP_DISPLAY_NAME[category] ?? group.name}
                {hiddenMain ? <em className="attr-badge">主界面不显示</em> : null}
              </h4>
              <div className="attr-list">
                {items.map((a) => {
                  const value = attrValue(run, a.key);
                  const max = a.key === 'stamina' ? STAMINA_MAX : 100;
                  // 只有状态组有进度条；成长属性无上限不配条，固有属性是固定值也不配条
                  const showBar = isStatus;
                  const percent = Math.max(0, Math.min(100, (value / max) * 100));
                  const tone = isStatus ? statusTone(value, a.key === 'stress') : '';
                  const unit = INNATE_UNIT[a.key];
                  return (
                    <div key={a.key} className={isStatus ? 'attr-item attr-vital' : 'attr-item'}>
                      <div className="attr-row">
                        <span className="k">{a.name}</span>
                        {a.key === 'appearance' ? (
                          <span className="v attr-text">{appearanceLabel(value)}</span>
                        ) : isStatus ? (
                          <span className="v">
                            {value}
                            <em>/{max}</em>
                          </span>
                        ) : (
                          <span className="v">
                            {value}
                            {unit ? <em className="attr-unit">{unit}</em> : null}
                          </span>
                        )}
                      </div>
                      {showBar ? (
                        <span
                          className={['attr-bar', isStatus ? '' : 'slim', tone]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <i style={{ width: percent + '%' }} />
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <section className="attr-group">
          <h4>资源</h4>
          <div className="attr-list">
            <div className="attr-item">
              <div className="attr-row">
                <span className="k">资金</span>
                <span className="v">¥{thousands(run.money)}</span>
              </div>
            </div>
            {/* 粉丝构成雷达：悬浮在这行上方显示（T-016d 浮层版），不常驻占位 */}
            <div
              className="attr-item fan-host"
              ref={fanHostRef}
              onMouseEnter={openFan}
              onMouseLeave={closeFanSoon}
            >
              <div className="attr-row">
                <span className="k">粉丝</span>
                <span className="v">{thousands(totalFans(run))}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 浮层本体：portal 到 body，fixed 定位；上方放不下且下方更宽裕时翻到下方 */}
      {fanRect
        ? (() => {
            const EST_H = 300; // 浮层大致高度（雷达 240 + 标题 + 内边距）
            const spaceAbove = fanRect.top;
            const spaceBelow = window.innerHeight - fanRect.bottom;
            const below = spaceAbove < EST_H + 16 && spaceBelow > spaceAbove;
            return createPortal(
              <div
                className={below ? 'fan-pop below' : 'fan-pop'}
                style={{
                  // 向上展开时保证不顶出视口上沿（宁可与宿主重叠，也不能看不见）
                  top: below ? fanRect.bottom + 8 : Math.max(EST_H + 8, fanRect.top - 8),
                  right: Math.max(8, window.innerWidth - fanRect.right),
                }}
                onMouseEnter={openFan}
                onMouseLeave={closeFanSoon}
              >
                <div className="fan-pop-head">粉丝构成</div>
                <FanRadar run={run} />
              </div>,
              document.body,
            );
          })()
        : null}

      <p className="muted small eff">
        实际属性：
        {Object.entries(effectiveStats(run))
          .map(([k, v]) => `${STAT_LABEL[k] ?? k} ${v}`)
          .join(' · ')}
      </p>
    </>
  );
}
